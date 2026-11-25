import { createRequire } from 'node:module';
import vm from 'node:vm';
import { afterEach, expect, it } from 'vitest';
const require = createRequire(import.meta.url);
const { agentHarness, tick, read } = require('./venice-bridge-harness.cjs');
const cleanups: Array<() => void> = [];
afterEach(() => { for (const close of cleanups.splice(0)) close(); });
const scope = { after: (close: () => void) => cleanups.push(close) };
const replies = () => [
  { action: 'tool', name: 'core/exec_command', args: { cmd: 'synthetic interactive', stdin_open: true } },
  { action: 'tool', name: 'core/write_stdin', args: { session_id: 1234 } },
  { action: 'tool', name: 'core/write_stdin', args: { session_id: 1234, chars: 'exit\n' } },
  { action: 'done', summary: 'synthetic finished' }
];
async function settled(check: () => boolean) {
  for (let i = 0; i < 150; i++) { await new Promise(resolve => setTimeout(resolve, 10)); if (check()) return; }
  throw new Error('Synthetic stdin panel did not settle');
}
function mount(h: any): ShadowRoot {
  vm.runInNewContext(read('venice-panel.js'), { window: h.brain, location: h.brain.location, document: h.brain.document, crypto: h.brain.crypto });
  return h.brain.document.getElementById('cos-venice-panel').shadowRoot;
}
function run(h: any, root: ShadowRoot) {
  const input = root.getElementById('instruction') as HTMLTextAreaElement;
  input.value = 'synthetic stdin'; input.dispatchEvent(new h.brain.Event('input', { bubbles: true })); root.getElementById('run')!.click();
}

it('routes exec → poll → input through MAIN/ISOLATED and updates one safe cumulative process row', async () => {
  const calls: any[] = []; let execId = '';
  const h = agentHarness(scope, { replies: replies(), localTransport: async (url: string, init: any) => {
    const body = JSON.parse(init.body);
    if (url === '/venice/grant/request') return { ok: true, data: { runId: 'synthetic-shell-run' } };
    if (url.startsWith('/venice/grant/')) return { ok: true, data: { revoked: true } };
    const req = body.request;
    if (req.tool === 'exec_command') execId = req.callId;
    const complete = req.args.chars === 'exit\n';
    const output = { callId: execId, processId: 1234, exitCode: complete ? 0 : null, running: !complete,
      stdout: complete ? 'ready\nreceived:<img src=x>\nexit\n' : 'ready\n', stderr: complete ? 'diagnostic\nsecond\n' : '', truncated: false, omittedBytes: 0 };
    if (body.output) return { ok: true, data: { output } };
    calls.push(req);
    return { ok: true, data: { callId: req.callId, state: 'completed', result: { content: [{ type: 'text', text: 'synthetic' }], structuredContent: output } } };
  } });
  const root = mount(h); await settled(() => root.getElementById('state')!.textContent === '待機中'); run(h, root);
  await settled(() => root.getElementById('state')!.textContent === '完了');
  expect(calls.map(req => req.tool)).toEqual(['exec_command', 'write_stdin', 'write_stdin']);
  expect(calls[0].args.stdin_open).toBe(true); expect(calls[1].args).toEqual({ session_id: 1234 });
  expect(calls[2].args).toEqual({ session_id: 1234, chars: 'exit\n' });
  expect(root.querySelectorAll('.exec-output')).toHaveLength(1);
  expect(root.querySelector('[data-stream=stdout]')!.textContent).toBe('ready\nreceived:<img src=x>\nexit\n');
  expect(root.querySelector('[data-stream=stderr]')!.textContent).toBe('diagnostic\nsecond\n');
  expect(root.querySelector('img')).toBeNull(); expect(root.querySelector('.exec-title')!.textContent).toContain('exitCode:0');
  expect([...root.querySelectorAll('li')].filter(row => row.textContent?.includes('/ core/write_stdin / ok:true'))).toHaveLength(2);
  expect(h.prompts[3]).toContain('received:<img src=x>');
  root.getElementById('stop')!.click(); await tick();
});

it('reuses the continuation callId after a transport error rather than issuing fresh input', async () => {
  let inputId = '', attempts = 0;
  const h = agentHarness(scope, { localTransport: async (url: string, init: any) => {
    const body = JSON.parse(init.body);
    if (url.startsWith('/venice/grant/')) return { ok: true, data: { revoked: true } };
    expect(body.request.tool).toBe('write_stdin'); expect(body.request.args.chars).toBe('once\n');
    if (++attempts === 1) { inputId = body.request.callId; throw new Error('Synthetic dropped response'); }
    expect(body.request.callId).toBe(inputId);
    return { ok: true, data: { callId: inputId, state: 'completed', result: { content: [{ type: 'text', text: 'received once' }] } } };
  } });
  await h.api.setLocalRun('synthetic-shell-run');
  expect(await h.api.executeTool('core/write_stdin', { session_id: 1234, chars: 'once\n' })).toMatchObject({ ok: true, result: { content: [{ text: 'received once' }] } });
  expect(attempts).toBe(2);
});
