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
import { locateRipgrep } from '../src/main/ripgrep.js';
import * as search from '../src/main/search.js';
import { makeTempDir, removeTempDir } from './helpers.js';
import type { VeniceFindResult, VeniceRunGrant, VeniceToolCallRequest } from '../src/shared/venice-integration.js';

let base: string, root: string, outside: string, sessionId: string, port: number;
const sender: VeniceSender = { browserId: 'a'.repeat(32), tabId: 11, documentId: 'synthetic-find-document' };
const grant = (find = true) => gateway.grant(sessionId, [root], sender, false, false, find);
const request = (runId: string, args: Record<string, unknown> = {}): VeniceToolCallRequest => ({ runId, callId: randomUUID(), surface: 'core', tool: 'find', args: { query: 'needle', ...args } });
const result = (response: unknown): VeniceFindResult => {
  expect(response).toMatchObject({ state: 'completed', result: { structuredContent: { matches: expect.any(Array) } } });
  expect(response).not.toHaveProperty('result.isError', true);
  return (response as {result: {structuredContent: VeniceFindResult}}).result.structuredContent;
};
beforeAll(async () => {
  base = await makeTempDir('venice-find-'); root = path.join(base, 'root'); outside = path.join(base, 'other');
  await fs.mkdir(root); await fs.mkdir(outside);
  await fs.writeFile(path.join(root, 'hits.txt'), 'heading\nneedle first\nnot this\nneedle second <img src=x>\n');
  await fs.writeFile(path.join(root, 'many.txt'), Array.from({ length: 201 }, (_, i) => `crowd ${i}`).join('\n') + '\n');
  await fs.writeFile(path.join(root, 'exact.txt'), Array.from({ length: 200 }, (_, i) => `exact ${i}`).join('\n') + '\n');
  await fs.writeFile(path.join(root, 'nul.txt'), 'needle\0binary');
  await fs.writeFile(path.join(root, 'binary.bin'), Buffer.from([0, 1, 2, ...Buffer.from('needle')]));
  await fs.writeFile(path.join(root, 'utf16.txt'), Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('heading\nneedle UTF16\n', 'utf16le')]));
  await fs.writeFile(path.join(outside, 'private.txt'), 'outside-only needle\n');
  await fs.symlink(path.join(outside, 'private.txt'), path.join(root, 'escape.txt')); await fs.symlink(outside, path.join(root, 'escape-dir'));
  initConfigPath(base); initSessionStore(base); initDurableStore(base); initSecretsPath(base);
  await saveConfig({ ...defaultConfig(), roots: [{ name: 'granted', path: root }, { name: 'other', path: outside }] });
  sessionId = (await createSession({ title: 'Synthetic find owner' })).id;
  await setSecret('bridgeToken', 'synthetic-find-token'); port = (await startBridge())!;
  expect(locateRipgrep()).toBeTruthy();
});
afterEach(() => vi.restoreAllMocks());
afterAll(async () => { await gateway.stop(); await shutdownBridge(); await removeTempDir(base); });

it('preserves legacy read grants and requires both the read scope and an explicitly admitted find tool', async () => {
  const legacy = await grant(false); expect(legacy.tools).toEqual(['core/read']);
  expect((await gateway.call(request(legacy.runId), sender)).error).toBe('TOOL_NOT_GRANTED');
  const g = await grant(); expect(g.tools).toEqual(['core/read', 'core/find']); expect(g.write).toBeUndefined(); expect(g.shell).toBeUndefined();
  // Simulate a corrupted app-owned allowlist: a tool name cannot stand in for read authority.
  const rows = (gateway as unknown as {grants: Map<string, {value: VeniceRunGrant}>}).grants;
  rows.get(g.runId)!.value.tools = ['core/find'];
  expect((await gateway.call(request(g.runId), sender)).error).toBe('TOOL_NOT_GRANTED');
});

