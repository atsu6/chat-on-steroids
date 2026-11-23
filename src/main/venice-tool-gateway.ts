import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import type { VeniceRunGrant, VeniceToolCallRequest, VeniceToolCallResponse } from '../shared/venice-integration.js';
import type { Root } from '../shared/types.js';
import { getConfig, effectiveCapabilities } from './config.js';
import { readDurable, writeDurableNow } from './durable.js';
import { resolvePath } from './sandbox.js';
import { getSession } from './session/store.js';
import { createRegistrar } from './mcp/kernel.js';
import { registerCoreTools } from './mcp/tools-core.js';

export const veniceSenderSchema = z.object({
  browserId: z.string().regex(/^[a-z0-9]{16,64}$/),
  tabId: z.number().int().nonnegative(), documentId: z.string().min(1).max(200)
}).strict();
export type VeniceSender = z.infer<typeof veniceSenderSchema>;
const requestSchema = z.object({
  runId: z.string().uuid(), callId: z.string().uuid(), surface: z.enum(['core', 'desktop']),
  tool: z.string().min(1).max(100), args: z.record(z.string(), z.unknown())
}).strict();
const responseSchema = z.object({
  callId: z.string().uuid(), state: z.enum(['pending', 'completed', 'unknown']),
  result: z.unknown().optional(), error: z.string().optional()
}).strict();
const recordSchema = z.object({ request: requestSchema, sender: veniceSenderSchema, response: responseSchema });
type CallRecord = z.infer<typeof recordSchema>;
type Grant = { value: VeniceRunGrant; sender: VeniceSender; active: boolean };
type Dependencies = {
  load(): Promise<unknown>;
  save(records: CallRecord[]): Promise<void>;
  execute(request: VeniceToolCallRequest, grant: VeniceRunGrant, current: () => boolean): Promise<unknown>;
};
const refusal = (callId: string, error: string): VeniceToolCallResponse => ({ callId, state: 'unknown', error });

/** One ledger owns acceptance/results. Grants are process-local and never restored as authority. */
export class VeniceToolGateway {
  private grants = new Map<string, Grant>();
  private records = new Map<string, CallRecord>();
  private reservations = new Map<string, { request: VeniceToolCallRequest; sender: VeniceSender; reply: Promise<VeniceToolCallResponse> }>();
  private ready: Promise<void> | null = null;
  private saves: Promise<void> = Promise.resolve();
  private stopped = false;
  constructor(private deps: Dependencies) {}

  initialize(): Promise<void> {
    if (!this.ready) this.ready = (async () => {
      const stored = await this.deps.load();
      if (stored === null) return;
      const rows = z.array(recordSchema).max(256).parse(stored);
      for (const row of rows) {
        if (this.records.has(row.request.callId) || row.response.callId !== row.request.callId) throw new Error('VENICE_LEDGER_INVALID');
        if (row.response.state === 'pending') row.response = refusal(row.request.callId, 'OUTCOME_UNKNOWN');
        this.records.set(row.request.callId, row);
      }
    })();
    return this.ready;
  }

  /** Only the trusted app debug IPC calls this; never exposed over HTTP. */
  async grant(sessionId: string, roots: string[], sender: VeniceSender): Promise<VeniceRunGrant> {
    await this.initialize();
    const session = await getSession(sessionId);
    if (!session || session.conversationId || session.endedAt) throw new Error('VENICE_SESSION_UNAVAILABLE');
    const config = getConfig();
    const approved: string[] = [];
    for (const root of roots) {
      const resolved = await resolvePath(config.roots, root);
      // Retain existing virtual-root meaning: approve whole named roots, not remap an alias.
      if (resolved.root.remote || resolved.real !== resolved.root.path) throw new Error('VENICE_APPROVED_ROOT_REQUIRED');
      approved.push(resolved.root.path);
    }
    if (!approved.length || this.stopped || this.grants.size >= 32) throw new Error('VENICE_GRANT_UNAVAILABLE');
    const value: VeniceRunGrant = { runId: randomUUID(), sessionId, roots: [...new Set(approved)],
      tabId: sender.tabId, documentId: sender.documentId, tools: ['core/read'] };
    this.grants.set(value.runId, { value, sender: veniceSenderSchema.parse(sender), active: true });
    return structuredClone(value);
  }

  revoke(runId: string): boolean {
    const grant = this.grants.get(runId);
    if (!grant) return false;
    grant.active = false;
    return true;
  }
  revokeAll(): void { for (const grant of this.grants.values()) grant.active = false; }
  async stop(): Promise<void> {
    this.stopped = true; this.revokeAll();
    await Promise.allSettled([...this.reservations.values()].map(row => row.reply));
    await this.saves;
  }

