// ChunkStreamer — sliding-window FW_CHUNK transport over a SerialBus.
//
// Task 3 (this file's first cut): linear single-chunk skeleton only —
//   BEGIN → wait BEGIN_ACK → CHUNK → wait CHUNK_ACK → END → wait END_ACK
// with one unified ack subscriber and a single waiter per phase. No sliding
// window, no NAK handling, no per-chunk timeout, no watchdog, no abort
// listener — those layers land in Tasks 4–9 of the c.6b plan.
//
// `fs.promises.readFile` is the only fs touch in this module: TransferSpec
// gives us a path, and the streamer needs the bytes to chunk-and-send. Future
// tasks may switch to a streaming reader (chunk-by-chunk fsp.read at offsets)
// to bound memory for large firmware images, but the 1.2 MB ESP firmware fits
// comfortably in memory today and the simpler readFile is preferred while the
// state machine grows.
//
// Payload framing (base64, CRC-16, line-delimited GS/RS/US bytes) lives in
// MessageGenerator (c.1). This module never builds wire bytes directly — it
// passes typed payload objects through generateMessage and forwards the
// resulting string to bus.send.

import { promises as fsp } from 'fs';
import { v4 as uuid_v4 } from 'uuid';
import type {
  FwInboundAck,
  SerialBus,
  StreamObserver,
  TransferResult,
  TransferSpec,
  TransportConfig,
} from '../models/firmware/chunk_streamer.js';
import { TransferError } from '../models/firmware/chunk_streamer.js';
import type {
  FwChunk,
  FwTransferBegin,
  FwTransferEnd,
} from '../models/firmware/firmware_messages.js';
import { MessageGenerator } from '../serial/message_generator.js';
import { SerialMessageType } from '../serial/serial_message.js';

// Module-level defaults for the transport. Concrete numbers come from the
// design spec; the streamer merges any caller overrides on top.
export const TRANSPORT_DEFAULTS: TransportConfig = {
  chunkSizeBytes: 4096,
  windowSize: 16,
  ackTimeoutMs: 1500,
  transferTimeoutMs: 300_000,
  maxRetriesPerChunk: 3,
};

export interface ChunkStreamerOpts {
  bus: SerialBus;
  config?: Partial<TransportConfig>;
}

export interface ChunkStreamerRunOpts {
  // Reserved for Task 9 (AbortSignal cancellation). Accepted now so callers
  // wiring the streamer in c.6c don't need a signature change later.
  signal?: AbortSignal;
}

// Compact discriminator alias for the waiter machinery. Listing the kinds we
// actually wait on (BEGIN_ACK / CHUNK_ACK / END_ACK) keeps the inferred
// types tight and lets `Extract<FwInboundAck, ...>` resolve cleanly.
type WaitableKind = 'beginAck' | 'chunkAck' | 'transferEndAck';

// `reject` is reserved for Task 8+ — the watchdog (Task 8), AbortSignal
// listener (Task 9), and per-phase timeout paths (Tasks 10–11) will need
// to reject the in-flight waiter from outside the ack subscriber.
// Currently unused: the Task 3 skeleton only resolves on protocol-correct
// ack arrival and surfaces other failures via thrown TransferError.
interface Waiter<K extends WaitableKind> {
  kind: K;
  resolve: (ack: Extract<FwInboundAck, { kind: K }>) => void;
  reject: (err: Error) => void;
}

export class ChunkStreamer {
  private readonly bus: SerialBus;
  private readonly config: TransportConfig;
  private readonly messageGenerator = new MessageGenerator();

  constructor(opts: ChunkStreamerOpts) {
    this.bus = opts.bus;
    this.config = { ...TRANSPORT_DEFAULTS, ...(opts.config ?? {}) };
    // Defensive validation. The spread merge above correctly handles
    // `undefined` overrides (no `??` footgun where 0 falls back to default),
    // but a caller passing an explicit `0` or negative value would slip
    // through and produce nonsense at runtime — e.g. `Math.ceil(len / 0)`
    // returns Infinity and the chunk loop would never make progress.
    if (this.config.chunkSizeBytes <= 0) {
      throw new TypeError(`chunkSizeBytes must be > 0; got ${this.config.chunkSizeBytes}`);
    }
    if (this.config.windowSize <= 0) {
      throw new TypeError(`windowSize must be > 0; got ${this.config.windowSize}`);
    }
    if (this.config.ackTimeoutMs <= 0) {
      throw new TypeError(`ackTimeoutMs must be > 0; got ${this.config.ackTimeoutMs}`);
    }
    if (this.config.transferTimeoutMs <= 0) {
      throw new TypeError(`transferTimeoutMs must be > 0; got ${this.config.transferTimeoutMs}`);
    }
    if (this.config.maxRetriesPerChunk <= 0) {
      throw new TypeError(`maxRetriesPerChunk must be > 0; got ${this.config.maxRetriesPerChunk}`);
    }
  }

