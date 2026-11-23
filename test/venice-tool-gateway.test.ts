import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
vi.mock('electron', () => ({ safeStorage: {
  isAsyncEncryptionAvailable: async () => true, getSelectedStorageBackend: () => 'unknown',
  encryptStringAsync: async (value: string) => Buffer.from(value),
  decryptStringAsync: async (value: Buffer) => ({ result: value.toString(), shouldReEncrypt: false })
}, shell: {}, clipboard: {} }));
import { VeniceToolGateway, veniceToolGateway, type VeniceSender } from '../src/main/venice-tool-gateway.js';
import { defaultConfig, initConfigPath, saveConfig, getConfig } from '../src/main/config.js';
import { initDurableStore, readDurable, writeDurableNow } from '../src/main/durable.js';
import { createSession, initSessionStore, readEvents } from '../src/main/session/store.js';
import { initSecretsPath, setSecret } from '../src/main/secrets.js';
import { startBridge, shutdownBridge } from '../src/main/bridge.js';
import { BRIDGE_PROTOCOL } from '../src/main/version.js';
import { makeTempDir, removeTempDir } from './helpers.js';
import type { VeniceToolCallRequest, VeniceToolCallResponse } from '../src/shared/venice-integration.js';

let base = '', sessionId = '', port: number;
const sender: VeniceSender = { browserId: 'a'.repeat(32), tabId: 7, documentId: 'synthetic-document' };
const request = (runId: string): VeniceToolCallRequest => ({ runId, callId: randomUUID(), surface: 'core', tool: 'read',
  args: { paths: ['/granted/small.txt'] } });
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}
beforeAll(async () => {
  base = await makeTempDir('venice-gateway-');
  await fs.mkdir(path.join(base, 'root')); await fs.mkdir(path.join(base, 'outside'));
  await fs.writeFile(path.join(base, 'root/small.txt'), 'synthetic local read\n');
  await fs.writeFile(path.join(base, 'outside/private.txt'), 'must not leave the other root');
  await fs.symlink(path.join(base, 'outside/private.txt'), path.join(base, 'root/escape.txt'));
  initConfigPath(base); initSessionStore(base); initDurableStore(base); initSecretsPath(base);
  await saveConfig({ ...defaultConfig(), roots: [{ name: 'granted', path: path.join(base, 'root') },
    { name: 'other', path: path.join(base, 'outside') }] });
  sessionId = (await createSession({ title: 'Synthetic Venice owner' })).id;
  await setSecret('bridgeToken', 'synthetic-venice-token');
  port = (await startBridge())!;
});
afterAll(async () => { await veniceToolGateway.stop(); await shutdownBridge(); await removeTempDir(base); });

function model(execute = vi.fn(async () => ({ content: [{ type: 'text', text: 'synthetic result' }] }))) {
  const snapshots: unknown[] = [];
  const save = vi.fn(async (rows: unknown) => { snapshots.push(structuredClone(rows)); });
  return { gateway: new VeniceToolGateway({ load: async () => null, save, execute }), execute, save, snapshots };
}
const grant = (gateway: VeniceToolGateway) => gateway.grant(sessionId, [path.join(base, 'root')], sender);

it('reserves before the first await, persists acceptance before execution, and replays without executing again', async () => {
  const saving = deferred(), saved = deferred();
  let committed = false;
  const execute = vi.fn(async () => { expect(committed).toBe(true); return { content: [{ type: 'text', text: 'once' }] }; });
  const save = vi.fn(async () => {
    if (save.mock.calls.length === 1) { saving.resolve(); await saved.promise; committed = true; }
  });
  const gateway = new VeniceToolGateway({ load: async () => null, save, execute });
  const g = await grant(gateway), r = request(g.runId);
  const a = gateway.call(r, sender), b = gateway.call(structuredClone(r), sender);
  await saving.promise; expect(execute).not.toHaveBeenCalled(); saved.resolve();
  const [first, second] = await Promise.all([a, b]);
  expect(first).toEqual(second); expect(first.state).toBe('completed');
  expect(await gateway.call(r, sender)).toEqual(first);
  expect(execute).toHaveBeenCalledTimes(1); expect(save).toHaveBeenCalledTimes(2);
  expect((await gateway.call({ ...r, args: {} }, sender)).error).toBe('CALL_ID_CONFLICT');
  expect((await gateway.call(r, { ...sender, documentId: 'other' })).error).toBe('CALL_ID_CONFLICT');
});

