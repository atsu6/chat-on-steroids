// Entirely synthetic DOM, responses and clock. Never connects to Venice or loads private fixtures.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const root = path.resolve(__dirname, '..');
const chat = '/api/inference/chat/agents/venice';
const event = (name, data) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;
const delta = (index, text) => event('response.output_text.delta', { output_index: index, delta: text });
const completed = event('response.completed', {});
const sse = text => new Response(delta(0, 'reasoning stays separate') + delta(1, text) + completed,
  { headers: { 'content-type': 'text/event-stream' } });
const tick = () => new Promise(resolve => setImmediate(resolve));

function harness(t, response = () => sse('合成の回答')) {
  const dom = new JSDOM('<textarea aria-label="チャットメッセージ入力"></textarea>', {
    url: 'https://venice.ai/chat/agent', runScripts: 'outside-only'
  });
  const w = dom.window;
  t.after(() => { w.__cosVeniceRecon.stop(); dom.window.close(); });
  const calls = [], timers = new Map(), events = [];
  let now = 0, timerId = 0;
  w.Date = class extends Date { static now() { return now; } };
  w.setTimeout = (cb, ms) => { timers.set(++timerId, { cb, at: now + ms }); return timerId; };
  Object.assign(w, { Request, Response, Headers, TextEncoder, TextDecoder, structuredClone });
  w.fetch = (url, init) => {
    calls.push({ url, init });
    return Promise.resolve(response(url, init, calls.length));
  };
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'extension/manifest.json'), 'utf8'));
  for (const file of manifest.content_scripts.find(row => row.matches.includes('https://venice.ai/*')).js) {
    w.eval(fs.readFileSync(path.join(root, 'extension', file), 'utf8'));
  }
  const textarea = w.document.querySelector('textarea');
  for (const type of ['input', 'keydown', 'keypress', 'keyup']) {
    w.document.addEventListener(type, e => events.push({
      type: e.type, key: e.key, code: e.code, bubbles: e.bubbles, value: e.target.value
    }));
  }
  let followed = 0;
  const recon = w.__cosVeniceRecon;
  w.__cosVeniceRecon = { ...recon, follow(cb) {
    followed++;
    const unsub = recon.follow(cb);
    return () => { followed--; unsub(); };
  } };
  return {
    w, api: w.__cosVeniceSend, recon, textarea, calls, events, timers,
    get followed() { return followed; },
    get now() { return now; },
    submit() {
      textarea.addEventListener('keydown', e => {
        if (e.key === 'Enter') void w.fetch(chat, { method: 'POST', body: textarea.value });
      });
    },
    async settle() {
      for (let i = 0; i < 100; i++) {
        await tick();
        if (recon.status().readingBodies === 0) return;
      }
      assert.fail('Synthetic response reader did not settle');
    },
    async advance(ms) {
      const target = now + ms;
      for (;;) {
        const next = [...timers].sort((a, b) => a[1].at - b[1].at)[0];
        if (!next || next[1].at > target) break;
        now = next[1].at;
        timers.delete(next[0]);
        next[1].cb();
        await tick();
      }
      now = target;
    }
  };
}

test('native TEXTAREA setter and bubbling input/Enter events drive one synthetic turn', async t => {
  const h = harness(t);
  assert.equal(h.calls.length, 0);
  assert.equal(h.recon.status().recording, false);
  Object.defineProperty(h.textarea, 'value', {
    get() { return Object.getOwnPropertyDescriptor(h.w.HTMLTextAreaElement.prototype, 'value').get.call(this); },
    set() { assert.fail('Must use the native prototype setter rather than the instance setter'); }
  });
  h.submit();
  let resolved = false;
  const result = h.api.sendViaUi('こんにちは\n二行目').then(text => { resolved = true; return text; });
  assert.equal(h.recon.status().recording, true);
  assert.equal(h.textarea.value, 'こんにちは\n二行目');
  assert.deepEqual(h.events.map(e => e.type), ['input', 'keydown', 'keypress', 'keyup']);
  assert.ok(h.events.every(e => e.bubbles && e.value === h.textarea.value));
  assert.ok(h.events.slice(1).every(e => e.key === 'Enter' && e.code === 'Enter'));
  await h.settle();
  await h.advance(499);
  assert.equal(resolved, false);
  await h.advance(1);
  assert.equal(await result, '合成の回答');
  assert.equal(h.calls.length, 1);
  assert.equal(h.followed, 0);
  assert.equal(h.timers.size, 0);
});

