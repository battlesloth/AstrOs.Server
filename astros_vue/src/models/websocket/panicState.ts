import type { BaseWsMessage } from './baseWsMessage';

// Shared panic-state data shape. Held by the panicState Pinia store and carried
// inside the PanicStateChanged WebSocket message. Mirrors the API side's
// PanicState (astros_api/src/models/networking/panic_responses.ts).
export interface PanicState {
  inPanicStop: boolean;
}

// WebSocket message broadcast on panic stop/clear transitions and sent as a
// one-time snapshot to newly-connected clients.
export interface PanicStateChanged extends BaseWsMessage, PanicState {}
