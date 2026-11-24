import { createRequire } from 'node:module';
import vm from 'node:vm';
import { afterEach, expect, it } from 'vitest';
const require = createRequire(import.meta.url);
const { agentHarness, tick, read } = require('./venice-bridge-harness.cjs');
const cleanups: Array<() => void> = []; afterEach(() => { for (const close of cleanups.splice(0)) close(); });
const scope = { after: (close: () => void) => cleanups.push(close) };
async function settled(check: () => boolean) {
  for (let i = 0; i < 150; i++) { await new Promise(resolve => setTimeout(resolve, 10)); if (check()) return; }
  throw new Error('Synthetic exec panel did not settle');
}
const replies = () => [{ action: 'tool', name: 'core/exec_command', args: { cmd: 'echo synthetic', yield_time_ms: 250 } }, { action: 'done', summary: 'synthetic finished' }];
function mount(h: any): ShadowRoot {
  vm.runInNewContext(read('venice-panel.js'), { window: h.brain, location: h.brain.location, document: h.brain.document, crypto: h.brain.crypto });
  return h.brain.document.getElementById('cos-venice-panel').shadowRoot;
}
function run(h: any, root: ShadowRoot) {
  const input = root.getElementById('instruction') as HTMLTextAreaElement; input.value = 'synthetic exec'; input.dispatchEvent(new h.brain.Event('input', { bubbles: true })); root.getElementById('run')!.click();
}
it('streams safe stdout/stderr into one step before exec returns, preserves lines, and marks truncation', async () => {
  let finish!: () => void, callId: string, executions = 0, polls = 0;
  const h = agentHarness(scope, { replies: replies(), localTransport: async (url: string, init: any) => {
    const body = JSON.parse(init.body);
    if (url === '/venice/grant/request') return { ok: true, data: { runId: 'synthetic-shell-run' } };
    if (url.startsWith('/venice/grant/')) return { ok: true, data: { revoked: true } };
    if (body.output) { polls++; expect(body.request.callId).toBe(callId); return { ok: true, data: { output: { callId, processId: 1234, exitCode: null, running: true, stdout: 'line1\nline2 <img src=x>\n' + 'x'.repeat(300), stderr: 'error\nnext\n', truncated: true, omittedBytes: 10 } } }; }
    executions++; callId = body.request.callId; await new Promise<void>(resolve => { finish = resolve; });
    return { ok: true, data: { callId, state: 'completed', result: { content: [{ type: 'text', text: 'done' }], structuredContent: { callId, processId: 1234, exitCode: 0, running: false, stdout: 'completed\n', stderr: 'error\n', truncated: true } } } };
  } });
  const root = mount(h); await settled(() => root.getElementById('state')!.textContent === '待機中'); run(h, root);
  await settled(() => Boolean(root.querySelector('.exec-output [data-stream=stdout]')));
  expect(root.getElementById('state')!.textContent).toBe('実行中'); expect(polls).toBeGreaterThan(0);
  expect(root.querySelector('[data-stream=stdout]')!.textContent).toContain('line1\nline2 <img src=x>\n');
  expect(root.querySelector('[data-stream=stderr]')!.textContent).toBe('error\nnext\n'); expect(root.querySelector('img')).toBeNull();
  expect(root.querySelector('.exec-notice')!.textContent).toContain('省略');
  expect((root.querySelector('[data-stream=stdout]') as HTMLElement).tabIndex).toBe(0);
  finish(); await settled(() => root.getElementById('state')!.textContent === '完了');
  expect(root.querySelectorAll('.exec-output')).toHaveLength(1); expect(root.querySelector('.exec-title')!.textContent).toContain('exitCode:0');
  expect(executions).toBe(1); root.getElementById('stop')!.click(); await tick();
});
it('keeps polling after a wait yields processId and Stop revokes the run without another exec', async () => {
  let executions = 0, polls = 0, revoked = false, callId: string;
  const h = agentHarness(scope, { replies: replies(), localTransport: async (url: string, init: any) => {
    const body = JSON.parse(init.body);
    if (url === '/venice/grant/request') return { ok: true, data: { runId: 'synthetic-shell-run' } };
    if (url.startsWith('/venice/grant/')) { if (url.endsWith('/revoke') && executions) revoked = true; return { ok: true, data: { revoked: true } }; }
    const output = { callId: body.request.callId, processId: 2345, exitCode: null, running: true, stdout: `tick ${polls}\n`, stderr: '', truncated: false };
    if (body.output) { polls++; expect(body.request.callId).toBe(callId); return { ok: true, data: { output } }; }
    executions++; callId = body.request.callId; return { ok: true, data: { callId, state: 'completed', result: { content: [{ type: 'text', text: 'running' }], structuredContent: output } } };
  } });
  const root = mount(h); await settled(() => root.getElementById('state')!.textContent === '待機中'); run(h, root);
  await settled(() => polls >= 2); expect(root.getElementById('state')!.textContent).toBe('完了'); expect(executions).toBe(1);
  root.getElementById('stop')!.click(); await settled(() => revoked); await settled(() => root.getElementById('state')!.textContent === '失効済み');
  const count = polls; await new Promise(resolve => setTimeout(resolve, 350)); expect(polls).toBe(count); expect(executions).toBe(1);
});
