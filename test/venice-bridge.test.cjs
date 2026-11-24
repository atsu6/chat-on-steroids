const {test} = require('node:test');
const assert = require('node:assert/strict');
const {worker, agentHarness, keyFor, senderFor, tick, read, clone} = require('./venice-bridge-harness.cjs');

const missing = '作業タブがありません。先に tab_open(url) を実行してください。';

test('manifest registers the bridge only for Venice in ISOLATED/document_start', () => {
  const manifest = JSON.parse(read('manifest.json'));
  const entries = manifest.content_scripts.filter(row => row.js.includes('venice-bridge.js'));
  assert.equal(entries.length, 1);
  assert.deepEqual(entries[0], {matches: ['https://venice.ai/*'], js: ['venice-bridge.js'],
    world: 'ISOLATED', run_at: 'document_start'});
});

test('tab_open and DOM tools travel through both worlds and leave the brain intact', async t => {
  const h = agentHarness(t, {html: '<button id="work">work only</button>'});
  const brainHtml = h.brain.document.body.innerHTML;
  assert.equal(h.calls.length, 0);
  assert.deepEqual(clone(await h.api.executeTool('query', {selector: 'button'})), {ok: false, error: missing});
  assert.deepEqual(clone(await h.api.executeTool('tab_open', {url: 'https://example.test/work'})), {
    ok: true, result: 'https://example.test/work'
  });
  const result = await h.api.executeTool('query', {selector: 'button'});
  assert.equal(result.result.matches[0].id, 'work');
  assert.equal(h.store[keyFor(1)], 10);
  assert.ok(h.runtimeMessages.every(message => message.type === 'cos-venice-bridge'));
  assert.ok(h.runtimeMessages.every(message => typeof message.id === 'string'));
  assert.equal(h.calls.find(call => call[0] === 'execute')[1].target.tabId, 10);
  assert.equal(h.brain.document.body.innerHTML, brainHtml);
  assert.equal(h.tabs.get(1).url, senderFor(1).url);
  assert.equal(h.prompts.length, 0);
});

test('all DOM tools report no working tab instead of operating on Venice', async t => {
  const h = agentHarness(t);
  for (const name of ['query', 'read_text', 'click_selector', 'scroll']) {
    assert.deepEqual(clone(await h.api.executeTool(name)), {ok: false, error: missing});
  }
  for (const op of ['eval', 'activate', 'close']) {
    assert.deepEqual(clone(await h.request(op)), {ok: false, error: missing});
  }
  assert.equal(h.calls.length, 0);
});

test('ensureTab creates inactive, reuses by navigation, activates and closes the owned tab', async t => {
  const h = worker(t);
  assert.equal((await h.request('ensureTab', {url: 'https://example.test/one'})).result.tabId, 10);
  assert.equal(h.calls[0][0], 'create');
  assert.equal(h.calls[0][1].active, false);
  const second = await h.request('ensureTab', {url: 'https://example.test/two'});
  assert.deepEqual(clone(second), {ok: true, result: {tabId: 10, url: 'https://example.test/two'}});
  assert.equal(h.calls.filter(call => call[0] === 'create').length, 1);
  assert.equal((await h.request('activate')).ok, true);
  assert.equal(h.tabs.get(10).active, true);
  assert.equal((await h.request('close')).ok, true);
  assert.equal(h.store[keyFor(1)], undefined);
  assert.equal(h.tabs.has(10), false);
  assert.equal(h.tabs.has(1), true);
  assert.equal((await h.request('activate')).error, missing);
});

test('session tab ownership survives service-worker restart', async t => {
  const first = worker(t);
  await first.request('ensureTab', {url: 'https://example.test/one'});
  const restarted = worker(t, {storage: first.store, tabs: first.tabs});
  const result = await restarted.request('ensureTab', {url: 'https://example.test/two'});
  assert.equal(result.result.tabId, 10);
  assert.equal(restarted.calls.filter(call => call[0] === 'create').length, 0);
});

test('concurrent requests serialize per brain; different brains do not share work tabs', async t => {
  const h = worker(t);
  const results = await Promise.all([
    h.request('ensureTab', {url: 'https://example.test/one'}),
    h.request('ensureTab', {url: 'https://example.test/two'})
  ]);
  assert.deepEqual(results.map(reply => reply.result.tabId), [10, 10]);
  h.tabs.set(3, {id: 3, url: senderFor(3).url, status: 'complete'});
  assert.equal((await h.request('ensureTab', {url: 'https://example.test/other'}, senderFor(3))).result.tabId, 11);
  assert.equal(h.store[keyFor(1)], 10);
  assert.equal(h.store[keyFor(3)], 11);
});

