import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { beforeAll, afterAll, expect, it, vi } from 'vitest';
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
import * as checkpoints from '../src/main/checkpoints/index.js';
import { makeTempDir, removeTempDir } from './helpers.js';
import type { VeniceToolCallRequest, VeniceRunGrant } from '../src/shared/venice-integration.js';

let base: string, root: string, outside: string, sessionId: string, port: number;
const sender: VeniceSender = { browserId: 'a'.repeat(32), tabId: 7, documentId: 'synthetic-patch-document' };
const patch = (runId: string, body: string): VeniceToolCallRequest => ({ runId, callId: randomUUID(), surface: 'core', tool: 'apply_patch', args: { patch: `*** Begin Patch\n${body}\n*** End Patch` } });
const granted = (write = false) => gateway.grant(sessionId, [root], sender, write);
const success = (result: unknown) => {
  expect(result).toMatchObject({ state: 'completed', result: { content: [{ type: 'text', text: expect.stringContaining('Exit code: 0\n') }] } });
  expect(result).not.toHaveProperty('result.isError', true);
};
beforeAll(async () => {
  base = await makeTempDir('venice-patch-'); root = path.join(base, 'root'); outside = path.join(base, 'other');
  await fs.mkdir(root); await fs.mkdir(outside); await fs.writeFile(path.join(outside, 'private.txt'), 'outside unchanged\n');
  await fs.symlink(path.join(outside, 'private.txt'), path.join(root, 'escape.txt'));
  await fs.symlink(outside, path.join(root, 'escape-dir'));
  initConfigPath(base); initSessionStore(base); initDurableStore(base); initSecretsPath(base);
  await saveConfig({ ...defaultConfig(), roots: [{ name: 'granted', path: root }, { name: 'other', path: outside }] });
  sessionId = (await createSession({ title: 'Synthetic patch owner' })).id;
  await setSecret('bridgeToken', 'synthetic-patch-token'); port = (await startBridge())!;
});
afterAll(async () => { await gateway.stop(); await shutdownBridge(); await removeTempDir(base); });

it('keeps old read grants read-only and refuses both preview and write without side effects', async () => {
  const g = await granted(), request = patch(g.runId, '*** Add File: /granted/no-write.txt\n+not allowed');
  expect(g.tools).toEqual(['core/read']); expect(g.write).toBeUndefined();
  expect((await gateway.call(request, sender)).error).toBe('TOOL_NOT_GRANTED');
  await expect(gateway.previewPatch(request, sender)).rejects.toThrow('TOOL_NOT_GRANTED');
  await expect(fs.stat(path.join(root, 'no-write.txt'))).rejects.toMatchObject({ code: 'ENOENT' });
  expect((await readEvents(sessionId, { limit: 100 })).filter(row => row.kind === 'tool_call')).toHaveLength(0);
});

it('previews real unified changes without writes, then applies once through host_admitted and replays after revoke', async () => {
  await fs.writeFile(path.join(root, 'once.txt'), 'old\n');
  const g = await granted(true), request = patch(g.runId, '*** Update File: /granted/once.txt\n@@\n-old\n+new');
  const preview = await gateway.previewPatch(request, sender);
  expect(preview.diff).toContain('--- "/granted/once.txt"\n+++ "/granted/once.txt"\n@@ -1,1 +1,1 @@');
  expect(preview.diff).toContain('-old\n+new'); expect(await fs.readFile(path.join(root, 'once.txt'), 'utf8')).toBe('old\n');
  const [first, duplicate] = await Promise.all([gateway.call(request, sender), gateway.call(request, sender)]);
  success(first); expect(duplicate).toEqual(first); expect(await fs.readFile(path.join(root, 'once.txt'), 'utf8')).toBe('new\n');
  const calls = (await readEvents(sessionId, { limit: 100 })).filter(row => row.kind === 'tool_call');
  expect(calls).toHaveLength(1); expect(calls[0]).toMatchObject({ call: { tool: 'apply_patch', attribution: 'host_admitted' } });
  gateway.revoke(g.runId); expect(await gateway.call(request, sender)).toEqual(first);
  expect((await gateway.call(patch(g.runId, '*** Add File: /granted/revoked.txt\n+no'), sender)).error).toBe('RUN_REVOKED');
  await expect(fs.stat(path.join(root, 'revoked.txt'))).rejects.toMatchObject({ code: 'ENOENT' });
  await expect(gateway.previewPatch(request, sender)).rejects.toThrow('RUN_REVOKED');
});

