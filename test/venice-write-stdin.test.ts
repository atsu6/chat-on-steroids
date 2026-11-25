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
import { initDurableStore } from '../src/main/durable.js';
import { createSession, initSessionStore, readEvents } from '../src/main/session/store.js';
import { initSecretsPath, setSecret } from '../src/main/secrets.js';
import { startBridge, shutdownBridge } from '../src/main/bridge.js';
import { BRIDGE_PROTOCOL } from '../src/main/version.js';
import { unifiedExecManager } from '../src/main/codex/manager.js';
import { makeTempDir, removeTempDir } from './helpers.js';
import type { VeniceToolCallRequest, VeniceToolCallResponse, VeniceExecOutput } from '../src/shared/venice-integration.js';

let base: string, root: string, sessionId: string, port: number;
const sender: VeniceSender = { browserId: 'b'.repeat(32), tabId: 8, documentId: 'synthetic-stdin-document' };
const runs: string[] = [];
const nodeCommand = (script: string) => {
  const windows = process.platform === 'win32';
  const quote = (value: string) => `'${value.replaceAll("'", windows ? "''" : "'\\''")}'`;
  return `${windows ? '& ' : ''}${quote(process.execPath)} -e ${quote(script)}`;
};
const request = (runId: string, tool: string, args: Record<string, unknown>): VeniceToolCallRequest => ({ runId, callId: randomUUID(), surface: 'core', tool, args });
const grant = async (shell = true, write = false) => {
  const g = await gateway.grant(sessionId, [root], sender, write, shell); runs.push(g.runId); return g;
};
const result = (reply: VeniceToolCallResponse): VeniceExecOutput => {
  expect(reply).toMatchObject({ state: 'completed', result: { structuredContent: { processId: expect.any(Number) } } });
  expect(reply).not.toHaveProperty('result.isError', true);
  return (reply.result as { structuredContent: VeniceExecOutput }).structuredContent;
};
const exec = async (runId: string, script: string, args = {}) => result(await gateway.call(request(runId, 'exec_command', { cmd: nodeCommand(script), login: false, yield_time_ms: 250, ...args }), sender));
const stdin = (runId: string, id: number, chars = '', args = {}) => request(runId, 'write_stdin', { session_id: id, chars, yield_time_ms: 250, ...args });
const ready = 'process.stdout.write("ready\\n");';
const interactive = ready + 'process.stdin.setEncoding("utf8");process.stdin.on("data",data=>{process.stdout.write("received:"+data);process.stderr.write("diagnostic\\n");if(data.includes("exit"))process.exit(0)});';
beforeAll(async () => {
  base = await makeTempDir('venice-stdin-'); root = path.join(base, 'root'); await fs.mkdir(root);
  initConfigPath(base); initSessionStore(base); initDurableStore(base); initSecretsPath(base);
  await saveConfig({ ...defaultConfig(), roots: [{ name: 'granted', path: root }] });
  sessionId = (await createSession({ title: 'Synthetic stdin owner' })).id;
  await setSecret('bridgeToken', 'synthetic-stdin-token'); port = (await startBridge())!;
});
afterEach(async () => { vi.restoreAllMocks(); for (const id of runs.splice(0)) gateway.revoke(id); await gateway.waitForRevocation(); });
afterAll(async () => { await gateway.stop(); await shutdownBridge(); await removeTempDir(base); });

it('requires independent shell consent for polls as well as non-empty input', async () => {
  const write = vi.spyOn(unifiedExecManager, 'writeStdin');
  for (const allowWrite of [false, true]) {
    const g = await grant(false, allowWrite); expect(g.tools).not.toContain('core/write_stdin');
    for (const chars of ['', 'input']) expect((await gateway.call(stdin(g.runId, 1234, chars), sender)).error).toBe('TOOL_NOT_GRANTED');
  }
  expect(write).not.toHaveBeenCalled();
});

it('refuses unknown ids, another run and another document before reading or writing', async () => {
  const a = await grant(), b = await grant(), output = await exec(a.runId, interactive, { stdin_open: true });
  const write = vi.spyOn(unifiedExecManager, 'writeStdin');
  for (const [runId, id] of [[a.runId, -1], [b.runId, output.processId!]] as const) {
    expect(await gateway.call(stdin(runId, id, 'input'), sender)).toMatchObject({ result: { isError: true, content: [{ text: expect.stringContaining('OWNER_MISMATCH') }] } });
  }
  expect((await gateway.call(stdin(a.runId, output.processId!, 'input'), { ...sender, documentId: 'other' })).error).toBe('RUN_NOT_AUTHORIZED');
  expect(write).not.toHaveBeenCalled();
});

