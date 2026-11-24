import { createRequire, stripTypeScriptTypes } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';
import { afterEach, expect, it, vi } from 'vitest';
const require = createRequire(import.meta.url);
const { agentHarness, tick, read } = require('./venice-bridge-harness.cjs');
const cleanups: Array<() => void> = []; const scope = { after: (close: () => void) => cleanups.push(close) };
afterEach(() => { for (const close of cleanups.splice(0)) close(); });
async function settled(check: () => boolean) { for (let i = 0; i < 100; i++) { await tick(); if (check()) return; } throw new Error('Synthetic find UI did not settle'); }

it('requests read+find approval and renders the full safe result with newlines, NUL removal and truncation', async () => {
  let calls = 0, tools: unknown;
  const h = agentHarness(scope, { replies: [{ action: 'tool', name: 'core/find', args: { query: 'needle', path: '/granted' } }, { action: 'done', summary: 'searched' }],
    localTransport: async (url: string, init: any) => {
      const body = JSON.parse(init.body);
      if (url === '/venice/grant/request') { tools = body.tools; return { ok: true, data: { runId: 'synthetic-find-run' } }; }
      if (url.startsWith('/venice/grant/')) return { ok: true, data: { revoked: true } };
      calls++; expect(body.request.tool).toBe('find');
      return { ok: true, data: { callId: body.request.callId, state: 'completed', result: { content: [{ type: 'text', text: 'matches' }], structuredContent: {
        matches: [{ path: '/granted/a.txt', line: 2, text: 'needle\0<img src=x>' + 'x'.repeat(250) }, { path: '/granted/b.txt', line: 5, text: 'second' }], count: 2, limit: 2, truncated: true, stoppedBecause: ['limit'], binaryPolicy: 'skip'
      } } } };
    } });
  vm.runInNewContext(read('venice-panel.js'), { window: h.brain, location: h.brain.location, document: h.brain.document, crypto: h.brain.crypto });
  const root: ShadowRoot = h.brain.document.getElementById('cos-venice-panel').shadowRoot;
  await settled(() => root.getElementById('state')!.textContent === '待機中');
  const input = root.getElementById('instruction') as HTMLTextAreaElement; input.value = 'synthetic search'; input.dispatchEvent(new h.brain.Event('input', { bubbles: true }));
  root.getElementById('run')!.click(); await settled(() => root.getElementById('state')!.textContent === '完了');
  expect(tools).toEqual(['core/read', 'core/find']); expect(calls).toBe(1);
  const pre = root.querySelector('.find-output pre') as HTMLElement;
  expect(pre.textContent).toContain('/granted/a.txt:2: needle <img src=x>'); expect(pre.textContent).toContain('\n/granted/b.txt:5: second');
  expect(pre.textContent).not.toContain('\0'); expect(pre.textContent!.length).toBeGreaterThan(250); expect(pre.tabIndex).toBe(0);
  expect(root.querySelector('img')).toBeNull(); expect(root.querySelector('.find-notice')!.textContent).toContain('打ち切り');
  expect(h.prompts[1]).toContain('"matches"');
});

it('shows both old read approval and new read+find scope without changing write or shell defaults', async () => {
  const source = readFileSync('src/renderer/chat.ts', 'utf8'), start = source.indexOf('export function initVeniceGrantDialog()');
  const code = stripTypeScriptTypes(source.slice(start, source.indexOf('export function initChat(', start)).replace('export function', 'function'));
  const html = readFileSync('src/renderer/index.html', 'utf8').match(/<dialog class="plugin-dialog" id="veniceGrantDialog"[\s\S]*?<\/dialog>/)![0];
  const dom = new JSDOM(html, { runScripts: 'outside-only' }); cleanups.push(() => dom.window.close());
  const w = dom.window, dialog = w.document.querySelector('dialog')!; dialog.showModal = () => dialog.setAttribute('open', ''); dialog.close = () => dialog.removeAttribute('open');
  let publish!: (rows: unknown[]) => void; const answer = vi.fn(async () => ({ ok: true }));
  Object.assign(w, { api: { onVeniceGrantPending: (fn: typeof publish) => { publish = fn; }, veniceGrantPending: async () => ({ ok: true, data: [] }), veniceGrantAnswer: answer } });
  w.eval('const api=window.api;' + code + ';initVeniceGrantDialog();'); await Promise.resolve();
  const pending = { id: 'find', sessionId: 'local', sessionTitle: 'Synthetic owner', project: null, tab: { id: 1, url: 'https://venice.ai/chat/synthetic' }, instructionSummary: 'search', tools: ['core/read', 'core/find'], roots: ['/synthetic/root'] };
  publish([pending]); expect(w.document.getElementById('veniceGrantReadTools')!.hidden).toBe(true); expect(w.document.getElementById('veniceGrantFindTools')!.hidden).toBe(false);
  for (const id of ['veniceGrantWrite', 'veniceGrantShell']) expect((w.document.getElementById(id) as HTMLInputElement).checked).toBe(false);
  w.document.getElementById('veniceGrantAllow')!.click(); await Promise.resolve(); expect(answer).toHaveBeenCalledExactlyOnceWith('find', true);
  publish([{ ...pending, id: 'legacy', tools: ['core/read'] }]); expect(w.document.getElementById('veniceGrantFindTools')!.hidden).toBe(true); expect(w.document.getElementById('veniceGrantReadTools')!.hidden).toBe(false);
});

it('shows an explicit no-match result in the panel', async () => {
  const h = agentHarness(scope, { replies: [{ action: 'tool', name: 'core/find', args: { query: 'absent' } }, { action: 'done', summary: 'empty' }],
    localTransport: async (url: string, init: any) => {
      if (url === '/venice/grant/request') return { ok: true, data: { runId: 'synthetic-empty-run' } };
      if (url.startsWith('/venice/grant/')) return { ok: true, data: {} };
      const body = JSON.parse(init.body);
      return { ok: true, data: { callId: body.request.callId, state: 'completed', result: { content: [], structuredContent: { matches: [], count: 0, limit: 200, truncated: false } } } };
    } });
  vm.runInNewContext(read('venice-panel.js'), { window: h.brain, location: h.brain.location, document: h.brain.document, crypto: h.brain.crypto });
  const root: ShadowRoot = h.brain.document.getElementById('cos-venice-panel').shadowRoot;
  await settled(() => root.getElementById('state')!.textContent === '待機中');
  const input = root.getElementById('instruction') as HTMLTextAreaElement; input.value = 'no matches'; input.dispatchEvent(new h.brain.Event('input', { bubbles: true }));
  root.getElementById('run')!.click(); await settled(() => root.getElementById('state')!.textContent === '完了');
  expect(root.querySelector('.find-output pre')!.textContent).toBe('一致なし'); expect(root.querySelector('.find-notice')!.textContent).toBe('');
});

it('registers every new search label in the required Japanese and English catalogs', () => {
  const source = 'File reading and search (core/read, core/find)', japanese = 'ファイルの読み取りと検索（core/read、core/find）';
  for (const locale of ['ja', 'en']) {
    const app = JSON.parse(readFileSync(`src/renderer/locales/${locale}.json`, 'utf8'));
    expect(app[source]).toBe(locale === 'ja' ? japanese : source); expect(app[japanese]).toBe(app[source]);
    const extension = JSON.parse(readFileSync(`extension/_locales/${locale}/messages.json`, 'utf8'));
    for (const key of ['venice_find_results', 'venice_find_empty', 'venice_find_truncated']) expect(extension[key]?.message).toBeTruthy();
  }
});
