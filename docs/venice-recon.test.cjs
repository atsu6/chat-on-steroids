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
  const result = h.window.fetch('/unknown-send-route', init);
  assert.equal(result, nativePromise);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].args[0], '/unknown-send-route');
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
  await h.window.fetch('/unknown?session=synthetic-query-secret', {
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
  const request = new Request('https://venice.ai/unknown', { method: 'POST', body: 'original request text' });
  h.api.start();
  await h.window.fetch(request);
  await h.window.fetch('/unknown', { method: 'POST', body: new Blob(['synthetic blob']) });
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
  await h.window.fetch('/unknown', { method: 'POST' });
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
  await h.window.fetch('/not-a-stream');
  await h.window.fetch('https://unrelated.example/unknown', { method: 'POST' });
  await h.window.fetch('https://api.venice.ai/unknown-sse');
  await h.settle();
  const { capture } = await h.save();
  assert.equal(capture.records.length, 1);
  assert.equal(capture.records[0].request.method, 'GET');
  assert.equal(capture.records[0].request.url, 'https://api.venice.ai/unknown-sse');
  assert.deepEqual(capture.records[0].request.headers, {});
});

test('body and request limits bound observation without truncating the native response', async () => {
  const large = 'x'.repeat(1024 * 1024 + 37);
  let calls = 0;
  const h = harness(() => { calls++; return Promise.resolve(new Response(large)); });
  h.api.start();
  const response = await h.window.fetch('/unknown', { method: 'POST' });
  for (let i = 0; i < 9; i++) await h.window.fetch('/unknown', { method: 'POST' });
  await h.settle();
  const { capture } = await h.save();
  assert.equal(calls, 10);
  assert.equal(capture.records.length, 8);
  assert.equal(capture.limitReached, true);
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
  await h.window.fetch('/unknown', { method: 'POST' });
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
  h.window.fetch('/old', { method: 'POST' });
  h.api.stop(); h.api.start();
  resolve(new Response('old response'));
  const result = h.window.fetch('/new', { method: 'POST' });
  assert.equal(result, rejected);
  await assert.rejects(result, /synthetic network failure/);
  await h.settle();
  const { capture } = await h.save();
  assert.equal(calls, 2);
  assert.equal(capture.records.length, 1);
  assert.equal(capture.records[0].request.url, 'https://venice.ai/new');
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
  assert.equal(venice.length, 1);
  assert.equal(venice[0].world, 'MAIN');
  assert.equal(venice[0].run_at, 'document_start');
  assert.deepEqual(venice[0].js, ['venice-recon.js', 'usage.js']);
  const chatgpt = manifest.content_scripts.filter(entry => entry.matches.includes('https://chatgpt.com/*'));
  assert.deepEqual(chatgpt, [
    { matches: ['https://chatgpt.com/*', 'https://chat.openai.com/*'],
      js: ['i18n.js', 'chatgpt-dom.js', 'app-palette.js', 'content.js'], css: ['overlay.css'], run_at: 'document_idle' },
    { matches: ['https://chatgpt.com/*', 'https://chat.openai.com/*'], js: ['fiber.js'], world: 'MAIN', run_at: 'document_idle' },
    { matches: ['https://chatgpt.com/*', 'https://chat.openai.com/*'], js: ['usage.js'], world: 'MAIN', run_at: 'document_start' }
  ]);
});
