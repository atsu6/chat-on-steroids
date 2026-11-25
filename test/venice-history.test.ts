import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { beforeAll, afterAll, expect, it, vi } from 'vitest';
vi.mock('electron', () => ({ safeStorage: {
  isAsyncEncryptionAvailable: async () => true, getSelectedStorageBackend: () => 'unknown',
  encryptStringAsync: async (value: string) => Buffer.from(value),
  decryptStringAsync: async (value: Buffer) => ({ result: value.toString(), shouldReEncrypt: false })
}, shell: {}, clipboard: {} }));
import { VeniceToolGateway, veniceToolGateway, recoverVeniceRunHistory, type VeniceSender } from '../src/main/venice-tool-gateway.js';
import { recordVeniceRun } from '../src/main/session/recorder.js';
import { initConfigPath, defaultConfig, getConfig, saveConfig } from '../src/main/config.js';
import { initSessionStore, createSession, getSession, readEvents, flushSessions, readAsset } from '../src/main/session/store.js';
import { initDurableStore, writeDurableNow } from '../src/main/durable.js';
import { initSecretsPath, setSecret } from '../src/main/secrets.js';
import { startBridge, shutdownBridge } from '../src/main/bridge.js';
import { BRIDGE_PROTOCOL } from '../src/main/version.js';
import { makeTempDir, removeTempDir } from './helpers.js';
import type { VeniceRunEvent, VeniceRunGrant } from '../src/shared/venice-integration.js';
import type { SessionEvent } from '../src/shared/session.js';
let base: string, root: string, port: number;
const sender: VeniceSender = { browserId: 'c'.repeat(32), tabId: 1, documentId: 'synthetic-history-document' };
beforeAll(async () => {
  base = await makeTempDir('venice-history-'); root = path.join(base, 'root'); await fs.mkdir(root);
  await fs.writeFile(path.join(root, 'example.txt'), 'synthetic content\n');
  initConfigPath(base); initSessionStore(base); initDurableStore(base); initSecretsPath(base);
  await saveConfig({ ...defaultConfig(), roots: [{ name: 'granted', path: root }] });
  await setSecret('bridgeToken', 'synthetic-history-token'); port = (await startBridge())!;
});
afterAll(async () => { await veniceToolGateway.stop(); await shutdownBridge(); await flushSessions(); await removeTempDir(base); });
const notes = async (sessionId: string) => (await readEvents(sessionId)).filter((event): event is Extract<SessionEvent, { kind: 'note' }> => event.kind === 'note' && event.venice !== undefined);
const step = { type: 'step', index: 1, name: 'query', ok: true, args: '{"selector":"h1"}', result: 'a heading', truncated: false } as const;
async function fixture(record = (g: VeniceRunGrant, e: VeniceRunEvent) => recordVeniceRun(g.sessionId, g.runId, e)) {
  const sessionId = (await createSession({ title: 'Synthetic history owner' })).id;
  const execute = vi.fn(async () => ({ content: [{ type: 'text', text: 'synthetic' }] }));
  const gateway = new VeniceToolGateway({ load: async () => null, save: async () => {}, execute,
    recordRun: record, saveGrants: rows => writeDurableNow('venice-grants', rows) });
  return { gateway, execute, sessionId };
}
async function approve(gateway: VeniceToolGateway, sessionId: string, instruction: string) {
  gateway.setApprovalUi({ notify: () => {}, context: async () => ({ sessionId, sessionTitle: 'Synthetic history owner', project: null }) });
  const reply = gateway.requestGrant({ requestId: randomUUID(), tools: ['core/read'], instructionSummary: instruction.slice(0, 1000), instruction }, sender, 'https://venice.ai/chat/synthetic');
  await vi.waitFor(() => expect(gateway.pendingApprovals()).toHaveLength(1));
  const pending = gateway.pendingApprovals()[0]!;
  await gateway.chooseApprovalRoots(pending.id, [root]); await gateway.answerApproval(pending.id, true);
  const g = await reply; if (!('runId' in g)) throw new Error(g.error); return g.runId;
}

