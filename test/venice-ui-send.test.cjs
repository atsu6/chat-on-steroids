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
const RENDER_WAIT = 82; // Two synthetic 16ms frames + 50ms.
const ENTER_WAIT = RENDER_WAIT + 3_000;

function harness(t, response = () => sse('合成の回答')) {
  const dom = new JSDOM('<form><textarea aria-label="チャットメッセージ入力"></textarea></form>', {
    url: 'https://venice.ai/chat/agent', runScripts: 'outside-only'
  });
  const w = dom.window;
  t.after(() => { w.__cosVeniceRecon.stop(); dom.window.close(); });
  const calls = [], timers = new Map(), events = [];
  let now = 0, timerId = 0;
  w.Date = class extends Date { static now() { return now; } };
  w.setTimeout = (cb, ms) => { timers.set(++timerId, { cb, at: now + ms }); return timerId; };
  w.requestAnimationFrame = cb => w.setTimeout(() => cb(now), 16);
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
      type: e.type, key: e.key, code: e.code, bubbles: e.bubbles, value: e.target.value,
      composed: e.composed, isComposing: e.isComposing, at: now
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
    w, api: w.__cosVeniceSend, recon, textarea, form: textarea.closest('form'), calls, events, timers,
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
  assert.deepEqual(h.events.map(e => e.type), ['input']);
  await h.advance(81);
  assert.equal(h.calls.length, 0);
  await h.advance(1);
  assert.deepEqual(h.events.map(e => e.type), ['input']);
  await h.advance(2_999);
  assert.equal(h.calls.length, 0);
  await h.advance(1);
  assert.deepEqual(h.events.map(e => e.type), ['input', 'keydown', 'keypress', 'keyup']);
  assert.ok(h.events.every(e => e.bubbles && e.value === h.textarea.value));
  assert.ok(h.events.slice(1).every(e => e.key === 'Enter' && e.code === 'Enter' && e.composed && !e.isComposing));
  assert.ok(h.events.slice(1).every(e => e.at === ENTER_WAIT));
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
  await h.advance(ENTER_WAIT);
  await h.w.fetch('/api/inference/helper', { method: 'POST' });
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
      assert.equal(error.textareaLength, 'timeout test'.length);
      assert.equal(error.buttonFound, false);
      assert.equal(error.buttonDisabled, null);
      assert.match(error.message, /textarea.value.length=12, buttonFound=false, buttonDisabled=null/);
      assert.deepEqual({ ...error.chatProgress }, {
        lastChatNumber: pending ? 2 : 1, lastChatBodyComplete: !pending, lastChatStatus: 200
      });
      return true;
    });
    await h.advance(ENTER_WAIT);
    await h.advance(89_500);
    assert.equal(rejected, false);
    await h.advance(500);
    await checked;
    assert.equal(h.now, 90_000 + ENTER_WAIT);
    assert.equal(h.events.filter(e => e.type === 'keydown').length, pending ? 1 : 2);
    assert.equal(h.calls.length, pending ? 2 : 1); // No extra request once a new chat exists; no sendTurn fallback.
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
  await h.advance(ENTER_WAIT); await h.settle(); await h.advance(500); await rejected;
  assert.equal(h.followed, 0);
  const result = h.api.sendViaUi('second');
  await h.advance(ENTER_WAIT); await h.settle(); await h.advance(500);
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
  h.form.appendChild(h.textarea);
  h.submit();
  const first = h.api.sendViaUi('first');
  await assert.rejects(h.api.sendViaUi('overlap'), /既に実行中/);
  await h.advance(ENTER_WAIT); await h.settle(); await h.advance(500);
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
    await h.advance(ENTER_WAIT); await h.settle(); await h.advance(500); await checked;
    assert.equal(h.calls.length, 1);
    assert.equal(h.followed, 0);
    assert.equal(h.timers.size, 0);
  });
}

function addSendButton(h, disabled = false) {
  const button = h.w.document.createElement('button');
  button.type = 'button';
  button.setAttribute('aria-label', 'メッセージを送信');
  button.disabled = disabled;
  h.form.appendChild(button);
  return button;
}

function submitOnClick(h, button, clicks) {
  button.addEventListener('click', () => {
    clicks.push(h.now);
    void h.w.fetch(chat, {method: 'POST', body: h.textarea.value});
  });
}

