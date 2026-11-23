// Runs the shipped listener/bridge with synthetic Chrome APIs and two separate documents.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {JSDOM} = require('jsdom');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, 'extension', name), 'utf8');
const background = read('background.js');
const section = (start, end) => {
  const from = background.indexOf(start), to = background.indexOf(end, from);
  assert.ok(from >= 0 && to > from, 'Shipped background section must exist');
  return background.slice(from, to);
};
const workerSource = section('// Venice work-tab bridge.', '/**\n * Best current conversation identity') +
  section('function serializeTab(tab, operation)', '\n/** Best-effort telemetry');
const keyFor = id => `cosVeniceWorkTab:${id}`;
const senderFor = id => ({id: 'synthetic-extension', tab: {id}, frameId: 0,
  url: 'https://venice.ai/chat/synthetic', origin: 'https://venice.ai', documentId: `synthetic-document-${id}`});
const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const tick = () => new Promise(resolve => setImmediate(resolve));

function worker(t, {html = '', owned = false, storage = {}, tabs, slowNavigation = false, timers, localTransport} = {}) {
  const workDom = new JSDOM(html, {url: 'https://example.test/', runScripts: 'outside-only'});
  t.after(() => workDom.window.close());
  workDom.window.fetch = () => assert.fail('No network is allowed');
  const calls = [], updates = new Set(), removals = new Set();
  const store = storage;
  const tabMap = tabs ?? new Map([[1, {id: 1, url: senderFor(1).url, status: 'complete'}]]);
  if (owned) {
    store[keyFor(1)] = 2;
    tabMap.set(2, {id: 2, url: 'https://example.test/', status: 'complete'});
  }
  let nextId = 10, listener;
  const event = listeners => ({addListener: fn => listeners.add(fn), removeListener: fn => listeners.delete(fn)});
  const api = {
    runtime: {id: 'synthetic-extension', onMessage: {addListener(fn) { listener = fn; }}},
    storage: {session: {
      async get(key) { return {[key]: store[key]}; },
      async set(value) { calls.push(['save', clone(value)]); Object.assign(store, value); },
      async remove(key) { calls.push(['forget', key]); delete store[key]; }
    }},
    tabs: {
      async get(id) {
        if (!tabMap.has(id)) throw new Error(`No tab with id: ${id}.`);
        return {...tabMap.get(id)};
      },
      async create(options) {
        calls.push(['create', clone(options)]);
        const tab = {id: nextId++, ...options, status: slowNavigation ? 'loading' : 'complete'};
        tabMap.set(tab.id, tab);
        return {...tab};
      },
      async update(id, changes) {
        calls.push(['update', id, clone(changes)]);
        const tab = await this.get(id);
        Object.assign(tab, changes);
        if (changes.url) tab.status = slowNavigation ? 'loading' : 'complete';
        tabMap.set(id, tab);
        return {...tab};
      },
      async remove(id) {
        calls.push(['remove', id]);
        await this.get(id);
        tabMap.delete(id);
        for (const fn of removals) fn(id);
      },
      onUpdated: event(updates), onRemoved: event(removals)
    },
    scripting: {async executeScript(injection) {
      calls.push(['execute', injection]);
      assert.notEqual(injection.target.tabId, 1, 'Never inject into the brain');
      assert.deepEqual(clone(injection.target.frameIds), [0]);
      assert.equal(injection.world, 'ISOLATED');
      // Like Chrome, serialize the function and args; do not retain any background closures.
      const fn = workDom.window.eval('(' + injection.func.toString() + ')');
      return [{frameId: 0, result: clone(await fn(...clone(injection.args)))}];
    }}
  };
  vm.runInNewContext(workerSource, {
    browserId: 'a'.repeat(32), load: async () => {},
    call: localTransport ?? (async () => { throw new Error('Unexpected local transport'); }),
    chrome: api, URL, setTimeout: timers?.setTimeout ?? setTimeout, clearTimeout: timers?.clearTimeout ?? clearTimeout,
    tabOperationQueues: new Map(),
    HANDLERS: {synthetic_echo: async message => ({ok: true, result: message.value})},
    tabId: sender => sender.tab?.id ?? null
  });
  const send = (message, sender = senderFor(1)) => new Promise(resolve => {
    assert.equal(listener(message, sender, resolve), message.type === 'unknown' ? false : true);
  });
  return {chrome: api, w: workDom.window, store, tabs: tabMap, calls, updates, removals,
    send, request: (op, args, sender) => send({type: 'cos-venice-bridge', op, args}, sender),
    complete(id, url) {
      const tab = tabMap.get(id);
      Object.assign(tab, {status: 'complete', ...(url ? {url} : {})});
      delete tab.pendingUrl;
      for (const fn of updates) fn(id, {status: 'complete'}, {...tab});
    }};
}

function agentHarness(t, {replies = [], html = '', owned = false, localTransport} = {}) {
  const h = worker(t, {html, owned, localTransport});
  const brainDom = new JSDOM('<textarea>brain must stay untouched</textarea><button id="brain">brain</button>', {
    url: 'https://venice.ai/chat/synthetic', runScripts: 'outside-only'
  });
  t.after(() => brainDom.window.close());
  const brain = brainDom.window, prompts = [], runtimeMessages = [];
  brain.fetch = () => assert.fail('Network must not be used');
  Object.defineProperty(brain, 'chrome', {get() { assert.fail('MAIN must not use Chrome APIs'); }});
  brain.postMessage = (data, origin) => {
    assert.equal(origin, 'https://venice.ai');
    queueMicrotask(() => brain.dispatchEvent(new brain.MessageEvent('message', {
      data: clone(data), origin, source: brain
    })));
  };
  const isolatedChrome = {runtime: {async sendMessage(message) {
    runtimeMessages.push(clone(message));
    return h.send(message);
  }}};
  vm.runInNewContext(read('venice-bridge.js'), {window: brain, location: brain.location, chrome: isolatedChrome});
  brain.__cosVeniceSend = {async sendViaUi(prompt) {
    prompts.push(prompt);
    assert.ok(replies.length, 'Unexpected model turn');
    const reply = replies.shift();
    if (reply instanceof Error) throw reply;
    return typeof reply === 'string' ? reply : JSON.stringify(reply);
  }};
  brain.eval(read('venice-agent.js'));
  return {...h, brain, prompts, runtimeMessages, isolatedChrome, api: brain.__cosVeniceAgent};
}
module.exports = {worker, agentHarness, keyFor, senderFor, tick, read, clone};
