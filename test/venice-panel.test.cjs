// Synthetic model replies, separate DOMs and a local postMessage bus. Never sends to Venice.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const {JSDOM} = require('jsdom');
const {agentHarness, tick, read, clone} = require('./venice-bridge-harness.cjs');
const tool = (name, args = {}) => ({action: 'tool', name, args});
const done = summary => ({action: 'done', summary});
function mount(h) {
  vm.runInNewContext(read('venice-panel.js'), {
    window: h.brain, location: h.brain.location, document: h.brain.document, crypto: h.brain.crypto
  });
  const host = h.brain.document.getElementById('cos-venice-panel');
  return {host, root: host?.shadowRoot, get: id => host.shadowRoot.getElementById(id)};
}
async function settled(check) {
  for (let i = 0; i < 100; i++) { await tick(); if (check()) return; }
  assert.fail('Synthetic panel did not settle');
}
function instruct(h, panel, text = 'synthetic instruction') {
  panel.get('instruction').value = text;
  panel.get('instruction').dispatchEvent(new h.brain.Event('input', {bubbles: true}));
}

test('onStep fires for every completed tool and done without changing return values', async t => {
  const summary = 'x'.repeat(90);
  const h = agentHarness(t, {replies: [tool('now'), tool('unknown'), done(summary)]});
  const calls = [];
  const result = await h.api.runTask('test', {onStep: (step, preview) => calls.push({step: clone(step), preview})});
  assert.deepEqual(clone(result), {summary, steps: [
    {name: 'now', ok: true}, {name: 'unknown', ok: false}, {name: 'done', ok: true}
  ]});
  assert.deepEqual(calls.map(call => call.step), [
    {index: 1, name: 'now', ok: true}, {index: 2, name: 'unknown', ok: false}, {index: 3, name: 'done', ok: true}
  ]);
  assert.ok(calls.every(call => typeof call.preview === 'string' && call.preview.length <= 60));
  assert.equal(calls[2].preview, summary.slice(0, 60));
  await assert.rejects(h.api.runTask('test', {onStep: true}), /onStep must be a function/);
  assert.equal(h.prompts.length, 3);
});

test('stopping in onStep prevents the next turn, retains completed steps and permits a later run', async t => {
  const h = agentHarness(t, {replies: [tool('now'), done('fresh run')]});
  assert.equal(h.api.stopTask(), false);
  await assert.rejects(h.api.runTask('stop at first step', {onStep: () => h.api.stopTask()}), error => {
    assert.equal(error.code, 'VENICE_TASK_STOPPED');
    assert.deepEqual(clone(error.steps), [{name: 'now', ok: true}]);
    assert.equal(error.stepCount, 1);
    return true;
  });
  assert.equal(h.prompts.length, 1);
  assert.equal(h.api.stopTask(), false);
  assert.equal((await h.api.runTask('fresh')).summary, 'fresh run');
});

for (const malformed of [false, true]) {
  test(`stop during an in-flight send waits for it, then skips ${malformed ? 'the JSON retry' : 'the returned tool'}`, async t => {
    const h = agentHarness(t, {owned: true, html: '<input id="field">'});
    let release, sends = 0, finished = false, steps = 0;
    h.brain.__cosVeniceSend.sendViaUi = () => { sends++; return new Promise(resolve => { release = resolve; }); };
    const pending = h.api.runTask('pending', {onStep: () => steps++});
    pending.then(() => { finished = true; }, () => { finished = true; });
    const checked = assert.rejects(pending, error => error.code === 'VENICE_TASK_STOPPED');
    assert.equal(h.api.stopTask(), true);
    await assert.rejects(h.api.runTask('overlap'), /既に実行中/);
    await tick();
    assert.equal(finished, false);
    release(malformed ? 'not JSON' : JSON.stringify(tool('fill', {selector: '#field', value: 'must not be filled'})));
    await checked;
    assert.equal(sends, 1);
    assert.equal(steps, 0);
    assert.equal(h.w.document.getElementById('field').value, '');
  });
}

