import { describe, it, expect } from 'vitest';
import { FwStage } from '../models/firmware/firmware_messages.js';
import type { FlashJobState } from '../models/firmware/flash_job_state.js';
import { decideLateJoinSnapshot } from './late_join_snapshot.js';

function makeJob(opts: { endedAt?: string } = {}): FlashJobState {
  const job: FlashJobState = {
    jobId: 'job-late-join',
    source: {
      kind: 'github',
      version: '1.4.0',
      sha256: 'a'.repeat(64),
      sizeBytes: 1_000,
      displayName: 'astros-esp 1.4.0 (lolin_d32_pro)',
    },
    controllers: [
      {
        controllerId: '00:00:00:00:00:00',
        stage: FwStage.UploadingToMaster,
        bytesSent: 250,
        totalBytes: 1_000,
        detail: '',
      },
    ],
    startedAt: '2026-05-03T12:00:00Z',
  };
  if (opts.endedAt !== undefined) {
    job.endedAt = opts.endedAt;
  }
  return job;
}

describe('decideLateJoinSnapshot', () => {
  it('none when no flash is in flight', () => {
    expect(decideLateJoinSnapshot(null)).toEqual({ kind: 'none' });
  });

  it('flashJobStarted when an in-flight job has not yet hit flashJobDone', () => {
    const job = makeJob();
    expect(decideLateJoinSnapshot(job)).toEqual({ kind: 'flashJobStarted', data: job });
  });

  it('none for a job in the post-DONE reboot-wait window (endedAt is set)', () => {
    // Bug-fix pin: the orchestrator keeps currentJob set during the
    // 15s reboot-wait, with endedAt populated. A fresh client must
    // NOT receive a flashJobStarted snapshot in that window — that
    // would mislead them into thinking a new flash is beginning.
    const job = makeJob({ endedAt: '2026-05-03T12:00:42Z' });
    expect(decideLateJoinSnapshot(job)).toEqual({ kind: 'none' });
  });

  it('still none when the post-DONE job has terminal-stage controllers', () => {
    // Same shape as the previous test but with controllers in their
    // terminal VersionConfirmed stage — closer to what the live job
    // looks like at the boundary.
    const job: FlashJobState = {
      ...makeJob({ endedAt: '2026-05-03T12:00:42Z' }),
      controllers: [
        {
          controllerId: '00:00:00:00:00:00',
          stage: FwStage.VersionConfirmed,
          bytesSent: 1_000,
          totalBytes: 1_000,
          detail: '',
          finalVersion: '1.4.0',
        },
      ],
    };
    expect(decideLateJoinSnapshot(job).kind).toBe('none');
  });

  it('returns flashJobStarted snapshot while a Finalizing row exists', () => {
    // Phase C: during the PENDING-resolution window (after FW_DEPLOY_DONE,
    // before notifyMasterHeartbeat or finalize timeout), the deploy is
    // in-flight and endedAt is undefined. A late-joining WS client should
    // receive the snapshot with Finalizing rows so its UI shows the
    // "Finalizing…" pill rather than nothing.
    const job: FlashJobState = {
      jobId: 'job-1',
      source: {
        kind: 'github',
        version: '1.4.0',
        sha256: 'a'.repeat(64),
        sizeBytes: 1000,
        displayName: 'astros-esp 1.4.0 (lolin_d32_pro)',
      },
      controllers: [
        {
          controllerId: '00:00:00:00:00:00',
          stage: FwStage.Finalizing,
          bytesSent: 1000,
          totalBytes: 1000,
          detail: '',
          pendingDetail: 'awaiting_post_reboot_version',
        },
        {
          controllerId: '11:22:33:44:55:66',
          stage: FwStage.VersionConfirmed,
          bytesSent: 1000,
          totalBytes: 1000,
          detail: '',
          finalVersion: '1.4.0',
        },
      ],
      startedAt: '2026-05-28T15:00:00Z',
      // endedAt deliberately undefined — Finalizing keeps the deploy open
    };
    const snapshot = decideLateJoinSnapshot(job);
    expect(snapshot.kind).toBe('flashJobStarted');
    if (snapshot.kind === 'flashJobStarted') {
      expect(snapshot.data).toBe(job);
    }
  });
});
