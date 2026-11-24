import { StringDecoder } from 'node:string_decoder';
import type { ExecProcessObserver } from './codex/unified-exec.js';
import type { VeniceExecOutput } from '../shared/venice-integration.js';

export const VENICE_EXEC_OUTPUT_BYTES = 64 * 1024;

/** Masking can expand short secret settings; the published view has the same byte ceiling. */
export function boundVeniceExecOutput(output: VeniceExecOutput): VeniceExecOutput {
  const stdout = Buffer.from(output.stdout), stderr = Buffer.from(output.stderr);
  const excess = Math.max(0, stdout.length + stderr.length - VENICE_EXEC_OUTPUT_BYTES);
  if (!excess) return output;
  const head = stdout.subarray(0, VENICE_EXEC_OUTPUT_BYTES);
  const rest = stderr.subarray(0, VENICE_EXEC_OUTPUT_BYTES - head.length);
  return { ...output, stdout: new StringDecoder('utf8').write(head), stderr: new StringDecoder('utf8').write(rest),
    truncated: true, omittedBytes: output.omittedBytes + excess };
}

export function veniceExecResult(output: VeniceExecOutput) {
  const view = boundVeniceExecOutput(output);
  return { content: [{ type: 'text' as const, text: `Process ID: ${view.processId}\nExit code: ${view.running ? 'running' : view.exitCode}\nstdout:\n${view.stdout}\nstderr:\n${view.stderr}` + (view.truncated ? '\n[output truncated]' : '') }],
    structuredContent: { ...view, output: { stdout: view.stdout, stderr: view.stderr } } };
}

/** Trusted, run-owned custody. The wire can neither create a lease nor choose its owner. */
export class VeniceExecLease {
  private stdout: Buffer[] = [];
  private stderr: Buffer[] = [];
  private bytes = 0;
  private omitted = 0;
  private control: Parameters<NonNullable<ExecProcessObserver['onSpawn']>>[0] | null = null;
  private termination: Promise<void> | null = null;
  private revoked = false;
  private running = true; // Includes admission/spawn, so simultaneous launches cannot oversubscribe.
  private exitCode: number | null = null;
  processId: number | null = null;

  constructor(readonly runId: string, readonly callId: string, private current: () => boolean) {}

  readonly observer: ExecProcessObserver = {
    onOutput: (stream, chunk) => {
      const keep = Math.min(chunk.length, VENICE_EXEC_OUTPUT_BYTES - this.bytes);
      if (keep) this[stream].push(Buffer.from(chunk.subarray(0, keep)));
      this.bytes += keep; this.omitted += chunk.length - keep;
    },
    onSpawn: control => {
      this.control = control;
      void control.completion.then(completion => { this.exitCode = completion.exitCode; this.running = false; });
      if (this.revoked || !this.current()) void this.revoke().catch(() => undefined);
    }
  };

  isLive(): boolean { return this.running; }
  finishInvocation(): void { if (!this.control) this.running = false; }
  revoke(): Promise<void> {
    this.revoked = true;
    if (!this.control || !this.running) return Promise.resolve();
    return this.termination ??= this.control.terminate();
  }
  waitForRevocation(): Promise<void> { return this.termination ?? Promise.resolve(); }
  snapshot(): VeniceExecOutput {
    // Drop an incomplete trailing UTF-8 codepoint rather than expanding a clipped byte into U+FFFD.
    const decode = (chunks: Buffer[]) => new StringDecoder('utf8').write(Buffer.concat(chunks));
    return { callId: this.callId, processId: this.processId, exitCode: this.exitCode,
      running: this.running, stdout: decode(this.stdout), stderr: decode(this.stderr),
      truncated: this.omitted > 0, omittedBytes: this.omitted };
  }
}

export class VeniceExecRuns {
  private leases = new Map<string, VeniceExecLease>();

  begin(runId: string, callId: string, current: () => boolean): VeniceExecLease {
    if (!current()) throw new Error('RUN_REVOKED');
    if ([...this.leases.values()].filter(row => row.runId === runId && row.isLive()).length >= 3) throw new Error('EXEC_LIMIT: at most 3 live processes per run');
    const lease = new VeniceExecLease(runId, callId, current);
    this.leases.set(callId, lease); return lease;
  }
  get(callId: string): VeniceExecLease | undefined { return this.leases.get(callId); }
  revoke(runId: string): void {
    for (const lease of this.leases.values()) if (lease.runId === runId) {
      void lease.revoke().catch(() => undefined);
    }
  }
  async drain(): Promise<void> { await Promise.all([...this.leases.values()].map(lease => lease.waitForRevocation())); }
}
