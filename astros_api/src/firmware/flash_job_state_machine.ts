import { FwStage } from '../models/firmware/firmware_messages.js';
import type {
  ControllerFlashState,
  FlashJobState,
  JobLifecycle,
} from '../models/firmware/flash_job_state.js';

// Single source of truth for the per-controller transition graph.
// Each entry maps a stage to the set of legal next stages. Non-terminal
// stages include themselves so within-stage progress updates (e.g.,
// bytesSent flowing during Sending as FW_PROGRESS messages arrive) are
// expressed as same-stage transitions. Terminal stages map to empty
// sets — once a controller reaches them, it stays.
const LEGAL_NEXT_STAGES: ReadonlyMap<FwStage, ReadonlySet<FwStage>> = new Map<
  FwStage,
  ReadonlySet<FwStage>
>([
  [FwStage.Queued, new Set([FwStage.Queued, FwStage.UploadingToMaster, FwStage.Failed])],
  [
    FwStage.UploadingToMaster,
    new Set([FwStage.UploadingToMaster, FwStage.Sending, FwStage.Failed]),
  ],
  [FwStage.Sending, new Set([FwStage.Sending, FwStage.Verifying, FwStage.Failed])],
  [FwStage.Verifying, new Set([FwStage.Verifying, FwStage.Rebooting, FwStage.Failed])],
  [FwStage.Rebooting, new Set([FwStage.Rebooting, FwStage.VersionConfirmed, FwStage.Failed])],
  [FwStage.VersionConfirmed, new Set()],
  [FwStage.Failed, new Set()],
]);

export function isControllerStageTerminal(stage: FwStage): boolean {
  return stage === FwStage.VersionConfirmed || stage === FwStage.Failed;
}

interface InFlightTransitionPayload {
  bytesSent?: number;
  totalBytes?: number;
  detail?: string;
}

interface VersionConfirmedPayload {
  finalVersion: string;
}

interface FailedPayload {
  error: string;
}

type NonTerminalStage =
  | FwStage.Queued
  | FwStage.UploadingToMaster
  | FwStage.Sending
  | FwStage.Verifying
  | FwStage.Rebooting;

// Overloaded so the type system enforces stage-specific payloads at the
// call site. Runtime defense covers two specific things: (a) stage
// legality (the LEGAL_NEXT_STAGES lookup, including the non-terminal
// self-edges that allow successive FW_PROGRESS messages within a
// stage), and (b) required terminal-state fields (`finalVersion` for
// VersionConfirmed, `error` for Failed) — a type-bypassing caller
// still can't construct an invalid terminal state. In-flight field
// shapes (numeric range on bytesSent / totalBytes, string-ness of
// detail) are TypeScript-only; a caller that bypasses the types with
// garbage values would propagate them, but the FSM transition rules
// themselves still hold. Always returns a new object — the input
// state is never mutated, including for same-stage no-payload calls.
export function transitionControllerState(
  current: ControllerFlashState,
  toStage: FwStage.VersionConfirmed,
  payload: VersionConfirmedPayload,
): ControllerFlashState;
export function transitionControllerState(
  current: ControllerFlashState,
  toStage: FwStage.Failed,
  payload: FailedPayload,
): ControllerFlashState;
export function transitionControllerState(
  current: ControllerFlashState,
  toStage: NonTerminalStage,
  payload?: InFlightTransitionPayload,
): ControllerFlashState;
export function transitionControllerState(
  current: ControllerFlashState,
  toStage: FwStage,
  payload?: InFlightTransitionPayload & Partial<VersionConfirmedPayload> & Partial<FailedPayload>,
): ControllerFlashState {
  if (!LEGAL_NEXT_STAGES.get(current.stage)?.has(toStage)) {
    throw new Error(
      `illegal flash-job transition: ${current.stage} → ${toStage} (controllerId=${current.controllerId})`,
    );
  }

  const base = {
    controllerId: current.controllerId,
    bytesSent: payload?.bytesSent ?? current.bytesSent,
    totalBytes: payload?.totalBytes ?? current.totalBytes,
    detail: payload?.detail ?? current.detail,
  };

  if (toStage === FwStage.VersionConfirmed) {
    if (typeof payload?.finalVersion !== 'string') {
      throw new Error(
        `flash-job transition to ${FwStage.VersionConfirmed} requires finalVersion in payload (controllerId=${current.controllerId})`,
      );
    }
    return { ...base, stage: FwStage.VersionConfirmed, finalVersion: payload.finalVersion };
  }

  if (toStage === FwStage.Failed) {
    if (typeof payload?.error !== 'string') {
      throw new Error(
        `flash-job transition to ${FwStage.Failed} requires error in payload (controllerId=${current.controllerId})`,
      );
    }
    return { ...base, stage: FwStage.Failed, error: payload.error };
  }

  return { ...base, stage: toStage };
}

export function deriveJobLifecycle(state: FlashJobState): JobLifecycle {
  if (state.abortReason !== undefined) return 'failed';
  // Empty controllers array is degenerate — the orchestrator shouldn't
  // produce a job with no targets. Returning 'done' keeps the function
  // total; a stricter check belongs at the orchestrator layer.
  if (state.controllers.length === 0) return 'done';
  if (state.controllers.every((c) => c.stage === FwStage.Queued)) return 'pending';
  if (state.controllers.every((c) => isControllerStageTerminal(c.stage))) return 'done';
  return 'in_flight';
}