it('refuses new calls after revocation and rechecks revocation after a delayed durable acceptance', async () => {
  const f = model(); const g = await grant(f.gateway);
  f.gateway.revoke(g.runId);
  expect((await f.gateway.call(request(g.runId), sender)).error).toBe('RUN_REVOKED');
  expect(f.execute).not.toHaveBeenCalled(); expect(f.save).not.toHaveBeenCalled();
  const saving = deferred(), saved = deferred();
  const gateway = new VeniceToolGateway({ load: async () => null, save: async () => {
    saving.resolve(); await saved.promise;
  }, execute: f.execute });
  const g2 = await grant(gateway), r = request(g2.runId), reply = gateway.call(r, sender);
  await saving.promise; gateway.revoke(g2.runId); saved.resolve();
  expect((await reply).error).toBe('RUN_REVOKED'); expect(f.execute).not.toHaveBeenCalled();
});

it('refuses a wrong run, document, browser, surface or tool without executing', async () => {
  const f = model(), g = await grant(f.gateway);
  for (const change of [{ runId: randomUUID() }, { surface: 'desktop' as const }, { tool: 'exec_command' }]) {
    expect((await f.gateway.call({ ...request(g.runId), ...change }, sender)).state).toBe('unknown');
  }
  for (const source of [{ ...sender, tabId: 8 }, { ...sender, documentId: 'other' }, { ...sender, browserId: 'b'.repeat(32) }]) {
    expect((await f.gateway.call(request(g.runId), source)).error).toBe('RUN_NOT_AUTHORIZED');
  }
  expect(f.execute).not.toHaveBeenCalled();
});

it('does not execute after failed acceptance persistence or repeat an effect after failed result persistence', async () => {
  for (const failAt of [1, 2]) {
    const execute = vi.fn(async () => ({}));
    const save = vi.fn(async () => { if (save.mock.calls.length === failAt) throw new Error('synthetic disk error'); });
    const gateway = new VeniceToolGateway({ load: async () => null, save, execute });
    const g = await grant(gateway), r = request(g.runId);
    const first = await gateway.call(r, sender);
    expect(first.error).toBe(failAt === 1 ? 'ACCEPTANCE_NOT_DURABLE' : 'RESULT_NOT_DURABLE');
    expect(await gateway.call(r, sender)).toEqual(first);
    expect(execute).toHaveBeenCalledTimes(failAt - 1);
  }
});

it('restores an accepted pending record as unknown and never restores its run as execution authority', async () => {
  const r = request(randomUUID()), execute = vi.fn(async () => ({}));
  await writeDurableNow('venice-test-restore', [{ request: r, sender, response: { callId: r.callId, state: 'pending' } }]);
  const gateway = new VeniceToolGateway({ load: () => readDurable('venice-test-restore', { strict: true }),
    save: async () => {}, execute });
  expect((await gateway.call(r, sender)).error).toBe('OUTCOME_UNKNOWN');
  expect((await gateway.call({ ...r, callId: randomUUID() }, sender)).error).toBe('RUN_NOT_AUTHORIZED');
  expect(execute).not.toHaveBeenCalled();
});

it('records an oversized known result as completed with an explicit limit error, without repeating it', async () => {
  const execute = vi.fn(async () => 'x'.repeat(1_000_001));
  const gateway = new VeniceToolGateway({ load: async () => null, save: async () => {}, execute });
  const g = await grant(gateway), r = request(g.runId);
  const result = await gateway.call(r, sender);
  expect(result).toEqual({ callId: r.callId, state: 'completed', error: 'RESULT_TOO_LARGE' });
  expect(await gateway.call(r, sender)).toEqual(result);
  expect(execute).toHaveBeenCalledTimes(1);
});

