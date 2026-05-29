import type { BaseWsMessage } from './baseWsMessage';

// Shared lock-state data shape. Held by the jobLock Pinia store and carried
// inside the LockStateChanged WebSocket message. Mirrors the API side's
// LockState (astros_api/src/models/networking/lock_responses.ts).
export interface LockState {
  locked: boolean;
  owner: string | null;
  since: string | null;
}

// WebSocket message broadcast on lock acquire/release transitions and sent as
// a one-time snapshot to newly-connected clients.
export interface LockStateChanged extends BaseWsMessage, LockState {}
