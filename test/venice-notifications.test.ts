import { readFileSync } from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';
import { createVeniceNotifications } from '../src/main/venice-notifications.js';
import { setMainTextTranslations } from '../src/main/main-texts.js';
import type { VeniceGrantPending, VeniceRunGrant } from '../src/shared/venice-integration.js';

const grant = (runId = 'run-a', sessionId = 'session-a'): VeniceRunGrant => ({ runId, sessionId, tabId: 7, documentId: 'synthetic', tools: ['core/read'], roots: ['/synthetic'] });
const approval = (id = 'approval-a', sessionId = 'session-a'): VeniceGrantPending => ({ id, sessionId, sessionTitle: 'Private title', project: null,
  tab: { id: 7, url: 'https://venice.ai/chat/synthetic' }, tools: ['core/read'], instructionSummary: 'Private instructions', roots: [] });
function fixture() {
  let rows: VeniceGrantPending[] = [], focused = false, enabled = true, supported = true, now = 1_000;
  const notices: Array<{ title: string; body: string; click(): void }> = [];
  const session = vi.fn(async (_id: string): Promise<{ title: string } | null> => ({ title: 'Private title' }));
  const open = vi.fn(), sound = vi.fn(), phone = vi.fn(async (_event: unknown) => {}), failed = vi.fn();
  const notifier = createVeniceNotifications({ session, pending: () => rows, enabled: () => enabled, focused: () => focused, supported: () => supported,
    now: () => now, show: (title, body, click) => { notices.push({ title, body, click }); }, open, sound, phone, failed });
  return { notifier, notices, open, session, sound, phone, failed, publish: (next: VeniceGrantPending[]) => { rows = next; notifier.approvals(rows); },
    focus: () => { focused = true; }, disable: () => { enabled = false; }, unsupported: () => { supported = false; }, advance: (ms: number) => { now += ms; } };
}
afterEach(() => setMainTextTranslations({}));

it('delivers one terminal notice per run, with the exact local session and elapsed time', async () => {
  const f = fixture(), g = grant(); f.notifier.run(g, { type: 'started', message: 'Private instruction' }); f.advance(25_000);
  f.notifier.run(g, { type: 'step', index: 1, name: 'query', args: 'private', result: 'private', ok: false, truncated: false });
  f.notifier.run(g, { type: 'completed', message: 'Private answer\0token' });
  f.notifier.run(g, { type: 'completed', message: 'Private answer\0token' });
  await f.notifier.drain(); expect(f.notices).toHaveLength(1);
  expect(f.notices[0]).toMatchObject({ title: 'Private title', body: 'Venice task completed' });
  expect(f.phone).toHaveBeenCalledExactlyOnceWith({ provider: 'venice', kind: 'finished', sessionId: g.sessionId, chatTitle: 'Private title', workedMs: 25_000 });
  expect(f.sound).toHaveBeenCalledExactlyOnceWith('finished', g.sessionId);
  f.notices[0]!.click(); await vi.waitFor(() => expect(f.open).toHaveBeenCalledExactlyOnceWith(g.sessionId, undefined));
});

it('does not notify tool errors, Stop or restored interruptions; distinct runs remain separate', async () => {
  const f = fixture();
  f.notifier.run(grant('stopped'), { type: 'stopped', message: '' });
  f.notifier.run(grant('restored'), { type: 'interrupted', message: '' });
  f.notifier.run(grant('restored'), { type: 'completed', message: 'old result' });
  f.notifier.run(grant(), { type: 'step', index: 1, name: 'read', args: '', result: 'failure', ok: false, truncated: false });
  await f.notifier.drain(); expect(f.notices).toEqual([]); expect(f.phone).not.toHaveBeenCalled();
  f.notifier.run(grant('a', 'owner-a'), { type: 'completed', message: '' });
  f.notifier.run(grant('b', 'owner-b'), { type: 'failed', message: 'Private error' });
  await f.notifier.drain(); expect(f.notices.map(row => row.body)).toEqual(['Venice task completed', 'Venice task failed']);
  f.notices[1]!.click(); await vi.waitFor(() => expect(f.open).toHaveBeenCalledWith('owner-b', undefined));
});

