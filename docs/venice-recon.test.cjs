// Synthetic local checks only; this file never contacts Venice.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'extension/venice-recon.js'), 'utf8');
const usage = fs.readFileSync(path.join(root, 'extension/usage.js'), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));

function harness(fetch, origin = 'https://venice.ai') {
  const blobs = new Map();
  const downloads = [];
  const sandbox = {
    location: { origin, hostname: new URL(origin).hostname, href: `${origin}/chat` },
    fetch, Request, Response, Headers, Blob, TextEncoder, TextDecoder, URLSearchParams,
    URL: class extends URL {
      static createObjectURL(blob) { const id = `blob:synthetic-${blobs.size}`; blobs.set(id, blob); return id; }
      static revokeObjectURL(id) { blobs.delete(id); }
    },
    setTimeout() {}, // Do not keep this local test process alive for object-URL expiry.
    document: {
      documentElement: { appendChild() {} },
      createElement(name) {
        assert.equal(name, 'a');
        return { click() { downloads.push({ filename: this.download, blob: blobs.get(this.href) }); }, remove() {} };
      }
    }
  };
  sandbox.window = sandbox;
  const context = vm.createContext(sandbox);
  vm.runInContext(source, context);
  if (origin === 'https://venice.ai') vm.runInContext(usage, context);
  return {
    window: sandbox, api: sandbox.__cosVeniceRecon, downloads,
    async settle() {
      for (let i = 0; i < 100; i++) {
        await tick();
        if (sandbox.__cosVeniceRecon.status().readingBodies === 0) return;
      }
      assert.fail('Synthetic body reader did not settle');
    },
    async save() {
      const receipt = sandbox.__cosVeniceRecon.save();
      const latest = downloads.at(-1);
      assert.equal(latest.filename, receipt.filename);
      const json = await latest.blob.text();
      return { json, capture: JSON.parse(json) };
    }
  };
}

test('progress reports only scalar completion metadata for empty and pending records', async () => {
  let resolve;
  const pending = new Promise(done => { resolve = done; });
  const h = harness(() => pending);
  const empty = { recording: false, requests: 0, lastNumber: 0, lastBodyComplete: false, lastStatus: null };
  assert.deepEqual({ ...h.api.progress() }, empty);
  h.api.start();
  assert.deepEqual({ ...h.api.progress() }, { ...empty, recording: true });
  h.window.fetch('/api/inference/unknown', { method: 'POST', headers: { Authorization: 'Bearer synthetic-progress-secret' }, body: 'private fixture text' });
  assert.deepEqual({ ...h.api.progress() }, { recording: true, requests: 1, lastNumber: 1, lastBodyComplete: false, lastStatus: null });
  resolve(new Response('private fixture response'));
  await h.settle();
  const snapshot = h.api.progress();
  assert.deepEqual({ ...snapshot }, { recording: true, requests: 1, lastNumber: 1, lastBodyComplete: true, lastStatus: 200 });
  assert.ok(Object.values(snapshot).every(value => typeof value === 'boolean' || typeof value === 'number' || value === null));
  snapshot.lastNumber = 99;
  assert.equal(h.api.progress().lastNumber, 1);
  h.api.stop();
  assert.equal(h.api.progress().recording, false);
  assert.equal(h.api.progress().lastNumber, 1);
  h.api.start();
  assert.deepEqual({ ...h.api.progress() }, { ...empty, recording: true });
});

test('progress distinguishes an open response body from a completed body and follows the latest record', async () => {
  let controller;
  let calls = 0;
  const response = new Response(new ReadableStream({ start(value) { controller = value; } }),
    { headers: { 'content-type': 'text/event-stream' } });
  const h = harness(() => Promise.resolve(++calls === 1 ? response : new Response('rate limited', { status: 429 })));
  h.api.start();
  await h.window.fetch('/api/inference/unknown', { method: 'POST' });
  assert.deepEqual({ ...h.api.progress() }, { recording: true, requests: 1, lastNumber: 1, lastBodyComplete: false, lastStatus: 200 });
  controller.close();
  await h.settle();
  assert.equal(h.api.progress().lastBodyComplete, true);
  await h.window.fetch('/api/inference/unknown', { method: 'POST' });
  await h.settle();
  assert.deepEqual({ ...h.api.progress() }, { recording: true, requests: 2, lastNumber: 2, lastBodyComplete: true, lastStatus: 429 });
});

