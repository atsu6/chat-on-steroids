import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { beforeAll, afterAll, afterEach, expect, it, vi } from 'vitest';
vi.mock('electron', () => ({ safeStorage: {
  isAsyncEncryptionAvailable: async () => true, getSelectedStorageBackend: () => 'unknown',
  encryptStringAsync: async (value: string) => Buffer.from(value),
  decryptStringAsync: async (value: Buffer) => ({ result: value.toString(), shouldReEncrypt: false })
}, shell: {}, clipboard: {} }));
import { veniceToolGateway as gateway, type VeniceSender } from '../src/main/venice-tool-gateway.js';
import { defaultConfig, initConfigPath, saveConfig, getConfig } from '../src/main/config.js';
import { initDurableStore, readDurable } from '../src/main/durable.js';
import { createSession, initSessionStore, readEvents } from '../src/main/session/store.js';
import { initSecretsPath, setSecret } from '../src/main/secrets.js';
import { startBridge, shutdownBridge } from '../src/main/bridge.js';
import { BRIDGE_PROTOCOL } from '../src/main/version.js';
import { unifiedExecManager } from '../src/main/codex/manager.js';
import { execOwnershipFailure } from '../src/main/codex/ownership.js';
import { makeTempDir, removeTempDir } from './helpers.js';
import type { VeniceToolCallRequest, VeniceRunGrant, VeniceExecOutput } from '../src/shared/venice-integration.js';

let base: string, root: string, outside: string, sessionId: string, port: number;
const sender: VeniceSender = { browserId: 'a'.repeat(32), tabId: 8, documentId: 'synthetic-exec-document' };
// Exercise the native shell on every OS, but produce fixture bytes with Node, not POSIX utilities.
const nodeCommand = (script: string) => {
  const windows = process.platform === 'win32';
  const quote = (value: string) => `'${value.replaceAll("'", windows ? "''" : "'\\''")}'`;
  return `${windows ? '& ' : ''}${quote(process.execPath)} -e ${quote(script)}`;
};
const request = (runId: string, cmd = nodeCommand('process.stdout.write("synthetic\\n")'), args = {}): VeniceToolCallRequest => ({ runId, callId: randomUUID(), surface: 'core', tool: 'exec_command', args: { cmd, login: false, ...args } });
const runs: string[] = [];
const grant = async (write = false, shell = true) => { const g = await gateway.grant(sessionId, [root], sender, write, shell); runs.push(g.runId); return g; };
const result = (reply: unknown): VeniceExecOutput => {
  expect(reply).toMatchObject({ state: 'completed', result: { structuredContent: { processId: expect.any(Number) } } });
  expect(reply).not.toHaveProperty('result.isError', true);
  return (reply as {result: {structuredContent: VeniceExecOutput}}).result.structuredContent;
};
beforeAll(async () => {
  base = await makeTempDir('venice-exec-'); root = path.join(base, 'root'); outside = path.join(base, 'other');
  await fs.mkdir(root); await fs.mkdir(outside); await fs.mkdir(path.join(root, 'sub'));
  await fs.symlink(outside, path.join(root, 'escape'));
  initConfigPath(base); initSessionStore(base); initDurableStore(base); initSecretsPath(base);
  await saveConfig({ ...defaultConfig(), roots: [{ name: 'granted', path: root }, { name: 'other', path: outside }] });
  sessionId = (await createSession({ title: 'Synthetic exec owner' })).id;
  await setSecret('bridgeToken', 'synthetic-exec-token'); port = (await startBridge())!;
});
afterEach(async () => { vi.restoreAllMocks(); for (const id of runs.splice(0)) gateway.revoke(id); await gateway.waitForRevocation(); });
afterAll(async () => { await gateway.stop(); await shutdownBridge(); await removeTempDir(base); });

it('keeps shell OFF for read and write grants and refuses exec without spawning', async () => {
  const spawn = vi.spyOn(unifiedExecManager, 'execCommand');
  for (const write of [false, true]) {
    const g = await grant(write, false); expect(g.shell).toBeUndefined(); expect(g.tools).not.toContain('core/exec_command');
    expect((await gateway.call(request(g.runId), sender)).error).toBe('TOOL_NOT_GRANTED');
  }
  expect(spawn).not.toHaveBeenCalled();
});

