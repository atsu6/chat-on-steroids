import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { JSDOM } from 'jsdom';
import { afterEach, expect, it, vi } from 'vitest';
import { openVeniceNotification } from '../src/main/venice-notifications.js';
import type { VeniceGrantPending } from '../src/shared/venice-integration.js';
const source = readFileSync('src/renderer/chat.ts', 'utf8'), start = source.indexOf('export function initVeniceGrantDialog()');
const code = stripTypeScriptTypes(source.slice(start, source.indexOf('export function initChat(', start)).replace('export function', 'function'));
const html = readFileSync('src/renderer/index.html', 'utf8').match(/<dialog class="plugin-dialog" id="veniceGrantDialog"[\s\S]*?<\/dialog>/)![0];
const row = (id: string): VeniceGrantPending => ({ id, sessionId: `session-${id}`, sessionTitle: `Owner ${id}`, project: null,
  tab: { id: 7, url: 'https://venice.ai/chat/synthetic' }, instructionSummary: `Instruction ${id}`, roots: ['/synthetic'], tools: ['core/read'] });
let dom: JSDOM;
afterEach(() => dom?.window.close());
async function fixture() {
  dom = new JSDOM(html, { runScripts: 'outside-only' }); const w = dom.window, dialog = w.document.querySelector('dialog')!;
  dialog.showModal = () => dialog.setAttribute('open', ''); dialog.close = () => dialog.removeAttribute('open');
  let publish!: (rows: VeniceGrantPending[]) => void, focus!: (id: string) => void;
  const answer = vi.fn(async (_id: string, _allow: boolean) => ({ ok: true }));
  const pick = vi.fn(async (_id: string) => ({ ok: true, data: [row('a'), row('b')] }));
  Object.assign(w, { api: { onVeniceGrantPending: (fn: typeof publish) => { publish = fn; }, onVeniceFocusApproval: (fn: typeof focus) => { focus = fn; },
    veniceGrantPending: async () => ({ ok: true, data: [] }), veniceGrantAnswer: answer, veniceGrantPick: pick } });
  w.eval('const api=window.api;' + code + ';initVeniceGrantDialog();'); await Promise.resolve(); publish([row('a'), row('b')]);
  return { w, publish, focus, answer, pick };
}
it('selects the notified approval, resets elevated consent, and answers that exact request', async () => {
  const f = await fixture(); f.w.document.getElementById('veniceGrantWrite')!.click(); f.w.document.getElementById('veniceGrantShell')!.click();
  f.focus('b'); expect(f.w.document.getElementById('veniceGrantSession')!.textContent).toBe('Owner b · session-b');
  expect((f.w.document.getElementById('veniceGrantWrite') as HTMLInputElement).checked).toBe(false);
  expect((f.w.document.getElementById('veniceGrantShell') as HTMLInputElement).checked).toBe(false);
  expect(f.w.document.activeElement?.id).toBe('veniceGrantDeny');
  f.w.document.getElementById('veniceGrantDeny')!.click(); await Promise.resolve(); expect(f.answer).toHaveBeenCalledExactlyOnceWith('b', false);
});
it('does not switch or grant anything for a stale approval focus', async () => {
  const f = await fixture(); f.focus('expired'); expect(f.w.document.getElementById('veniceGrantSession')!.textContent).toContain('Owner a');
  expect(f.answer).not.toHaveBeenCalled();
});
it('defers a notification target until the native folder picker has finished', async () => {
  const f = await fixture(); let release!: (value: { ok: boolean; data: VeniceGrantPending[] }) => void;
  f.pick.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
  f.w.document.getElementById('veniceGrantPick')!.click(); f.focus('b');
  expect(f.w.document.getElementById('veniceGrantSession')!.textContent).toContain('Owner a'); expect(f.answer).not.toHaveBeenCalled();
  release({ ok: true, data: [row('a'), row('b')] }); await new Promise(resolve => setImmediate(resolve));
  expect(f.w.document.getElementById('veniceGrantSession')!.textContent).toContain('Owner b'); expect(f.answer).not.toHaveBeenCalled();
});
it.each(['ready', 'loading'] as const)('reveals the local target via preload IPC when the window is %s', state => {
  const send = vi.fn(), once = vi.fn(); const target = { send, once, isDestroyed: () => false, isLoadingMainFrame: () => state === 'loading' };
  openVeniceNotification(target, 'session-b', 'b', () => [row('a'), row('b')]);
  if (state === 'loading') { expect(send).not.toHaveBeenCalled(); expect(once.mock.calls[0]![0]).toBe('did-finish-load'); once.mock.calls[0]![1](); }
  expect(send.mock.calls).toEqual([['venice:openSession', 'session-b'], ['venice:grantPending', [row('a'), row('b')]], ['venice:focusApproval', 'b']]);
});
it('does not redirect an expired target after a window reload, or send to a destroyed window', () => {
  const send = vi.fn(), once = vi.fn(); let rows = [row('b')], destroyed = false;
  const target = { send, once, isDestroyed: () => destroyed, isLoadingMainFrame: () => true };
  openVeniceNotification(target, 'session-b', 'b', () => rows); rows = []; once.mock.calls[0]![1](); expect(send).not.toHaveBeenCalled();
  openVeniceNotification(target, 'session-a', undefined, () => rows); destroyed = true; once.mock.calls[1]![1](); expect(send).not.toHaveBeenCalled();
});