test('manual opt-in preserves the exact native promise, arguments and SSE body', async () => {
  const sse = 'event: synthetic\ndata: {"opaque":"fixture"}\n\ndata: [DONE]\n\n';
  const response = new Response(sse, { headers: { 'Content-Type': 'text/event-stream' } });
  const nativePromise = Promise.resolve(response);
  const calls = [];
  const h = harness(function (...args) { calls.push({ receiver: this, args }); return nativePromise; });
  assert.equal(h.api.status().installed, true);
  await h.window.fetch('/ignored-before-start', { method: 'POST' });
  assert.equal(h.api.status().requests, 0);
  h.api.start();
  const init = { method: 'POST', body: '{"synthetic":"request"}' };
  const result = h.window.fetch('/api/inference/unknown-send-route', init);
  assert.equal(result, nativePromise);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].args[0], '/api/inference/unknown-send-route');
  assert.equal(calls[1].args[1], init);
  await h.settle();
  const { capture } = await h.save();
  assert.equal(capture.records[0].request.body.text, init.body);
  assert.equal(capture.records[0].response.body.text, sse);
  assert.equal(capture.records[0].response.body.complete, true);
  assert.equal(capture.records[0].response.url, ''); // A synthetic Response has no observed URL.
  assert.equal(await response.text(), sse);
  assert.equal(h.api.status().recording, false);
});

test('credentials are redacted before JSON escaping, including cookies and body echoes', async () => {
  const token = 'synthetic-"quoted\\credential';
  const cookie = 'synthetic-session-cookie';
  const responseBody = `echo: ${token}\necho: ${cookie}\n{"session":"synthetic-body-secret"}`;
  let originalInit;
  const h = harness((_url, init) => {
    originalInit = init;
    return Promise.resolve(new Response(responseBody, { headers: {
      'set-cookie': 'session=synthetic-new-cookie; HttpOnly; Path=/', 'content-type': 'text/event-stream'
    } }));
  });
  h.api.start();
  await h.window.fetch('/api/inference/unknown?session=synthetic-query-secret', {
    method: 'POST', credentials: 'include', headers: {
      aUtHoRiZaTiOn: `Bearer ${token}`, Cookie: `session=${cookie}; another=synthetic-another-cookie`
    }, body: '{"messages":[{"text":"not a secret"}],"access_token":"synthetic-body-token"}'
  });
  await h.settle();
  const { capture, json } = await h.save();
  const record = capture.records[0];
  assert.equal(record.request.headers.authorization, '[REDACTED]');
  assert.equal(record.request.headers.cookie, '[REDACTED]');
  assert.equal(record.response.headers['set-cookie'], '[REDACTED]');
  assert.ok(!record.response.body.text.includes(token));
  for (const secret of [cookie, 'synthetic-new-cookie', 'synthetic-another-cookie',
    'synthetic-query-secret', 'synthetic-body-token', 'synthetic-body-secret']) assert.ok(!json.includes(secret), secret);
  assert.equal(originalInit.headers.aUtHoRiZaTiOn, `Bearer ${token}`);
  assert.equal(originalInit.credentials, 'include');
  assert.ok(record.response.body.text.includes('[REDACTED]'));
  assert.ok(capture.unobservable.some(value => value.includes('HttpOnly')));
});

test('Request bodies are cloned, and unsupported init bodies remain explicitly unknown', async () => {
  const h = harness(() => Promise.resolve(new Response('synthetic response')));
  const request = new Request('https://venice.ai/api/inference/unknown', { method: 'POST', body: 'original request text' });
  h.api.start();
  await h.window.fetch(request);
  await h.window.fetch('/api/inference/unknown', { method: 'POST', body: new Blob(['synthetic blob']) });
  await h.settle();
  const { capture } = await h.save();
  assert.equal(capture.records[0].request.body.text, 'original request text');
  assert.equal(await request.text(), 'original request text');
  assert.equal(capture.records[1].request.body.text, '');
  assert.equal(capture.records[1].request.body.limitation, 'non-text-init-body-not-read');
});