it('keeps stdin closed by default but permits empty polls and retains late stdout/stderr', async () => {
  const g = await grant(), output = await exec(g.runId, ready + 'setTimeout(()=>{process.stdout.write("late\\n");process.stderr.write("err\\n")},1500)');
  expect(output.running).toBe(true);
  expect(await gateway.call(stdin(g.runId, output.processId!, 'input'), sender)).toMatchObject({ result: { isError: true, content: [{ text: expect.stringContaining('STDIN_CLOSED') }] } });
  let polled: VeniceExecOutput = output;
  // A poll returns as soon as output arrives, which may precede the child's exit event.
  await vi.waitFor(async () => {
    polled = result(await gateway.call(stdin(g.runId, output.processId!), sender));
    expect(polled.running).toBe(false);
  }, { timeout: 5000 });
  expect(polled).toMatchObject({ callId: output.callId, processId: output.processId, running: false, exitCode: 0, stdout: 'ready\nlate\n', stderr: 'err\n' });
});

it('writes to an explicitly opened pipe, preserves stream separation and records host admission', async () => {
  const g = await grant(), output = await exec(g.runId, interactive, { stdin_open: true });
  const req = stdin(g.runId, output.processId!, 'hello\nexit\n');
  const final = result(await gateway.call(req, sender));
  expect(final).toMatchObject({ callId: output.callId, processId: output.processId, stdout: 'ready\nreceived:hello\nexit\n', stderr: 'diagnostic\n', running: false, exitCode: 0 });
  const events = await readEvents(sessionId, { limit: 100 });
  expect(events).toContainEqual(expect.objectContaining({ kind: 'tool_call', call: expect.objectContaining({ tool: 'write_stdin', attribution: 'host_admitted' }) }));
});

it('joins duplicate callIds without sending twice and keeps completed answers replayable after revoke', async () => {
  const g = await grant(), output = await exec(g.runId, interactive, { stdin_open: true });
  const req = stdin(g.runId, output.processId!, 'once\n'), write = vi.spyOn(unifiedExecManager, 'writeStdin');
  const [a, b] = await Promise.all([gateway.call(req, sender), gateway.call(req, sender)]);
  expect(result(a).stdout).toBe('ready\nreceived:once\n'); expect(b).toEqual(a); expect(write).toHaveBeenCalledTimes(1);
  expect((await gateway.call({ ...req, args: { ...req.args, chars: 'different' } }, sender)).error).toBe('CALL_ID_CONFLICT');
  gateway.revoke(g.runId); await gateway.waitForRevocation();
  expect(await gateway.call(req, sender)).toEqual(a);
  expect((await gateway.call(stdin(g.runId, output.processId!, 'again'), sender)).error).toBe('RUN_REVOKED');
  expect(write).toHaveBeenCalledTimes(1);
});

it('polls completed output repeatedly without executing again and rejects input after exit', async () => {
  const g = await grant(), output = await exec(g.runId, 'process.stdout.write("complete\\n")');
  const spawn = vi.spyOn(unifiedExecManager, 'execCommand');
  for (let i = 0; i < 2; i++) expect(result(await gateway.call(stdin(g.runId, output.processId!), sender))).toMatchObject({ running: false, exitCode: 0, stdout: 'complete\n' });
  expect(await gateway.call(stdin(g.runId, output.processId!, 'input'), sender)).toMatchObject({ result: { isError: true, content: [{ text: expect.stringContaining('already completed') }] } });
  expect(spawn).not.toHaveBeenCalled();
});

it('defaults wait to 10 seconds and caps explicit waits at 30 seconds', async () => {
  const g = await grant(), output = await exec(g.runId, 'process.stdout.write("complete\\n")');
  const write = vi.spyOn(unifiedExecManager, 'writeStdin');
  await gateway.call(request(g.runId, 'write_stdin', { session_id: output.processId }), sender);
  await gateway.call(stdin(g.runId, output.processId!, '', { yield_time_ms: 999999 }), sender);
  expect(write.mock.calls.map(([req]) => req.yieldTimeMs)).toEqual([10000, 30000]);
  expect(write.mock.calls.every(([req]) => req.maxWriteStdinYieldTimeMs === 30000)).toBe(true);
});