test('a manually closed work tab is cleared and only ensureTab recreates it', async t => {
  const h = worker(t);
  await h.request('ensureTab', {url: 'https://example.test/'});
  await h.chrome.tabs.remove(10);
  assert.equal((await h.request('eval', {name: 'query', args: {selector: 'body'}})).error, missing);
  assert.equal(h.store[keyFor(1)], undefined);
  assert.equal(h.calls.filter(call => call[0] === 'create').length, 1);
  assert.equal((await h.request('ensureTab', {url: 'https://example.test/'})).result.tabId, 11);
});

test('ensureTab waits for navigation before resolving and removes navigation listeners', async t => {
  const h = worker(t, {slowNavigation: true});
  let resolved = false;
  const opening = h.request('ensureTab', {url: 'https://example.test/start'}).then(reply => { resolved = true; return reply; });
  await tick();
  assert.equal(resolved, false);
  assert.equal(h.updates.size, 2); // One permanent grant-lifecycle listener plus navigation.
  h.complete(10, 'https://example.test/redirected');
  assert.equal((await opening).result.url, 'https://example.test/redirected');
  assert.equal(h.updates.size, 1); // Only the permanent grant-lifecycle listener remains.
  assert.equal(h.removals.size, 1);
});

test('navigation timeout and closing during navigation return errors without retrying', async t => {
  const timers = new Map();
  const h = worker(t, {slowNavigation: true, timers: {
    setTimeout(fn, ms) { timers.set(1, {fn, ms}); return 1; }, clearTimeout(id) { timers.delete(id); }
  }});
  const opening = h.request('ensureTab', {url: 'https://example.test/'});
  await tick();
  assert.equal(timers.get(1).ms, 30_000);
  timers.get(1).fn();
  assert.match((await opening).error, /30秒.*タイムアウト/);
  assert.equal(h.updates.size, 1); // Only the permanent grant-lifecycle listener remains.
  assert.equal(h.removals.size, 1);
  assert.equal(timers.size, 0);
  const reopening = h.request('ensureTab', {url: 'https://example.test/next'});
  await tick();
  await h.chrome.tabs.remove(10);
  assert.match((await reopening).error, /閉じられ/);
  assert.equal(h.calls.filter(call => call[0] === 'create').length, 1);
});

test('background rejects foreign senders, frames and navigation away from the brain', async t => {
  const h = worker(t);
  for (const sender of [
    {...senderFor(1), id: 'other-extension'}, {...senderFor(1), frameId: 1},
    {...senderFor(1), url: 'https://venice.ai.evil.test/'},
    {...senderFor(1), origin: 'https://other.test'}, {...senderFor(1), tab: undefined}
  ]) {
    assert.equal((await h.request('ensureTab', {url: 'https://example.test/'}, sender)).ok, false);
  }
  h.tabs.get(1).url = 'https://other.test/';
  assert.match((await h.request('ensureTab', {url: 'https://example.test/'})).error, /navigated away/);
  assert.equal(h.calls.length, 0);
});

test('bad URLs and corrupted ownership never navigate or close the brain', async t => {
  const h = worker(t);
  for (const url of ['javascript:alert(1)', 'chrome://extensions', 'file:///private', '/relative', undefined]) {
    assert.equal((await h.request('ensureTab', {url})).ok, false);
  }
  h.store[keyFor(1)] = 1;
  for (const op of ['ensureTab', 'activate', 'close', 'eval']) {
    assert.equal((await h.request(op, {url: 'https://example.test/'})).ok, false);
  }
  assert.equal(h.calls.length, 0);
});

test('only fixed DOM function names can be injected; scripting denial is not retried', async t => {
  const h = worker(t, {owned: true});
  for (const name of ['constructor', 'toString', 'fetch', '() => alert(1)']) {
    assert.match((await h.request('eval', {name})).error, /未登録のDOMツール/);
  }
  assert.equal(h.calls.length, 0);
  let calls = 0;
  h.chrome.scripting.executeScript = async () => { calls++; throw new Error('synthetic scripting permission denied'); };
  assert.match((await h.request('eval', {name: 'query', args: {selector: 'body'}})).error, /permission denied/);
  assert.equal(calls, 1);
  assert.equal((await h.request('other')).ok, false);
});

test('storage and browser errors preserve recovery rather than creating duplicate tabs', async t => {
  const h = worker(t);
  h.chrome.storage.session.set = async () => { throw new Error('synthetic storage full'); };
  assert.match((await h.request('ensureTab', {url: 'https://example.test/'})).error, /storage full/);
  assert.equal(h.tabs.has(10), false); // A tab without a saved owner is rolled back.
  const owned = worker(t, {owned: true});
  owned.chrome.tabs.get = async id => {
    if (id === 1) return {id: 1, url: senderFor(1).url};
    throw new Error('synthetic tabs access denied');
  };
  assert.match((await owned.request('ensureTab', {url: 'https://example.test/'})).error, /access denied/);
  assert.equal(owned.store[keyFor(1)], 2);
  assert.equal(owned.calls.length, 0);
});