it('records full approved instructions, idempotent steps and completion without executing a tool', async () => {
  const f = await fixture(), instruction = 'synthetic '.repeat(200), runId = await approve(f.gateway, f.sessionId, instruction);
  await f.gateway.runEvent({ runId, event: step }, sender); await f.gateway.runEvent({ runId, event: step }, sender);
  await expect(f.gateway.runEvent({ runId, event: { ...step, result: 'changed' } }, sender)).rejects.toThrow('HISTORY_CONFLICT');
  await f.gateway.runEvent({ runId, event: { type: 'completed', message: 'Finished the task' } }, sender);
  f.gateway.revoke(runId); await f.gateway.waitForRevocation();
  const rows = await notes(f.sessionId);
  expect(rows.map(row => row.venice!.phase)).toEqual(['started', 'step', 'completed']);
  expect(rows[0]!.message.text).toBe(instruction); expect(rows[1]!.venice!.args!.text).toBe(step.args);
  expect(rows[2]!.message.text).toBe('Finished the task'); expect(f.execute).not.toHaveBeenCalled();
});

it('separates runs and sessions, rejects a different document and cannot grant authority through history', async () => {
  const a = await fixture(), b = await fixture();
  const ga = await a.gateway.grant(a.sessionId, [root], sender), gb = await b.gateway.grant(b.sessionId, [root], sender);
  await expect(a.gateway.runEvent({ runId: gb.runId, event: step }, sender)).rejects.toThrow('RUN_NOT_AUTHORIZED');
  await expect(a.gateway.runEvent({ runId: ga.runId, event: step }, { ...sender, documentId: 'other' })).rejects.toThrow('RUN_NOT_AUTHORIZED');
  await expect(a.gateway.runEvent({ runId: ga.runId, event: { type: 'started', message: 'forged' } }, sender)).rejects.toThrow();
  await a.gateway.runEvent({ runId: ga.runId, event: { type: 'failed', message: 'A useful failure reason' } }, sender);
  expect((await notes(a.sessionId)).map(row => row.venice!.runId)).toEqual([ga.runId, ga.runId]);
  expect((await notes(b.sessionId)).map(row => row.venice!.phase)).toEqual(['started']);
});

it('records Stop and refuses new browser reports after revocation', async () => {
  const f = await fixture(), g = await f.gateway.grant(f.sessionId, [root], sender);
  f.gateway.revoke(g.runId); await f.gateway.waitForRevocation();
  await expect(f.gateway.runEvent({ runId: g.runId, event: step }, sender)).rejects.toThrow('RUN_REVOKED');
  expect((await notes(f.sessionId)).map(row => row.venice!.phase)).toEqual(['started', 'stopped']);
});

it('withholds a new run when its start cannot be durably recorded', async () => {
  const f = await fixture(async () => { throw new Error('Synthetic history disk failure'); });
  await expect(f.gateway.grant(f.sessionId, [root], sender)).rejects.toThrow('venice_grant_not_durable');
  expect(f.execute).not.toHaveBeenCalled(); expect(await notes(f.sessionId)).toEqual([]);
});

it('restores canonical history and marks interrupted work once, without restoring its grant', async () => {
  const f = await fixture(), g = await f.gateway.grant(f.sessionId, [root], sender);
  await f.gateway.runEvent({ runId: g.runId, event: step }, sender); await flushSessions();
  expect(await fs.readFile(path.join(base, 'sessions', f.sessionId, 'events.jsonl'), 'utf8')).toContain(g.runId);
  await recoverVeniceRunHistory(); await recoverVeniceRunHistory();
  expect((await notes(f.sessionId)).map(row => row.venice!.phase)).toEqual(['started', 'step', 'interrupted']);
  const fresh = new VeniceToolGateway({ load: async () => null, save: async () => {}, execute: f.execute, recoverHistory: recoverVeniceRunHistory });
  await expect(fresh.runEvent({ runId: g.runId, event: step }, sender)).rejects.toThrow('RUN_NOT_AUTHORIZED');
  expect(f.execute).not.toHaveBeenCalled();
});

