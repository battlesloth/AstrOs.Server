import type { FwStage } from './firmware_messages.js';

interface BaseControllerFlashState {
  controllerId: string;
  bytesSent: number;
  totalBytes: number;
  // Required-with-empty-string-default rather than optional. Mirrors
  // the wire shape (FwProgress.detail is a required field). With
  // optional, an `undefined` value would cause `JSON.stringify` to
  // omit the property entirely from the WS payload — consumers would
  // see the field missing rather than as `""`. Required ensures
  // every payload carries `detail` with at least an empty string.
  detail: string;
}

export type ControllerFlashState =
  | (BaseControllerFlashState & { stage: FwStage.Queued })
  | (BaseControllerFlashState & { stage: FwStage.UploadingToMaster })
  | (BaseControllerFlashState & { stage: FwStage.Sending })
  | (BaseControllerFlashState & { stage: FwStage.Verifying })
  | (BaseControllerFlashState & { stage: FwStage.Flashing })
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
