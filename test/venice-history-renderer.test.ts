import { expect, it, vi } from 'vitest';
import { boot, closeDom, settle, text, toolCall, T0, type SessionEvent } from './renderer-timeline.harness.js';
vi.mock('../src/renderer/workspace-terminal.js', () => ({ createWorkspaceTerminal: () => ({
  update: vi.fn(), show: vi.fn(), hide: vi.fn(), hasTabs: () => false,
  tabs: () => [], newTab: () => null, selectTab: vi.fn(), closeTab: vi.fn()
}) }));
vi.mock('../src/renderer/pet.js', () => ({ initPet: () => Object.assign(() => {}, { toggle: () => {}, isVisible: () => false }) }));
const note = (seq: number, runId: string, phase: NonNullable<Extract<SessionEvent, { kind: 'note' }>['venice']>['phase'], value: string): SessionEvent => ({
  seq, time: T0 + seq * 1000, source: 'app', kind: 'note', message: text(value), venice: { runId, phase }
});
it('shows instructions, page reports and actual Core records separately, without replay controls', async () => {
  const call = toolCall(3, 'canonical-read') as Extract<SessionEvent, { kind: 'tool_call' }>;
  call.call.venice = { runId: 'run-a', callId: 'wire-call' };
  call.call.attribution = 'host_admitted';
  const step = note(2, 'run-a', 'step', '<img src=x>\nheading') as Extract<SessionEvent, { kind: 'note' }>;
  step.venice!.step = { index: 1, name: 'query', ok: true }; step.venice!.args = text('{"selector":"h1"}');
  const events = [note(1, 'run-a', 'started', 'Inspect the heading'), step, call,
    note(4, 'run-a', 'completed', 'Finished'), note(5, 'run-b', 'started', 'A different task'), note(6, 'run-b', 'stopped', '')];
  const { w } = await boot(events);
  const rows = w.document.querySelectorAll('#timeline [data-venice-run]'); expect(rows).toHaveLength(5);
  expect(rows[0]!.textContent).toContain('Inspect the heading');
  expect(rows[1]!.textContent).toContain('Reported by the Venice page');
  expect(rows[1]!.textContent).toContain('<img src=x>\nheading'); expect(rows[1]!.querySelector('img')).toBeNull();
  expect(rows[1]!.querySelector('button')).toBeNull();
  (w.document.querySelector('.ev-tool_call summary') as HTMLElement).click(); await settle();
  expect(w.document.querySelector('.ev-tool_call')!.textContent).toContain('app-approved run');
  expect(w.document.querySelector('.ev-tool_call')!.textContent).toContain('Venice run run-a');
  closeDom(); vi.resetModules(); const restored = await boot(events);
  expect(restored.w.document.querySelectorAll('#timeline [data-venice-run]')).toHaveLength(5);
  expect(restored.live.inputs).toHaveLength(0);
});
it('localizes lifecycle labels in ja/en while preserving authored text and required direct catalog keys', async () => {
  const { w } = await boot([note(1, 'run-a', 'started', 'Keep authored text'), note(2, 'run-a', 'interrupted', '')]);
  const { setLanguage } = await import('../src/renderer/i18n.js');
  setLanguage('ja'); expect(w.document.querySelector('#timeline')!.textContent).toContain('Veniceタスク開始');
  expect(w.document.querySelector('#timeline')!.textContent).toContain('アプリ再起動によりVeniceタスクが中断');
  expect(w.document.querySelector('#timeline')!.textContent).toContain('Keep authored text');
  setLanguage('en'); expect(w.document.querySelector('#timeline')!.textContent).toContain('Venice task started');
  const { readFileSync } = await import('node:fs');
  for (const locale of ['ja', 'en']) {
    const catalog = JSON.parse(readFileSync(`src/renderer/locales/${locale}.json`, 'utf8'));
    for (const key of ['Venice task started', 'Venice task completed', 'Venice task failed', 'Venice task stopped', 'Venice task interrupted by app restart', 'Venice step {0}: {1}', 'Venice run {0}', 'Reported by the Venice page', 'Page report truncated at 64,000 characters.']) expect(catalog[key]).toBeTruthy();
  }
});

it('does not call a completed or interrupted local Venice task Working because of a recent tool', async () => {
  const events = [note(1, 'run-a', 'started', 'Inspect'), note(2, 'run-a', 'interrupted', '')];
  const { w } = await boot(events, true, [], [], { summary: { conversationId: null, veniceRuns: [], lastToolCallAt: Date.now() } });
  expect(w.document.querySelector('#timeline')!.textContent).not.toContain('Working…');
  expect(w.document.querySelector('#timeline .turn-live')).toBeNull();
});
