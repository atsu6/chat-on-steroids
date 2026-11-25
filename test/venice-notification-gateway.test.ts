import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
vi.mock('electron', () => ({ shell: {}, clipboard: {} }));
import { VeniceToolGateway } from '../src/main/venice-tool-gateway.js';
import { initConfigPath, defaultConfig, saveConfig } from '../src/main/config.js';
import { initSessionStore, createSession, flushSessions } from '../src/main/session/store.js';
import { makeTempDir, removeTempDir } from './helpers.js';
import type { VeniceRunEvent } from '../src/shared/venice-integration.js';
let base: string, sessionId: string;
const sender = { browserId: 'b'.repeat(32), tabId: 7, documentId: 'synthetic-notification-document' };
beforeAll(async () => {
  base = await makeTempDir('venice-notifications-'); initConfigPath(base); initSessionStore(base);
  await saveConfig({ ...defaultConfig(), roots: [{ name: 'synthetic', path: base }] }); sessionId = (await createSession({ title: 'Synthetic notification owner' })).id;
});
afterAll(async () => { await flushSessions(); await removeTempDir(base); });
function fixture(recordRun = vi.fn(async (_grant: unknown, _event: VeniceRunEvent) => {})) {
  const gateway = new VeniceToolGateway({ load: async () => null, save: async () => {}, execute: vi.fn(), recordRun });
  const run = vi.fn(), approvals = vi.fn(); gateway.setNotifications({ run, approvals }); return { gateway, recordRun, run, approvals };
}
it('publishes only after the durable event, once, without replay on duplicate completion or Stop', async () => {
  const f = fixture(); f.recordRun.mockImplementation(async () => { expect(f.run.mock.calls.length).toBe(f.recordRun.mock.calls.length - 1); });
  const g = await f.gateway.grant(sessionId, [base], sender), event = { type: 'completed', message: 'Synthetic result' } as const;
  await f.gateway.runEvent({ runId: g.runId, event }, sender); await f.gateway.runEvent({ runId: g.runId, event }, sender);
  f.gateway.revoke(g.runId); await f.gateway.waitForRevocation(); expect(f.run.mock.calls.map(call => call[1].type)).toEqual(['started', 'completed']);
});
it('does not publish an event rejected by durable storage', async () => {
  const f = fixture(); const g = await f.gateway.grant(sessionId, [base], sender); f.run.mockClear();
  f.recordRun.mockRejectedValueOnce(new Error('Synthetic storage failure'));
  await expect(f.gateway.runEvent({ runId: g.runId, event: { type: 'completed', message: '' } }, sender)).rejects.toThrow('storage failure');
  expect(f.run).not.toHaveBeenCalled(); await f.gateway.stop();
});
it('keeps the durable terminal result valid even when a native observer throws', async () => {
  const f = fixture(); const g = await f.gateway.grant(sessionId, [base], sender); f.run.mockImplementation(() => { throw new Error('Synthetic native failure'); });
  const report = { runId: g.runId, event: { type: 'failed', message: 'Synthetic model failure' } };
  await expect(f.gateway.runEvent(report, sender)).resolves.toEqual({ recorded: true });
  await expect(f.gateway.runEvent(report, sender)).resolves.toEqual({ recorded: true }); expect(f.recordRun).toHaveBeenCalledTimes(2); await f.gateway.stop();
});
it('publishes app-owned pending requests and their removal independently from the dialog observer', async () => {
  const f = fixture(), ui = vi.fn(); f.gateway.setApprovalUi({ notify: ui, context: async () => ({ sessionId, sessionTitle: 'App owner', project: null }) });
  const reply = f.gateway.requestGrant({ requestId: randomUUID(), tools: ['core/read'], instructionSummary: 'Synthetic instruction' }, sender, 'https://venice.ai/chat/synthetic');
  await vi.waitFor(() => expect(f.approvals).toHaveBeenCalledTimes(1)); const [pending] = f.gateway.pendingApprovals();
  expect(f.approvals).toHaveBeenLastCalledWith([pending]); expect(ui).toHaveBeenLastCalledWith([pending]);
  await f.gateway.answerApproval(pending!.id, false); expect(await reply).toHaveProperty('error'); expect(f.approvals).toHaveBeenLastCalledWith([]); await f.gateway.stop();
});
it('does not publish historical notifications while initialization recovers interrupted runs', async () => {
  const recoverHistory = vi.fn(async () => {}), run = vi.fn();
  const gateway = new VeniceToolGateway({ load: async () => null, save: async () => {}, execute: vi.fn(), recoverHistory });
  gateway.setNotifications({ run, approvals: vi.fn() }); await gateway.initialize(); expect(recoverHistory).toHaveBeenCalledTimes(1); expect(run).not.toHaveBeenCalled(); await gateway.stop();
});
