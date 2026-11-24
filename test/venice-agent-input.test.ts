import { createRequire } from 'node:module';
import { afterEach, expect, it } from 'vitest';
const require = createRequire(import.meta.url);
const { agentHarness } = require('./venice-bridge-harness.cjs');
const cleanups: Array<() => void> = [];
const scope = { after: (close: () => void) => cleanups.push(close) };
afterEach(() => { for (const close of cleanups.splice(0)) close(); });
const done = { action: 'done', summary: 'Synthetic complete' };

it('removes NUL from instructions and nested tool-result strings before serialization without changing the original data', () => {
  const h = agentHarness(scope);
  const previous = { ok: true, result: { stdout: 'one\0two', stderr: '\0error\0', values: ['a\0b', 3, false, null], literal: '\\u0000' } };
  const turn = h.api.buildTurn('instruction\0tail', previous);
  expect(turn).toContain('指示: instruction tail'); expect(turn).not.toContain('\0');
  expect(JSON.parse(turn.split('前のツール結果: ')[1])).toEqual({ ok: true,
    result: { stdout: 'one two', stderr: ' error ', values: ['a b', 3, false, null], literal: '\\u0000' } });
  expect(previous.result.stdout).toBe('one\0two'); expect(previous.result.values[0]).toBe('a\0b');
  expect(h.prompts).toHaveLength(0);
});

it('sends cleaned tool output through the existing injected transport', async () => {
  const h = agentHarness(scope, { replies: [done] });
  await h.api.runTurn('safe\0instruction', { ok: true, result: 'tool\0output' });
  expect(h.prompts).toHaveLength(1); expect(h.prompts[0]).toContain('safe instruction');
  expect(h.prompts[0]).toContain('"result":"tool output"'); expect(h.prompts[0]).not.toContain('\\u0000');
});

it.each(['I will inspect the files next.', '{"action":"plan","summary":"First inspect the files"}'])('retries one plan-only reply once before executing a valid action: %s', async plan => {
  const h = agentHarness(scope, { replies: [plan, { action: 'tool', name: 'now', args: {} }, done] });
  const result = await h.api.runTask('synthetic task');
  expect(result.steps.map((step: {name: string}) => step.name)).toEqual(['now', 'done']);
  expect(h.prompts).toHaveLength(3); expect(h.prompts[1]).toContain('今すぐ実行してください');
  expect(h.prompts.filter((prompt: string) => prompt.includes('今すぐ実行してください'))).toHaveLength(1);
});

it('stops after two consecutive plan-only replies, without executing a tool or starting a third turn', async () => {
  const h = agentHarness(scope, { replies: ['I will inspect next.', 'I will start soon.'] });
  await expect(h.api.runTask('synthetic task')).rejects.toThrow('JSON として解析');
  expect(h.prompts).toHaveLength(2); expect(h.prompts[1]).toContain('今すぐ実行してください');
  expect(h.calls).toHaveLength(0);
});

it('keeps the last tool result in the retry, including its NUL-cleaned text', async () => {
  const h = agentHarness(scope, { replies: ['I plan to continue.', done] });
  await h.api.runTurn('same task', { ok: true, result: 'retained\0evidence' });
  for (const prompt of h.prompts) expect(prompt).toContain('"result":"retained evidence"');
  expect(h.prompts[1]).toContain('JSONのみで再出力してください。');
});

it('does not retry a transport error or a valid done response', async () => {
  const h = agentHarness(scope, { replies: [new Error('Synthetic transport refused'), done] });
  await expect(h.api.runTask('synthetic task')).rejects.toThrow('Synthetic transport refused');
  expect(h.prompts).toHaveLength(1);
  expect((await h.api.runTask('synthetic next task')).summary).toBe('Synthetic complete'); expect(h.prompts).toHaveLength(2);
});
