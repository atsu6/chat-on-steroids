import { createRequire } from 'node:module';
import vm from 'node:vm';
import { afterEach, expect, it } from 'vitest';
const require = createRequire(import.meta.url);
const { agentHarness, tick, read } = require('./venice-bridge-harness.cjs');
const cleanups: Array<() => void> = [];
afterEach(() => { for (const close of cleanups.splice(0)) close(); });
const scope = { after: (close: () => void) => cleanups.push(close) };
const diff = '--- "/granted/a.txt"\n+++ "/granted/a.txt"\n@@ -1,1 +1,30 @@\n-old\n' + Array.from({ length: 30 }, (_, n) => `+line ${n} <img src=x>`).join('\n');
const replies = () => [{ action: 'tool', name: 'core/apply_patch', args: { patch: '*** Begin Patch\n*** Add File: /granted/a.txt\n+new\n*** End Patch' } }, { action: 'done', summary: 'patched' }];
async function settled(check: () => boolean) {
  for (let i = 0; i < 100; i++) { await tick(); if (check()) return; }
  throw new Error('Synthetic patch panel did not settle');
}
it('renders safe unified diff with a collapsed full view before sending the actual patch, without another confirmation', async () => {
  let root: ShadowRoot; let writes = 0; const calls: any[] = [];
  const h = agentHarness(scope, { replies: replies(), localTransport: async (url: string, init: any) => {
    const body = JSON.parse(init.body); calls.push({ url, body });
    if (url === '/venice/grant/request') return { ok: true, data: { runId: 'synthetic-write-run' } };
    if (url.startsWith('/venice/grant/')) return { ok: true, data: { revoked: true } };
    if (body.preview) { expect(writes).toBe(0); return { ok: true, data: { diff } }; }
    writes++; expect(root!.querySelector('.patch-preview pre')!.textContent).toContain('--- "/granted/a.txt"');
    expect(root!.querySelector('details pre')!.textContent).toBe(diff);
    expect((root!.querySelector('details pre') as HTMLElement).tabIndex).toBe(0); expect(root!.querySelector('img')).toBeNull();
    expect((root!.querySelector('details') as HTMLDetailsElement).open).toBe(false);
    return { ok: true, data: { callId: body.request.callId, state: 'completed', result: { content: [{ type: 'text', text: 'patch applied' }] } } };
  } });
  vm.runInNewContext(read('venice-panel.js'), { window: h.brain, location: h.brain.location, document: h.brain.document, crypto: h.brain.crypto });
  root = h.brain.document.getElementById('cos-venice-panel').shadowRoot;
  await settled(() => root.getElementById('state')!.textContent === '待機中');
  const input = root.getElementById('instruction') as HTMLTextAreaElement; input.value = 'synthetic patch'; input.dispatchEvent(new h.brain.Event('input', { bubbles: true }));
  root.getElementById('run')!.click(); await settled(() => root.getElementById('state')!.textContent === '完了');
  expect(writes).toBe(1); expect(h.prompts).toHaveLength(2);
  const preview = calls.find(row => row.body.preview), actual = calls.find(row => row.url === '/venice/tools' && !row.body.preview);
  expect(actual.body.request).toEqual(preview.body.request);
  const full = root.querySelector('details') as HTMLDetailsElement; expect(full.open).toBe(false); full.querySelector('summary')!.click(); expect(full.open).toBe(true);
  expect(root.querySelector('.patch-preview > pre')!.textContent!.length).toBeLessThan(diff.length);
});
it('waits for the exact preview acknowledgement and a Stop prevents any write while that display is pending', async () => {
  let writes = 0; let preview: any;
  const h = agentHarness(scope, { replies: replies(), localTransport: async (url: string, init: any) => {
    const body = JSON.parse(init.body);
    if (url === '/venice/grant/request') return { ok: true, data: { runId: 'synthetic-run' } };
    if (url.startsWith('/venice/grant/')) return { ok: true, data: { revoked: true } };
    if (body.preview) return { ok: true, data: { diff } };
    writes++; throw new Error('No actual write is allowed');
  } });
  h.brain.addEventListener('message', (event: MessageEvent) => { if (event.data?.event === 'patch-preview') preview = event.data; });
  h.brain.postMessage({ type: 'cos-venice-panel-request', op: 'run', id: 'panel-task', instruction: 'synthetic patch', maxSteps: 2 }, 'https://venice.ai');
  await settled(() => Boolean(preview));
  h.brain.postMessage({ type: 'cos-venice-panel-request', op: 'patchPreviewRendered', id: 'panel-task', previewId: 'wrong' }, 'https://venice.ai');
  await tick(); expect(writes).toBe(0);
  h.brain.postMessage({ type: 'cos-venice-panel-request', op: 'stop', id: 'panel-task' }, 'https://venice.ai');
  await tick(); await tick(); expect(writes).toBe(0); expect(h.prompts).toHaveLength(1);
});
it('keeps short diffs fully visible without adding an unnecessary disclosure', async () => {
  const h = agentHarness(scope); vm.runInNewContext(read('venice-panel.js'), { window: h.brain, location: h.brain.location, document: h.brain.document, crypto: h.brain.crypto });
  const root = h.brain.document.getElementById('cos-venice-panel').shadowRoot;
  await settled(() => root.getElementById('state').textContent === '待機中');
  let id: string | undefined;
  h.brain.addEventListener('message', (event: MessageEvent) => { if (event.data?.op === 'run') id = event.data.id; });
  // A panel task already has an ID before any asynchronous approval/model work.
  const input = root.getElementById('instruction'); input.value = 'short'; input.dispatchEvent(new h.brain.Event('input', { bubbles: true }));
  h.brain.__cosVeniceAgent = { ...h.api, runTask: () => new Promise(() => {}) };
  root.getElementById('run').click(); await settled(() => Boolean(id));
  const short = '--- a\n+++ a\n@@ -1,1 +1,1 @@\n-a\n+b';
  h.brain.postMessage({ type: 'cos-venice-panel-event', event: 'patch-preview', id, previewId: 'short', index: 1, diff: short }, 'https://venice.ai');
  await tick(); expect(root.querySelector('.patch-preview pre').textContent).toBe(short); expect(root.querySelector('details')).toBeNull();
});
