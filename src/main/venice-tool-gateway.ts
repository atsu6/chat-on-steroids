import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import type { VeniceRunGrant, VeniceToolCallRequest, VeniceToolCallResponse, VeniceGrantPending, VeniceGrantReply } from '../shared/venice-integration.js';
import type { Root } from '../shared/types.js';
import { getConfig, effectiveCapabilities } from './config.js';
import { readDurable, writeDurableNow } from './durable.js';
import { resolvePath, validateNewRoot, uniqueRootName } from './sandbox.js';
import { getSession } from './session/store.js';
import { createRegistrar, shieldSessionToolOutput } from './mcp/kernel.js';
import { registerCoreTools } from './mcp/tools-core.js';
import { VeniceExecRuns, boundVeniceExecOutput, type VeniceExecLease } from './venice-exec.js';

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
type Grant = { value: VeniceRunGrant; sender: VeniceSender; active: boolean; roots: Root[]; configured: boolean };
type Approval = { id: string; key: string; sender: VeniceSender; view: VeniceGrantPending | null;
  roots: Root[]; answering: boolean; reply: Promise<VeniceGrantReply>; finish(reply: VeniceGrantReply): void; timer: ReturnType<typeof setTimeout> };
type ApprovalUi = {
  context(): Promise<Pick<VeniceGrantPending, 'sessionId' | 'sessionTitle' | 'project'>>;
  notify(pending: VeniceGrantPending[]): void;
};
export const veniceGrantRequestSchema = z.object({ requestId: z.string().uuid(),
  tools: z.union([z.tuple([z.literal('core/read')]), z.tuple([z.literal('core/read'), z.literal('core/find')])]), instructionSummary: z.string().trim().min(1).max(1000) }).strict();
type Dependencies = {
  load(): Promise<unknown>;
  save(records: CallRecord[]): Promise<void>;
  execute(request: VeniceToolCallRequest, grant: VeniceRunGrant, current: () => boolean, roots?: Root[], preview?: boolean, exec?: VeniceExecLease): Promise<unknown>;
  saveGrants?(grants: unknown[]): Promise<void>;
};
const refusal = (callId: string, error: string): VeniceToolCallResponse => ({ callId, state: 'unknown', error });

/** One ledger owns acceptance/results. Grants are process-local and never restored as authority. */
export class VeniceToolGateway {
  private execRuns = new VeniceExecRuns();
  private grants = new Map<string, Grant>();
  private records = new Map<string, CallRecord>();
  private reservations = new Map<string, { request: VeniceToolCallRequest; sender: VeniceSender; reply: Promise<VeniceToolCallResponse> }>();
  private ready: Promise<void> | null = null;
  private saves: Promise<void> = Promise.resolve();
  private stopped = false;
  private approvalUi: ApprovalUi | null = null;
  private approvals = new Map<string, Approval>();
  private grantSaves: Promise<void> = Promise.resolve();