it('uses the real host-admitted kernel read, schema and sandbox, and files exactly one call in the local session', async () => {
  const g = await grant(veniceToolGateway), r = request(g.runId);
  const first = await veniceToolGateway.call(r, sender);
  expect(first.state).toBe('completed');
  expect(JSON.stringify(first.result)).toContain('synthetic local read');
  expect(await veniceToolGateway.call(r, sender)).toEqual(first);
  const events = await readEvents(sessionId, { limit: 100 });
  const calls = events.filter(event => event.kind === 'tool_call');
  expect(calls).toHaveLength(1);
  expect(calls[0]!.kind === 'tool_call' && calls[0]!.call.attribution).toBe('host_admitted');
  for (const target of ['/other/private.txt', '/granted/escape.txt', '/granted/../other/private.txt', path.join(base, 'outside/private.txt')]) {
    const result = await veniceToolGateway.call({ ...request(g.runId), args: { paths: [target] } }, sender);
    expect(result.state).toBe('completed');
    expect((result.result as { isError?: boolean }).isError).toBe(true);
    expect(JSON.stringify(result)).not.toContain('must not leave');
  }
  const invalid = await veniceToolGateway.call({ ...request(g.runId), args: { paths: 'not-an-array' } }, sender);
  expect(JSON.stringify(invalid)).toContain('INVALID_ARGUMENTS');
  veniceToolGateway.revoke(g.runId);
  expect(await veniceToolGateway.call(r, sender)).toEqual(first);
});

it('honors live reading permission and permits read-only reads without enabling Desktop or commands', async () => {
  const config = getConfig();
  const g = await grant(veniceToolGateway);
  await saveConfig({ ...config, readOnly: true });
  expect(JSON.stringify((await veniceToolGateway.call(request(g.runId), sender)).result)).toContain('synthetic local read');
  await saveConfig({ ...getConfig(), capabilities: { ...config.capabilities, read: false } });
  expect(JSON.stringify((await veniceToolGateway.call(request(g.runId), sender)).result)).toContain('TOOL_DISABLED');
  await saveConfig(config);
});

it('serves the authenticated POST route, rejects spoofed documents, and preserves hello', async () => {
  const g = await grant(veniceToolGateway), r = request(g.runId);
  const post = (source: VeniceSender, token = 'synthetic-venice-token') => fetch(`http://127.0.0.1:${port}/venice/tools`, {
    method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json',
      'x-extension-protocol': String(BRIDGE_PROTOCOL), 'x-extension-browser': source.browserId },
    body: JSON.stringify({ request: r, sender: { tabId: source.tabId, documentId: source.documentId } })
  });
  expect((await post(sender, 'wrong')).status).toBe(401);
  const wrong = await (await post({ ...sender, documentId: 'spoofed' })).json() as VeniceToolCallResponse;
  expect(wrong.error).toBe('RUN_NOT_AUTHORIZED');
  // Use a new call ID after the refused request, rather than changing its original sender.
  r.callId = randomUUID();
  expect(JSON.stringify(await (await post(sender)).json())).toContain('synthetic local read');
  const hello = await (await fetch(`http://127.0.0.1:${port}/hello`)).json() as { bridge: number };
  expect(hello.bridge).toBe(BRIDGE_PROTOCOL);
});

function approval(gateway: VeniceToolGateway) {
  const notify = vi.fn();
  gateway.setApprovalUi({ notify, context: async () => ({ sessionId, sessionTitle: 'App-owned session', project: null }) });
  const input = () => ({ requestId: randomUUID(), tools: ['core/read'], instructionSummary: 'synthetic instruction' });
  const wait = async () => { for (let i = 0; i < 30; i++) { const row = gateway.pendingApprovals()[0]; if (row) return row; await new Promise(resolve => setImmediate(resolve)); } throw new Error('missing approval'); };
  return { notify, input, wait };
}

it('keeps app-owned targets, denies empty folders and returns a readable denial without executing', async () => {
  const f = model(), a = approval(f.gateway), input = a.input();
  const reply = f.gateway.requestGrant(input, sender, 'https://venice.ai/chat/synthetic');
  expect(f.gateway.requestGrant(input, sender, 'https://venice.ai/chat/synthetic')).toBe(reply);
  const pending = await a.wait();
  expect(pending.sessionTitle).toBe('App-owned session'); expect(pending.tools).toEqual(['core/read']);
  await expect(f.gateway.answerApproval(pending.id, true)).rejects.toThrow('venice_folder_required');
  await f.gateway.answerApproval(pending.id, false);
  expect(await reply).toEqual({ error: 'ファイルの読み取りを許可しませんでした。' });
  expect(f.execute).not.toHaveBeenCalled(); expect(f.gateway.pendingApprovals()).toEqual([]);
  expect(() => f.gateway.requestGrant({...input,sessionId:'forged'}, sender, 'https://venice.ai/')).toThrow();
  expect(() => f.gateway.requestGrant({...input,tools:['core/exec_command']}, sender, 'https://venice.ai/')).toThrow();
});