  /** Reserve synchronously, before initialize, persistence or the handler can await. */
  call(input: unknown, source: unknown): Promise<VeniceToolCallResponse> {
    const request = structuredClone(requestSchema.parse(input));
    const sender = veniceSenderSchema.parse(source);
    const previous = this.reservations.get(request.callId);
    if (previous) return isDeepStrictEqual(previous.request, request) && isDeepStrictEqual(previous.sender, sender)
      ? previous.reply.then(response => structuredClone(response)) : Promise.resolve(refusal(request.callId, 'CALL_ID_CONFLICT'));
    if (this.reservations.size >= 512) return Promise.resolve(refusal(request.callId, 'VENICE_LEDGER_FULL'));
    const reply = Promise.resolve().then(() => this.admit(request, sender));
    this.reservations.set(request.callId, { request, sender, reply });
    return reply.then(response => structuredClone(response));
  }

  private save(): Promise<void> {
    const next = this.saves.then(() => this.deps.save(structuredClone([...this.records.values()])));
    this.saves = next.catch(() => undefined);
    return next;
  }

  private async admit(request: VeniceToolCallRequest, sender: VeniceSender): Promise<VeniceToolCallResponse> {
    try { await this.initialize(); }
    catch { return refusal(request.callId, 'VENICE_LEDGER_UNAVAILABLE'); }
    const old = this.records.get(request.callId);
    if (old) return isDeepStrictEqual(old.request, request) && isDeepStrictEqual(old.sender, sender)
      ? old.response : refusal(request.callId, 'CALL_ID_CONFLICT');
    const grant = this.grants.get(request.runId);
    if (!grant || !isDeepStrictEqual(grant.sender, sender)) return refusal(request.callId, 'RUN_NOT_AUTHORIZED');
    const current = () => !this.stopped && grant.active;
    if (!current()) return refusal(request.callId, 'RUN_REVOKED');
    if (request.surface !== 'core' || request.tool !== 'read' || !grant.value.tools.includes('core/read')) return refusal(request.callId, 'TOOL_NOT_GRANTED');
    if (this.records.size >= 256) return refusal(request.callId, 'VENICE_LEDGER_FULL');
    const row: CallRecord = { request, sender, response: { callId: request.callId, state: 'pending' } };
    this.records.set(request.callId, row);
    try { await this.save(); }
    catch { return row.response = refusal(request.callId, 'ACCEPTANCE_NOT_DURABLE'); }
    let result: unknown;
    try {
      if (!current()) row.response = { callId: request.callId, state: 'completed', error: 'RUN_REVOKED' };
      else {
        result = await this.deps.execute(request, grant.value, current);
        // Keep bounded JSON, not an unbounded image batch, in the first text-only ledger.
        row.response = Buffer.byteLength(JSON.stringify(result) ?? '') > 1_000_000
          ? { callId: request.callId, state: 'completed', error: 'RESULT_TOO_LARGE' }
          : { callId: request.callId, state: 'completed', result };
      }
    } catch { row.response = refusal(request.callId, 'OUTCOME_UNKNOWN'); }
    try { await this.save(); }
    catch { row.response = refusal(request.callId, 'RESULT_NOT_DURABLE'); }
    return row.response;
  }
}

/** Build a fresh live registrar for each call; no MCP URL, fake request proof or nested parent. */
async function executeRead(request: VeniceToolCallRequest, grant: VeniceRunGrant, current: () => boolean): Promise<unknown> {
  const config = getConfig();
  const roots: Root[] = config.roots.filter(root => !root.remote && grant.roots.includes(root.path));
  if (roots.length !== grant.roots.length) throw new Error('RUN_ROOT_REVOKED');
  const caps = effectiveCapabilities(config);
  // This stage is text-only and does not expose unrelated metadata/browse/command tools.
  const reg = createRegistrar(null, { roots, caps, exposedCaps: { ...caps, read: true }, readOnly: config.readOnly,
    sessionTools: false, agentTools: false }, 'core');
  registerCoreTools(reg);
  const live = () => current() &&
    roots.every(approved => getConfig().roots.some(root => !root.remote && approved.path === root.path && approved.name === root.name));
  return reg.invokeHostAdmitted(request.tool, request.args, { type: 'venice', runId: grant.runId,
    sessionId: grant.sessionId, roots, current: live });
}

export const veniceToolGateway = new VeniceToolGateway({
  load: () => readDurable('venice-tools', { strict: true }),
  save: rows => writeDurableNow('venice-tools', rows), execute: executeRead
});
