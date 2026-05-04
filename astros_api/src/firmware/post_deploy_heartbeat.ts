import type { FlashJobState } from '../models/firmware/flash_job_state.js';

// The master ESP32 reports its POLL_ACK with this sentinel MAC; padawan
// POLL_ACKs carry their real hardware MACs. Filtering on the sentinel
// ensures only the master's post-deploy version-match heartbeat releases
// the lock — without the filter, any padawan that has already rebooted
// into the same target version would race the master and trip the
// release prematurely.
export const MASTER_POLL_ADDRESS = '00:00:00:00:00:00';

export type HeartbeatDecision =
  | { kind: 'no_active_job' }
  | { kind: 'not_master'; from: string }
  | { kind: 'empty_version_during_flash'; from: string; jobId: string }
  | {
      kind: 'version_mismatch';
      from: string;
      jobId: string;
      expected: string;
      reported: string;
    }
  | { kind: 'fire'; version: string };

/**
 * Decides whether an incoming POLL_ACK should fire the orchestrator's
 * post-deploy heartbeat. Pure function — caller routes the decision to
 * `notifyMasterHeartbeat`, the logger, or no-op.
 *
 * Decision rules (in order):
 *   1. No active flash → no_active_job (silent — common steady-state path)
 *   2. POLL came from a non-master MAC → not_master (silent — padawans
 *      poll normally during a flash)
 *   3. POLL came from master but firmwareVersion is empty → log it (a
 *      master that fails to report its version after deploy means we'll
 *      rely on the 15s reboot-timer fallback)
 *   4. POLL from master with mismatched version → log it (stale POLL_ACK
 *      from before the deploy, or master booted into the wrong version —
 *      timer fallback covers it)
 *   5. POLL from master with matching version → fire heartbeat
 */
export function decidePostDeployHeartbeat(
  controllerAddress: string,
  reportedFwVersion: string | undefined,
  currentJob: FlashJobState | null,
): HeartbeatDecision {
  if (currentJob === null) {
    return { kind: 'no_active_job' };
  }
  if (controllerAddress !== MASTER_POLL_ADDRESS) {
    return { kind: 'not_master', from: controllerAddress };
  }
  if (typeof reportedFwVersion !== 'string' || reportedFwVersion.length === 0) {
    return {
      kind: 'empty_version_during_flash',
      from: controllerAddress,
      jobId: currentJob.jobId,
    };
  }
  if (reportedFwVersion !== currentJob.source.version) {
    return {
      kind: 'version_mismatch',
      from: controllerAddress,
      jobId: currentJob.jobId,
      expected: currentJob.source.version,
      reported: reportedFwVersion,
    };
  }
  return { kind: 'fire', version: reportedFwVersion };
}
