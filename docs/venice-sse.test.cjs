// Synthetic offline checks. No credentials, private fixture or browser connection required.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const sandbox = { fetch() { throw new Error('Network is forbidden in parser tests'); } };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../extension/venice-sse.js'), 'utf8'), sandbox);
const parse = sandbox.__cosVeniceSse.parse;
const event = (name, data) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;
const delta = (output_index, value) => event('response.output_text.delta', { output_index, delta: value });
const completed = event('response.completed', { response: { status: 'completed' } });

test('only index 1 becomes assistant text; index 0 remains separate reasoning', () => {
  const result = parse(delta(0, 'private reasoning') + delta(1, '青い') + delta(2, 'ignored') +
    delta(1, '伞') + event('response.output_text.done', { output_index: 1, text: 'must not duplicate' }) + completed);
  assert.deepEqual({ ...result }, {
    text: '青い伞', reasoning: 'private reasoning', ok: true,
    termination: 'response.completed', malformedJsonEvents: 0
  });
});

test('reads CRLF, comments, multiple data lines and a leading BOM', () => {
  const multiline = 'event: response.output_text.delta\ndata: {"output_index":1,\ndata: "delta":"A B"}\n\n';
  const result = parse(('\uFEFF: keepalive\n\n' + multiline + completed).replaceAll('\n', '\r\n'));
  assert.equal(result.text, 'A B');
  assert.equal(result.ok, true);
});

test('drops malformed JSON events and continues with the next frame', () => {
  const broken = 'event: response.output_text.delta\ndata: {broken-json\n\n';
  const result = parse(delta(1, 'before') + broken + delta(1, 'after') + completed);
  assert.equal(result.text, 'beforeafter');
  assert.equal(result.malformedJsonEvents, 1);
  assert.equal(result.ok, true);
});

test('[DONE] without response.completed stops parsing and is abnormal', () => {
  const result = parse(delta(1, 'partial') + 'data: [DONE]\n\n' + delta(1, 'must not appear') + completed);
  assert.equal(result.text, 'partial');
  assert.equal(result.ok, false);
  assert.equal(result.termination, 'done_without_completed');
});

test('response.completed is normal termination; later data cannot change the result', () => {
  const result = parse(delta(1, 'final') + completed + 'data: [DONE]\n\n' + delta(1, 'late'));
  assert.equal(result.text, 'final');
  assert.equal(result.ok, true);
  assert.equal(result.termination, 'response.completed');
});

test('EOF without completion preserves partial text but is abnormal', () => {
  const result = parse(delta(1, 'partial'));
  assert.equal(result.text, 'partial');
  assert.equal(result.ok, false);
  assert.equal(result.termination, 'eof');
});

test('an unterminated final frame cannot prove completion', () => {
  const result = parse(delta(1, 'partial') + completed.slice(0, -2));
  assert.equal(result.text, 'partial');
  assert.equal(result.ok, false);
  assert.equal(result.termination, 'eof');
});

for (const name of ['error', 'response.error', 'response.failed', 'response.incomplete', 'response.cancelled']) {
  test(`${name} is abnormal termination and prevents later text`, () => {
    const result = parse(delta(1, 'partial') + event(name, {}) + delta(1, 'late') + completed);
    assert.equal(result.text, 'partial');
    assert.equal(result.ok, false);
    assert.equal(result.termination, name);
  });
}

test('does not coerce string indices or non-string deltas into assistant text', () => {
  const result = parse(delta('1', 'wrong index') + delta(1, null) + delta(1, { nested: 'wrong type' }) +
    delta(1, 'valid') + completed);
  assert.equal(result.text, 'valid');
  assert.equal(result.reasoning, '');
});

test('accepts the unprefixed output_text.delta event name without changing index rules', () => {
  const result = parse(event('output_text.delta', { output_index: 1, delta: 'text' }) + completed);
  assert.equal(result.text, 'text');
  assert.equal(result.ok, true);
});

test('empty input is an abnormal EOF and non-string input is rejected', () => {
  assert.deepEqual({ ...parse('') }, { text: '', reasoning: '', ok: false, termination: 'eof', malformedJsonEvents: 0 });
  assert.throws(() => parse(null), /SSE input must be a string/);
});
