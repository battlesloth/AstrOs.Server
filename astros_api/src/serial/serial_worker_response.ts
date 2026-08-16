import { ControlModule } from 'src/models/index.js';
import type {
  FwTransferBeginAck,
  FwChunkAck,
  FwChunkNak,
  FwTransferEndAck,
  FwProgress,
  FwDeployDone,
  FwBackpressure,
} from 'src/models/firmware/firmware_messages.js';

export enum SerialWorkerResponseType {
  UNKNOWN,
  TIMEOUT,
  POLL,
  REGISTRATION_SYNC,
  CONFIG_SYNC,
  SCRIPT_DEPLOY,
  SCRIPT_RUN,
  SEND_SERIAL_MESSAGE,
  UPDATE_CLIENTS,

  // Firmware OTA inbound messages — see .docs/protocol.md § A.
  FW_TRANSFER_BEGIN_ACK,
  FW_CHUNK_ACK,
  FW_CHUNK_NAK,
  FW_TRANSFER_END_ACK,
  FW_PROGRESS,
  FW_DEPLOY_DONE,
  FW_BACKPRESSURE,

  // Appended after the FW block, never inserted: these numeric values cross
  // the postMessage boundary to the compiled dist/ worker, which can lag src/
  // under tsx dev runs or a stale build — renumbering would silently remap
  // every response type in that mismatch window.
  POLL_NAK,
  NO_OP,
}

export interface ISerialWorkerResponse extends Record<string, any> {
  type: SerialWorkerResponseType;
}

export interface PollResponse extends ISerialWorkerResponse {
  type: SerialWorkerResponseType;
  controller: ControlModule;
}

export interface RegistrationResponse extends ISerialWorkerResponse {
  type: SerialWorkerResponseType;
  success: boolean;
  registrations: Array<ControlModule>;
}

export interface ConfigSyncResponse extends ISerialWorkerResponse {
  type: SerialWorkerResponseType;
  success: boolean;
  controller: ControlModule;
}

export interface ScriptDeployResponse extends ISerialWorkerResponse {
  type: SerialWorkerResponseType;
  success: boolean;
  scriptId: string;
  controller: ControlModule;
}

export interface ScriptRunResponse extends ISerialWorkerResponse {
  type: SerialWorkerResponseType;
  success: boolean;
  scriptId: string;
  controller: ControlModule;
}

// ---------------------------------------------------------------------------
// Firmware OTA inbound responses. Each wraps the parsed typed payload from
// .docs/protocol.md § A so the dispatcher (c.6) can route by type.
//
// These interfaces deliberately do NOT extend ISerialWorkerResponse: that
// base carries `Record<string, any>` as an escape hatch for legacy `as`
// casts elsewhere in this file, and inheriting it would let `.payload`
// slip through as `any` even on the UnknownSerialResponse branch — defeating
// the whole point of the discriminated union. Each Fw*Response narrows
// `type` to a single literal so handlers can return `Fw*Response |
// UnknownSerialResponse` and force callers to discriminate before reading
// `payload`. They remain structurally compatible with ISerialWorkerResponse
// (a `type: SerialWorkerResponseType` field), so the eventual dispatcher in
// c.6 can accept either family.
// ---------------------------------------------------------------------------

// Marker response returned by every FW_* handler when the wire payload fails
// validation. No `payload` field — callers MUST discriminate against this
// case before reading payload from the success-shape sibling.
export interface UnknownSerialResponse {
  type: SerialWorkerResponseType.UNKNOWN;
}

export interface FwTransferBeginAckResponse {
  type: SerialWorkerResponseType.FW_TRANSFER_BEGIN_ACK;
  payload: FwTransferBeginAck;
}

export interface FwChunkAckResponse {
  type: SerialWorkerResponseType.FW_CHUNK_ACK;
  payload: FwChunkAck;
}

export interface FwChunkNakResponse {
  type: SerialWorkerResponseType.FW_CHUNK_NAK;
  payload: FwChunkNak;
}

export interface FwTransferEndAckResponse {
  type: SerialWorkerResponseType.FW_TRANSFER_END_ACK;
  payload: FwTransferEndAck;
}

export interface FwProgressResponse {
  type: SerialWorkerResponseType.FW_PROGRESS;
  payload: FwProgress;
}

export interface FwDeployDoneResponse {
  type: SerialWorkerResponseType.FW_DEPLOY_DONE;
  payload: FwDeployDone;
}

export interface FwBackpressureResponse {
  type: SerialWorkerResponseType.FW_BACKPRESSURE;
  payload: FwBackpressure;
}

// Master reported a padawan unreachable. Carries only what the POLL_NAK wire
// payload holds (mac{US}name — see AstrOs.ESP getPollNak); no ControlModule
// because fingerprint/version/variant are meaningless for a silent peer.
export interface PollNakResponse {
  type: SerialWorkerResponseType.POLL_NAK;
  controller: { address: string; name: string };
}

// Valid frame, deliberately no main-thread action (e.g. FORMAT_SD_ACK).
// Distinct from UnknownSerialResponse, which marks an invalid frame.
export interface NoOpSerialResponse {
  type: SerialWorkerResponseType.NO_OP;
}
