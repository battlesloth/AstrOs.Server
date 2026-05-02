import type { FwStage } from './firmware_messages.js';

interface BaseControllerFlashState {
  controllerId: string;
  bytesSent: number;
  totalBytes: number;
  detail?: string;
}

export type ControllerFlashState =
  | (BaseControllerFlashState & { stage: FwStage.Queued })
  | (BaseControllerFlashState & { stage: FwStage.UploadingToMaster })
  | (BaseControllerFlashState & { stage: FwStage.Sending })
  | (BaseControllerFlashState & { stage: FwStage.Verifying })
  | (BaseControllerFlashState & { stage: FwStage.Rebooting })
  | (BaseControllerFlashState & { stage: FwStage.VersionConfirmed; finalVersion: string })
  | (BaseControllerFlashState & { stage: FwStage.Failed; error: string });

export interface FlashSource {
  kind: 'github' | 'upload';
  version: string;
  sha256: string;
  sizeBytes: number;
  // Operator-visible label — "astros-esp 1.4.0" for a release, the
  // original filename for an upload.
  displayName: string;
}

export interface FlashJobState {
  jobId: string;
  source: FlashSource;
  controllers: ControllerFlashState[];
  startedAt: string;
  endedAt?: string;
  // Job-wide abort (master serial disconnect, hash mismatch on master's
  // SD copy, etc.). Distinct from per-controller `Failed`, which is
  // local to one controller — others can still complete.
  abortReason?: string;
}

export type JobLifecycle = 'pending' | 'in_flight' | 'done' | 'failed';