test('UTF-8 split across read chunks preserves Japanese text and raw SSE framing', async () => {
  const text = 'data: {"text":"青い傘"}\r\n\r\ndata: not-json\r\n\r\n';
  const bytes = new TextEncoder().encode(text);
  const split = new TextEncoder().encode('data: {"text":"').length + 1;
  const response = new Response(new ReadableStream({ start(controller) {
    controller.enqueue(bytes.subarray(0, split));
    controller.enqueue(bytes.subarray(split, split + 1));
    controller.enqueue(bytes.subarray(split + 1));
    controller.close();
  } }), { headers: { 'content-type': 'text/event-stream' } });
  const h = harness(() => Promise.resolve(response));
  h.api.start();
  await h.window.fetch('/api/inference/unknown', { method: 'POST' });
  await h.settle();
  const { capture } = await h.save();
  const body = capture.records[0].response.body;
  assert.equal(body.text, text);
  assert.equal(body.chunks.length, 3);
  assert.equal(body.chunks.reduce((sum, row) => sum + row.byteLength, 0), bytes.length);
  assert.equal(await response.text(), text);
});

test('GET is retained only for observed SSE; foreign destinations are not retained', async () => {
  const h = harness(url => Promise.resolve(new Response('synthetic', {
    headers: { 'content-type': String(url).includes('sse') ? 'text/event-stream' : 'application/json' }
  })));
  h.api.start();
  await h.window.fetch('/api/inference/not-a-stream');
  await h.window.fetch('https://unrelated.example/api/inference/unknown', { method: 'POST' });
  await h.window.fetch('https://api.venice.ai/api/inference/unknown-sse');
  await h.settle();
  const { capture } = await h.save();
  assert.equal(capture.records.length, 1);
  assert.equal(capture.records[0].request.method, 'GET');
  assert.equal(capture.records[0].request.url, 'https://api.venice.ai/api/inference/unknown-sse');
  assert.deepEqual(capture.records[0].request.headers, {});
});

test('body limits bound observation without truncating the native response', async () => {
  const large = 'x'.repeat(1024 * 1024 + 37);
  let calls = 0;
  const h = harness(() => { calls++; return Promise.resolve(new Response(large)); });
  h.api.start();
  const response = await h.window.fetch('/api/inference/unknown', { method: 'POST' });
  for (let i = 0; i < 9; i++) await h.window.fetch('/api/inference/unknown', { method: 'POST' });
  await h.settle();
  const { capture } = await h.save();
  assert.equal(calls, 10);
  assert.equal(capture.records.length, 10);
  assert.equal(capture.limitReached, false);
  assert.equal(capture.records[0].response.body.bytesCaptured, 1024 * 1024);
  assert.equal(capture.records[0].response.body.complete, false);
  assert.equal(capture.records[0].response.body.limitation, 'body-byte-limit');
  assert.equal(await response.text(), large);
});

test('stopping a live clone does not cancel the user stream or wait for it to finish', async () => {
  let controller;
  const response = new Response(new ReadableStream({ start(value) { controller = value; } }),
    { headers: { 'content-type': 'text/event-stream' } });
  const h = harness(() => Promise.resolve(response));
  h.api.start();
  await h.window.fetch('/api/inference/unknown', { method: 'POST' });
  controller.enqueue(new TextEncoder().encode('data: synthetic-start\n\n'));
  for (let i = 0; i < 5; i++) await tick();
  const { capture } = await h.save();
  assert.equal(capture.records[0].response.body.complete, false);
  assert.equal(capture.records[0].response.body.limitation, 'stopped-before-body-complete');
  controller.enqueue(new TextEncoder().encode('data: synthetic-end\n\n'));
  controller.close();
  assert.equal(await response.text(), 'data: synthetic-start\n\ndata: synthetic-end\n\n');
});