test('polls every 100ms for the send button appearing 300ms after input', async t => {
  const h = harness(t), clicks = [];
  const text = '長い複数行の指示\n次の行も保つ\n'.repeat(400);
  h.textarea.addEventListener('input', () => h.w.setTimeout(() => {
    submitOnClick(h, addSendButton(h), clicks);
  }, 300));
  h.submit(); // A premature Enter would be observable as an extra synthetic request.
  const result = h.api.sendViaUi(text);
  await h.advance(RENDER_WAIT);
  assert.equal(h.textarea.value, text);
  assert.equal(h.w.document.querySelector('form [aria-label="メッセージを送信"]'), null);
  await h.advance(299); // 381ms: polls at 82, 182 and 282 have not seen it yet.
  assert.equal(h.calls.length, 0);
  await h.advance(1);
  assert.deepEqual(clicks, [382]);
  assert.equal(h.calls[0].init.body, text);
  assert.deepEqual(h.events.map(e => e.type), ['input']);
  await h.settle(); await h.advance(500);
  assert.equal(await result, '合成の回答');
  assert.equal(h.calls.length, 1);
  assert.equal(h.followed, 0);
});

test('does not press a disabled button and clicks it when it becomes enabled', async t => {
  const h = harness(t), clicks = [];
  const button = addSendButton(h, true);
  submitOnClick(h, button, clicks);
  h.w.setTimeout(() => { button.disabled = false; }, 450);
  h.submit();
  const result = h.api.sendViaUi('wait for enabled button');
  await h.advance(481);
  assert.equal(h.calls.length, 0);
  assert.deepEqual(clicks, []);
  assert.deepEqual(h.events.map(e => e.type), ['input']);
  await h.advance(1);
  assert.deepEqual(clicks, [482]);
  await h.settle(); await h.advance(500);
  assert.equal(await result, '合成の回答');
  assert.equal(h.calls.length, 1);
});

test('a permanently disabled button waits the full 3000ms before Enter fallback', async t => {
  const h = harness(t);
  const button = addSendButton(h, true);
  button.click = () => assert.fail('Disabled button must not be clicked');
  h.submit();
  const result = h.api.sendViaUi('disabled button');
  await h.advance(ENTER_WAIT - 1);
  assert.equal(h.calls.length, 0);
  await h.advance(1);
  const keys = h.events.filter(e => e.type !== 'input');
  assert.deepEqual(keys.map(e => e.type), ['keydown', 'keypress', 'keyup']);
  assert.ok(keys.every(e => e.at === ENTER_WAIT && e.composed && e.isComposing === false));
  await h.settle(); await h.advance(500);
  assert.equal(await result, '合成の回答');
});

test('ignores textarea and send-button decoys outside forms and unrelated submit buttons', async t => {
  const h = harness(t);
  const outsideTextarea = h.w.document.createElement('textarea');
  outsideTextarea.setAttribute('aria-label', 'チャットメッセージ入力');
  h.w.document.body.prepend(outsideTextarea);
  const outsideButton = h.w.document.createElement('button');
  outsideButton.setAttribute('aria-label', 'メッセージを送信');
  outsideButton.click = () => assert.fail('Outside-form button must not be clicked');
  h.w.document.body.prepend(outsideButton);
  const unrelated = h.w.document.createElement('button');
  unrelated.type = 'submit';
  unrelated.click = () => assert.fail('Generic submit selector must no longer be used');
  h.form.appendChild(unrelated);
  h.submit();
  const result = h.api.sendViaUi('correct form');
  await h.advance(ENTER_WAIT);
  assert.equal(outsideTextarea.value, '');
  assert.equal(h.textarea.value, 'correct form');
  assert.equal(h.events.find(e => e.type === 'keydown').at, ENTER_WAIT);
  await h.settle(); await h.advance(500);
  assert.equal(await result, '合成の回答');
});

test('refuses an otherwise matching textarea when it is outside a form', async t => {
  const h = harness(t);
  h.w.document.body.appendChild(h.textarea);
  await assert.rejects(h.api.sendViaUi('outside form'), /TEXTAREA/);
  assert.equal(h.textarea.value, '');
  assert.equal(h.recon.status().recording, false);
  assert.equal(h.calls.length, 0);
});

for (const afterDeadline of [false, true]) {
  test(`button appearing ${afterDeadline ? 'after' : 'at'} the 3000ms limit ${afterDeadline ? 'does not replace Enter fallback' : 'is clicked'}`, async t => {
    const h = harness(t), clicks = [];
    h.w.setTimeout(() => submitOnClick(h, addSendButton(h), clicks), ENTER_WAIT + Number(afterDeadline));
    h.submit();
    const result = h.api.sendViaUi('deadline boundary');
    await h.advance(ENTER_WAIT + Number(afterDeadline));
    assert.deepEqual(clicks, afterDeadline ? [] : [ENTER_WAIT]);
    assert.equal(h.events.filter(e => e.type === 'keydown').length, afterDeadline ? 1 : 0);
    await h.settle(); await h.advance(500);
    assert.equal(await result, '合成の回答');
    assert.equal(h.calls.length, 1);
  });
}