it('denies when live read permission is disabled, even with find in the run allowlist', async () => {
  const g = await grant(), config = getConfig(), spy = vi.spyOn(search, 'searchOneFile');
  try {
    await saveConfig({ ...config, capabilities: { ...config.capabilities, read: false } });
    expect((await gateway.call(request(g.runId, { path: '/granted/hits.txt' }), sender)).result).toMatchObject({ isError: true });
    expect(spy).not.toHaveBeenCalled();
  } finally { await saveConfig(config); }
});

it('works in read-only mode with command execution disabled', async () => {
  const g = await grant(), config = getConfig();
  try {
    await saveConfig({ ...config, readOnly: true, capabilities: { ...config.capabilities, command: false } });
    expect(result(await gateway.call(request(g.runId, { path: '/granted/hits.txt' }), sender)).count).toBe(2);
  } finally { await saveConfig(config); }
});

it('refuses native, virtual, traversal and symlink paths outside the grant, even when globally approved', async () => {
  const g = await grant(), spy = vi.spyOn(search, 'search');
  for (const p of [outside, '/other', '/granted/../other', '/granted/escape.txt', '/granted/escape-dir']) {
    expect((await gateway.call(request(g.runId, { path: p }), sender)).result).toMatchObject({ isError: true });
  }
  expect(spy).not.toHaveBeenCalled();
  expect(result(await gateway.call(request(g.runId, { query: 'outside-only' }), sender)).matches).toEqual([]);
});

it('searches real file content through ripgrep with paths, line numbers, snippets and the default 200 limit', async () => {
  const g = await grant(), reply = await gateway.call(request(g.runId, { path: '/granted/hits.txt' }), sender);
  expect(result(reply)).toMatchObject({ matches: [
    { path: '/granted/hits.txt', line: 2, text: 'needle first' }, { path: '/granted/hits.txt', line: 4, text: 'needle second <img src=x>' }
  ], count: 2, limit: 200, truncated: false, stoppedBecause: [], binaryPolicy: 'skip' });
  expect((await readEvents(sessionId, { limit: 100 })).some(row => row.kind === 'tool_call' && row.call.tool === 'find' && row.call.attribution === 'host_admitted')).toBe(true);
  expect(result(await gateway.call(request(g.runId, { path: 'hits.txt', query: 'needle (first|second)', regex: true }), sender)).count).toBe(2);
});

it('returns an explicit empty result for zero matches', async () => {
  const g = await grant(); expect(result(await gateway.call(request(g.runId, { query: 'does-not-exist' }), sender))).toMatchObject({ count: 0, matches: [], truncated: false });
});

it('clips above 200 matches by default, but does not mark an exactly full result as truncated', async () => {
  const g = await grant();
  const over = result(await gateway.call(request(g.runId, { query: 'crowd', path: '/granted/many.txt' }), sender));
  expect(over.matches).toHaveLength(200); expect(over.count).toBe(200); expect(over.truncated).toBe(true); expect(over.stoppedBecause).toContain('limit');
  const exact = result(await gateway.call(request(g.runId, { query: 'exact', path: '/granted/exact.txt' }), sender));
  expect(exact.matches).toHaveLength(200); expect(exact.truncated).toBe(false);
  expect(result(await gateway.call(request(g.runId, { path: '/granted/hits.txt', max_results: 1 }), sender))).toMatchObject({ count: 1, limit: 1, truncated: true });
});

it('skips NUL-marked binary files, but decodes BOM-marked UTF16 without leaking NUL', async () => {
  const g = await grant();
  for (const name of ['nul.txt', 'binary.bin']) expect(result(await gateway.call(request(g.runId, { path: `/granted/${name}` }), sender))).toMatchObject({ matches: [], binaryPolicy: 'skip' });
  const response = await gateway.call(request(g.runId, { path: '/granted/utf16.txt' }), sender);
  expect(result(response).matches).toEqual([{ path: '/granted/utf16.txt', line: 2, text: 'needle UTF16' }]);
  expect(JSON.stringify(response)).not.toContain('\\u0000');
});

