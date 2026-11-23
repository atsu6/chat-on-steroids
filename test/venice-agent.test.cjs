// Synthetic DOM and model replies only. No Venice traffic or private fixtures.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM} = require('jsdom');
const source = fs.readFileSync(path.resolve(__dirname, '../extension/venice-agent.js'), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
const tool = (name, args = {}) => ({action: 'tool', name, args});
const done = summary => ({action: 'done', summary});

function harness(t, replies = [], html = '') {
  const dom = new JSDOM(html, {url: 'https://venice.ai/chat/synthetic', runScripts: 'outside-only'});
  t.after(() => dom.window.close());
  const w = dom.window, prompts = [];
  w.fetch = () => assert.fail('Network must not be used');
  Object.defineProperty(w, 'chrome', {get() { assert.fail('Chrome APIs must not be used'); }});
  w.__cosVeniceSend = {async sendViaUi(prompt) {
    prompts.push(prompt);
    assert.ok(replies.length, 'Unexpected model turn');
    const reply = replies.shift();
    if (reply instanceof Error) throw reply;
    return typeof reply === 'string' ? reply : JSON.stringify(reply);
  }};
  w.eval(source);
  return {w, api: w.__cosVeniceAgent, prompts};
}

test('loading is inert; runTask ends on the first done and preserves runTurn', async t => {
  const h = harness(t, [done('finished'), done('single turn')]);
  assert.equal(h.prompts.length, 0);
  assert.deepEqual(plain(await h.api.runTask('task')), {
    summary: 'finished', steps: [{name: 'done', ok: true}]
  });
  assert.equal(h.prompts.length, 1);
  const turn = await h.api.runTurn('other task', {ok: true, result: 7});
  assert.equal(turn.action, 'done');
  assert.equal(turn.summary, 'single turn');
  assert.equal(JSON.parse(turn.raw).summary, 'single turn');
  assert.ok(h.prompts[1].includes('前のツール結果: {"ok":true,"result":7}'));
});

test('consecutive tools pass exact results to the next turn and record failures', async t => {
  const h = harness(t, [tool('query', {selector: 'button'}), tool('click_selector', {selector: '#missing'}),
    tool('now'), done('complete')], '<button id="first">one</button>');
  const result = plain(await h.api.runTask('same instruction'));
  assert.deepEqual(result, {summary: 'complete', steps: [
    {name: 'query', ok: true}, {name: 'click_selector', ok: false},
    {name: 'now', ok: true}, {name: 'done', ok: true}
  ]});
  assert.ok(h.prompts.every(prompt => prompt.includes('指示: same instruction')));
  const previous = h.prompts.slice(1).map(prompt => JSON.parse(prompt.split('前のツール結果: ')[1]));
  assert.equal(previous[0].result.count, 1);
  assert.equal(previous[0].result.matches[0].id, 'first');
  assert.deepEqual(previous[1], {ok: false, error: 'Element not found'});
  assert.equal(previous[2].ok, true);
  assert.ok(Number.isFinite(Date.parse(previous[2].result)));
});

for (const [label, options, count] of [
  ['default', undefined, 10], ['custom', {maxSteps: 2}, 2],
  ['hard cap', {maxSteps: 100}, 40]
]) {
  test(`runTask enforces ${label} limit without an extra turn`, async t => {
    const h = harness(t, Array.from({length: count}, () => tool('now')));
    await assert.rejects(h.api.runTask('never done', options), error => {
      assert.match(error.message, new RegExp(`steps=${count}, lastAction=.*"name":"now"`));
      assert.equal(error.stepCount, count);
      assert.equal(error.lastAction.name, 'now');
      assert.equal(error.steps.length, count);
      assert.ok(error.steps.every(step => step.name === 'now' && step.ok));
      return true;
    });
    assert.equal(h.prompts.length, count);
  });
}

test('done at the exact step limit succeeds', async t => {
  const h = harness(t, [tool('now'), done('at limit')]);
  const result = await h.api.runTask('finish', {maxSteps: 2});
  assert.equal(result.summary, 'at limit');
  assert.equal(result.steps.length, 2);
});

test('invalid limits fail before calling the transport', async t => {
  const h = harness(t);
  for (const maxSteps of [0, -1, 1.5, NaN, Infinity, '2']) {
    await assert.rejects(h.api.runTask('task', {maxSteps}), /positive integer/);
  }
  assert.equal(h.prompts.length, 0);
});

test('unknown tools retain direct rejection and become failed task feedback', async t => {
  const h = harness(t, [tool('constructor'), done('handled')]);
  await assert.rejects(h.api.executeTool('constructor'), /未登録のツール/);
  const result = await h.api.runTask('task');
  assert.equal(result.steps[0].ok, false);
  assert.ok(h.prompts[1].includes('"ok":false'));
});

test('transport errors and twice-invalid JSON stop the task without executing tools', async t => {
  const h = harness(t, [new Error('synthetic transport stopped'), 'invalid', 'still invalid']);
  await assert.rejects(h.api.runTask('task'), /synthetic transport stopped/);
  await assert.rejects(h.api.runTask('task'), /JSON として解析/);
  assert.equal(h.prompts.length, 3);
  assert.ok(h.prompts[2].includes('JSONのみで再出力してください。'));
});

test('query reports total count and at most 20 numbered, bounded DOM descriptions', async t => {
  const html = Array.from({length: 23}, (_, i) =>
    `<div id="item-${i}" class="${'a'.repeat(100)}"> \n ${'x'.repeat(70)} </div>`).join('');
  const h = harness(t, [], html);
  const {ok, result} = await h.api.executeTool('query', {selector: 'div'});
  assert.equal(ok, true);
  assert.equal(result.count, 23);
  assert.equal(result.matches.length, 20);
  assert.deepEqual(plain(result.matches[0]), {
    index: 1, tagName: 'DIV', id: 'item-0', className: 'a'.repeat(80), text: 'x'.repeat(40)
  });
  assert.equal(result.matches[19].index, 20);
  assert.equal((await h.api.executeTool('query', {selector: '.missing'})).result.count, 0);
});

test('read_text uses innerText, collapses whitespace and bounds output at 2000 characters', async t => {
  const h = harness(t, [], '<section>textContent is not innerText</section>');
  // jsdom has no layout/innerText implementation; supply synthetic rendered text explicitly.
  Object.defineProperty(h.w.document.body, 'innerText', {value: '  body \n\t text  '});
  Object.defineProperty(h.w.document.querySelector('section'), 'innerText', {value: ` \n ${'word\t '.repeat(600)}`});
  assert.deepEqual(plain(await h.api.executeTool('read_text')), {ok: true, result: 'body text'});
  const result = await h.api.executeTool('read_text', {selector: 'section'});
  assert.equal(result.result.length, 2000);
  assert.equal(result.result, 'word '.repeat(400));
  assert.equal((await h.api.executeTool('read_text', {selector: '.missing'})).ok, false);
});

test('click_selector scrolls the first match before observing its click event', async t => {
  const h = harness(t, [], '<button>first</button><button>second</button>');
  const [first, second] = h.w.document.querySelectorAll('button'), events = [];
  first.scrollIntoView = () => events.push('scroll');
  first.addEventListener('click', () => events.push('click'));
  second.addEventListener('click', () => assert.fail('Only the first match may be clicked'));
  assert.deepEqual(plain(await h.api.executeTool('click_selector', {selector: 'button'})), {
    ok: true, result: {clicked: true}
  });
  assert.deepEqual(events, ['scroll', 'click']);
});

test('click_selector reports missing, disabled, inert, detached and non-dispatched clicks as failures', async t => {
  const h = harness(t, [], '<button disabled id="disabled"></button><fieldset disabled><button id="fieldset"></button></fieldset>' +
    '<div inert><button id="inert"></button></div><button id="noop"></button><button id="detached"></button>');
  for (const id of ['missing', 'disabled', 'fieldset', 'inert']) {
    assert.equal((await h.api.executeTool('click_selector', {selector: '#' + id})).ok, false);
  }
  const noop = h.w.document.getElementById('noop');
  noop.scrollIntoView = () => {};
  noop.click = () => {};
  assert.equal((await h.api.executeTool('click_selector', {selector: '#noop'})).ok, false);
  const detached = h.w.document.getElementById('detached');
  detached.scrollIntoView = () => detached.remove();
  detached.click = () => assert.fail('Detached element must not be clicked');
  assert.equal((await h.api.executeTool('click_selector', {selector: '#detached'})).ok, false);
});

test('scroll returns the resulting scrollY, including negative and zero movement', async t => {
  const h = harness(t), calls = [];
  h.w.scrollY = 100;
  h.w.scrollBy = (x, y) => { calls.push([x, y]); h.w.scrollY = Math.max(0, h.w.scrollY + y); };
  for (const [dy, expected] of [[50, 150], [-300, 0], [0, 0]]) {
    assert.deepEqual(plain(await h.api.executeTool('scroll', {dy})), {ok: true, result: expected});
  }
  assert.deepEqual(calls, [[0, 50], [0, -300], [0, 0]]);
  for (const dy of [NaN, Infinity, '1', undefined]) {
    assert.equal((await h.api.executeTool('scroll', {dy})).ok, false);
  }
  assert.equal(calls.length, 3);
});

test('bad or missing selectors return ok:false instead of escaping as DOM exceptions', async t => {
  const h = harness(t);
  for (const name of ['query', 'read_text', 'click_selector']) {
    for (const selector of ['', '[', null]) {
      assert.equal((await h.api.executeTool(name, {selector})).ok, false);
    }
  }
  for (const name of ['query', 'click_selector']) assert.equal((await h.api.executeTool(name)).ok, false);
});
