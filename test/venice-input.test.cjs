// Synthetic working-tab DOM and Chrome APIs only; no model/network sends or private fixtures.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {agentHarness, clone, tick} = require('./venice-bridge-harness.cjs');

for (const [html, value] of [
  ['<input id="field">', 'input text'],
  ['<textarea id="field"></textarea>', 'line one\n二行目'],
  ['<select id="field"><option value="a">A</option><option value="b">B</option></select>', 'b']
]) {
  test(`fill uses the prototype value setter and bubbles input/change for ${html.split(' ')[0]}`, async t => {
    const h = agentHarness(t, {owned: true, html});
    const field = h.w.document.getElementById('field'), events = [];
    const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(field), 'value');
    Object.defineProperty(field, 'value', {
      get() { return descriptor.get.call(this); },
      set() { assert.fail('Must bypass the instance setter, as needed for React-controlled inputs'); }
    });
    field.scrollIntoView = () => events.push({type: 'scroll', value: field.value});
    for (const type of ['input', 'change']) h.w.document.addEventListener(type, event => {
      events.push({type, value: event.target.value, bubbles: event.bubbles, target: event.target});
    });
    assert.deepEqual(clone(await h.api.executeTool('fill', {selector: '#field', value})), {
      ok: true, result: {filled: true}
    });
    assert.equal(field.value, value);
    assert.deepEqual(events.map(event => event.type), ['scroll', 'input', 'change']);
    assert.ok(events.slice(1).every(event => event.bubbles && event.value === value && event.target === field));
    assert.equal(h.brain.document.querySelector('textarea').value, 'brain must stay untouched');
    assert.equal(h.prompts.length, 0);
  });
}

test('fill can clear an existing value and reports missing or unsupported elements as failures', async t => {
  const h = agentHarness(t, {owned: true, html: '<input id="field" value="old"><div id="unsupported"></div>'});
  h.w.document.getElementById('field').scrollIntoView = () => {};
  h.w.document.getElementById('unsupported').scrollIntoView = () => {};
  assert.equal((await h.api.executeTool('fill', {selector: '#field', value: ''})).ok, true);
  assert.equal(h.w.document.getElementById('field').value, '');
  assert.equal((await h.api.executeTool('fill', {selector: '#missing', value: 'text'})).error, 'Element not found');
  assert.match((await h.api.executeTool('fill', {selector: '#unsupported', value: 'text'})).error, /no value setter/);
  for (const value of [undefined, null, 1]) {
    assert.equal((await h.api.executeTool('fill', {selector: '#field', value})).ok, false);
  }
  assert.equal((await h.api.executeTool('fill', {selector: '[', value: 'text'})).ok, false);
});

for (const key of ['Enter', 'ArrowDown', 'a']) {
  test(`press dispatches ${key} as keydown/keypress/keyup on the selected work element`, async t => {
    const h = agentHarness(t, {owned: true, html: '<input id="field"><input id="other">'});
    const field = h.w.document.getElementById('field'), events = [];
    for (const type of ['keydown', 'keypress', 'keyup']) h.w.document.addEventListener(type, event => {
      events.push({type, key: event.key, code: event.code, keyCode: event.keyCode,
        bubbles: event.bubbles, composed: event.composed, isComposing: event.isComposing, target: event.target});
    });
    assert.deepEqual(clone(await h.api.executeTool('press', {selector: '#field', key})), {
      ok: true, result: {pressed: true, key}
    });
    assert.deepEqual(events.map(event => event.type), ['keydown', 'keypress', 'keyup']);
    assert.ok(events.every(event => event.key === key && event.target === field && event.bubbles && event.composed && !event.isComposing));
    if (key === 'Enter') assert.ok(events.every(event => event.code === 'Enter' && event.keyCode === 13));
    assert.equal(h.prompts.length, 0);
  });
}

test('press rejects a missing element, invalid selector or empty/non-string key', async t => {
  const h = agentHarness(t, {owned: true, html: '<input id="field">'});
  assert.equal((await h.api.executeTool('press', {selector: '#missing', key: 'Enter'})).error, 'Element not found');
  for (const selector of ['', '[', undefined]) {
    assert.equal((await h.api.executeTool('press', {selector, key: 'Enter'})).ok, false);
  }
  for (const key of ['', undefined, null, 1]) {
    assert.equal((await h.api.executeTool('press', {selector: '#field', key})).ok, false);
  }
});

