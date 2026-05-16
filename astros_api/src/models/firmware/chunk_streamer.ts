import type {
  FwBackpressure,
  FwChunkAck,
  FwChunkNak,
  FwChunkNakReason,
  FwTransferBeginAck,
  FwTransferEndAck,
} from './firmware_messages.js';
import type { FwDeployEvent } from './flash_orchestrator.js';

export interface TransferSpec {
  // Wire-protocol `uint8 transfer-id` per AstrOs.ESP `.docs/protocol.md`.
  // The firmware's OtaReceiver parses with `parseStrictU8` and rejects
  // anything outside `'0'..'255'` (including UUIDs, hex strings, leading
  // zeros). The type stays `string` for compatibility with the stub-master
  // / fake-bus test fixtures that key subscriptions by arbitrary id; the
  // production mint helper `mintTransferId` is the actual invariant gate.
  transferId: string;
  source: { path: string; sha256: string; sizeBytes: number };
  targets: string[];
}

/**
 * Producer-side helper for transfer-ids. Asserts the uint8 wire-protocol
 * range at the mint site so a mutation that drops the `& 0xff` mask in the
 * counter (or a future code path that stringifies a non-uint8 number)
 * trips a hard error here rather than reaching the firmware as a value
 * `parseStrictU8` would silently reject.
 */
export function mintTransferId(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n > 255) {
    throw new Error(`transferId out of uint8 range: ${n}`);
  }
  return String(n);
}

export interface StreamObserver {
  onTransferBegun?: (ack: FwTransferBeginAck) => void;
  onChunkAck?: (highestContiguousSeq: number, bytesSent: number) => void;
  // nextExpectedSeq is the seq the streamer is resuming from after this NAK.
  // A conformant master sets it to lastGoodSeq + 1 on a regular NAK and to
  // 0 on a first-chunk NAK (where lastGoodSeq is also 0). Observers should
  // NOT assert `nextExpectedSeq === lastGoodSeq + 1` as a structural
  // invariant — the streamer honors whatever the master sends (subject to
  // the `nextExpectedSeq >= totalChunks` bounds guard in
  // `handleChunkNak`), so a misbehaving master could in principle violate
  // it. Surfacing this value here lets observers distinguish "nothing
  // committed" (nextExpectedSeq=0) from "seq 0 was committed"
  // (nextExpectedSeq=1) without re-parsing protocol state.
  onChunkNak?: (lastGoodSeq: number, nextExpectedSeq: number, reason: FwChunkNakReason) => void;
  onRetry?: (seq: number, attempt: number) => void;
  onBackpressure?: (paused: boolean) => void;
  onTransferEnd?: (ack: FwTransferEndAck) => void;
}

export interface TransferResult {
  transferId: string;
  totalBytesSent: number;
  totalChunks: number;
  durationMs: number;
  endAck: FwTransferEndAck;
}

export type FwInboundAck =
  | ({ kind: 'beginAck' } & FwTransferBeginAck)
  | ({ kind: 'chunkAck' } & FwChunkAck)
  | ({ kind: 'chunkNak' } & FwChunkNak)
  | ({ kind: 'transferEndAck' } & FwTransferEndAck)
  | ({ kind: 'backpressure' } & FwBackpressure);

export interface SerialBus {
  // `kind` is a deliberate seam for c.6c's JobLock-aware drop policy.
  // c.6b's WorkerSerialBus adapter ignores it; c.6c will silently
  // discard `kind: 'normal'` sends when the lock is held.
  send(payload: string, opts: { kind: 'firmware' | 'normal' }): void;
  subscribeFwAcks(transferId: string, handler: (ack: FwInboundAck) => void): () => void;
  // Separate typed channel from `subscribeFwAcks`. Deploy-phase events
  // (FW_PROGRESS, FW_DEPLOY_DONE) flow during the deploy phase that
  // begins after the server emits FW_DEPLOY_BEGIN, so they are routed
  // to the c.6c.1 FlashJobOrchestrator — not to the upload-phase
  // ChunkStreamer. Keeping the channels split prevents broadening
  // FwInboundAck (the streamer's narrow union) and lets each consumer
  // see exactly the events it cares about.
  //
  // The orchestrator owns this subscription; the streamer never calls
  // it. Returns a disposer that removes the underlying listener — the
  // orchestrator must invoke the disposer on job teardown to avoid
  // leaking handlers across successive flash jobs.
  subscribeDeployEvents(transferId: string, handler: (event: FwDeployEvent) => void): () => void;
}

export type TransferErrorCode =
  | 'source_read_failed'
  | 'source_size_mismatch'
  | 'begin_timeout'
  | 'begin_rejected'
  | 'chunk_retry_exhausted'
  | 'flash_full'
  | 'transfer_timeout'
  | 'aborted'
  | 'end_timeout'
  | 'hash_mismatch'
  | 'master_io_error'
  | 'bus_send_failed';

export class TransferError extends Error {
  readonly code: TransferErrorCode;
  readonly transferId: string;
  readonly detail?: string;

  constructor(code: TransferErrorCode, transferId: string, detail?: string) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'TransferError';
    this.code = code;
    this.transferId = transferId;
    this.detail = detail;
  }
}

export interface TransportConfig {
  chunkSizeBytes: number;
  windowSize: number;
  ackTimeoutMs: number;
  transferTimeoutMs: number;
  maxRetriesPerChunk: number;
}
