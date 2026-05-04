import type { FlashJobState } from '../models/firmware/flash_job_state.js';

export type LateJoinSnapshot = { kind: 'none' } | { kind: 'flashJobStarted'; data: FlashJobState };

/**
 * Decides what (if anything) a freshly-connected WS client should be
 * sent so it converges on the current orchestrator state.
 *
 * - No active job → no snapshot. The next state change broadcasts as
 *   normal.
 * - Active job, pre-DONE (`endedAt === undefined`) → send `flashJobStarted`
 *   so the client can render progress against the same FlashJobState the
 *   in-flight clients see.
 * - Active job that has reached `flashJobDone` but not yet released the
 *   lock (the up-to-15s reboot-wait window) → no snapshot. Emitting
 *   `flashJobStarted` for a terminal job would mislead the client into
 *   thinking a new flash is starting; the imminent `lockStateChanged`
 *   event tells them the system is settling. Documented in QA case
 *   §"WS late-join mid-flash" §6.
 */
export function decideLateJoinSnapshot(currentJob: FlashJobState | null): LateJoinSnapshot {
  if (currentJob === null) return { kind: 'none' };
  if (currentJob.endedAt !== undefined) return { kind: 'none' };
  return { kind: 'flashJobStarted', data: currentJob };
}