it('preserves a completed outcome across restart and later revocation', async () => {
  const f = await fixture(), g = await f.gateway.grant(f.sessionId, [root], sender);
  await f.gateway.runEvent({ runId: g.runId, event: { type: 'completed', message: 'done' } }, sender);
  await recoverVeniceRunHistory(); f.gateway.revoke(g.runId); await f.gateway.waitForRevocation();
  expect((await notes(f.sessionId)).map(row => row.venice!.phase)).toEqual(['started', 'completed']);
});

it('projects concurrent active runs independently and clears the final run on Stop', async () => {
  const f = await fixture(), a = await f.gateway.grant(f.sessionId, [root], sender), b = await f.gateway.grant(f.sessionId, [root], sender);
  expect((await getSession(f.sessionId))!.veniceRuns).toEqual([a.runId, b.runId]);
  await f.gateway.runEvent({ runId: a.runId, event: { type: 'completed', message: 'done' } }, sender);
  expect((await getSession(f.sessionId))!.veniceRuns).toEqual([b.runId]);
  f.gateway.revoke(b.runId); await f.gateway.waitForRevocation();
  expect((await getSession(f.sessionId))!.veniceRuns).toEqual([]);
});

it('follows the existing always-on recording policy and redacts known credentials before inline or overflow storage', async () => {
  const config = getConfig(), f = await fixture();
  try {
    await saveConfig({ ...config, sessions: { ...config.sessions, record: false } });
    const g = await f.gateway.grant(f.sessionId, [root], sender);
    await f.gateway.runEvent({ runId: g.runId, event: step }, sender);
    expect(getConfig().sessions.record).toBe(true); // v2.1.55 normalizes legacy OFF to ON.
    expect((await notes(f.sessionId)).map(row => row.venice!.phase)).toEqual(['started', 'step']);
  } finally { await saveConfig(config); }
  const secret = 'sk-' + 'SyntheticOnly'.repeat(4), runId = await approve(f.gateway, f.sessionId, 'x'.repeat(5000) + ' ' + secret + '\0tail');
  const start = (await notes(f.sessionId)).find(row => row.venice!.runId === runId)!;
  expect(start.message.truncated).toBe(true); expect(start.message.assetId).toBeTruthy();
  const full = (await readAsset(f.sessionId, start.message.assetId!))!.toString();
  expect(full).not.toContain(secret); expect(full).not.toContain('\0'); expect(full).toContain('[redacted] tail');
});

it('records real host-admitted tool provenance and accepts page reports through authenticated HTTP', async () => {
  const sessionId = (await createSession({ title: 'Synthetic HTTP history' })).id;
  const g = await veniceToolGateway.grant(sessionId, [root], sender);
  const post = (url: string, body: unknown, token = 'synthetic-history-token') => fetch(`http://127.0.0.1:${port}${url}`, { method: 'POST', headers: {
    'content-type': 'application/json', authorization: `Bearer ${token}`, 'x-extension-protocol': String(BRIDGE_PROTOCOL), 'x-extension-browser': sender.browserId
  }, body: JSON.stringify(body) });
  const source = { tabId: sender.tabId, documentId: sender.documentId }, callId = randomUUID();
  const read = await post('/venice/tools', { sender: source, request: { runId: g.runId, callId, surface: 'core', tool: 'read', args: { paths: ['/granted/example.txt'] } } });
  expect(await read.json()).toMatchObject({ state: 'completed' });
  const report = { sender: source, runId: g.runId, event: { type: 'completed', message: 'Read the synthetic file' } };
  expect((await post('/venice/run/event', report, 'wrong-token')).status).toBe(401);
  expect(await (await post('/venice/run/event', report)).json()).toEqual({ recorded: true });
  const events = await readEvents(sessionId);
  expect(events).toContainEqual(expect.objectContaining({ kind: 'tool_call', call: expect.objectContaining({ attribution: 'host_admitted', venice: { runId: g.runId, callId } }) }));
  veniceToolGateway.revoke(g.runId); await veniceToolGateway.waitForRevocation();
});
