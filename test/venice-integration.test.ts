import { isDeepStrictEqual } from 'node:util';
import { expect, it, vi } from 'vitest';
import * as wire from '../src/shared/venice-integration.js';
import type {
  VeniceRunGrant, VeniceToolCallRequest, VeniceToolCallResponse
} from '../src/shared/venice-integration.js';

// Executable specification only: no gateway, network, filesystem or real tool is used.
// Sender/session authentication is assumed at this model's boundary, not implemented here.
// All state, persistence acknowledgements and execution are synthetic and test-local.
function contractModel(
  grant: VeniceRunGrant,
  persist: (response: VeniceToolCallResponse) => Promise<void>,
  execute: (request: VeniceToolCallRequest) => Promise<unknown>
) {
  let active = true;
  const calls = new Map<string, { request: VeniceToolCallRequest; reply: Promise<VeniceToolCallResponse> }>();
  const refused = (callId: string, error: string): VeniceToolCallResponse => ({ callId, state: 'unknown', error });
  return {
    revoke() { active = false; },
    submit(input: VeniceToolCallRequest): Promise<VeniceToolCallResponse> {
      const request = structuredClone(input);
      const { callId } = request;
      if (request.runId !== grant.runId) return Promise.resolve(refused(callId, 'RUN_NOT_AUTHORIZED'));
      const previous = calls.get(callId);
      if (previous) {
        return isDeepStrictEqual(previous.request, request)
          ? previous.reply
          : Promise.resolve(refused(callId, 'CALL_ID_CONFLICT'));
      }
      if (!active) return Promise.resolve(refused(callId, 'RUN_REVOKED'));
      // Defer async work so the reservation below owns callId before any await.
      const reply = Promise.resolve().then(async (): Promise<VeniceToolCallResponse> => {
        try { await persist({ callId, state: 'pending' }); }
        catch { return refused(callId, 'ACCEPTANCE_NOT_DURABLE'); }
        let completed: VeniceToolCallResponse;
        if (!active) completed = { callId, state: 'completed', error: 'RUN_REVOKED' };
        else {
          try { completed = { callId, state: 'completed', result: await execute(request) }; }
          catch { completed = { callId, state: 'completed', error: 'SYNTHETIC_TOOL_FAILED' }; }
        }
        try { await persist(completed); }
        catch { return refused(callId, 'RESULT_NOT_DURABLE'); }
        return completed;
      });
      calls.set(callId, { request, reply });
      return reply;
    }
  };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

function fixture() {
  const grant: VeniceRunGrant = {
    runId: 'synthetic-app-run', sessionId: 'synthetic-local-session',
    tabId: 7, documentId: 'synthetic-document', tools: ['core/read'], roots: ['/synthetic-root']
  };
  const request: VeniceToolCallRequest = {
    runId: grant.runId, callId: 'synthetic-call', surface: 'core', tool: 'read',
    args: { paths: ['/synthetic-root/example.txt'] }
  };
  const journal: VeniceToolCallResponse[] = [];
  const persist = vi.fn(async (response: VeniceToolCallResponse) => { journal.push(structuredClone(response)); });
  const execute = vi.fn(async (_request: VeniceToolCallRequest): Promise<unknown> => ({
    content: [{ type: 'text', text: 'synthetic file contents' }], isError: false
  }));
  return { grant, request, journal, persist, execute };
}

it('exports only erased wire types and represents all three response states', () => {
  expect(Object.keys(wire)).toEqual([]);
  const responses: VeniceToolCallResponse[] = [
    { callId: 'synthetic-call', state: 'pending' },
    { callId: 'synthetic-call', state: 'completed', result: { isError: false } },
    { callId: 'synthetic-call', state: 'unknown', error: 'OUTCOME_UNKNOWN' }
  ];
  expect(responses.map(response => response.state)).toEqual(['pending', 'completed', 'unknown']);
});

it('joins simultaneous duplicates during persistence and execution, then replays the same record', async () => {
  const f = fixture();
  const acceptanceStarted = deferred(), acceptanceSaved = deferred(), effectDone = deferred();
  const persist = vi.fn(async (response: VeniceToolCallResponse) => {
    if (response.state === 'pending') {
      acceptanceStarted.resolve();
      await acceptanceSaved.promise;
    }
    await f.persist(response);
  });
  const effectStarted = deferred();
  const execute = vi.fn(async (request: VeniceToolCallRequest) => {
    expect(f.journal).toEqual([{ callId: request.callId, state: 'pending' }]);
    effectStarted.resolve();
    await effectDone.promise;
    return f.execute(request);
  });
  const model = contractModel(f.grant, persist, execute);
  const first = model.submit(f.request);
  const duplicate = model.submit(structuredClone(f.request));
  expect(duplicate).toBe(first);
  await acceptanceStarted.promise;
  expect(execute).not.toHaveBeenCalled();
  expect(f.journal).toEqual([]);
  acceptanceSaved.resolve();
  await effectStarted.promise;
  expect(model.submit(f.request)).toBe(first);
  effectDone.resolve();
  const [a, b] = await Promise.all([first, duplicate]);
  expect(a).toBe(b);
  expect(a).toEqual({ callId: f.request.callId, state: 'completed', result: await f.execute.mock.results[0]!.value });
  expect(await model.submit(f.request)).toBe(a);
  expect(execute).toHaveBeenCalledTimes(1);
  expect(f.execute).toHaveBeenCalledTimes(1);
  expect(persist).toHaveBeenCalledTimes(2);
  expect(f.journal).toEqual([{ callId: f.request.callId, state: 'pending' }, a]);
});

it('refuses new calls after revocation while the authenticated owner can retrieve an existing result', async () => {
  const f = fixture();
  const model = contractModel(f.grant, f.persist, f.execute);
  const recorded = await model.submit(f.request);
  model.revoke();
  expect(await model.submit({ ...f.request, callId: 'synthetic-new-call' })).toEqual({
    callId: 'synthetic-new-call', state: 'unknown', error: 'RUN_REVOKED'
  });
  expect(await model.submit(f.request)).toBe(recorded);
  expect(f.execute).toHaveBeenCalledTimes(1);
  expect(f.persist).toHaveBeenCalledTimes(2);
});

it('rechecks revocation after acceptance persistence and before the effect', async () => {
  const f = fixture();
  const saving = deferred(), saved = deferred();
  const model = contractModel(f.grant, async response => {
    if (response.state === 'pending') { saving.resolve(); await saved.promise; }
    await f.persist(response);
  }, f.execute);
  const reply = model.submit(f.request);
  await saving.promise;
  model.revoke();
  saved.resolve();
  expect(await reply).toEqual({ callId: f.request.callId, state: 'completed', error: 'RUN_REVOKED' });
  expect(f.execute).not.toHaveBeenCalled();
  expect(f.journal.map(response => response.state)).toEqual(['pending', 'completed']);
});

it('refuses a client-invented runId instead of treating it as a grant', async () => {
  const f = fixture();
  const model = contractModel(f.grant, f.persist, f.execute);
  expect(await model.submit({ ...f.request, runId: 'synthetic-client-run' })).toEqual({
    callId: f.request.callId, state: 'unknown', error: 'RUN_NOT_AUTHORIZED'
  });
  expect(f.execute).not.toHaveBeenCalled();
  expect(f.persist).not.toHaveBeenCalled();
});

it('refuses changed arguments for an existing callId without replacing the recorded result', async () => {
  const f = fixture();
  const model = contractModel(f.grant, f.persist, f.execute);
  const recorded = await model.submit(f.request);
  expect(await model.submit({ ...f.request, args: { paths: ['/synthetic-root/other.txt'] } })).toEqual({
    callId: f.request.callId, state: 'unknown', error: 'CALL_ID_CONFLICT'
  });
  expect(await model.submit(f.request)).toBe(recorded);
  expect(f.execute).toHaveBeenCalledTimes(1);
});

it('does not execute or automatically retry when acceptance cannot be made durable', async () => {
  const f = fixture();
  const persist = vi.fn(async () => { throw new Error('synthetic persistence failure'); });
  const model = contractModel(f.grant, persist, f.execute);
  const response = await model.submit(f.request);
  expect(response).toEqual({ callId: f.request.callId, state: 'unknown', error: 'ACCEPTANCE_NOT_DURABLE' });
  expect(await model.submit(f.request)).toBe(response);
  expect(persist).toHaveBeenCalledTimes(1);
  expect(f.execute).not.toHaveBeenCalled();
});

it('does not repeat an effect when its result cannot be made durable', async () => {
  const f = fixture();
  const model = contractModel(f.grant, async response => {
    if (response.state === 'completed') throw new Error('synthetic completion save failure');
    await f.persist(response);
  }, f.execute);
  const response = await model.submit(f.request);
  expect(response).toEqual({ callId: f.request.callId, state: 'unknown', error: 'RESULT_NOT_DURABLE' });
  expect(await model.submit(f.request)).toBe(response);
  expect(f.execute).toHaveBeenCalledTimes(1);
  expect(f.journal).toEqual([{ callId: f.request.callId, state: 'pending' }]);
});
