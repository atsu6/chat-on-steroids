import { expect, it, vi } from 'vitest';
import { createPhonePush, DEFAULT_PHONE_PUSH, type PhonePushEvent } from '../src/main/phone-push.js';

function fixture(includeDetails = false, enabled = true) {
  const post = vi.fn(async (_url: string, _body: string, _headers: Record<string, string>) => ({ ok: true, status: 200 }));
  const send = vi.fn(async (_text: string, _about?: { sessionId?: string; cardId?: string }) => true);
  const push = createPhonePush({ settings: () => ({ ...DEFAULT_PHONE_PUSH, enabled, topic: 'synthetic-topic', includeDetails, finishedAfterMinutes: 0 }),
    token: async () => null, now: () => new Date(2026, 10, 25, 14).getTime(), idleState: () => 'idle', post, telegram: () => ({ send }), log: () => {} });
  return { push, post, send };
}
it.each(['needs-you', 'failed', 'finished'] as const)('sends a private Venice %s without ChatGPT links or Telegram controls', async kind => {
  const f = fixture(); const event: PhonePushEvent = { provider: 'venice', kind, sessionId: 'private-session', chatTitle: 'Private title',
    conversationId: 'synthetic-conversation', detail: 'Private answer or error', approval: { sessionId: 'private-session', cardId: 'private-card' } };
  expect(await f.push.notify(event)).toBe('sent');
  const body = JSON.parse(f.post.mock.calls[0]![1] as string);
  expect(body.title).toBe('Chat On Venice'); expect(body.click).toBeUndefined();
  expect(body.message).toBe(kind === 'finished' ? 'Venice task completed' : kind === 'failed' ? 'Venice task failed' : 'Venice is waiting for folder approval.');
  expect(f.send).toHaveBeenCalledWith(expect.any(String), undefined);
  expect(JSON.stringify(f.post.mock.calls) + JSON.stringify(f.send.mock.calls)).not.toMatch(/Private|private-|chatgpt\.com/);
  expect(await f.push.notify(event)).toBe('repeat'); expect(f.post).toHaveBeenCalledTimes(1);
});
it('includes only the allowed title with details, never a ChatGPT action target', async () => {
  const f = fixture(true); await f.push.notify({ provider: 'venice', kind: 'finished', sessionId: 's', chatTitle: 'Allowed title', conversationId: 'synthetic-conversation', detail: 'Private answer' });
  expect(JSON.parse(f.post.mock.calls[0]![1] as string)).toMatchObject({ title: 'Allowed title', message: 'Venice task completed' });
  expect(f.send).toHaveBeenCalledWith('Allowed title\nVenice task completed', undefined);
});
it('keeps phone notifications opt-in', async () => {
  const f = fixture(false, false); expect(await f.push.notify({ provider: 'venice', kind: 'failed', sessionId: 's' })).toBe('off');
  expect(f.post).not.toHaveBeenCalled(); expect(f.send).not.toHaveBeenCalled();
});