test('baseline excludes a previous chat; helper completion cannot finish an open chat body', async t => {
  let controller;
  const open = new Response(new ReadableStream({ start(c) { controller = c; } }),
    { headers: { 'content-type': 'text/event-stream' } });
  const h = harness(t, (_url, _init, n) => n === 1 ? sse('old text') : n === 2 ? open : new Response('helper', { status: 429 }));
  h.recon.start();
  await h.w.fetch(chat, { method: 'POST' });
  await h.settle();
  h.submit();
  let resolved = false;
  const result = h.api.sendViaUi('new text').then(text => { resolved = true; return text; });
  await h.w.fetch('/helper', { method: 'POST' });
  await tick();
  await h.advance(500);
  assert.equal(resolved, false);
  assert.equal(h.recon.progress().lastStatus, 429);
  assert.equal(h.recon.chatProgress().lastChatNumber, 2);
  controller.enqueue(new TextEncoder().encode(delta(1, 'new answer') + completed));
  controller.close();
  await h.settle();
  await h.advance(500);
  assert.equal(await result, 'new answer');
  assert.equal(h.followed, 0);
});

for (const pending of [false, true]) {
  test(`90-second timeout includes baseline and final chatProgress (${pending ? 'incomplete new response' : 'no new chat'})`, async t => {
    let controller;
    const open = new Response(new ReadableStream({ start(c) { controller = c; } }),
      { headers: { 'content-type': 'text/event-stream' } });
    const h = harness(t, (_url, _init, n) => n === 1 ? sse('old text') : open);
    h.recon.start();
    await h.w.fetch(chat, { method: 'POST' });
    await h.settle();
    if (pending) h.submit();
    let rejected = false;
    const checked = assert.rejects(h.api.sendViaUi('timeout test'), error => {
      rejected = true;
      assert.match(error.message, /90秒.*baseline=1.*chatProgress=/);
      assert.equal(error.baseline, 1);
      assert.deepEqual({ ...error.chatProgress }, {
        lastChatNumber: pending ? 2 : 1, lastChatBodyComplete: !pending, lastChatStatus: 200
      });
      return true;
    });
    await h.advance(89_500);
    assert.equal(rejected, false);
    await h.advance(500);
    await checked;
    assert.equal(h.now, 90_000);
    assert.equal(h.calls.length, pending ? 2 : 1); // No retries and no sendTurn fallback.
    assert.equal(h.followed, 0);
    assert.equal(h.timers.size, 0);
    controller.close();
    await h.settle();
  });
}

test('unterminated SSE rejects instead of returning partial text; a later call can succeed', async t => {
  const h = harness(t, (_url, _init, n) => n === 1 ? new Response(delta(1, 'partial') + 'data: [DONE]\n\n', {
    headers: { 'content-type': 'text/event-stream' }
  }) : sse('recovered'));
  h.submit();
  const rejected = assert.rejects(h.api.sendViaUi('first'), /termination=done_without_completed/);
  await h.settle(); await h.advance(500); await rejected;
  assert.equal(h.followed, 0);
  const result = h.api.sendViaUi('second');
  await h.settle(); await h.advance(500);
  assert.equal(await result, 'recovered');
  assert.equal(h.calls.length, 2);
});

test('invalid input, missing TEXTAREA and overlapping calls do not trigger additional input', async t => {
  const h = harness(t);
  await assert.rejects(h.api.sendViaUi(null), /text must be a non-empty string/);
  await assert.rejects(h.api.sendViaUi(' '), /text must be a non-empty string/);
  h.textarea.remove();
  await assert.rejects(h.api.sendViaUi('missing'), /TEXTAREA/);
  assert.equal(h.recon.status().recording, false);
  h.w.document.body.appendChild(h.textarea);
  h.submit();
  const first = h.api.sendViaUi('first');
  await assert.rejects(h.api.sendViaUi('overlap'), /既に実行中/);
  await h.settle(); await h.advance(500);
  assert.equal(await first, '合成の回答');
  assert.equal(h.calls.length, 1);
  assert.equal(h.events.length, 4);
});

for (const status of [401, 403]) {
  test(`non-SSE HTTP ${status} rejects without retrying or calling the legacy sender`, async t => {
    const h = harness(t, () => new Response('{"error":"synthetic access rejection"}', {
      status, headers: { 'content-type': 'application/json' }
    }));
    h.submit();
    const checked = assert.rejects(h.api.sendViaUi('test'), new RegExp(`status=${status}, termination=eof`));
    await h.settle(); await h.advance(500); await checked;
    assert.equal(h.calls.length, 1);
    assert.equal(h.followed, 0);
    assert.equal(h.timers.size, 0);
  });
}
