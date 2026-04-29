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
// ---------------------------------------------------------------------------

export interface FwTransferBeginAckResponse extends ISerialWorkerResponse {
  type: SerialWorkerResponseType;
  payload: FwTransferBeginAck;
}

export interface FwChunkAckResponse extends ISerialWorkerResponse {
  type: SerialWorkerResponseType;
  payload: FwChunkAck;
}

export interface FwChunkNakResponse extends ISerialWorkerResponse {
  type: SerialWorkerResponseType;
  payload: FwChunkNak;
}

export interface FwTransferEndAckResponse extends ISerialWorkerResponse {
  type: SerialWorkerResponseType;
  payload: FwTransferEndAck;
}

export interface FwProgressResponse extends ISerialWorkerResponse {
  type: SerialWorkerResponseType;
  payload: FwProgress;
}

export interface FwDeployDoneResponse extends ISerialWorkerResponse {
  type: SerialWorkerResponseType;
  payload: FwDeployDone;
}

export interface FwBackpressureResponse extends ISerialWorkerResponse {
  type: SerialWorkerResponseType;
  payload: FwBackpressure;
}