test('stop during a tool lets the tool finish and reports it, but starts no next send', async t => {
  const h = agentHarness(t, {owned: true, replies: [tool('wait', {ms: 100})]});
  let release, finished = false;
  h.w.setTimeout = callback => { release = callback; return 1; };
  const steps = [];
  const pending = h.api.runTask('wait', {onStep: step => steps.push(clone(step))});
  pending.then(() => { finished = true; }, () => { finished = true; });
  const checked = assert.rejects(pending, error => error.code === 'VENICE_TASK_STOPPED');
  await settled(() => Boolean(release));
  h.api.stopTask();
  await tick(); assert.equal(finished, false);
  release(); await checked;
  assert.deepEqual(steps, [{index: 1, name: 'wait', ok: true}]);
  assert.equal(h.prompts.length, 1);
});

test('panel is host-scoped, Shadow DOM based, idle on load, collapsible and registered at document_start', async t => {
  const entries = JSON.parse(read('manifest.json')).content_scripts.filter(row => row.js.includes('venice-panel.js'));
  assert.deepEqual(entries, [{matches: ['https://venice.ai/*'], js: ['venice-panel.js'], world: 'ISOLATED', run_at: 'document_start'}]);
  const h = agentHarness(t), panel = mount(h);
  await settled(() => panel.get('state').textContent === '待機中');
  assert.equal(h.brain.document.querySelector('#instruction'), null);
  assert.equal(panel.get('maxSteps').value, '10');
  assert.equal(panel.get('maxSteps').max, '40');
  assert.equal(panel.get('run').disabled, true);
  assert.equal(panel.get('stop').disabled, true);
  assert.equal(h.prompts.length, 0);
  panel.get('toggle').click();
  assert.equal(panel.get('body').hidden, true);
  assert.equal(panel.get('toggle').getAttribute('aria-expanded'), 'false');
  assert.equal(panel.get('toggle').textContent, '開く');
  panel.get('toggle').click();
  assert.equal(panel.get('body').hidden, false);
  mount(h);
  assert.equal(h.brain.document.querySelectorAll('#cos-venice-panel').length, 1);
  const foreign = new JSDOM('<body></body>', {url: 'https://other.test/'});
  t.after(() => foreign.window.close());
  vm.runInNewContext(read('venice-panel.js'), {location: foreign.window.location});
  assert.equal(foreign.window.document.getElementById('cos-venice-panel'), null);
});

test('panel sends input/options via postMessage and renders progress and summary as safe text', async t => {
  const summary = '<img src=x onerror=alert(1)> ' + 'result '.repeat(20);
  const h = agentHarness(t, {replies: [tool('now'), done(summary)]}), panel = mount(h);
  await settled(() => panel.get('state').textContent === '待機中');
  instruct(h, panel);
  panel.get('maxSteps').value = '2';
  panel.get('run').click();
  assert.equal(panel.get('stop').disabled, false);
  assert.equal(panel.get('run').disabled, true);
  assert.equal(panel.get('instruction').disabled, true);
  await settled(() => panel.get('state').textContent === '完了');
  assert.equal(h.prompts.length, 2);
  assert.equal(panel.get('stop').disabled, true);
  assert.equal(panel.get('run').disabled, false);
  const rows = panel.get('steps').querySelectorAll('li');
  assert.equal(rows.length, 2);
  assert.match(rows[0].textContent, /^01 \/ now \/ ok:true \/ /);
  assert.equal(rows[1].textContent, `02 / done / ok:true / ${summary.replace(/\s+/g, ' ').slice(0, 60)}`);
  assert.equal(panel.get('message').textContent, summary);
  assert.equal(panel.root.querySelector('img'), null);
});

