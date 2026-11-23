// Local evidence check. Requires the user-provided capture, which remains Git-ignored.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('real capture #2 produces exactly 青い伞 without mixing in reasoning', t => {
  const root = path.resolve(__dirname, '..');
  const file = path.join(root, 'fixtures/venice-capture-2026-11-23T13-15-07-891Z.json');
  const capture = JSON.parse(fs.readFileSync(file, 'utf8'));
  const record = capture.records.find(row => row.number === 2);
  assert.equal(record.response.body.complete, true);
  const sandbox = { fetch() { throw new Error('Network is forbidden in fixture checks'); } };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'extension/venice-sse.js'), 'utf8'), sandbox);
  const result = sandbox.__cosVeniceSse.parse(record.response.body.text);
  assert.equal(result.text, '青い伞');
  assert.equal(result.reasoning.length, 315);
  assert.ok(result.reasoning.startsWith('The user says:'));
  assert.equal(result.ok, true);
  assert.equal(result.termination, 'response.completed');
  assert.equal(result.malformedJsonEvents, 0);
  t.diagnostic(`number=2; text=${result.text}; reasoningChars=${result.reasoning.length}; termination=${result.termination}`);
});