it('refuses native/virtual/traversal/symlink destinations and moves outside the run, even when globally approved', async () => {
  const g = await granted(true);
  for (const destination of ['/other/new.txt', path.join(outside, 'native.txt'), '/granted/../other/traversal.txt', '/granted/escape-dir/new.txt']) {
    const request = patch(g.runId, `*** Add File: ${destination}\n+not allowed`);
    await expect(gateway.previewPatch(request, sender)).rejects.toThrow();
    expect((await gateway.call(request, sender)).result).toMatchObject({ isError: true });
  }
  for (const target of ['/granted/escape.txt', '/other/private.txt']) {
    expect((await gateway.call(patch(g.runId, `*** Update File: ${target}\n@@\n-outside unchanged\n+bad`), sender)).result).toMatchObject({ isError: true });
  }
  await fs.writeFile(path.join(root, 'move-source.txt'), 'source\n');
  const move = patch(g.runId, '*** Update File: /granted/move-source.txt\n*** Move to: /other/moved.txt\n@@\n-source\n+bad');
  expect((await gateway.call(move, sender)).result).toMatchObject({ isError: true });
  expect(await fs.readFile(path.join(root, 'move-source.txt'), 'utf8')).toBe('source\n');
  expect(await fs.readdir(outside)).toEqual(['private.txt']);
  expect(await fs.readFile(path.join(outside, 'private.txt'), 'utf8')).toBe('outside unchanged\n');
  const mixed = patch(g.runId, '*** Add File: /granted/first-in-mixed.txt\n+inside\n*** Add File: /other/second-in-mixed.txt\n+outside');
  expect((await gateway.call(mixed, sender)).result).toMatchObject({ isError: true });
  await expect(fs.stat(path.join(root, 'first-in-mixed.txt'))).rejects.toMatchObject({ code: 'ENOENT' });
});

it('supports relative add/update/move/delete, repeated paths and overwritten destinations in the existing engine', async () => {
  const g = await granted(true);
  const add = patch(g.runId, '*** Add File: added.txt\n+first');
  expect((await gateway.previewPatch(add, sender)).diff).toContain('--- /dev/null'); success(await gateway.call(add, sender));
  const move = patch(g.runId, '*** Update File: added.txt\n*** Move to: moved.txt\n@@\n-first\n+second\n*** Add File: added.txt\n+replacement');
  const preview = await gateway.previewPatch(move, sender);
  expect(preview.diff).toContain('moved.txt'); expect(preview.diff).toContain('+replacement');
  success(await gateway.call(move, sender));
  expect(await fs.readFile(path.join(root, 'added.txt'), 'utf8')).toBe('replacement\n');
  expect(await fs.readFile(path.join(root, 'moved.txt'), 'utf8')).toBe('second\n');
  const remove = patch(g.runId, '*** Delete File: added.txt\n*** Delete File: moved.txt');
  expect((await gateway.previewPatch(remove, sender)).diff).toContain('+++ /dev/null'); success(await gateway.call(remove, sender));
  await expect(fs.stat(path.join(root, 'moved.txt'))).rejects.toMatchObject({ code: 'ENOENT' });
});

