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

// HTTP 423 body returned by the requireUnlocked middleware.
export interface LockedErrorResponse {
  error: 'flashJobActive';
  lockOwner: string | null;
  since: string | null;
}
