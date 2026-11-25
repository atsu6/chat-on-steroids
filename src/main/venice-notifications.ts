import type { VeniceGrantPending, VeniceRunEvent, VeniceRunGrant } from '../shared/venice-integration.js';
import type { SoundCue } from '../shared/sound-cues.js';
import type { PhonePushEvent } from './phone-push.js';
import { mainText } from './main-texts.js';
import type { WebContents } from 'electron';

/** Always the local app, on every OS; never the ChatGPT browser/reply path. */
export function openVeniceNotification(target: Pick<WebContents, 'isDestroyed' | 'isLoadingMainFrame' | 'once' | 'send'>,
  sessionId: string, approvalId: string | undefined, pending: () => VeniceGrantPending[]): void {
  const open = (): void => {
    if (target.isDestroyed()) return;
    const rows = pending();
    if (approvalId && !rows.some(row => row.id === approvalId && row.sessionId === sessionId)) return;
    target.send('venice:openSession', sessionId);
    if (approvalId) {
      target.send('venice:grantPending', rows);
      target.send('venice:focusApproval', approvalId);
    }
  };
  if (target.isLoadingMainFrame()) target.once('did-finish-load', open); else open();
}

interface Dependencies {
  session(id: string): Promise<{ title?: string | null } | null>;
  pending(): VeniceGrantPending[];
  enabled(): boolean;
  supported(): boolean;
  focused(): boolean;
  now(): number;
  show(title: string, body: string, click: () => void): void;
  open(sessionId: string, approvalId?: string): void;
  sound(kind: SoundCue, sessionId: string): void;
  phone(event: PhonePushEvent): Promise<unknown> | void;
  failed(): void;
}

/** Live gateway facts only: reading/restoring history must never replay notifications. */
export function createVeniceNotifications(deps: Dependencies) {
  const seen = new Set<string>(), started = new Map<string, number>();
  let delivery = Promise.resolve();
  const once = (key: string): boolean => {
    if (seen.has(key)) return false;
    seen.add(key);
    if (seen.size > 256) seen.delete(seen.values().next().value!);
    return true;
  };
  const enqueue = (run: () => Promise<void>): void => {
    delivery = delivery.then(run).catch(() => { deps.failed(); });
  };
  const pending = (id: string, sessionId: string): boolean =>
    deps.pending().some(row => row.id === id && row.sessionId === sessionId);
  const notify = async (kind: SoundCue, sessionId: string, approvalId?: string, workedMs?: number): Promise<void> => {
    const session = await deps.session(sessionId);
    if (!session || (approvalId && !pending(approvalId, sessionId))) return;
    const title = session.title?.replace(/[\0\s]+/g, ' ').trim().slice(0, 120) || mainText('Chat On Venice');
    const body = mainText(kind === 'finished' ? 'Venice task completed' : kind === 'failed' ? 'Venice task failed' : 'Venice is waiting for folder approval.');
    // Each existing destination keeps its own opt-in, quiet-hours and repetition rules.
    try { deps.sound(kind, sessionId); } catch { deps.failed(); }
    try { void Promise.resolve(deps.phone({ provider: 'venice', kind, sessionId, chatTitle: title, workedMs })).catch(() => { deps.failed(); }); }
    catch { deps.failed(); }
    // Like the existing needs-you notices, failure/approval are not the completion toggle.
    if (!deps.supported() || deps.focused() || (kind === 'finished' && !deps.enabled())) return;
    if (approvalId && !pending(approvalId, sessionId)) return;
    deps.show(title, body, () => {
      void (async () => {
        if (!await deps.session(sessionId) || (approvalId && !pending(approvalId, sessionId))) return;
        deps.open(sessionId, approvalId);
      })().catch(() => { deps.failed(); });
    });
  };
  return {
    run(grant: VeniceRunGrant, event: VeniceRunEvent): void {
      if (event.type === 'started') { if (!started.has(grant.runId)) started.set(grant.runId, deps.now()); return; }
      if (event.type === 'step') return;
      const at = started.get(grant.runId); started.delete(grant.runId);
      if (!once(`run:${grant.runId}`) || (event.type !== 'completed' && event.type !== 'failed')) return;
      const workedMs = at === undefined ? undefined : Math.max(0, deps.now() - at);
      enqueue(() => notify(event.type === 'completed' ? 'finished' : 'failed', grant.sessionId, undefined, workedMs));
    },
    approvals(rows: VeniceGrantPending[]): void {
      for (const row of rows) if (once(`approval:${row.id}`)) enqueue(() => notify('needs-you', row.sessionId, row.id));
    },
    /** Tests and bounded shutdown checks can wait for already accepted deliveries. */
    drain: () => delivery
  };
}
