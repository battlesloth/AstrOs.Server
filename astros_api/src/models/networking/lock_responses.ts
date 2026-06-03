import { TransmissionType } from '../enums.js';
import { BaseResponse } from './base_response.js';

// Internal state shape held by the JobLock and exposed to subscribers.
// `since` is an ISO-8601 timestamp string when locked, null otherwise.
export interface LockState {
  locked: boolean;
  owner: string | null;
  since: string | null;
}

// WebSocket broadcast payload. `type` will be TransmissionType.lockStateChanged.
export interface LockStateResponse extends BaseResponse, LockState {}

// HTTP 423 body returned by writeGuard when a flash job is active.
export interface LockedErrorResponse {
  error: 'flashJobActive';
  lockOwner: string | null;
  since: string | null;
}

// WebSocket frame sent to a single client when one of its inbound write-class
// messages was rejected because the lock is held. Mirrors LockedErrorResponse
// (so HTTP 423 and WS rejection bodies are consistent) plus a
// `rejectedMsgType` field so the client can tell the user which action was
// dropped.
export interface FlashJobActiveResponse extends BaseResponse, LockedErrorResponse {
  // type = TransmissionType.flashJobActive
  rejectedMsgType: string;
}

// Set of inbound WebSocket msgType values that count as "write-class" for
// the purposes of the JobLock guard. Single source of truth — extending the
// guard to a future write-class WS msgType is a one-line addition here.
export const WS_WRITE_CLASS_MESSAGE_TYPES: ReadonlySet<string> = new Set(['SERVO_TEST']);

// Single source of truth for the lockStateChanged WS payload, used both for
// transition broadcasts (jobLock.subscribe handler) and the on-connect snapshot
// sent to newly-connected clients.
export function buildLockStateResponse(state: LockState): LockStateResponse {
  return {
    type: TransmissionType.lockStateChanged,
    success: true,
    message: '',
    ...state,
  };
}

// Single source of truth for the flashJobActive WS rejection frame. Sent from
// rejectIfLocked alongside a lockStateChanged echo so the client can both
// reconcile lock state and surface the per-action rejection.
export function buildFlashJobActiveResponse(
  state: LockState,
  rejectedMsgType: string,
): FlashJobActiveResponse {
  return {
    type: TransmissionType.flashJobActive,
    success: false,
    message: `Write rejected: flash job active (${state.owner ?? 'unknown'})`,
    error: 'flashJobActive',
    lockOwner: state.owner,
    since: state.since,
    rejectedMsgType,
  };
}