test('ISOLATED ignores wrong origins and sources and forwards only the fixed message type', async t => {
  const h = agentHarness(t);
  const request = {id: 'synthetic-id', op: 'ensureTab', args: {url: 'https://example.test/'}, type: 'settings_set'};
  for (const [origin, source] of [['https://other.test', h.brain], ['https://venice.ai', null]]) {
    h.brain.dispatchEvent(new h.brain.MessageEvent('message', {data: {__cosVeniceBridge: request}, origin, source}));
  }
  await tick();
  assert.deepEqual(h.runtimeMessages.map(message => message.op), ['localDocument']);
  h.brain.postMessage({__cosVeniceBridge: request}, 'https://venice.ai');
  await tick();
  assert.equal(h.runtimeMessages[1].type, 'cos-venice-bridge');
  assert.equal(h.runtimeMessages[1].id, 'synthetic-id');
});

test('runtime disconnects and empty replies become tool errors', async t => {
  const h = agentHarness(t);
  h.isolatedChrome.runtime.sendMessage = async () => { throw new Error('synthetic extension disconnected'); };
  assert.match((await h.api.executeTool('query', {selector: 'body'})).error, /extension disconnected/);
  h.isolatedChrome.runtime.sendMessage = async () => undefined;
  assert.match((await h.api.executeTool('query', {selector: 'body'})).error, /no valid reply/);
});

test('MAIN correlates replies by id, origin and source and cleans up a timed-out request', async t => {
  const h = agentHarness(t);
  h.isolatedChrome.runtime.sendMessage = () => new Promise(() => {});
  let request, resolved = false;
  h.brain.addEventListener('message', event => { if (event.data.__cosVeniceBridge) request = event.data.__cosVeniceBridge; });
  const pending = h.api.executeTool('query', {selector: 'body'}).then(value => { resolved = true; return value; });
  await tick();
  for (const [id, origin, source] of [
    ['wrong-id', 'https://venice.ai', h.brain], [request.id, 'https://other.test', h.brain],
    [request.id, 'https://venice.ai', null]
  ]) {
    h.brain.dispatchEvent(new h.brain.MessageEvent('message', {
      data: {__cosVeniceBridgeReply: {id, ok: true, result: 'wrong'}}, origin, source
    }));
  }
  await tick();
  assert.equal(resolved, false);
  h.brain.postMessage({__cosVeniceBridgeReply: {id: request.id, ok: true, result: 'matched'}}, 'https://venice.ai');
  assert.equal((await pending).result, 'matched');
  let timeout, cleared = 0;
  h.brain.setTimeout = (fn, ms) => { assert.equal(ms, 45_000); timeout = fn; return 42; };
  h.brain.clearTimeout = id => { assert.equal(id, 42); cleared++; };
  const timed = h.api.executeTool('query', {selector: 'body'});
  timeout();
  assert.match((await timed).error, /bridge timed out.*eval/);
  assert.equal(cleared, 1);
});

test('existing non-Venice message dispatch and unknown-message behavior are unchanged', async t => {
  const h = worker(t);
  assert.deepEqual(clone(await h.send({type: 'synthetic_echo', value: 7})), {ok: true, result: 7});
  assert.deepEqual(clone(await h.send({type: 'unknown'})), {ok: false, error: 'unknown_message'});
  assert.equal(h.calls.length, 0);
});

test('runTask opens a work tab, reads its DOM and feeds the results back to the synthetic model', async t => {
  const h = agentHarness(t, {html: '<main id="destination">destination only</main>', replies: [
    {action: 'tool', name: 'tab_open', args: {url: 'https://example.test/destination'}},
    {action: 'tool', name: 'query', args: {selector: 'main'}}, {action: 'done', summary: 'read work tab'}
  ]});
  assert.deepEqual(clone(await h.api.runTask('inspect destination')), {summary: 'read work tab', steps: [
    {name: 'tab_open', ok: true}, {name: 'query', ok: true}, {name: 'done', ok: true}
  ]});
  assert.ok(h.prompts[1].includes('"result":"https://example.test/destination"'));
  assert.ok(h.prompts[2].includes('"id":"destination"'));
  assert.ok(h.prompts[0].includes('作業用タブ'));
  assert.equal(h.tabs.get(1).url, senderFor(1).url);
});
