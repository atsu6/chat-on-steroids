import { readFileSync, readdirSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { stripTypeScriptTypes } from 'node:module';
import { afterEach, expect, it, vi } from 'vitest';

const source = readFileSync('src/renderer/chat.ts', 'utf8'), start = source.indexOf('export function initVeniceGrantDialog()');
const code = stripTypeScriptTypes(source.slice(start, source.indexOf('export function initChat(', start)).replace('export function', 'function'));
const html = readFileSync('src/renderer/index.html', 'utf8').match(/<dialog class="plugin-dialog" id="veniceGrantDialog"[\s\S]*?<\/dialog>/)![0];
let dom: JSDOM;
afterEach(() => dom?.window.close());
async function fixture() {
  dom = new JSDOM(html, { runScripts: 'outside-only' }); const w = dom.window, dialog = w.document.querySelector('dialog')!;
  dialog.showModal = () => dialog.setAttribute('open', ''); dialog.close = () => dialog.removeAttribute('open');
  let publish!: (rows: unknown[]) => void;
  const pending = { id: 'first', sessionId: 'local', sessionTitle: 'Local owner', project: null,
    tab: { id: 8, url: 'https://venice.ai/chat/synthetic' }, instructionSummary: 'Synthetic exec', tools: ['core/read'], roots: ['/synthetic/root'] };
  const answer = vi.fn(async () => ({ ok: true })), pick = vi.fn(async () => ({ ok: true, data: [pending] }));
  Object.assign(w, { api: { onVeniceGrantPending: (fn: typeof publish) => { publish = fn; }, veniceGrantPending: async () => ({ ok: true, data: [] }), veniceGrantPick: pick, veniceGrantAnswer: answer } });
  w.eval('const api=window.api;' + code + ';initVeniceGrantDialog();'); await Promise.resolve(); publish([pending]);
  return { w, publish, pending, answer, pick, shell: w.document.getElementById('veniceGrantShell') as HTMLInputElement,
    write: w.document.getElementById('veniceGrantWrite') as HTMLInputElement };
}
it('requires independent shell consent, retains it during folder selection and resets it for the next run', async () => {
  const f = await fixture(); expect(f.shell.checked).toBe(false); expect(f.write.checked).toBe(false);
  f.shell.click(); expect(f.write.checked).toBe(false); f.w.document.getElementById('veniceGrantPick')!.click(); expect(f.shell.disabled).toBe(true);
  await new Promise(resolve => setImmediate(resolve)); expect(f.shell.checked).toBe(true); expect(f.shell.disabled).toBe(false);
  f.w.document.getElementById('veniceGrantAllow')!.click(); await Promise.resolve(); expect(f.answer).toHaveBeenCalledExactlyOnceWith('first', true, false, true);
  f.publish([{ ...f.pending, id: 'second' }]); expect(f.shell.checked).toBe(false);
  f.shell.click(); f.write.click(); f.w.document.getElementById('veniceGrantAllow')!.click(); await Promise.resolve();
  expect(f.answer).toHaveBeenLastCalledWith('second', true, true, true);
});
it('never sends shell permission for unchecked consent, denial or Escape', async () => {
  const f = await fixture(); f.write.click(); f.w.document.getElementById('veniceGrantAllow')!.click(); await Promise.resolve();
  expect(f.answer).toHaveBeenLastCalledWith('first', true, true);
  f.publish([{ ...f.pending, id: 'second' }]); f.shell.click(); f.w.document.querySelector('dialog')!.dispatchEvent(new f.w.Event('cancel', { cancelable: true })); await Promise.resolve();
  expect(f.answer).toHaveBeenLastCalledWith('second', false);
});
it('registers the verbatim Japanese shell warning in all app catalogs and output labels in all extension catalogs', () => {
  const entries = {
    'Also allow running commands': 'コマンドの実行も許可する',
    'Venice can run commands with your permissions. Commands are not isolated within the selected folders and can also access files and the network outside those folders.': 'あなたの権限でコマンドを実行できます。選択したフォルダー内に隔離されず、その外のファイルやネットワークにもアクセスできます。'
  };
  for (const file of readdirSync('src/renderer/locales').filter(file => file.endsWith('.json'))) {
    const catalog = JSON.parse(readFileSync(`src/renderer/locales/${file}`, 'utf8'));
    for (const [key, japanese] of Object.entries(entries)) {
      expect(catalog[key], `${file}: ${key}`).toBeTruthy(); expect(catalog[japanese]).toBe(catalog[key]);
      expect(html).toContain(`data-i18n="${key}">${japanese}`);
      if (file === 'ja.json') expect(catalog[key]).toBe(japanese);
    }
  }
  for (const locale of readdirSync('extension/_locales')) {
    const catalog = JSON.parse(readFileSync(`extension/_locales/${locale}/messages.json`, 'utf8'));
    for (const key of ['venice_exec_running', 'venice_exec_output_omitted', 'venice_exec_output_error']) expect(catalog[key]?.message, `${locale}: ${key}`).toBeTruthy();
  }
  expect(html).not.toContain('id="veniceGrantShell" type="checkbox" checked');
  expect(html).toContain('aria-describedby="veniceGrantShellWarning"');
});