  setApprovalUi(ui: ApprovalUi): void { this.approvalUi = ui; }
  pendingApprovals(): VeniceGrantPending[] {
    return structuredClone([...this.approvals.values()].flatMap(row => row.view ? [row.view] : []));
  }
  private publishApprovals(): void { this.approvalUi?.notify(this.pendingApprovals()); }
  private finishApproval(row: Approval, reply: VeniceGrantReply): void {
    if (!this.approvals.delete(row.id)) return;
    clearTimeout(row.timer); row.finish(reply); this.publishApprovals();
  }
  requestGrant(input: unknown, source: unknown, tabUrl: string): Promise<VeniceGrantReply> {
    const request = veniceGrantRequestSchema.parse(input), sender = veniceSenderSchema.parse(source);
    const url = new URL(tabUrl);
    if (url.origin !== 'https://venice.ai') throw new Error('venice_invalid_tab');
    for (const row of this.approvals.values()) {
      if (!isDeepStrictEqual(row.sender, sender)) continue;
      return row.key === request.requestId ? row.reply : Promise.resolve({ error: '承認待ちの要求がすでにあります。' });
    }
    if (this.stopped || !this.approvalUi || this.approvals.size >= 8) return Promise.resolve({ error: 'アプリで承認画面を開けません。' });
    let finish!: (reply: VeniceGrantReply) => void;
    const reply = new Promise<VeniceGrantReply>(resolve => { finish = resolve; });
    const row: Approval = { id: randomUUID(), key: request.requestId, sender, view: null, roots: [], answering: false,
      reply, finish, timer: setTimeout(() => this.finishApproval(row, { error: '承認待ちが時間切れになりました。' }), 120_000) };
    row.timer.unref?.();
    this.approvals.set(row.id, row);
    void this.approvalUi.context().then(context => {
      if (!this.approvals.has(row.id)) return;
      row.view = { ...context, id: row.id, tab: { id: sender.tabId, url: url.href },
        tools: request.tools, instructionSummary: request.instructionSummary, roots: [] };
      this.publishApprovals();
    }).catch(() => this.finishApproval(row, { error: '対象のローカルsessionを用意できません。' }));
    return reply;
  }
  async chooseApprovalRoots(id: string, paths: string[]): Promise<VeniceGrantPending[]> {
    const row = this.approvals.get(id);
    if (!row?.view || row.answering) throw new Error('venice_approval_unavailable');
    const roots = [...row.roots];
    for (const selected of paths) {
      const real = await validateNewRoot(selected, []);
      if (!roots.some(root => root.path === real)) roots.push({ name: uniqueRootName(real, roots), path: real });
    }
    if (roots.length > 16) throw new Error('venice_too_many_folders');
    if (this.approvals.get(id) !== row || row.answering) throw new Error('venice_approval_unavailable');
    row.roots = roots; row.view.roots = roots.map(root => root.path);
    this.publishApprovals(); return this.pendingApprovals();
  }
  async answerApproval(id: string, allow: boolean, write = false, shell = false): Promise<void> {
    const row = this.approvals.get(id);
    if (!row?.view || row.answering) throw new Error('venice_approval_unavailable');
    if (!allow) { this.finishApproval(row, { error: 'ファイルの読み取りを許可しませんでした。' }); return; }
    if (!row.roots.length) throw new Error('venice_folder_required');
    row.answering = true;
    try {
      for (const root of row.roots) {
        if (await validateNewRoot(root.path, []) !== root.path) throw new Error('venice_folder_changed');
      }
      if (!this.approvals.has(id)) throw new Error('venice_approval_unavailable');
      const grant = await this.grantWithRoots(row.view.sessionId, row.roots, row.sender, false, write, shell, row.view.tools.length === 2);
      if (!this.approvals.has(id)) { this.revoke(grant.runId); return; }
      this.finishApproval(row, { runId: grant.runId });
    } finally { row.answering = false; }
  }
  revokeSender(source: VeniceSender, runId?: string): boolean {
    let revoked = false;
    for (const [id, grant] of this.grants) if ((!runId || id === runId) && isDeepStrictEqual(grant.sender, source)) revoked = this.revoke(id) || revoked;
    for (const row of [...this.approvals.values()]) if (isDeepStrictEqual(row.sender, source)) this.finishApproval(row, { error: 'このrunは停止されました。' });
    return revoked;
  }
  documentChanged(source: VeniceSender): void {
    for (const grant of this.grants.values()) if (grant.sender.browserId === source.browserId && grant.sender.tabId === source.tabId && grant.sender.documentId !== source.documentId) this.revokeSender(grant.sender);
    for (const row of [...this.approvals.values()]) if (row.sender.browserId === source.browserId && row.sender.tabId === source.tabId && row.sender.documentId !== source.documentId) this.revokeSender(row.sender);
  }
  private saveGrants(): Promise<void> {
    const next = this.grantSaves.then(() => this.deps.saveGrants?.(structuredClone([...this.grants.values()])));
    this.grantSaves = next.catch(() => undefined); return next;
  }
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
  async grant(sessionId: string, roots: string[], sender: VeniceSender, write = false, shell = false, find = false): Promise<VeniceRunGrant> {
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
    return this.grantWithRoots(sessionId, config.roots.filter(root => approved.includes(root.path)), sender, true, write, shell, find);
  }