it('requires an explicit write answer, persists that scope, and never upgrades a previous read run', async () => {
  const read = await granted();
  gateway.setApprovalUi({ notify: () => {}, context: async () => ({ sessionId, sessionTitle: 'App owner', project: null }) });
  const reply = gateway.requestGrant({ requestId: randomUUID(), tools: ['core/read'], instructionSummary: 'synthetic write approval' }, sender, 'https://venice.ai/chat/synthetic');
  for (let i = 0; i < 30 && !gateway.pendingApprovals().length; i++) await new Promise(resolve => setImmediate(resolve));
  const pending = gateway.pendingApprovals()[0]!;
  const picked = path.join(base, 'picked-only'); await fs.mkdir(picked);
  const before = structuredClone(getConfig().roots);
  await gateway.chooseApprovalRoots(pending.id, [picked]); await gateway.answerApproval(pending.id, true, true);
  const response = await reply; if (!('runId' in response)) throw new Error(response.error);
  success(await gateway.call(patch(response.runId, `*** Add File: ${path.join(picked, 'picked.txt')}\n+picked write`), sender));
  expect(await fs.readFile(path.join(picked, 'picked.txt'), 'utf8')).toBe('picked write\n');
  expect((await gateway.call(patch(read.runId, '*** Add File: /granted/still-read-only.txt\n+no'), sender)).error).toBe('TOOL_NOT_GRANTED');
  const saved = await readDurable<Array<{ value: VeniceRunGrant }>>('venice-grants');
  expect(saved?.find(row => row.value.runId === response.runId)?.value).toMatchObject({ write: true, tools: ['core/read', 'core/apply_patch'] });
  expect(getConfig().roots).toEqual(before);
});

it('honors read-only and granular live capabilities without granting shell or Desktop', async () => {
  const g = await granted(true), config = getConfig();
  try {
    await saveConfig({ ...config, readOnly: true });
    expect((await gateway.call(patch(g.runId, '*** Add File: /granted/read-only-mode.txt\n+no'), sender)).result).toMatchObject({ isError: true });
    await saveConfig({ ...config, capabilities: { ...config.capabilities, edit: false } });
    expect((await gateway.call(patch(g.runId, '*** Update File: /granted/once.txt\n@@\n-new\n+not permitted'), sender)).result).toMatchObject({ isError: true });
    expect(await fs.readFile(path.join(root, 'once.txt'), 'utf8')).toBe('new\n');
    for (const tool of ['exec_command', 'write_stdin', 'find', 'computer']) {
      expect((await gateway.call({ ...patch(g.runId, ''), tool }, sender)).error).toBe('TOOL_NOT_GRANTED');
    }
  } finally { await saveConfig(config); }
});

it.each(['revoke', 'read-only'])('rechecks %s after the awaited checkpoint and before the first real write', async change => {
  const g = await granted(true), config = getConfig();
  let entered!: () => void, release!: () => void;
  const ready = new Promise<void>(resolve => { entered = resolve; });
  const held = new Promise<void>(resolve => { release = resolve; });
  const spy = vi.spyOn(checkpoints, 'checkpointBeforePatch').mockImplementationOnce(async () => { entered(); await held; });
  const target = `late-${change}.txt`;
  const call = gateway.call(patch(g.runId, `*** Add File: /granted/${target}\n+must not be written`), sender);
  try {
    await ready;
    if (change === 'revoke') gateway.revoke(g.runId);
    else await saveConfig({ ...config, readOnly: true });
    release(); expect((await call).result).toMatchObject({ isError: true });
    await expect(fs.stat(path.join(root, target))).rejects.toMatchObject({ code: 'ENOENT' });
  } finally { release(); spy.mockRestore(); await saveConfig(config); }
});

it('uses the authenticated existing HTTP route for both preview and application and rejects forged owners', async () => {
  const g = await granted(true), request = patch(g.runId, '*** Add File: /granted/http.txt\n+HTTP patch');
  const post = (preview = false, documentId = sender.documentId) => fetch(`http://127.0.0.1:${port}/venice/tools`, {
    method: 'POST', headers: { authorization: 'Bearer synthetic-patch-token', 'content-type': 'application/json',
      'x-extension-protocol': String(BRIDGE_PROTOCOL), 'x-extension-browser': sender.browserId },
    body: JSON.stringify({ sender: { tabId: sender.tabId, documentId }, request, ...(preview ? { preview: true } : {}) })
  });
  expect((await post(true, 'forged')).status).toBe(400);
  const preview = await (await post(true)).json() as { diff: string }; expect(preview.diff).toContain('+HTTP patch');
  await expect(fs.stat(path.join(root, 'http.txt'))).rejects.toMatchObject({ code: 'ENOENT' });
  success(await (await post()).json()); expect(await fs.readFile(path.join(root, 'http.txt'), 'utf8')).toBe('HTTP patch\n');
});