it('durably saves a picked run before returning its ID, revokes by sender and never widens configured roots', async () => {
  const barrier = deferred(), saving = deferred();
  const saveGrants = vi.fn(async () => { saving.resolve(); await barrier.promise; });
  const execute = vi.fn(async () => ({}));
  const gateway = new VeniceToolGateway({load:async()=>null,save:async()=>{},saveGrants,execute});
  const a = approval(gateway), before = structuredClone(getConfig().roots);
  const reply = gateway.requestGrant(a.input(), sender, 'https://venice.ai/chat/synthetic');
  const pending = await a.wait();
  await gateway.chooseApprovalRoots(pending.id, [path.join(base,'outside')]);
  let returned = false; void reply.then(() => { returned = true; });
  const answer = gateway.answerApproval(pending.id, true);
  await saving.promise; expect(returned).toBe(false); barrier.resolve(); await answer;
  const grant = await reply; expect('runId' in grant).toBe(true);
  if (!('runId' in grant)) throw new Error(grant.error);
  expect(getConfig().roots).toEqual(before);
  expect(gateway.revokeSender({...sender,documentId:'other'},grant.runId)).toBe(false);
  expect(gateway.revokeSender(sender,grant.runId)).toBe(true);
  expect((await gateway.call(request(grant.runId),sender)).error).toBe('RUN_REVOKED');
  expect(execute).not.toHaveBeenCalled();
});

it('cancels pending approvals on reload and shutdown, including a late durable grant completion', async () => {
  const saving = deferred(), barrier = deferred();
  const gateway = new VeniceToolGateway({load:async()=>null,save:async()=>{},execute:async()=>({}),saveGrants:async()=>{saving.resolve();await barrier.promise;}});
  const a = approval(gateway), reply = gateway.requestGrant(a.input(),sender,'https://venice.ai/');
  const pending = await a.wait(); await gateway.chooseApprovalRoots(pending.id,[path.join(base,'root')]);
  const answer = gateway.answerApproval(pending.id,true);
  await saving.promise; gateway.documentChanged({...sender,documentId:'new-document'});
  expect(await reply).toEqual({error:'このrunは停止されました。'});
  barrier.resolve(); await expect(answer).rejects.toThrow('venice_run_revoked');
  const stopped = gateway.requestGrant(a.input(),{...sender,documentId:'new-document'},'https://venice.ai/');
  await a.wait(); await gateway.stop(); expect(await stopped).toEqual({error:'アプリとの接続が終了しました。'});
});

it('reads a native-picked root outside the global config through the real kernel', async () => {
  const selected = path.join(base,'picked-only'); await fs.mkdir(selected); await fs.writeFile(path.join(selected,'note.txt'),'picked root content');
  const a = approval(veniceToolGateway), before = structuredClone(getConfig().roots);
  const reply = veniceToolGateway.requestGrant(a.input(),sender,'https://venice.ai/');
  const pending = await a.wait(); await veniceToolGateway.chooseApprovalRoots(pending.id,[selected]);
  await veniceToolGateway.answerApproval(pending.id,true); const grant = await reply;
  if (!('runId' in grant)) throw new Error(grant.error);
  const read = await veniceToolGateway.call({...request(grant.runId),args:{paths:[path.join(selected,'note.txt')]}},sender);
  expect(JSON.stringify(read.result)).toContain('picked root content'); expect(getConfig().roots).toEqual(before);
  const persisted = await readDurable<unknown[]>('venice-grants'); expect(JSON.stringify(persisted)).toContain(grant.runId);
  veniceToolGateway.documentChanged({...sender,documentId:'reloaded'});
  expect((await veniceToolGateway.call(request(grant.runId),sender)).error).toBe('RUN_REVOKED');
});

it('shutdown durably marks granted runs inactive and refuses any new call', async () => {
  const snapshots: unknown[][] = [], execute = vi.fn(async()=>({}));
  const gateway = new VeniceToolGateway({load:async()=>null,save:async()=>{},execute,
    saveGrants:async rows=>{snapshots.push(structuredClone(rows));}});
  const granted = await grant(gateway); await gateway.stop();
  expect(snapshots.at(-1)).toMatchObject([{active:false}]);
  expect((await gateway.call(request(granted.runId),sender)).error).toBe('RUN_REVOKED');
  expect(execute).not.toHaveBeenCalled();
});