test('panel rejects step limits outside 1..40 and shows partial progress on a real step-limit error', async t => {
  const h = agentHarness(t, {replies: [tool('now')]}), panel = mount(h);
  await settled(() => panel.get('state').textContent === '待機中');
  instruct(h, panel);
  for (const value of ['0', '41', '1.5']) {
    panel.get('maxSteps').value = value; panel.get('run').click();
    assert.equal(h.prompts.length, 0);
  }
  panel.get('maxSteps').value = '1'; panel.get('run').click();
  await settled(() => panel.get('state').textContent === 'エラー');
  assert.match(panel.get('message').textContent, /exceeded maxSteps/);
  assert.equal(panel.get('steps').children.length, 1);
  assert.equal(panel.get('stop').disabled, true);
});

test('panel stop is pending until the send finishes and cannot stop a different run id', async t => {
  const h = agentHarness(t), panel = mount(h);
  let release;
  h.brain.__cosVeniceSend.sendViaUi = () => new Promise(resolve => { release = resolve; });
  await settled(() => panel.get('state').textContent === '待機中');
  instruct(h, panel); panel.get('run').click();
  await settled(() => Boolean(release));
  h.brain.postMessage({type: 'cos-venice-panel-request', op: 'stop', id: 'wrong-id'}, 'https://venice.ai');
  await tick();
  assert.equal(panel.get('state').textContent, '実行中');
  panel.get('stop').click();
  await settled(() => panel.get('state').textContent === '停止待ち');
  assert.equal(panel.get('stop').disabled, true);
  assert.equal(panel.get('run').disabled, true);
  release(JSON.stringify(tool('now')));
  await settled(() => panel.get('state').textContent === '停止');
  assert.equal(panel.get('steps').children.length, 0);
  assert.equal(panel.get('instruction').disabled, false);
  assert.equal(panel.get('run').disabled, false);
});

test('MAIN and panel ignore foreign-origin, wrong-source, wrong-id and wrong-type messages', async t => {
  const h = agentHarness(t), panel = mount(h);
  await settled(() => panel.get('state').textContent === '待機中');
  const request = {type: 'cos-venice-panel-request', op: 'run', id: 'spoof', instruction: 'must not send'};
  for (const [origin, source] of [['https://other.test', h.brain], ['https://venice.ai', null]]) {
    h.brain.dispatchEvent(new h.brain.MessageEvent('message', {data: request, origin, source}));
  }
  await tick(); assert.equal(h.prompts.length, 0);
  let release, runId;
  h.brain.__cosVeniceSend.sendViaUi = () => new Promise(resolve => { release = resolve; });
  h.brain.addEventListener('message', event => { if (event.data.type === 'cos-venice-panel-request' && event.data.op === 'run') runId = event.data.id; });
  instruct(h, panel); panel.get('run').click();
  await settled(() => Boolean(runId && release));
  for (const [id, type, origin, source] of [
    [runId, 'cos-venice-panel-event', 'https://other.test', h.brain],
    [runId, 'cos-venice-panel-event', 'https://venice.ai', null],
    ['wrong-id', 'cos-venice-panel-event', 'https://venice.ai', h.brain],
    [runId, 'wrong-type', 'https://venice.ai', h.brain]
  ]) {
    h.brain.dispatchEvent(new h.brain.MessageEvent('message', {origin, source, data: {type, id, event: 'done', summary: 'spoof'}}));
  }
  await tick(); assert.equal(panel.get('state').textContent, '実行中');
  release(JSON.stringify(done('real')));
  await settled(() => panel.get('state').textContent === '完了');
  assert.equal(panel.get('message').textContent, 'real');
});

test('document_start waits for a body and does not enable run before MAIN is ready', async t => {
  const dom = new JSDOM('', {url: 'https://venice.ai/'});
  t.after(() => dom.window.close());
  const brain = dom.window;
  brain.document.body.remove();
  brain.postMessage = () => {};
  const h = {brain};
  assert.equal(mount(h).host, null);
  brain.document.documentElement.appendChild(brain.document.createElement('body'));
  brain.document.dispatchEvent(new brain.Event('DOMContentLoaded'));
  const root = brain.document.getElementById('cos-venice-panel').shadowRoot;
  assert.equal(root.getElementById('run').disabled, true);
  assert.equal(root.getElementById('state').textContent, '接続待ち');
});