test('empty textarea after render wait stops before polling/sending and releases the sending gate', async t => {
  const h = harness(t);
  const clear = () => { h.w.setTimeout(() => { h.textarea.value = ''; }, 20); };
  h.textarea.addEventListener('input', clear);
  const stopped = assert.rejects(h.api.sendViaUi('cleared during render'), /待機後の TEXTAREA が空/);
  await h.advance(RENDER_WAIT); await stopped;
  assert.equal(h.calls.length, 0);
  assert.deepEqual(h.events.map(e => e.type), ['input']);
  assert.equal(h.followed, 0);
  assert.equal(h.timers.size, 0);
  h.textarea.removeEventListener('input', clear);
  h.submit();
  const recovery = h.api.sendViaUi('recovery');
  await h.advance(ENTER_WAIT); await h.settle(); await h.advance(500);
  assert.equal(await recovery, '合成の回答');
});

test('no-button fallback gets exactly one Enter nudge after 2 seconds without a new record', async t => {
  const h = harness(t);
  let keydowns = 0;
  h.textarea.addEventListener('keydown', () => {
    if (++keydowns === 2) void h.w.fetch(chat, {method: 'POST', body: h.textarea.value});
  });
  const result = h.api.sendViaUi('fallback nudge recovery');
  await h.advance(ENTER_WAIT + 1_999);
  assert.equal(keydowns, 1);
  await h.advance(1);
  assert.equal(keydowns, 2);
  assert.deepEqual(h.events.filter(e => e.type === 'keydown').map(e => e.at), [ENTER_WAIT, ENTER_WAIT + 2_000]);
  await h.settle(); await h.advance(500);
  assert.equal(await result, '合成の回答');
  await h.advance(5_000);
  assert.equal(keydowns, 2);
  assert.equal(h.calls.length, 1);
});

test('preserves the one-shot nudge if a button click produces no chat record', async t => {
  const h = harness(t);
  const button = addSendButton(h);
  let clicks = 0;
  button.addEventListener('click', () => clicks++);
  h.submit();
  const result = h.api.sendViaUi('button nudge recovery');
  await h.advance(RENDER_WAIT + 1_999);
  assert.equal(clicks, 1);
  assert.equal(h.events.filter(e => e.type === 'keydown').length, 0);
  await h.advance(1);
  await h.settle(); await h.advance(500);
  assert.equal(await result, '合成の回答');
  await h.advance(5_000);
  assert.equal(clicks, 1);
  assert.equal(h.events.filter(e => e.type === 'keydown').length, 1);
});

for (const disabled of [false, true]) {
  test(`silent ${disabled ? 'disabled' : 'enabled'} button nudges only once and timeout includes current diagnostics`, async t => {
    const h = harness(t);
    const button = addSendButton(h, disabled);
    let clicks = 0;
    button.addEventListener('click', () => clicks++);
    const finalText = 'synthetic private text';
    const checked = assert.rejects(h.api.sendViaUi('initial text'), error => {
      assert.equal(error.textareaLength, finalText.length);
      assert.equal(error.buttonFound, true);
      assert.equal(error.buttonDisabled, !disabled);
      assert.match(error.message, /textarea.value.length=22, buttonFound=true/);
      assert.ok(error.message.includes(`buttonDisabled=${!disabled}`));
      assert.ok(!error.message.includes(finalText));
      return true;
    });
    const preparation = disabled ? ENTER_WAIT : RENDER_WAIT;
    await h.advance(preparation + 5_000);
    button.disabled = !disabled;
    h.textarea.value = finalText;
    await h.advance(85_000); await checked;
    assert.equal(clicks, disabled ? 0 : 1);
    const keydowns = h.events.filter(e => e.type === 'keydown');
    assert.equal(keydowns.length, disabled ? 2 : 1);
    assert.equal(keydowns[keydowns.length - 1].at, preparation + 2_000);
    assert.equal(h.calls.length, 0);
    assert.equal(h.followed, 0);
    assert.equal(h.timers.size, 0);
  });
}

test('sendViaUi observes a new chat when the recorder already contains 200 records', async t => {
  const h = harness(t);
  h.recon.start();
  for (let i = 0; i < 200; i++) await h.w.fetch(chat, {method: 'POST'});
  await h.settle();
  assert.equal(h.recon.chatProgress().lastChatNumber, 200);
  assert.equal(h.recon.status().limitReached, false);
  h.submit();
  const result = h.api.sendViaUi('next turn after 200 records');
  await h.advance(ENTER_WAIT); await h.settle(); await h.advance(500);
  assert.equal(await result, '合成の回答');
  assert.equal(h.recon.chatProgress().lastChatNumber, 201);
  assert.equal(h.recon.status().requests, 200);
  assert.equal(h.recon.status().limitReached, true);
  assert.equal(h.calls.length, 201);
  assert.equal(h.followed, 0);
});