it('runs echo through host_admitted in the first grant root with separate output and no write upgrade', async () => {
  const g = await grant(); expect(g.write).toBeUndefined(); expect(g.tools).toEqual(['core/read', 'core/exec_command']);
  const req = request(g.runId, nodeCommand('process.stdout.write(process.cwd()+"\\nline1\\nline2\\n");process.stderr.write("diagnostic\\n")'));
  const output = result(await gateway.call(req, sender));
  expect(output).toMatchObject({ exitCode: 0, running: false, stdout: root + '\nline1\nline2\n', stderr: 'diagnostic\n', truncated: false });
  const events = (await readEvents(sessionId, { limit: 100 })).filter(event => event.kind === 'tool_call');
  expect(events).toContainEqual(expect.objectContaining({ call: expect.objectContaining({ tool: 'exec_command', attribution: 'host_admitted' }) }));
  expect(execOwnershipFailure(output.processId!, null)).not.toBeNull();
  expect(execOwnershipFailure(output.processId!, `venice:${g.runId}`)).toBeNull();
  expect((await gateway.call({ ...request(g.runId), tool: 'apply_patch', args: { patch: '' } }, sender)).error).toBe('TOOL_NOT_GRANTED');
});

it('rejects native, virtual, traversal and symlink cwd escapes, including another globally approved root', async () => {
  const g = await grant(); const spawn = vi.spyOn(unifiedExecManager, 'execCommand');
  for (const workdir of [outside, '/other', '/granted/../other', '/granted/escape']) {
    expect((await gateway.call(request(g.runId, 'echo no', { workdir }), sender)).result).toMatchObject({ isError: true });
  }
  expect(spawn).not.toHaveBeenCalled();
  for (const workdir of ['/granted/sub', 'sub']) expect(result(await gateway.call(request(g.runId, nodeCommand('process.stdout.write(process.cwd()+"\\n")'), { workdir }), sender)).stdout).toBe(path.join(root, 'sub') + '\n');
});

it('joins concurrent identical callIds, replays after revoke and rejects changed owner or arguments', async () => {
  const g = await grant(), req = request(g.runId, nodeCommand('require("node:fs").appendFileSync("once.txt","once\\n");process.stdout.write("received\\n")'));
  const [a, b] = await Promise.all([gateway.call(req, sender), gateway.call(req, sender)]); result(a); expect(b).toEqual(a);
  expect(await fs.readFile(path.join(root, 'once.txt'), 'utf8')).toBe('once\n');
  gateway.revoke(g.runId); expect(await gateway.call(req, sender)).toEqual(a);
  expect((await gateway.call({ ...req, args: { cmd: 'echo different' } }, sender)).error).toBe('CALL_ID_CONFLICT');
  expect((await gateway.call(req, { ...sender, tabId: 9 })).error).toBe('CALL_ID_CONFLICT');
  expect((await gateway.call(request(g.runId), sender)).error).toBe('RUN_REVOKED');
  await expect(gateway.execOutput(req, sender)).rejects.toThrow('RUN_REVOKED');
});

it('enforces the existing command allowlist and live command capability', async () => {
  const g = await grant(), config = getConfig();
  try {
    await saveConfig({ ...config, capabilities: { ...config.capabilities, command: false } });
    expect((await gateway.call(request(g.runId), sender)).result).toMatchObject({ isError: true });
    await saveConfig({ ...config, commandAllowlist: { ...config.commandAllowlist, enabled: true, mode: 'allow', rules: [] } });
    expect((await gateway.call(request(g.runId), sender)).result).toMatchObject({ isError: true, content: [{ text: expect.stringContaining('COMMAND_NOT_ALLOWED') }] });
  } finally { await saveConfig(config); }
});

it('retains a shared 64KiB prefix budget, drops the tail and keeps stderr separate', async () => {
  const g = await grant();
  const output = result(await gateway.call(request(g.runId, nodeCommand('process.stderr.write("error-line\\n");setTimeout(()=>process.stdout.write("x".repeat(70000)+"TAIL"),100)')), sender));
  expect(output.stderr).toBe('error-line\n'); expect(output.stdout.startsWith('xxx')).toBe(true);
  expect(output.stdout).not.toContain('TAIL'); expect(output.stdout + output.stderr).toHaveLength(65536);
  expect(output.truncated).toBe(true); expect(output.omittedBytes).toBe(70000 + 4 + 11 - 65536);
});