test('late responses cannot cross recording sessions, and failures are not retried', async () => {
  let resolve;
  let calls = 0;
  const old = new Promise(done => { resolve = done; });
  const rejected = Promise.reject(new Error('synthetic network failure'));
  // Attach the test's handler now, before starting observation.
  void rejected.catch(() => {});
  const h = harness(() => (++calls === 1 ? old : rejected));
  h.api.start();
  assert.throws(() => h.api.start(), /既に記録中/);
  h.window.fetch('/api/inference/old', { method: 'POST' });
  h.api.stop(); h.api.start();
  resolve(new Response('old response'));
  const result = h.window.fetch('/api/inference/new', { method: 'POST' });
  assert.equal(result, rejected);
  await assert.rejects(result, /synthetic network failure/);
  await h.settle();
  const { capture } = await h.save();
  assert.equal(calls, 2);
  assert.equal(capture.records.length, 1);
  assert.equal(capture.records[0].request.url, 'https://venice.ai/api/inference/new');
  assert.equal(capture.records[0].networkError, 'fetch-rejected');
  assert.equal(capture.records[0].response, null);
});

test('starting and exporting never sends network requests', async () => {
  let calls = 0;
  const h = harness(() => { calls++; return Promise.resolve(new Response('unused')); });
  h.api.start();
  const { capture } = await h.save();
  assert.equal(calls, 0);
  assert.equal(capture.records.length, 0);
});

test('Venice injection is host-scoped, with unchanged ChatGPT content-script entries', () => {
  const native = () => Promise.resolve(new Response('unused'));
  const other = harness(native, 'https://chatgpt.com');
  assert.equal(other.window.fetch, native);
  assert.equal(other.api, undefined);
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'extension/manifest.json'), 'utf8'));
  assert.ok(manifest.host_permissions.includes('https://venice.ai/*'));
  const venice = manifest.content_scripts.filter(entry => entry.matches.includes('https://venice.ai/*'));
  assert.equal(venice.length, 2);
  assert.equal(venice[0].world, 'MAIN');
  assert.equal(venice[0].run_at, 'document_start');
  assert.deepEqual(venice[0].js, ['venice-recon.js', 'venice-sse.js', 'venice-send.js', 'venice-agent.js', 'usage.js']);
  assert.deepEqual(venice[1], {matches: ['https://venice.ai/*'], js: ['venice-bridge.js'], world: 'ISOLATED', run_at: 'document_start'});
  const chatgpt = manifest.content_scripts.filter(entry => entry.matches.includes('https://chatgpt.com/*'));
  assert.deepEqual(chatgpt, [
    { matches: ['https://chatgpt.com/*', 'https://chat.openai.com/*'],
      js: ['i18n.js', 'chatgpt-dom.js', 'app-palette.js', 'content.js'], css: ['overlay.css'], run_at: 'document_idle' },
    { matches: ['https://chatgpt.com/*', 'https://chat.openai.com/*'], js: ['fiber.js'], world: 'MAIN', run_at: 'document_idle' },
    { matches: ['https://chatgpt.com/*', 'https://chat.openai.com/*'], js: ['usage.js'], world: 'MAIN', run_at: 'document_start' }
  ]);
});

test('chatProgress ignores helper requests and reports only the latest chat record', async () => {
  let calls = 0;
  const h = harness(() => Promise.resolve(new Response('synthetic', { status: ++calls === 2 ? 403 : 200 })));
  const empty = { lastChatNumber: 0, lastChatBodyComplete: false, lastChatStatus: null };
  assert.deepEqual({ ...h.api.chatProgress() }, empty);
  h.api.start();
  await h.window.fetch('/api/inference/helper', { method: 'POST' });
  await h.settle();
  assert.deepEqual({ ...h.api.chatProgress() }, empty);
  await h.window.fetch('/api/inference/chat/agents/venice', { method: 'POST' });
  await h.settle();
  const expected = { lastChatNumber: 2, lastChatBodyComplete: true, lastChatStatus: 403 };
  assert.deepEqual({ ...h.api.chatProgress() }, expected);
  await h.window.fetch('/api/inference/helper', { method: 'POST' });
  await h.settle();
  assert.equal(h.api.progress().lastStatus, 200);
  assert.deepEqual({ ...h.api.chatProgress() }, expected);
  h.api.stop(); h.api.start();
  assert.deepEqual({ ...h.api.chatProgress() }, empty);
});

