import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { stripTypeScriptTypes } from 'node:module';
import { afterEach, expect, it, vi } from 'vitest';

const source = readFileSync('src/renderer/chat.ts', 'utf8');
const start = source.indexOf('export function initVeniceGrantDialog()');
const code = stripTypeScriptTypes(source.slice(start, source.indexOf('export function initChat(', start)).replace('export function', 'function'));
const html = readFileSync('src/renderer/index.html', 'utf8').match(/<dialog class="plugin-dialog" id="veniceGrantDialog"[\s\S]*?<\/dialog>/)![0];
let dom: JSDOM;
afterEach(() => { dom?.window.close(); });
async function fixture() {
  dom = new JSDOM(html, { runScripts: 'outside-only' }); const w = dom.window;
  const dialog = w.document.querySelector('dialog')!;
  dialog.showModal = () => dialog.setAttribute('open', ''); dialog.close = () => dialog.removeAttribute('open');
  let publish!: (rows: unknown[]) => void;
  const pending = { id: 'first', sessionId: 'local', sessionTitle: 'Local owner', project: null,
    tab: { id: 7, url: 'https://venice.ai/chat/synthetic' }, instructionSummary: 'Synthetic patch', tools: ['core/read'], roots: ['/synthetic/root'] };
  const answer = vi.fn(async () => ({ ok: true }));
  const pick = vi.fn(async () => ({ ok: true, data: [{ ...pending, roots: ['/synthetic/root', '/synthetic/second'] }] }));
  Object.assign(w, { api: { onVeniceGrantPending: (fn: typeof publish) => { publish = fn; }, veniceGrantPending: async () => ({ ok: true, data: [] }),
    veniceGrantPick: pick, veniceGrantAnswer: answer } });
  w.eval('const api=window.api;' + code + ';initVeniceGrantDialog();'); await Promise.resolve(); publish([pending]);
  return { w, publish, pending, answer, pick, write: w.document.getElementById('veniceGrantWrite') as HTMLInputElement };
}
it('defaults to read-only and preserves the existing two-argument answer', async () => {
  const f = await fixture(); expect(f.write.checked).toBe(false);
  f.w.document.getElementById('veniceGrantAllow')!.click(); await Promise.resolve();
  expect(f.answer).toHaveBeenCalledExactlyOnceWith('first', true);
});
it('sends write only for an explicit checked approval, keeps the choice during picking, and resets for the next run', async () => {
  const f = await fixture(); f.write.click(); expect(f.write.checked).toBe(true);
  f.w.document.getElementById('veniceGrantPick')!.click(); expect(f.write.disabled).toBe(true);
  await new Promise(resolve => setImmediate(resolve)); expect(f.write.checked).toBe(true); expect(f.write.disabled).toBe(false);
  f.w.document.getElementById('veniceGrantAllow')!.click(); await Promise.resolve();
  expect(f.answer).toHaveBeenCalledExactlyOnceWith('first', true, true);
  f.publish([{ ...f.pending, id: 'second' }]); expect(f.write.checked).toBe(false);
  f.write.click(); f.w.document.querySelector('dialog')!.dispatchEvent(new f.w.Event('cancel', { cancelable: true }));
  await Promise.resolve(); expect(f.answer).toHaveBeenLastCalledWith('second', false);
});
it('registers the write label and its precise scope in required ja/en app catalogs, with unchanged Japanese fallback copy', () => {
  const entries = {
    'Also allow writing': '書き込みも許可する',
    'Allow creating, editing, moving, and deleting files in the selected folders.': '選択したフォルダー内のファイルの作成・編集・移動・削除を許可します。'
  };
  for (const file of ['ja.json', 'en.json']) {
    const catalog = JSON.parse(readFileSync(`src/renderer/locales/${file}`, 'utf8'));
    for (const [key, fallback] of Object.entries(entries)) {
      expect(catalog[key]?.trim(), `${file}: ${key}`).toBeTruthy(); expect(catalog[fallback]).toBe(catalog[key]);
      if (file === 'ja.json') expect(catalog[key]).toBe(fallback);
    }
  }
  for (const file of ['ja', 'en']) {
    const catalog = JSON.parse(readFileSync(`extension/_locales/${file}/messages.json`, 'utf8'));
    for (const key of ['venice_patch_preview', 'venice_patch_full_diff']) expect(catalog[key]?.message?.trim(), `${file}: ${key}`).toBeTruthy();
  }
  expect(html).toContain('type="checkbox"'); expect(html).not.toContain('id="veniceGrantWrite" type="checkbox" checked');
});