  private async grantWithRoots(sessionId: string, roots: Root[], sender: VeniceSender, configured: boolean, write = false, shell = false, find = false): Promise<VeniceRunGrant> {
    await this.initialize();
    const session = await getSession(sessionId);
    if (!session || session.conversationId || session.endedAt || this.stopped || this.grants.size >= 32) throw new Error('venice_grant_unavailable');
    const value: VeniceRunGrant = { runId: randomUUID(), sessionId, roots: roots.map(root => root.path),
      tabId: sender.tabId, documentId: sender.documentId, tools: ['core/read', ...(find ? ['core/find'] : []), ...(write ? ['core/apply_patch'] : []), ...(shell ? ['core/exec_command', 'core/write_stdin'] : [])],
      ...(write ? { write: true } : {}), ...(shell ? { shell: true } : {}) };
    const grant: Grant = { value, sender: veniceSenderSchema.parse(sender), active: true, roots: structuredClone(roots), configured };
    this.grants.set(value.runId, grant);
    try { await this.saveGrants(); }
    catch { grant.active = false; throw new Error('venice_grant_not_durable'); }
    if (!grant.active || this.stopped) throw new Error('venice_run_revoked');
    return structuredClone(value);
  }

  revoke(runId: string): boolean {
    const grant = this.grants.get(runId);
    if (!grant) return false;
    grant.active = false;
    this.execRuns.revoke(runId);
    void this.saveGrants().catch(() => undefined);
    return true;
  }
  revokeAll(): void {
    for (const [id] of this.grants) this.revoke(id);
    for (const row of [...this.approvals.values()]) this.finishApproval(row, { error: 'アプリとの接続が終了しました。' });
  }
  async stop(): Promise<void> {
    this.stopped = true; this.revokeAll();
    await Promise.allSettled([...this.reservations.values()].map(row => row.reply));
    await this.execRuns.drain();
    await this.saves; await this.grantSaves;
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

  private authorize(request: VeniceToolCallRequest, sender: VeniceSender): { grant: Grant; current: () => boolean } | VeniceToolCallResponse {
    const grant = this.grants.get(request.runId);
    if (!grant || !isDeepStrictEqual(grant.sender, sender)) return refusal(request.callId, 'RUN_NOT_AUTHORIZED');
    const current = () => !this.stopped && grant.active && (!grant.configured ||
      grant.roots.every(root => getConfig().roots.some(live => !live.remote && live.path === root.path && live.name === root.name)));
    if (!current()) return refusal(request.callId, 'RUN_REVOKED');
    if (request.surface !== 'core' || !['read', 'find', 'apply_patch', 'exec_command', 'write_stdin'].includes(request.tool) ||
        !grant.value.tools.includes(`core/${request.tool}`) || (request.tool === 'find' && !grant.value.tools.includes('core/read')) || (request.tool === 'apply_patch' && grant.value.write !== true) ||
        (['exec_command', 'write_stdin'].includes(request.tool) && grant.value.shell !== true)) return refusal(request.callId, 'TOOL_NOT_GRANTED');
    return { grant, current };
  }

  /** Side-effect-free preview, under the same live grant/sender/root checks as execution. */
  async previewPatch(input: unknown, source: unknown): Promise<{ diff: string }> {
    const request = requestSchema.parse(input), sender = veniceSenderSchema.parse(source);
    await this.initialize();
    const admission = this.authorize(request, sender);
    if (!('grant' in admission)) throw new Error(admission.error);
    if (request.tool !== 'apply_patch') throw new Error('TOOL_NOT_GRANTED');
    const { grant, current } = admission;
    const result = await this.deps.execute(request, grant.value, current, grant.roots, true) as { isError?: boolean; content?: Array<{ type: string; text?: string }> };
    if (!current()) throw new Error('RUN_REVOKED');
    const diff = result.content?.filter(part => part.type === 'text').map(part => part.text ?? '').join('\n') ?? '';
    if (result.isError) throw new Error(diff || 'PATCH_PREVIEW_FAILED');
    if (Buffer.byteLength(diff) > 1_000_000) throw new Error('PATCH_PREVIEW_TOO_LARGE');
    return { diff };
  }

  /** Observes only the original accepted call; it never admits or reexecutes a command. */
  async execOutput(input: unknown, source: unknown): Promise<import('../shared/venice-integration.js').VeniceExecOutput | null> {
    const request = requestSchema.parse(input), sender = veniceSenderSchema.parse(source);
    await this.initialize();
    const admission = this.authorize(request, sender);
    if (!('grant' in admission)) throw new Error(admission.error);
    const record = this.records.get(request.callId);
    if (request.tool !== 'exec_command' || !record || !isDeepStrictEqual(record.request, request) || !isDeepStrictEqual(record.sender, sender)) throw new Error('CALL_NOT_AUTHORIZED');
    const snapshot = this.execRuns.get(request.callId)?.snapshot();
    if (!snapshot) return null;
    const shielded = await shieldSessionToolOutput(admission.grant.value.sessionId, 'exec_command output', { content: [], structuredContent: { ...snapshot } });
    if (!admission.current()) throw new Error('RUN_REVOKED');
    return boundVeniceExecOutput(shielded.structuredContent as unknown as import('../shared/venice-integration.js').VeniceExecOutput);
  }
  async waitForRevocation(): Promise<void> { await this.execRuns.drain(); }

  private async admit(request: VeniceToolCallRequest, sender: VeniceSender): Promise<VeniceToolCallResponse> {
    try { await this.initialize(); }
    catch { return refusal(request.callId, 'VENICE_LEDGER_UNAVAILABLE'); }
    const old = this.records.get(request.callId);
    if (old) return isDeepStrictEqual(old.request, request) && isDeepStrictEqual(old.sender, sender)
      ? old.response : refusal(request.callId, 'CALL_ID_CONFLICT');
    const admission = this.authorize(request, sender);
    if (!('grant' in admission)) return admission;
    const { grant, current } = admission;
    if (this.records.size >= 256) return refusal(request.callId, 'VENICE_LEDGER_FULL');
    const row: CallRecord = { request, sender, response: { callId: request.callId, state: 'pending' } };
    this.records.set(request.callId, row);
    try { await this.save(); }
    catch { return row.response = refusal(request.callId, 'ACCEPTANCE_NOT_DURABLE'); }
    let result: unknown;
    try {
      if (!current()) row.response = { callId: request.callId, state: 'completed', error: 'RUN_REVOKED' };
      else {
        let exec: VeniceExecLease | undefined;
        try {
          if (request.tool === 'exec_command') {
            try { exec = this.execRuns.begin(request.runId, request.callId, current); }
            catch (error) {
              result = { isError: true, content: [{ type: 'text', text: error instanceof Error ? error.message : 'EXEC_LIMIT' }] };
            }
          }
          if (request.tool === 'write_stdin') {
            const id = request.args.session_id;
            if (typeof id === 'number' && Number.isInteger(id)) exec = this.execRuns.forProcess(request.runId, id);
            if (!exec) result = { isError: true, content: [{ type: 'text', text: 'EXEC_SESSION_OWNER_MISMATCH: no process owned by this run; no input was sent or output read.' }] };
          }
          if (!['exec_command', 'write_stdin'].includes(request.tool) || exec) result = await this.deps.execute(request, grant.value, current, grant.roots, false, exec);
        } finally { if (request.tool === 'exec_command') exec?.finishInvocation(); }
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
async function executeLocalTool(request: VeniceToolCallRequest, grant: VeniceRunGrant, current: () => boolean, roots: Root[] = [], preview = false, exec?: VeniceExecLease): Promise<unknown> {
  const config = getConfig();
  const caps = effectiveCapabilities(config);
  // This opt-in belongs to the Venice adapter, not the ordinary CoS exec schema/defaults.
  const args = { ...request.args };
  const stdinOpen = request.tool === 'exec_command' && args.stdin_open === true;
  if (request.tool === 'exec_command' && Object.hasOwn(args, 'stdin_open')) {
    if (typeof args.stdin_open !== 'boolean') return { isError: true, content: [{ type: 'text', text: 'INVALID_ARGUMENT: stdin_open must be a boolean.' }] };
    delete args.stdin_open;
  }
  // Expose the existing handlers; the independent live host grant still admits each tool.
  const reg = createRegistrar(null, { roots, caps, exposedCaps: { ...caps, read: true, create: true, edit: true, move: true, deleteFile: true, command: true, search: true }, readOnly: config.readOnly,
    exposedFind: true, sessionTools: false, agentTools: false }, 'core');
  registerCoreTools(reg);
  return reg.invokeHostAdmitted(request.tool, args, { type: 'venice', read: grant.tools.includes('core/read'), write: grant.write === true, shell: grant.shell === true, stdinOpen, exec, preview, runId: grant.runId,
    sessionId: grant.sessionId, roots, current });
}

export const veniceToolGateway = new VeniceToolGateway({
  load: () => readDurable('venice-tools', { strict: true }),
  save: rows => writeDurableNow('venice-tools', rows), execute: executeLocalTool,
  saveGrants: rows => writeDurableNow('venice-grants', rows)
});
