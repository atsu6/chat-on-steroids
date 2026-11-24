const {test} = require('node:test');
const assert = require('node:assert/strict');
const {agentHarness, clone, senderFor} = require('./venice-bridge-harness.cjs');

test('core/read crosses both worlds, uses the real sender and preserves ToolResult inside the existing wrapper', async t => {
  const calls = [], result = {content: [{type: 'text', text: 'synthetic file'}], structuredContent: {kept: true}};
  const h = agentHarness(t, {localTransport: async (path, init) => {
    calls.push([path, JSON.parse(init.body)]);
    return {ok: true, data: {callId: calls.at(-1)[1].request.callId, state: 'completed', result}};
  }});
  assert.deepEqual(clone(await h.api.localIdentity()), {browserId: 'a'.repeat(32), tabId: 1, documentId: 'synthetic-document-1'});
  await h.api.setLocalRun('synthetic-app-run');
  assert.deepEqual(clone(await h.api.executeTool('core/read', {paths: ['/root/small.txt']})), {ok: true, result});
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], '/venice/tools');
  assert.deepEqual(calls[0][1].sender, {tabId: 1, documentId: 'synthetic-document-1'});
  assert.equal(calls[0][1].request.runId, 'synthetic-app-run');
  assert.equal(calls[0][1].request.surface, 'core');
  assert.equal(calls[0][1].request.tool, 'read');
  assert.equal(h.prompts.length, 0);
});

for (const first of ['lost-response', 'pending']) {
  test(`a ${first} retries exactly once with the identical callId and arguments`, async t => {
    const requests = [];
    const h = agentHarness(t, {localTransport: async (_path, init) => {
      const body = JSON.parse(init.body); requests.push(body.request);
      if (requests.length === 1 && first === 'lost-response') throw new Error('synthetic lost response');
      return {ok: true, data: {callId: body.request.callId,
        state: requests.length === 1 ? 'pending' : 'completed', result: {content: []}}};
    }});
    await h.api.setLocalRun('synthetic-app-run');
    assert.deepEqual(clone(await h.api.executeTool('core/read', {paths: ['/root/a']})), {ok: true, result: {content: []}});
    assert.equal(requests.length, 2); assert.deepEqual(requests[0], requests[1]);
  });
}

test('unknown and tool rejection are errors, not successful results or new executions', async t => {
  let calls = 0;
  const h = agentHarness(t, {localTransport: async (_path, init) => {
    calls++;
    return {ok: true, data: {callId: JSON.parse(init.body).request.callId, state: 'unknown', error: 'RUN_REVOKED'}};
  }});
  await h.api.setLocalRun('synthetic-app-run');
  const result = await h.api.executeTool('core/read', {paths: ['/root/a']});
  assert.equal(result.ok, false); assert.match(result.error, /RUN_REVOKED.*callId=/);
  assert.equal(calls, 1);
  const rejected = agentHarness(t, {localTransport: async (_path, init) => ({ok: true, data: {
    callId: JSON.parse(init.body).request.callId, state: 'completed',
    result: {isError: true, content: [{type: 'text', text: 'root refused'}]}
  }})});
  await rejected.api.setLocalRun('synthetic-app-run');
  assert.deepEqual(clone(await rejected.api.executeTool('core/read', {})), {ok: false, error: 'root refused'});
});

test('no grant or another document cannot use the stored run, and no model turn is sent', async t => {
  const h = agentHarness(t);
  assert.equal((await h.api.executeTool('core/read', {paths: ['/root/a']})).ok, false);
  await h.api.setLocalRun('synthetic-app-run');
  const otherDocument = await h.request('localTool', {surface: 'core', tool: 'read', callId: 'synthetic-call', args: {}},
    {...senderFor(1), documentId: 'other-document'});
  assert.equal(otherDocument.ok, false);
  assert.match(otherDocument.error, /grant/);
  assert.equal(h.prompts.length, 0);
});
