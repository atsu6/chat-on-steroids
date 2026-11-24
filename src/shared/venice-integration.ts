/**
 * Venice A-plan wire contract. Types only; admission and execution belong to the app.
 *
 * The app issues runId after approval and looks up its own VeniceRunGrant. A runId in
 * a request is only a lookup key, not authority. Never accept a client-supplied grant,
 * session, root or sender binding as proof. Check the authenticated extension's actual
 * tab/document against the stored grant, plus live permissions, before admitting work.
 *
 * Call lifecycle (owned by the main-process gateway):
 *   unseen -> pending: reserve callId before any await; durably save acceptance BEFORE
 *                      any side effect. Failed persistence must execute nothing.
 *   pending -> completed: execute at most once, then durably save the result/error
 *                         before publishing completed. Tool failure is completed too.
 *   pending -> unknown: recovery cannot prove the outcome, e.g. a crash after acceptance.
 *                       Never automatically execute that call again.
 *
 * Bind each callId to its original runId, surface, tool and args. Concurrent duplicates
 * join the same acceptance/execution; later identical requests retrieve the same record,
 * never start new work. Before acceptance is durable, duplicates wait, not report pending.
 * Reusing callId with a different payload or owner is refused without altering its record.
 *
 * Revocation refuses NEW calls. Recheck the grant after awaited admission work and before
 * execution; revocation does not undo an effect already started. Previously recorded
 * calls may only be read by their independently authenticated original owner. A revoked
 * run cannot be revived by a request; a new approval needs a new app-issued runId.
 */
export interface VeniceToolCallRequest {
  runId: string;
  callId: string;
  surface: 'core' | 'desktop';
  tool: string;
  /** JSON object on the wire; the existing tool schema validates its actual contents. */
  args: Record<string, unknown>;
}

export interface VeniceToolCallResponse {
  callId: string;
  /**
   * pending: acceptance is durable; completion is not yet published.
   * completed: the recorded outcome is known, including a tool error or refusal to
   *            execute an accepted call after revocation.
   * unknown: admission was refused, or an accepted call's outcome cannot be proved;
   *          error distinguishes these cases. Neither authorizes an automatic retry.
   */
  state: 'pending' | 'completed' | 'unknown';
  /** Preserve the original tool result, including content, structuredContent and isError. */
  result?: unknown;
  error?: string;
}

/** App-owned approval snapshot, never a client request to grant permissions. */
export interface VeniceRunGrant {
  runId: string;
  sessionId: string;
  tabId: number;
  documentId: string;
  /** Surface-qualified allowlist. Existing read-only grants remain unchanged. */
  tools: string[];
  /** Omitted/false on existing read grants; only explicit app consent enables writes. */
  write?: boolean;
  /** Independent explicit shell consent; never implied by read or write. */
  shell?: boolean;
  /** Approved filesystem roots; this list does not sandbox a shell process. */
  roots: string[];
}

/** App-owned approval view. Only instructionSummary is browser-authored, not identity. */
export interface VeniceGrantPending {
  id: string;
  sessionId: string;
  sessionTitle: string;
  project: { id: string; name: string } | null;
  tab: { id: number; url: string };
  tools: ['core/read'];
  instructionSummary: string;
  roots: string[];
}
export type VeniceGrantReply = { runId: string } | { error: string };


/** Bounded cumulative process output, not an stdin/continuation capability. */
export interface VeniceExecOutput {
  callId: string;
  processId: number | null;
  exitCode: number | null;
  running: boolean;
  stdout: string;
  stderr: string;
  truncated: boolean;
  omittedBytes: number;
}
