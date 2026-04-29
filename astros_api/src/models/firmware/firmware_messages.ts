// Typed payload interfaces for the firmware OTA wire protocol.
// Mirrors the field layouts in .docs/protocol.md § A. The two copies of
// .docs/protocol.md (this repo + AstrOs.ESP) are the source of truth;
// any change here must be made in lockstep with both.

// ---------------------------------------------------------------------------
// Protocol numeric constants. Single source of truth for runtime range checks.
// ---------------------------------------------------------------------------

// Maximum sliding-window size on the serial transport (server↔master), per
// .docs/protocol.md "Shared values". FW_CHUNK_ACK.windowRemaining must lie in
// [0, FW_SERIAL_SLIDING_WINDOW]; larger values indicate a malformed frame.
export const FW_SERIAL_SLIDING_WINDOW = 16;

// ---------------------------------------------------------------------------
// Stage enum (shared with .docs/protocol.md "Stage enum"). Master emits these
// in FW_PROGRESS.stage; server forwards them to the UI.
// ---------------------------------------------------------------------------

export enum FwStage {
  Queued = 'QUEUED',
  UploadingToMaster = 'UPLOADING_TO_MASTER',
  Sending = 'SENDING',
  Verifying = 'VERIFYING',
  Rebooting = 'REBOOTING',
  VersionConfirmed = 'VERSION_CONFIRMED',
  Failed = 'FAILED',
}

// ---------------------------------------------------------------------------
// Server → master (outgoing). Consumed by MessageGenerator.
// ---------------------------------------------------------------------------

export interface FwTransferBegin {
  transferId: string;
  totalSize: number;
  sha256Hex: string; // 64 lowercase hex chars
  chunkSize: number; // decoded bytes per FW_CHUNK
  targets: string[]; // controller IDs; "master" included means self-flash last
}

export interface FwChunk {
  transferId: string;
  seq: number;
  payloadLen: number;
  base64Bytes: string;
  crc16Hex: string;
}

export interface FwTransferEnd {
  transferId: string;
  totalChunks: number;
  finalSha256Hex: string;
}

export interface FwDeployBegin {
  transferId: string;
  order: string[]; // ordered controller IDs; padawans first, master last
}

// ---------------------------------------------------------------------------
// Master → server (incoming). Produced by MessageHandler.
// ---------------------------------------------------------------------------

export interface FwTransferBeginAck {
  transferId: string;
  // "OK" or a rejection reason like "sd_full". Open-ended string per
  // protocol.md so future reasons can be added without enum churn.
  status: string;
}

export interface FwChunkAck {
  transferId: string;
  highestContiguousSeq: number;
  nextExpectedSeq: number;
  windowRemaining: number;
}

// Single source of truth for the FW_CHUNK_NAK reason codes. The runtime check
// in MessageHandler derives its lookup set from this same tuple, so adding a
// new reason here automatically extends both the type and the validator.
export const FW_CHUNK_NAK_REASONS = ['CRC', 'SIZE', 'OUT_OF_ORDER', 'FLASH_FULL'] as const;
export type FwChunkNakReason = (typeof FW_CHUNK_NAK_REASONS)[number];

export interface FwChunkNak {
  transferId: string;
  lastGoodSeq: number;
  reasonCode: FwChunkNakReason;
}

export const FW_TRANSFER_END_STATUSES = ['OK', 'HASH_MISMATCH', 'IO_ERROR'] as const;
export type FwTransferEndStatus = (typeof FW_TRANSFER_END_STATUSES)[number];

export interface FwTransferEndAck {
  transferId: string;
  status: FwTransferEndStatus;
  computedSha256Hex: string;
}

export interface FwProgress {
  transferId: string;
  controllerId: string;
  stage: FwStage;
  bytesSent: number;
  totalBytes: number;
  detail: string;
}

export interface FwDeployDoneResult {
  controllerId: string;
  outcome: 'OK' | 'FAILED';
  finalVersion: string;
  error: string; // empty string when outcome === 'OK'
}

export interface FwDeployDone {
  transferId: string;
  results: FwDeployDoneResult[];
}

export const FW_BACKPRESSURE_ACTIONS = ['PAUSE', 'RESUME'] as const;
export type FwBackpressureAction = (typeof FW_BACKPRESSURE_ACTIONS)[number];

export interface FwBackpressure {
  transferId: string;
  action: FwBackpressureAction;
  reason: string;
}
