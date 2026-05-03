// ChunkStreamer — sliding-window FW_CHUNK transport over a SerialBus.
//
// Task 3 (skeleton): linear BEGIN → CHUNK(seq=0) → END pipeline with a single
// waiter per phase.
// Task 4: replaces the chunk-phase single waiter with a sliding-window state
// machine. State: an `inFlight` Map keyed by seq, plus `nextToSend` /
// `highestAcked` cursors. Window grows up to WINDOW_SIZE on each top-up;
// cumulative CHUNK_ACK semantics retire every entry with
// seq <= highestContiguousSeq in one shot. BEGIN-wait and END-wait keep
// the single-slot waiter — only one outstanding ack is possible there.
// Task 5 (this revision): wires FW_CHUNK_NAK into the phase-aware dispatcher.
// FLASH_FULL is unrecoverable — `handleChunkNak` rejects the chunk-phase
// awaiter via `rejectChunkPhase`, propagating a TransferError('flash_full')
// out to the outer try/catch/finally. CRC / SIZE / OUT_OF_ORDER trigger
// Go-Back-N: clear `inFlight`, set nextToSend = lastGoodSeq + 1, set
// highestAcked = lastGoodSeq, and let the existing top-up refill the window.
// No per-chunk timeout, no watchdog, no abort listener, no backpressure —
// those layers land in Tasks 6–9 of the c.6b plan.
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
  FwChunkAck,
  FwChunkNak,
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
    const lastSeq = totalChunks - 1;
    const { chunkSizeBytes, windowSize } = this.config;

    // ---- Sliding-window state (Task 4). Initialized eagerly so the `finally`
    // block can always clear `inFlight` regardless of which phase we error in.
    // `inFlight`: seq → bookkeeping for chunks sent but not yet cumulatively
    //   acked. Tasks 5–6 will read `sentAt`/`retries` for retry & NAK logic.
    // `nextToSend`: next seq to put on the wire when the window has room.
    // `highestAcked`: greatest cumulatively-acked seq, or -1 before any ACK.
    const inFlight = new Map<number, { sentAt: number; retries: number }>();
    let nextToSend = 0;
    let highestAcked = -1;

    // Single waiter slot — used by BEGIN-wait and END-wait phases only. The
    // chunk phase (Task 4+) drives off `inFlight` / `highestAcked` and is
    // released by `chunkPhaseDone`, not this slot.
    let currentWaiter: Waiter<WaitableKind> | null = null;

    // Resolves when `highestAcked === lastSeq`. The chunk-phase ack handler
    // calls `resolveChunkPhaseDone` after the cumulative ACK that completes
    // the transfer; the main loop awaits this before sending TRANSFER_END.
    // `rejectChunkPhase` lets the chunk-phase awaiter throw from outside the
    // `await chunkPhaseDone` — currently used by the FLASH_FULL NAK path
    // (Task 5) and reserved for the watchdog (Task 8) and AbortSignal
    // listener (Task 9).
    let resolveChunkPhaseDone: (() => void) | null = null;
    let rejectChunkPhase: ((err: Error) => void) | null = null;
    const chunkPhaseDone = new Promise<void>((resolve, reject) => {
      resolveChunkPhaseDone = resolve;
      rejectChunkPhase = reject;
    });

    const handleChunkAck = (ack: FwChunkAck): void => {
      // Capture the cursor BEFORE the monotonic update so we can detect
      // whether this ACK actually advanced progress. A duplicate / late
      // cumulative ACK (e.g. master NIC-level retransmit, or a stale ACK
      // arriving in the gap between resolveChunkPhaseDone firing and the
      // END-phase waiter being installed) leaves prevHighestAcked === the
      // post-update highestAcked, and we suppress the observer notification
      // — otherwise the UI would see a duplicate progress event with the
      // same (lastSeq, totalBytes) data and "complete twice."
      const prevHighestAcked = highestAcked;

      // Cumulative-ACK semantics: every in-flight entry with
      // seq <= highestContiguousSeq is retired in one shot. A single ACK can
      // therefore retire many chunks (e.g. one ACK closing out a full window).
      for (const seq of Array.from(inFlight.keys())) {
        if (seq <= ack.highestContiguousSeq) inFlight.delete(seq);
      }
      // Monotonic: out-of-order or duplicate older ACKs can't roll back.
      if (ack.highestContiguousSeq > highestAcked) {
        highestAcked = ack.highestContiguousSeq;
      }

      // Only notify the observer when the cursor actually advanced. Duplicate
      // / stale cumulative ACKs are silently absorbed.
      if (ack.highestContiguousSeq > prevHighestAcked) {
        const bytesSent = Math.min((highestAcked + 1) * chunkSizeBytes, sourceBuffer.length);
        observer.onChunkAck?.(ack.highestContiguousSeq, bytesSent);
      }

      if (highestAcked >= lastSeq) {
        // All chunks acked — release the chunk phase. Top-up is a no-op past
        // lastSeq, so we can skip it.
        resolveChunkPhaseDone?.();
        return;
      }
      topUpWindow();
    };

    const handleChunkNak = (nak: FwChunkNak): void => {
      // Observer fires before any state mutation so listeners see the NAK
      // even when FLASH_FULL is about to terminate the transfer. Symmetric
      // to handleChunkAck calling onChunkAck before the early return on
      // completion.
      observer.onChunkNak?.(nak.lastGoodSeq, nak.reasonCode);

      if (nak.reasonCode === 'FLASH_FULL') {
        // Master's flash is exhausted — there's no recovery path. Reject the
        // chunk-phase awaiter; the outer try/catch/finally propagates the
        // error and the finally block clears in-flight state and disposes
        // the subscriber.
        rejectChunkPhase?.(
          new TransferError(
            'flash_full',
            spec.transferId,
            `master refused chunk after seq=${nak.lastGoodSeq}: FLASH_FULL`,
          ),
        );
        return;
      }

      // CRC / SIZE / OUT_OF_ORDER → Go-Back-N. Wipe the in-flight window,
      // rewind cursors so the next top-up retransmits from lastGoodSeq + 1,
      // and let topUpWindow refill. The `inFlight.clear()` here makes the
      // finally-block's `inFlight.clear()` a no-op on the post-NAK happy
      // path, which is fine — clearing an empty Map is cheap.
      inFlight.clear();
      nextToSend = nak.lastGoodSeq + 1;
      highestAcked = nak.lastGoodSeq;
      topUpWindow();
    };

    const topUpWindow = (): void => {
      while (inFlight.size < windowSize && nextToSend <= lastSeq) {
        const seq = nextToSend++;
        // subarray() returns a zero-copy view — important for 300+ chunk
        // transfers where Buffer.from(slice(...)) would copy each chunk.
        const chunkBytes = sourceBuffer.subarray(
          seq * chunkSizeBytes,
          Math.min((seq + 1) * chunkSizeBytes, sourceBuffer.length),
        );
        const chunkPayload: FwChunk = {
          transferId: spec.transferId,
          seq,
          payloadLen: chunkBytes.length,
          base64Bytes: chunkBytes.toString('base64'),
          // CRC-16 of the chunk bytes. Task 3/4 send a placeholder so the wire
          // framing is well-formed; FakeSerialBus does not validate. A real
          // CRC helper is tracked separately and lands when the master starts
          // checking it.
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
        inFlight.set(seq, { sentAt: Date.now(), retries: 0 });
      }
    };

    const unsubscribe = this.bus.subscribeFwAcks(spec.transferId, (ack) => {
      // Phase-aware dispatch: the chunk phase routes chunkAck and chunkNak
      // into the sliding-window machine; BEGIN-wait / END-wait route their
      // ack-of-interest into the single-slot waiter.
      if (ack.kind === 'chunkAck' || ack.kind === 'chunkNak') {
        // Chunk-phase acks are handled directly. If we somehow receive one
        // outside the chunk phase (BEGIN-wait, post-END-wait), it's a
        // protocol oddity; ignoring it matches the Task 3 "out-of-phase ack"
        // policy. Task 7 (backpressure) will route 'backpressure' similarly.
        if (currentWaiter !== null) return;
        if (ack.kind === 'chunkAck') {
          handleChunkAck(ack);
        } else {
          handleChunkNak(ack);
        }
        return;
      }
      if (currentWaiter === null) return;
      if (ack.kind !== currentWaiter.kind) return;
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
        chunkSize: chunkSizeBytes,
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

      // ---------- CHUNK (sliding window) ----------
      // currentWaiter is null here — the chunk-phase dispatcher uses
      // inFlight/highestAcked instead. Initial fill kicks off the window;
      // each subsequent CHUNK_ACK arrival in handleChunkAck() retires
      // entries and tops the window back up.
      topUpWindow();
      await chunkPhaseDone;

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
      // Task 4 added: clear the in-flight Map. Task 6 will clear the
      // per-chunk timer Map; Task 8 the transfer watchdog; Task 9 the
      // AbortSignal listener.
      inFlight.clear();
      unsubscribe();
    }
  }
}