it.each(['focused', 'disabled', 'unsupported'] as const)('suppresses desktop completion when %s without replaying it later', async state => {
  const f = fixture(); if (state === 'focused') f.focus(); else if (state === 'disabled') f.disable(); else f.unsupported();
  f.notifier.run(grant(), { type: 'completed', message: '' }); await f.notifier.drain();
  expect(f.notices).toEqual([]); expect(f.phone).toHaveBeenCalledTimes(1); expect(f.sound).toHaveBeenCalledTimes(1);
  f.notifier.run(grant(), { type: 'completed', message: '' }); await f.notifier.drain(); expect(f.phone).toHaveBeenCalledTimes(1);
});

it('keeps approval/failure independent of the finished-reply toggle and deduplicates root updates', async () => {
  const f = fixture(); f.disable(); const a = approval();
  f.publish([a]); f.publish([{ ...a, roots: ['/synthetic'] }]);
  f.notifier.run(grant(), { type: 'failed', message: 'Private stack' }); await f.notifier.drain();
  expect(f.notices.map(row => row.body)).toEqual(['Venice is waiting for folder approval.', 'Venice task failed']);
  f.notices[0]!.click(); await vi.waitFor(() => expect(f.open).toHaveBeenCalledWith(a.sessionId, a.id));
});

it('opens the selected request, not the first pending request or current window session', async () => {
  const f = fixture(), a = approval(), b = approval('approval-b', 'session-b'); f.publish([a, b]); await f.notifier.drain();
  f.notices[1]!.click(); await vi.waitFor(() => expect(f.open).toHaveBeenCalledExactlyOnceWith('session-b', 'approval-b'));
});

it('ignores a stale approval click rather than redirecting to another pending request', async () => {
  const f = fixture(), a = approval(), b = approval('approval-b', 'session-b'); f.publish([a, b]); await f.notifier.drain();
  f.publish([b]); f.notices[0]!.click(); await Promise.resolve(); await Promise.resolve(); expect(f.open).not.toHaveBeenCalled();
});

it('does not notify an approval resolved while its session lookup is in flight', async () => {
  const f = fixture(); let release!: (row: { title: string }) => void;
  f.session.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
  f.publish([approval()]); await Promise.resolve(); f.publish([]); release({ title: 'Private title' }); await f.notifier.drain();
  expect(f.notices).toEqual([]); expect(f.phone).not.toHaveBeenCalled();
});

it('does not open or notify a deleted session', async () => {
  const f = fixture(); f.session.mockResolvedValueOnce(null);
  f.notifier.run(grant(), { type: 'completed', message: '' }); await f.notifier.drain(); expect(f.notices).toEqual([]);
  f.notifier.run(grant('next'), { type: 'completed', message: '' }); await f.notifier.drain();
  f.session.mockResolvedValueOnce(null); f.notices[0]!.click(); await Promise.resolve(); await Promise.resolve(); expect(f.open).not.toHaveBeenCalled();
});

it('does not wait for phone networking before showing the desktop notice', async () => {
  const f = fixture(); f.phone.mockImplementation(() => new Promise(() => {}));
  f.notifier.run(grant(), { type: 'completed', message: '' }); await f.notifier.drain(); expect(f.notices).toHaveLength(1);
});

it('isolates destination failures and keeps later deliveries alive', async () => {
  const f = fixture(); f.phone.mockRejectedValueOnce(new Error('Synthetic phone failure')); f.sound.mockImplementationOnce(() => { throw new Error('Synthetic sound failure'); });
  f.notifier.run(grant(), { type: 'completed', message: '' }); await f.notifier.drain();
  expect(f.notices).toHaveLength(1); expect(f.failed).toHaveBeenCalledTimes(2);
  f.notifier.run(grant('next'), { type: 'failed', message: '' }); await f.notifier.drain(); expect(f.notices).toHaveLength(2);
});

it.each(['en', 'ja'])('publishes native notification copy directly from the %s catalog', async language => {
  const catalog = JSON.parse(readFileSync(`src/renderer/locales/${language}.json`, 'utf8'));
  const keys = ['Venice task completed', 'Venice task failed', 'Venice is waiting for folder approval.'];
  for (const key of keys) expect(catalog[key]?.trim(), `${language}: ${key}`).toBeTruthy();
  setMainTextTranslations(catalog); const f = fixture(); f.publish([approval()]);
  f.notifier.run(grant(), { type: 'failed', message: '' }); f.notifier.run(grant('b'), { type: 'completed', message: '' }); await f.notifier.drain();
  expect(f.notices.map(row => row.body)).toEqual([catalog[keys[2]!], catalog[keys[1]!], catalog[keys[0]!]]);
});