it('applies the existing secrets shield to both the exec result and live output observations', async () => {
  const g = await grant(); const synthetic = 'sk-' + 'SyntheticOnly'.repeat(4);
  const req = request(g.runId, nodeCommand(`process.stdout.write(${JSON.stringify(synthetic + '\n')});process.stderr.write(${JSON.stringify(synthetic + '\n')});setTimeout(()=>{},100)`));
  const output = result(await gateway.call(req, sender));
  for (const snapshot of [output, (await gateway.execOutput(req, sender))!]) {
    expect(snapshot.stdout).not.toContain(synthetic); expect(snapshot.stderr).not.toContain(synthetic);
    expect(snapshot.stdout).toContain('hidden by Chat On Steroids'); expect(snapshot.stderr).toContain('hidden by Chat On Steroids');
  }
});

it('keeps the published 64KiB limit even when the secrets shield expands repeated short settings', async () => {
  const g = await grant(), req = request(g.runId, nodeCommand('process.stdout.write("API_TOKEN=abcdefgh12345678\\n".repeat(2500))'));
  const output = result(await gateway.call(req, sender));
  for (const snapshot of [output, (await gateway.execOutput(req, sender))!]) {
    expect(Buffer.byteLength(snapshot.stdout) + Buffer.byteLength(snapshot.stderr)).toBeLessThanOrEqual(65536);
    expect(snapshot.stdout).not.toContain('abcdefgh12345678'); expect(snapshot.truncated).toBe(true);
  }
});

it('defaults wait to 10 seconds and caps explicit waits at 30 seconds without changing other exec callers', async () => {
  const g = await grant(), spy = vi.spyOn(unifiedExecManager, 'execCommand');
  result(await gateway.call(request(g.runId), sender)); result(await gateway.call(request(g.runId, 'echo capped', { yield_time_ms: 999999 }), sender));
  expect(spy.mock.calls.map(([req]) => req.yieldTimeMs)).toEqual([10000, 30000]);
});

it('yields a live processId, streams before the first answer and observes later completion without new execution', async () => {
  const g = await grant(), req = request(g.runId, nodeCommand('process.stdout.write("early\\n");setTimeout(()=>{process.stdout.write("late\\n");process.stderr.write("err\\n")},1500)'), { yield_time_ms: 250 });
  const call = gateway.call(req, sender);
  await vi.waitFor(async () => expect((await gateway.execOutput(req, sender))?.stdout).toContain('early\n'));
  const output = result(await call); expect(output.running).toBe(true); expect(output.exitCode).toBeNull(); expect(output.stdout).toBe('early\n');
  expect(unifiedExecManager.listProcesses().some(row => row.processId === output.processId)).toBe(true);
  await vi.waitFor(async () => expect(await gateway.execOutput(req, sender)).toMatchObject({ running: false, exitCode: 0, stdout: 'early\nlate\n', stderr: 'err\n' }), { timeout: 5000 });
  expect(await gateway.call(req, sender)).toMatchObject({ result: { structuredContent: { running: true, exitCode: null } } }); // The ledger is the original answer, not a new exec.
  await expect(gateway.execOutput(req, { ...sender, documentId: 'different' })).rejects.toThrow('RUN_NOT_AUTHORIZED');
  await expect(gateway.execOutput({ ...req, callId: randomUUID() }, sender)).rejects.toThrow('CALL_NOT_AUTHORIZED');
});

it('reserves a maximum of three live/spawning processes per run and frees slots on exit', async () => {
  const g = await grant();
  const calls = Array.from({ length: 4 }, () => request(g.runId, nodeCommand('setTimeout(()=>{},2000)'), { yield_time_ms: 250 }));
  const replies = await Promise.all(calls.map(req => gateway.call(req, sender)));
  for (const reply of replies.slice(0, 3)) expect(result(reply).running).toBe(true);
  expect(replies[3]).toMatchObject({ result: { isError: true, content: [{ text: expect.stringContaining('EXEC_LIMIT') }] } });
  const secondRun = await grant(); expect(result(await gateway.call(request(secondRun.runId), sender)).exitCode).toBe(0);
  await vi.waitFor(async () => expect((await gateway.execOutput(calls[0]!, sender))?.running).toBe(false), { timeout: 5000 });
  expect(result(await gateway.call(request(g.runId), sender)).exitCode).toBe(0);
});