it('keeps existing name/include/regex options, and validates argument limits with the existing schema', async () => {
  const g = await grant();
  expect(result(await gateway.call(request(g.runId, { query: 'hits', mode: 'name' }), sender)).matches).toEqual([{ path: '/granted/hits.txt' }]);
  expect(result(await gateway.call(request(g.runId, { path: '/granted/hits.txt', include: '*.md' }), sender)).count).toBe(0);
  for (const args of [{ max_results: 501 }, { max_results: 0 }, { regex: true, mode: 'name' }, { query: '' }]) {
    expect((await gateway.call(request(g.runId, args), sender)).result).toMatchObject({ isError: true });
  }
});

it('replays the same callId, refuses revoked new calls and withholds an in-flight result after revoke', async () => {
  const g = await grant(), req = request(g.runId, { path: '/granted/hits.txt' });
  const spy = vi.spyOn(search, 'searchOneFile');
  const [first, second] = await Promise.all([gateway.call(req, sender), gateway.call(req, sender)]); expect(second).toEqual(first); expect(spy).toHaveBeenCalledTimes(1);
  gateway.revoke(g.runId); expect(await gateway.call(req, sender)).toEqual(first); expect((await gateway.call(request(g.runId), sender)).error).toBe('RUN_REVOKED');
  const active = await grant(); let release!: () => void, entered!: () => void;
  const ready = new Promise<void>(resolve => { entered = resolve; }), held = new Promise<void>(resolve => { release = resolve; });
  spy.mockImplementationOnce(async () => { entered(); await held; return { hits: [{ path: '/granted/hits.txt', line: 1, text: 'withheld' }], filesScanned: 1, truncated: false, stoppedBecause: null, elapsedMs: 0 }; });
  const call = gateway.call(request(active.runId, { path: '/granted/hits.txt' }), sender); await ready; gateway.revoke(active.runId); release();
  expect((await call).result).toMatchObject({ isError: true, content: [{ text: 'RUN_REVOKED' }] });
});

it('admits a new read+find approval without adding write or shell, while old read-only approvals stay unchanged', async () => {
  gateway.setApprovalUi({ notify: () => {}, context: async () => ({ sessionId, sessionTitle: 'Find owner', project: null }) });
  const reply = gateway.requestGrant({ requestId: randomUUID(), tools: ['core/read', 'core/find'], instructionSummary: 'Synthetic search' }, sender, 'https://venice.ai/chat/synthetic');
  await vi.waitFor(() => expect(gateway.pendingApprovals()).toHaveLength(1)); const pending = gateway.pendingApprovals()[0]!;
  expect(pending.tools).toEqual(['core/read', 'core/find']); await gateway.chooseApprovalRoots(pending.id, [root]); await gateway.answerApproval(pending.id, true);
  const approved = await reply; if (!('runId' in approved)) throw new Error(approved.error);
  expect(result(await gateway.call(request(approved.runId), sender)).count).toBeGreaterThan(0);
  const saved = await readDurable<Array<{ value: VeniceRunGrant }>>('venice-grants');
  expect(saved?.find(row => row.value.runId === approved.runId)?.value.tools).toEqual(['core/read', 'core/find']);
});

it('uses the authenticated HTTP gateway and applies the existing secrets shield to both output forms', async () => {
  const g = await grant(), fake = 'sk-' + 'SyntheticOnly'.repeat(4); await fs.writeFile(path.join(root, 'secret.txt'), `needle ${fake}\n`);
  const req = request(g.runId, { path: '/granted/secret.txt' });
  const response = await fetch(`http://127.0.0.1:${port}/venice/tools`, { method: 'POST', headers: { authorization: 'Bearer synthetic-find-token', 'content-type': 'application/json',
    'x-extension-protocol': String(BRIDGE_PROTOCOL), 'x-extension-browser': sender.browserId }, body: JSON.stringify({ request: req, sender: { tabId: sender.tabId, documentId: sender.documentId } }) });
  expect(response.status).toBe(200); const value = await response.json(); expect(result(value).count).toBe(1);
  expect(JSON.stringify(value)).not.toContain(fake); expect(JSON.stringify(value)).toContain('hidden by Chat On Steroids');
});
