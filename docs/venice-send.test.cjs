// Synthetic sender checks; no connection to Venice and no private fixture required.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../extension/venice-send.js'), 'utf8');
const messages = text => [{
  content: [{ annotations: [], text, type: 'output_text' }],
  id: 'synthetic-message', role: 'user', status: 'completed', type: 'message'
}];

function harness(fetch, origin = 'https://venice.ai') {
  const sandbox = { fetch, location: { origin }, URL, structuredClone };
  sandbox.window = sandbox;
  vm.runInNewContext(source, sandbox);
  return { api: sandbox.__cosVeniceSend, window: sandbox };
}

test('sendTurn posts the captured shape and only replaces messages and agentModelId', async () => {
  const calls = [];
  const response = new Response('event: synthetic\ndata: fixture\n\n');
  const nativePromise = Promise.resolve(response);
  const h = harness((url, init) => { calls.push({ url, init }); return nativePromise; });
  assert.equal(calls.length, 0);
  const input = messages('synthetic one');
  const original = structuredClone(input);
  const result = h.api.sendTurn(input, 'synthetic-model&not-a-new-query=true');
  assert.equal(result, nativePromise);
  assert.equal(await result, response);
  assert.equal(response.bodyUsed, false);
  assert.equal(calls.length, 1);
  const { url, init } = calls[0];
  const parsed = new URL(url);
  assert.equal(parsed.origin + parsed.pathname, 'https://outerface.venice.ai/api/inference/chat/agents/venice');
  assert.deepEqual([...parsed.searchParams], [
    ['agentModelId', 'synthetic-model&not-a-new-query=true'],
    ['allowPaidImages', 'true'], ['paidImagesMode', 'allow']
  ]);
  assert.equal(init.method, 'POST');
  assert.equal(init.credentials, 'include');
  assert.deepEqual({ ...init.headers }, { 'Content-Type': 'application/json' });
  const body = JSON.parse(init.body);
  assert.deepEqual(Object.keys(body), ['clientTools', 'input']);
  assert.deepEqual(Object.keys(body.input), ['messages']);
  assert.deepEqual(body.input.messages, input);
  assert.deepEqual(input, original);
  assert.deepEqual(body.clientTools.map(tool => tool.name), ['approve_paid_usage', 'edit_video']);
  assert.deepEqual(Object.keys(h.api), ['sendTurn']);
});

test('each turn gets an independent body while the captured clientTools stay identical', () => {
  const calls = [];
  const h = harness((url, init) => { calls.push({ url, body: JSON.parse(init.body) }); return Promise.resolve(new Response()); });
  h.api.sendTurn(messages('first'), 'first-model');
  h.api.sendTurn(messages('second'), 'second-model');
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0].body.clientTools, calls[1].body.clientTools);
  assert.notDeepEqual(calls[0].body.input.messages, calls[1].body.input.messages);
  assert.equal(new URL(calls[1].url).searchParams.get('agentModelId'), 'second-model');
});

for (const status of [401, 403]) {
  test(`${status} is returned untouched without reading the body, adding auth or retrying`, async () => {
    let calls = 0;
    const response = new Response('synthetic access rejection', { status });
    const h = harness((_url, init) => {
      calls++;
      assert.deepEqual(Object.keys(init.headers), ['Content-Type']);
      return Promise.resolve(response);
    });
    const returned = await h.api.sendTurn(messages('test'), 'synthetic-model');
    assert.equal(returned, response);
    assert.equal(returned.status, status);
    assert.equal(returned.bodyUsed, false);
    assert.equal(calls, 1);
  });
}

test('invalid arguments never cause a request', () => {
  let calls = 0;
  const h = harness(() => { calls++; return Promise.resolve(new Response()); });
  assert.throws(() => h.api.sendTurn({}, 'model'), /messages must be an array/);
  assert.throws(() => h.api.sendTurn([], ''), /model must be a non-empty string/);
  assert.throws(() => h.api.sendTurn([], undefined), /model must be a non-empty string/);
  assert.equal(calls, 0);
});

test('the sender is not exposed on ChatGPT and never sends on installation', () => {
  let calls = 0;
  const native = () => { calls++; return Promise.resolve(new Response()); };
  const h = harness(native, 'https://chatgpt.com');
  assert.equal(h.api, undefined);
  assert.equal(h.window.fetch, native);
  assert.equal(calls, 0);
});