it('revoke kills this run and its descendants, but leaves another run alive', async () => {
  const a = await grant(), b = await grant();
  const start = async (runId: string, file: string) => {
    const child = `require("node:fs").writeFileSync(${JSON.stringify(file)},String(process.pid));process.stdout.write(process.pid+"\\n");setTimeout(()=>{},30000)`;
    const req = request(runId, nodeCommand(`require("node:child_process").spawn(process.execPath,["-e",${JSON.stringify(child)}],{stdio:"inherit"})`), { yield_time_ms: 250 });
    const output = result(await gateway.call(req, sender));
    // The descendant's stdout receipt follows its PID-file write; no startup sleep or PID-file polling.
    await vi.waitFor(async () => expect((await gateway.execOutput(req, sender))?.stdout).toMatch(/^\d+\n/), { timeout: 5000 });
    return output;
  };
  const owned = await start(a.runId, 'owned.pid'), other = await start(b.runId, 'other.pid');
  const pid = Number(await fs.readFile(path.join(root, 'owned.pid'), 'utf8'));
  gateway.revoke(a.runId); await gateway.waitForRevocation();
  await vi.waitFor(() => expect(() => process.kill(pid, 0)).toThrow());
  expect(unifiedExecManager.listProcesses().some(row => row.processId === owned.processId)).toBe(false);
  expect(unifiedExecManager.listProcesses().some(row => row.processId === other.processId)).toBe(true);
});

it('persists explicit shell consent without implying write or upgrading earlier runs', async () => {
  const old = await grant(false, false);
  gateway.setApprovalUi({ notify: () => {}, context: async () => ({ sessionId, sessionTitle: 'App owner', project: null }) });
  const pendingReply = gateway.requestGrant({ requestId: randomUUID(), tools: ['core/read'], instructionSummary: 'synthetic shell consent' }, sender, 'https://venice.ai/chat/synthetic');
  await vi.waitFor(() => expect(gateway.pendingApprovals()).toHaveLength(1));
  const pending = gateway.pendingApprovals()[0]!; await gateway.chooseApprovalRoots(pending.id, [root]); await gateway.answerApproval(pending.id, true, false, true);
  const reply = await pendingReply; if (!('runId' in reply)) throw new Error(reply.error); runs.push(reply.runId);
  expect(result(await gateway.call(request(reply.runId), sender)).exitCode).toBe(0);
  const saved = await readDurable<Array<{ value: VeniceRunGrant }>>('venice-grants');
  expect(saved?.find(row => row.value.runId === reply.runId)?.value).toMatchObject({ shell: true, tools: ['core/read', 'core/exec_command'] });
  expect(saved?.find(row => row.value.runId === reply.runId)?.value.write).toBeUndefined();
  expect((await gateway.call(request(old.runId), sender)).error).toBe('TOOL_NOT_GRANTED');
});

it('uses the authenticated HTTP gateway for exec, output observation and Stop/revoke', async () => {
  const g = await grant(), req = request(g.runId, nodeCommand('process.stdout.write("http\\n");setTimeout(()=>{},30000)'), { yield_time_ms: 250 });
  const post = (url: string, body: unknown) => fetch(`http://127.0.0.1:${port}${url}`, { method: 'POST', headers: {
    'Content-Type': 'application/json', authorization: 'Bearer synthetic-exec-token', 'x-extension-protocol': String(BRIDGE_PROTOCOL), 'x-extension-browser': sender.browserId
  }, body: JSON.stringify(body) });
  const payload = { request: req, sender: { tabId: sender.tabId, documentId: sender.documentId } };
  const response = await post('/venice/tools', payload); expect(response.status).toBe(200); const output = result(await response.json()); expect(output.running).toBe(true);
  const read = await post('/venice/tools', { ...payload, output: true }); expect(await read.json()).toMatchObject({ output: { stdout: 'http\n', processId: output.processId } });
  const stop = await post('/venice/grant/revoke', { sender: payload.sender, runId: g.runId }); expect(await stop.json()).toMatchObject({ revoked: true });
  expect(unifiedExecManager.listProcesses().some(row => row.processId === output.processId)).toBe(false);
});

it('app shutdown kills every remaining run, including an exec still awaiting its first result', async () => {
  const g = await grant(), req = request(g.runId, nodeCommand('process.stdout.write("shutdown\\n");setTimeout(()=>{},30000)')); const reply = gateway.call(req, sender);
  await vi.waitFor(async () => expect((await gateway.execOutput(req, sender))?.stdout).toContain('shutdown'));
  await gateway.stop(); await reply;
  expect(unifiedExecManager.listProcesses()).toHaveLength(0);
  expect((await gateway.call(request(g.runId), sender)).error).toBe('RUN_REVOKED');
});