test('follow delivers live raw POST chat SSE deltas with record numbers and unsubscribes', async () => {
  let controller;
  const stream = new Response(new ReadableStream({ start(value) { controller = value; } }),
    { headers: { 'content-type': 'text/event-stream' } });
  const sse = 'event: synthetic\ndata: {"text":"青い傘"}\n\n';
  const h = harness(url => Promise.resolve(String(url).endsWith('/stream') ? stream : new Response(sse, {
    headers: { 'content-type': String(url).includes('json') ? 'application/json' : 'text/event-stream' }
  })));
  const chunks = [];
  assert.throws(() => h.api.follow(null), /callback must be a function/);
  const stopBroken = h.api.follow(() => { throw new Error('synthetic subscriber failure'); });
  const unsubscribe = h.api.follow((text, number) => chunks.push({ text, number }));
  h.api.start();
  await h.window.fetch('/api/inference/helper', { method: 'POST' });
  await h.window.fetch('/api/inference/chat/get');
  await h.window.fetch('/api/inference/chat/json', { method: 'POST' });
  await h.settle();
  assert.deepEqual(chunks, []);
  const original = await h.window.fetch('/api/inference/chat/stream', { method: 'POST', body: 'not response text' });
  const bytes = new TextEncoder().encode(sse);
  const split = new TextEncoder().encode('event: synthetic\ndata: {"text":"').length + 1;
  controller.enqueue(bytes.subarray(0, split));
  for (let i = 0; i < 5; i++) await tick();
  assert.equal(chunks.length, 1); // Delivered before response EOF, including a split UTF-8 character.
  assert.equal(h.api.chatProgress().lastChatBodyComplete, false);
  controller.enqueue(bytes.subarray(split));
  controller.close();
  await h.settle();
  assert.equal(chunks.map(row => row.text).join(''), sse);
  assert.ok(chunks.every(row => row.number === 4));
  assert.equal(await original.text(), sse);
  const count = chunks.length;
  unsubscribe(); stopBroken();
  await h.window.fetch('/api/inference/chat/next', { method: 'POST' });
  await h.settle();
  assert.equal(chunks.length, count);
});

test('only inference paths on Venice hosts are recorded; telemetry, auth and attestation never consume slots', async () => {
  let observing = false, nativePromise, calls = 0;
  const h = harness(() => {
    calls++;
    const response = new Response('synthetic', {headers: {'content-type': 'text/event-stream'}});
    if (!observing) response.clone = () => assert.fail('Excluded traffic must not be cloned');
    nativePromise = Promise.resolve(response);
    return nativePromise;
  });
  h.api.start();
  const excluded = [
    'https://t.venice.ai/events', 'https://clerk.venice.ai/v1/client/sessions/synthetic/tokens',
    'https://outerface.venice.ai/api/app/user/client_attestation/mint', '/api/app/user/client_attestation/mint',
    '/helper', '/api/other?next=/api/inference/chat/decoy', '/api/other#/api/inference/chat/decoy',
    'https://unrelated.example/api/inference/chat/foreign', 'https://venice.ai.evil.test/api/inference/chat/foreign',
    'http://venice.ai/api/inference/chat/insecure', 'https://t.venice.ai/api/inference/telemetry',
    'https://clerk.venice.ai/api/inference/auth'
  ];
  for (const url of excluded) {
    const result = h.window.fetch(url, {method: 'POST'});
    assert.equal(result, nativePromise);
    await result;
  }
  await h.settle();
  assert.equal(calls, excluded.length);
  assert.equal(h.api.status().requests, 0);
  assert.equal(h.api.status().limitReached, false);
  assert.equal(h.api.progress().lastNumber, 0);
  assert.equal(h.api.summary().length, 0);
  observing = true;
  await h.window.fetch('/api/inference/chat/synthetic', {method: 'POST'});
  await h.window.fetch(new h.window.URL('https://outerface.venice.ai/api/inference/synthetic'), {method: 'POST'});
  await h.settle();
  assert.deepEqual(Array.from(h.api.summary(), row => row.number), [1, 2]);
});

