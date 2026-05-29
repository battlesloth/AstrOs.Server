import { FwStage } from '../models/firmware/firmware_messages.js';
import type {
  ControllerFlashState,
  FlashJobState,
  JobLifecycle,
} from '../models/firmware/flash_job_state.js';

// Shared empty-set marker for terminal stages — typed so the Map's
// value side stays uniformly ReadonlySet<FwStage>.
const EMPTY_STAGE_SET: ReadonlySet<FwStage> = new Set<FwStage>();

// Single source of truth for the per-controller transition graph.
// Each entry maps a stage to the set of legal next stages. Non-terminal
// stages include themselves so within-stage progress updates (e.g.,
// bytesSent flowing during Sending as FW_PROGRESS messages arrive) are
// expressed as same-stage transitions. Terminal stages map to
// EMPTY_STAGE_SET — once a controller reaches them, it stays.
const LEGAL_NEXT_STAGES: ReadonlyMap<FwStage, ReadonlySet<FwStage>> = new Map<
  FwStage,
  ReadonlySet<FwStage>
>([
  [
    FwStage.Queued,
    new Set([FwStage.Queued, FwStage.UploadingToMaster, FwStage.Finalizing, FwStage.Failed]),
  ],
  [
    FwStage.UploadingToMaster,
    new Set([FwStage.UploadingToMaster, FwStage.Sending, FwStage.Finalizing, FwStage.Failed]),
  ],
  [
    FwStage.Sending,
    new Set([FwStage.Sending, FwStage.Verifying, FwStage.Finalizing, FwStage.Failed]),
  ],
  [
    FwStage.Verifying,
    new Set([FwStage.Verifying, FwStage.Flashing, FwStage.Finalizing, FwStage.Failed]),
  ],
  [
    FwStage.Flashing,
    new Set([FwStage.Flashing, FwStage.Rebooting, FwStage.Finalizing, FwStage.Failed]),
  ],
  [
    FwStage.Rebooting,
    new Set([FwStage.Rebooting, FwStage.VersionConfirmed, FwStage.Finalizing, FwStage.Failed]),
  ],
  [FwStage.Finalizing, new Set([FwStage.Finalizing, FwStage.VersionConfirmed, FwStage.Failed])],
  [FwStage.VersionConfirmed, EMPTY_STAGE_SET],
  [FwStage.Failed, EMPTY_STAGE_SET],
]);

// A stage is terminal exactly when it has no legal next stages. Derived from
// LEGAL_NEXT_STAGES (the EMPTY_STAGE_SET entries) rather than hardcoding the
// terminal stages, so adding/removing a terminal stage only requires editing
// the transition graph above — one source of truth. An unmapped stage (none
// today) is treated as non-terminal.
export function isControllerStageTerminal(stage: FwStage): boolean {
  return LEGAL_NEXT_STAGES.get(stage)?.size === 0;
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

interface FinalizingPayload {
  pendingDetail: string;
}

type NonTerminalStage =
  | FwStage.Queued
  | FwStage.UploadingToMaster
  | FwStage.Sending
  | FwStage.Verifying
  | FwStage.Flashing
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
  toStage: FwStage.Finalizing,
  payload: FinalizingPayload,
): ControllerFlashState;
export function transitionControllerState(
  current: ControllerFlashState,
  toStage: NonTerminalStage,
  payload?: InFlightTransitionPayload,
): ControllerFlashState;
export function transitionControllerState(
  current: ControllerFlashState,
  toStage: FwStage,
  payload?: InFlightTransitionPayload &
    Partial<VersionConfirmedPayload> &
    Partial<FailedPayload> &
    Partial<FinalizingPayload>,
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

  if (toStage === FwStage.Finalizing) {
    if (typeof payload?.pendingDetail !== 'string') {
      throw new Error(
        `flash-job transition to ${FwStage.Finalizing} requires pendingDetail in payload (controllerId=${current.controllerId})`,
      );
    }
    return { ...base, stage: FwStage.Finalizing, pendingDetail: payload.pendingDetail };
  }

  return { ...base, stage: toStage };
}

// Builds an emit-only terminal ControllerFlashState for a UI *preview* of a
// terminal status the master reported via FW_PROGRESS (VERSION_CONFIRMED /
// FAILED — see protocol.md §A). Unlike `transitionControllerState`, this does
// NO FSM-legality check: a preview is not a transition, so it must not gate on
// the controller's current stage and must never throw out of the serial-event
// dispatcher. It still produces a fully-formed variant (`finalVersion` / `error`
// sourced from the wire `detail`). The `never` switch forces a compile error if
// a future terminal stage is added without a preview shape here — so the union,
// not a hand-maintained branch in the orchestrator, drives correctness.
export function previewTerminalState(
  current: ControllerFlashState,
  stage: FwStage.VersionConfirmed | FwStage.Failed,
  detail: string,
): ControllerFlashState {
  const base = {
    controllerId: current.controllerId,
    bytesSent: current.bytesSent,
    totalBytes: current.totalBytes,
    detail,
  };
  switch (stage) {
    case FwStage.VersionConfirmed:
      return { ...base, stage: FwStage.VersionConfirmed, finalVersion: detail };
    case FwStage.Failed:
      return { ...base, stage: FwStage.Failed, error: detail };
    default: {
      const _exhaustive: never = stage;
      return _exhaustive;
    }
  }
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
