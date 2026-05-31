import { TransmissionType } from '../enums.js';
import { BaseResponse } from './base_response.js';

// Animation-queue panic-stop state. A boolean is enough for v1 — no who/when
// metadata (cf. JobLock's owner/since).
export interface PanicState {
  inPanicStop: boolean;
}

// WebSocket broadcast payload. `type` is TransmissionType.panicState.
export interface PanicStateResponse extends BaseResponse, PanicState {}

// Single source of truth for the panicState WS payload — used both for change
// broadcasts (animationQueue.subscribe handler) and the on-connect snapshot
// sent to newly-connected clients. Mirrors buildLockStateResponse.
export function buildPanicStateResponse(state: PanicState): PanicStateResponse {
  return {
    type: TransmissionType.panicState,
    success: true,
    message: '',
    ...state,
  };
}