  async run(
    spec: TransferSpec,
    observer: StreamObserver,
    _opts?: ChunkStreamerRunOpts,
  ): Promise<TransferResult> {
    const startedAt = Date.now();
    const sourceBuffer = await fsp.readFile(spec.source.path);
    const totalChunks = Math.max(1, Math.ceil(sourceBuffer.length / this.config.chunkSizeBytes));

    // Single waiter slot — Task 3's linear pipeline only ever has one phase
    // pending at a time. Tasks 4+ will replace this with the in-flight Map
    // for the sliding window.
    let currentWaiter: Waiter<WaitableKind> | null = null;

    const unsubscribe = this.bus.subscribeFwAcks(spec.transferId, (ack) => {
      if (currentWaiter === null) return;
      if (ack.kind !== currentWaiter.kind) {
        // Skeleton: out-of-phase acks are ignored. Proper dispatch (NAK,
        // backpressure, multi-window CHUNK_ACK arrival) lands in Tasks 4–7.
        return;
      }
      const w = currentWaiter as Waiter<typeof ack.kind>;
      currentWaiter = null;
      w.resolve(ack as Extract<FwInboundAck, { kind: typeof ack.kind }>);
    });

    const waitFor = <K extends WaitableKind>(
      kind: K,
    ): Promise<Extract<FwInboundAck, { kind: K }>> =>
      new Promise<Extract<FwInboundAck, { kind: K }>>((resolve, reject) => {
        currentWaiter = { kind, resolve, reject } as Waiter<WaitableKind>;
      });

    try {
      // ---------- BEGIN ----------
      const beginPayload: FwTransferBegin = {
        transferId: spec.transferId,
        totalSize: sourceBuffer.length,
        sha256Hex: spec.source.sha256,
        chunkSize: this.config.chunkSizeBytes,
        targets: spec.targets,
      };
      const beginMsg = this.messageGenerator.generateMessage(
        SerialMessageType.FW_TRANSFER_BEGIN,
        uuid_v4(),
        beginPayload,
      );
      this.bus.send(beginMsg.msg, { kind: 'firmware' });
      const beginAck = await waitFor('beginAck');
      observer.onTransferBegun?.(beginAck);

      // ---------- CHUNK (single, skeleton-only) ----------
      // Multi-chunk loop replaces this in Task 4. For now we send seq=0 of
      // the whole buffer and wait for one CHUNK_ACK.
      const chunkBytes = sourceBuffer.subarray(0, this.config.chunkSizeBytes);
      const chunkPayload: FwChunk = {
        transferId: spec.transferId,
        seq: 0,
        payloadLen: chunkBytes.length,
        base64Bytes: chunkBytes.toString('base64'),
        // CRC-16 of the chunk bytes. Task 3 sends a placeholder so the wire
        // framing is well-formed; FakeSerialBus does not validate. A real CRC
        // helper lands alongside Task 4's chunking loop, where the master
        // actually checks it. Tracked in the c.6b design spec.
        //
        // The value is a non-numeric greppable marker (NOT '0000') so a
        // buggy CRC validator can't silently accept it as a valid all-zero
        // CRC — any well-formed validator will reject this at parse time
        // and a maintainer running against a real master will have an
        // obvious search target.
        crc16Hex: 'TODO_TASK_4_CRC16',
      };
      const chunkMsg = this.messageGenerator.generateMessage(
        SerialMessageType.FW_CHUNK,
        uuid_v4(),
        chunkPayload,
      );
      this.bus.send(chunkMsg.msg, { kind: 'firmware' });
      const chunkAck = await waitFor('chunkAck');
      observer.onChunkAck?.(chunkAck.highestContiguousSeq, sourceBuffer.length);

      // ---------- END ----------
      const endPayload: FwTransferEnd = {
        transferId: spec.transferId,
        totalChunks,
        finalSha256Hex: spec.source.sha256,
      };
      const endMsg = this.messageGenerator.generateMessage(
        SerialMessageType.FW_TRANSFER_END,
        uuid_v4(),
        endPayload,
      );
      this.bus.send(endMsg.msg, { kind: 'firmware' });
      const endAck = await waitFor('transferEndAck');
      observer.onTransferEnd?.(endAck);

      if (endAck.status === 'HASH_MISMATCH') {
        throw new TransferError(
          'hash_mismatch',
          spec.transferId,
          `master computed ${endAck.computedSha256Hex}`,
        );
      }
      if (endAck.status === 'IO_ERROR') {
        throw new TransferError('master_io_error', spec.transferId);
      }
      // status === 'OK' — falls through to the resolve below.

      return {
        transferId: spec.transferId,
        totalBytesSent: sourceBuffer.length,
        totalChunks,
        durationMs: Date.now() - startedAt,
        endAck,
      };
    } finally {
      // Cleanup invariants: this block extends as later tasks add state.
      // Task 4 will clear the in-flight Map; Task 6 the per-chunk timer
      // Map; Task 8 the transfer watchdog; Task 9 the AbortSignal listener.
      unsubscribe();
    }
  }
}