it('refuses when command permission or Read-only mode changes without consuming output', async () => {
  const g = await grant(), output = await exec(g.runId, interactive, { stdin_open: true }), config = getConfig();
  const write = vi.spyOn(unifiedExecManager, 'writeStdin');
  try {
    for (const next of [{ ...config, capabilities: { ...config.capabilities, command: false } }, { ...config, readOnly: true }]) {
      await saveConfig(next);
      expect(await gateway.call(stdin(g.runId, output.processId!, 'blocked\n'), sender)).toMatchObject({ result: { isError: true } });
    }
    expect(write).not.toHaveBeenCalled();
  } finally { await saveConfig(config); }
  expect(result(await gateway.call(stdin(g.runId, output.processId!, 'exit\n'), sender)).stdout).toBe('ready\nreceived:exit\n');
});

it('rechecks authority after a queued continuation acquires the interaction lock', async () => {
  const g = await grant(), output = await exec(g.runId, interactive, { stdin_open: true }), config = getConfig();
  const write = vi.spyOn(unifiedExecManager, 'writeStdin');
  const poll = gateway.call(stdin(g.runId, output.processId!, '', { yield_time_ms: 1000 }), sender);
  await vi.waitFor(() => expect(write).toHaveBeenCalledTimes(1));
  const queued = gateway.call(stdin(g.runId, output.processId!, 'blocked\n'), sender);
  await vi.waitFor(() => expect(write).toHaveBeenCalledTimes(2));
  try {
    await saveConfig({ ...config, capabilities: { ...config.capabilities, command: false } });
    await poll;
    expect(await queued).toMatchObject({ result: { isError: true, content: [{ text: expect.stringContaining('COMMAND_DISABLED') }] } });
  } finally { await saveConfig(config); }
  expect(result(await gateway.call(stdin(g.runId, output.processId!, 'exit\n'), sender)).stdout).toBe('ready\nreceived:exit\n');
});

it('keeps cumulative output within 64KiB and shields secrets on continuation results', async () => {
  const g = await grant(), output = await exec(g.runId, ready + 'process.stdin.once("data",()=>{process.stdout.write("API_TOKEN=abcdefgh12345678\\n");setTimeout(()=>{process.stderr.write("x".repeat(70000));process.exit(0)},100)})', { stdin_open: true });
  const final = result(await gateway.call(stdin(g.runId, output.processId!, 'go\n'), sender));
  expect(final.stdout).not.toContain('abcdefgh12345678'); expect(final.stdout).toContain('hidden by Chat On Steroids');
  expect(Buffer.byteLength(final.stdout) + Buffer.byteLength(final.stderr)).toBeLessThanOrEqual(65536);
  expect(final.truncated).toBe(true); expect(final.omittedBytes).toBeGreaterThan(0);
});

it('rejects malformed pipe-input opt-ins before spawning', async () => {
  const g = await grant(), spawn = vi.spyOn(unifiedExecManager, 'execCommand');
  expect(await gateway.call(request(g.runId, 'exec_command', { cmd: 'echo no', stdin_open: 'true' }), sender)).toMatchObject({ result: { isError: true } });
  expect(spawn).not.toHaveBeenCalled();
});

it('interrupts an opted-in pipe instead of writing a literal Ctrl-C byte to it', async () => {
  const g = await grant(), output = await exec(g.runId, interactive, { stdin_open: true });
  let stopped = result(await gateway.call(stdin(g.runId, output.processId!, '\u0003'), sender));
  if (stopped.running) stopped = result(await gateway.call(stdin(g.runId, output.processId!), sender));
  expect(stopped.running).toBe(false); expect(stopped.stdout).not.toContain('received:');
  expect(unifiedExecManager.listProcesses().some(row => row.processId === output.processId)).toBe(false);
});

it('continues a real process through the authenticated HTTP gateway and Stop kills it', async () => {
  const g = await grant(), output = await exec(g.runId, interactive, { stdin_open: true });
  const post = (url: string, body: unknown) => fetch(`http://127.0.0.1:${port}${url}`, { method: 'POST', headers: {
    'Content-Type': 'application/json', authorization: 'Bearer synthetic-stdin-token', 'x-extension-protocol': String(BRIDGE_PROTOCOL), 'x-extension-browser': sender.browserId
  }, body: JSON.stringify(body) });
  const req = stdin(g.runId, output.processId!, 'http\n');
  const response = await post('/venice/tools', { request: req, sender: { tabId: sender.tabId, documentId: sender.documentId } });
  expect(response.status).toBe(200); expect(result(await response.json()).stdout).toBe('ready\nreceived:http\n');
  const stop = await post('/venice/grant/revoke', { runId: g.runId, sender: { tabId: sender.tabId, documentId: sender.documentId } });
  expect(await stop.json()).toMatchObject({ revoked: true });
  expect(unifiedExecManager.listProcesses().some(row => row.processId === output.processId)).toBe(false);
});