test('ring retains the latest 200 records with consecutive numbers and reports actual eviction, not capacity', async () => {
  let calls = 0;
  const h = harness(() => Promise.resolve(new Response(String(++calls))));
  assert.equal(h.api.status().limitReached, false);
  h.api.start();
  for (let number = 1; number <= 200; number++) {
    await h.window.fetch('/api/inference/synthetic', {method: 'POST'});
    assert.equal(h.api.progress().lastNumber, number);
  }
  await h.settle();
  assert.equal(h.api.status().requests, 200);
  assert.equal(h.api.status().limitReached, false);
  // An unretained GET must neither evict a record nor consume a sequence number.
  await h.window.fetch('/api/inference/not-sse');
  assert.equal(h.api.progress().lastNumber, 200);
  assert.equal(h.api.status().limitReached, false);
  for (let number = 201; number <= 205; number++) {
    await h.window.fetch('/api/inference/synthetic', {method: 'POST'});
    assert.equal(h.api.progress().requests, 200);
    assert.equal(h.api.progress().lastNumber, number);
    assert.equal(h.api.status().limitReached, true);
  }
  await h.settle();
  const summary = h.api.summary();
  assert.equal(summary.length, 200);
  const numbers = Array.from({length: 200}, (_, i) => i + 6);
  assert.deepEqual(Array.from(summary, row => row.number), numbers);
  assert.deepEqual(Object.keys(summary[0]), ['number', 'url', 'method', 'status', 'complete', 'text']);
  assert.equal(summary.at(-1).text, '206'); // The unrecorded GET still reached native fetch once.
  summary[0].number = -1;
  summary.pop();
  assert.equal(h.api.summary()[0].number, 6);
  assert.equal(h.api.summary().length, 200);
  await h.window.fetch('https://t.venice.ai/events', {method: 'POST'});
  assert.equal(h.api.status().limitReached, true); // Excluded traffic does not reset the last-insertion flag.
  assert.equal(h.api.stop().limitReached, true);
  const {capture} = await h.save();
  assert.equal(capture.limits.requests, 200);
  assert.equal(capture.limitReached, true);
  assert.deepEqual(capture.records.map(row => row.number), numbers);
  const fresh = h.api.start();
  assert.equal(fresh.limitReached, false);
  assert.equal(fresh.requests, 0);
  await h.window.fetch('/api/inference/synthetic', {method: 'POST'});
  await h.settle();
  assert.equal(h.api.progress().lastNumber, 1); // Sequence scope remains one start/stop recording session.
  h.api.stop();
});

test('chatProgress, summary and follow still report the latest chat after the ring is full', async () => {
  const raw = 'event: synthetic\ndata: {"text":"latest chat"}\n\n';
  const h = harness(url => Promise.resolve(new Response(String(url).includes('/chat/') ? raw : 'helper', {
    headers: {'content-type': String(url).includes('/chat/') ? 'text/event-stream' : 'application/json'}
  })));
  const chunks = [];
  const unsubscribe = h.api.follow((text, number) => chunks.push({text, number}));
  h.api.start();
  for (let i = 0; i < 200; i++) await h.window.fetch('/api/inference/helper', {method: 'POST'});
  await h.settle();
  const response = await h.window.fetch('/api/inference/chat/synthetic', {method: 'POST'});
  await h.settle();
  assert.equal(h.api.status().requests, 200);
  assert.equal(h.api.progress().lastNumber, 201);
  assert.deepEqual({...h.api.chatProgress()}, {lastChatNumber: 201, lastChatBodyComplete: true, lastChatStatus: 200});
  assert.equal(h.api.summary().at(-1).text, raw);
  assert.equal(chunks.map(row => row.text).join(''), raw);
  assert.ok(chunks.length > 0 && chunks.every(row => row.number === 201));
  assert.equal(await response.text(), raw);
  unsubscribe(); h.api.stop();
});

test('an evicted pending response cannot overwrite or reinsert into the latest ring records', async () => {
  let resolve, calls = 0;
  const pending = new Promise(done => { resolve = done; });
  const h = harness(() => ++calls === 1 ? pending : Promise.resolve(new Response(`record ${calls}`)));
  h.api.start();
  assert.equal(h.window.fetch('/api/inference/chat/pending', {method: 'POST'}), pending);
  for (let i = 0; i < 200; i++) await h.window.fetch('/api/inference/helper', {method: 'POST'});
  const original = new Response('late old response');
  resolve(original);
  await h.settle();
  const summary = h.api.summary();
  assert.equal(summary.length, 200);
  assert.equal(summary[0].number, 2);
  assert.equal(summary.at(-1).number, 201);
  assert.equal(summary.at(-1).text, 'record 201');
  assert.equal(h.api.progress().lastNumber, 201);
  assert.equal(await original.text(), 'late old response');
  h.api.stop();
});