for (const [ms, expected] of [[0, 0], [250, 250], [10_000, 10_000], [25_000, 10_000]]) {
  test(`wait(${ms}) schedules ${expected}ms and resolves only after its work-tab timer`, async t => {
    const h = agentHarness(t, {owned: true});
    const scheduled = [];
    h.w.setTimeout = (cb, delay) => { scheduled.push({cb, delay}); return scheduled.length; };
    let resolved = false;
    const pending = h.api.executeTool('wait', {ms}).then(result => { resolved = true; return result; });
    await tick();
    assert.equal(scheduled.length, 1);
    assert.equal(scheduled[0].delay, expected);
    assert.equal(resolved, false);
    scheduled[0].cb();
    assert.deepEqual(clone(await pending), {ok: true, result: {ms: expected}});
    assert.equal(resolved, true);
  });
}

test('wait rejects invalid durations before scheduling a timer', async t => {
  const h = agentHarness(t, {owned: true});
  h.w.setTimeout = () => assert.fail('Invalid duration must not schedule a timer');
  for (const ms of [-1, '100', null, undefined, NaN, Infinity]) {
    const result = await h.api.executeTool('wait', {ms});
    assert.equal(result.ok, false);
    assert.match(result.error, /non-negative finite number/);
  }
});

test('activate uses the existing background op and targets only the owned work tab', async t => {
  const h = agentHarness(t, {owned: true});
  assert.deepEqual(clone(await h.api.executeTool('activate')), {ok: true, result: {tabId: 2}});
  assert.equal(h.runtimeMessages[0].op, 'activate');
  assert.equal(h.tabs.get(2).active, true);
  assert.deepEqual(h.calls.map(call => clone(call)), [['update', 2, {active: true}]]);
  assert.equal(h.tabs.get(1).active, undefined);
});

test('all new tools report the existing no-work-tab error', async t => {
  const h = agentHarness(t);
  for (const [name, args] of [
    ['fill', {selector: 'input', value: 'text'}], ['press', {selector: 'input', key: 'Enter'}],
    ['wait', {ms: 0}], ['activate', {}]
  ]) {
    assert.deepEqual(clone(await h.api.executeTool(name, args)), {
      ok: false, error: '作業タブがありません。先に tab_open(url) を実行してください。'
    });
  }
  assert.equal(h.calls.length, 0);
});

test('CONTRACT lists each registered tool exactly once on its own line', t => {
  const h = agentHarness(t);
  const contract = h.api.buildTurn('synthetic').split('\n---\n')[0];
  const lines = contract.split('利用可能なツール:\n')[1].split('\n');
  const names = lines.map(line => {
    assert.match(line, /^[a-z_]+\(.*\) -> .+$/);
    return line.slice(0, line.indexOf('('));
  });
  assert.deepEqual(names, Object.keys(h.api.TOOL_REGISTRY));
  assert.equal(new Set(names).size, names.length);
  for (const name of ['fill', 'press', 'wait', 'activate']) assert.ok(names.includes(name));
});

test('runTask executes input, key, wait and activation through the bridge', async t => {
  const actions = [
    ['fill', {selector: '#field', value: 'synthetic input'}],
    ['press', {selector: '#field', key: 'Enter'}], ['wait', {ms: 0}], ['activate', {}]
  ];
  const h = agentHarness(t, {owned: true, html: '<input id="field">', replies: [
    ...actions.map(([name, args]) => ({action: 'tool', name, args})), {action: 'done', summary: 'complete'}
  ]});
  h.w.document.getElementById('field').scrollIntoView = () => {};
  assert.deepEqual(clone(await h.api.runTask('synthetic input task')), {summary: 'complete', steps: [
    ...actions.map(([name]) => ({name, ok: true})), {name: 'done', ok: true}
  ]});
  assert.equal(h.w.document.getElementById('field').value, 'synthetic input');
  assert.equal(h.tabs.get(2).active, true);
});
