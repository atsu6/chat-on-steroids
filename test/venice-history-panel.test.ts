import { createRequire } from 'node:module';
import vm from 'node:vm';
import { afterEach, expect, it } from 'vitest';
const require = createRequire(import.meta.url);
const { agentHarness, read } = require('./venice-bridge-harness.cjs');
const cleanups: Array<() => void> = [];
afterEach(() => { for (const close of cleanups.splice(0)) close(); });
const scope = { after: (close: () => void) => cleanups.push(close) };
async function settled(check: () => boolean) {
  for (let i = 0; i < 150; i++) { await new Promise(resolve => setTimeout(resolve, 10)); if (check()) return; }
  throw new Error('Synthetic history panel did not settle');
}
async function mount(h: any): Promise<ShadowRoot> {
  vm.runInNewContext(read('venice-panel.js'), { window: h.brain, location: h.brain.location, document: h.brain.document, crypto: h.brain.crypto });
  const root = h.brain.document.getElementById('cos-venice-panel').shadowRoot;
  await settled(() => root.getElementById('state').textContent === '待機中');
  const input = root.getElementById('instruction'); input.value = 'synthetic history'; input.dispatchEvent(new h.brain.Event('input', { bubbles: true })); root.getElementById('run').click();
  return root;
}
const replies = () => [{ action: 'tool', name: 'query', args: { selector: 'h1' } }, { action: 'done', summary: 'Found the heading' }];
it('waits for durable history acknowledgement before the next model turn and records completion', async () => {
  let release!: () => void;
  const h = agentHarness(scope, { replies: replies(), owned: true, html: '<h1>synthetic</h1>', historyTransport: async (_url: string, init: any) => {
    if (JSON.parse(init.body).event.type === 'step') await new Promise<void>(resolve => { release = resolve; });
    return { ok: true, data: { recorded: true } };
  } });
  const root = await mount(h); await settled(() => Boolean(release)); expect(h.prompts).toHaveLength(1);
  release(); await settled(() => root.getElementById('state')!.textContent === '完了');
  expect(h.historyRequests.map((row: any) => row.event.type)).toEqual(['step', 'completed']);
  expect(h.historyRequests[0].event).toMatchObject({ index: 1, name: 'query', ok: true });
  expect(h.historyRequests[0].runId).toBe(h.historyRequests[1].runId);
  expect(h.historyRequests[1].event.message).toBe('Found the heading');
});
it('retries only the same history event after a lost acknowledgement, not the tool', async () => {
  let attempts = 0;
  const h = agentHarness(scope, { replies: replies(), owned: true, html: '<h1>synthetic</h1>', historyTransport: async (_url: string, init: any) => {
    if (JSON.parse(init.body).event.type === 'step' && ++attempts === 1) throw new Error('Synthetic lost acknowledgement');
    return { ok: true, data: { recorded: true } };
  } });
  const root = await mount(h); await settled(() => root.getElementById('state')!.textContent === '完了');
  expect(h.historyRequests[0]).toEqual(h.historyRequests[1]); expect(attempts).toBe(2);
  expect(h.calls.filter((row: any[]) => row[0] === 'execute')).toHaveLength(1);
  expect(h.prompts).toHaveLength(2);
});
it('stops the loop and displays a useful error when history cannot be acknowledged', async () => {
  const h = agentHarness(scope, { replies: replies(), owned: true, html: '<h1>synthetic</h1>',
    historyTransport: async () => ({ ok: true, data: { recorded: false } }) });
  const root = await mount(h); await settled(() => root.getElementById('state')!.textContent === 'エラー');
  expect(h.prompts).toHaveLength(1); expect(h.calls.filter((row: any[]) => row[0] === 'execute')).toHaveLength(1);
  expect(root.getElementById('message')!.textContent).toContain('履歴を保存できなかった');
  expect(h.historyRequests.some((row: any) => row.event.type === 'completed')).toBe(false);
});
it('reports Stop rather than an error when revocation overtakes completion history', async () => {
  let release!: () => void, attempts = 0;
  const h = agentHarness(scope, { replies: [{ action: 'done', summary: 'done' }], historyTransport: async () => {
    if (++attempts === 1) await new Promise<void>(resolve => { release = resolve; });
    return { ok: false, status: 400 };
  } });
  const root = await mount(h); await settled(() => Boolean(release));
  root.getElementById('stop')!.click(); await settled(() => root.getElementById('state')!.textContent === '停止待ち'); release();
  // The worker retains the run binding for ledger reads; the app refuses new reports.
  await settled(() => root.getElementById('state')!.textContent === '停止' || root.getElementById('state')!.textContent === '失効済み');
  expect(root.getElementById('state')!.dataset.error).not.toBe('true'); expect(h.prompts).toHaveLength(1); expect(attempts).toBe(2);
});
