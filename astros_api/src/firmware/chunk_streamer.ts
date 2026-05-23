// ChunkStreamer — sliding-window FW_CHUNK transport over a SerialBus.
//
// One transfer drives `BEGIN → chunk loop → END`:
//   - sliding window of `windowSize` chunks in flight, retired by
//     cumulative FW_CHUNK_ACK (production wiring overrides to
//     `windowSize: 1` for stop-and-wait — see `DEFAULT_STREAMER_CONFIG`)
//   - FW_CHUNK_NAK with FLASH_FULL is terminal; CRC / SIZE / OUT_OF_ORDER
//     trigger Go-Back-N from `nak.nextExpectedSeq` (NOT `lastGoodSeq + 1`
//     — that breaks on first-chunk NAK; see handleChunkNak for details)
//   - per-chunk ack timer with `maxRetriesPerChunk` budget; whole-transfer
//     watchdog as a second-level safety net
//   - FW_BACKPRESSURE PAUSE halts new sends but in-flight ACKs still drain;
//     PAUSEd timeouts increment the retry budget but don't resend
//   - AbortSignal cancellation rejects whatever phase is current (BEGIN-wait,
//     chunk-streaming, END-wait)
//
// `chunkPhaseActive` is the dispatcher's gate for routing chunkAck/chunkNak/
// backpressure into the sliding-window machine — `currentWaiter === null`
// alone is not enough (it's also true in the synchronous setup window before
// BEGIN-wait, between BEGIN_ACK and the chunk loop, and between
// `chunkPhaseDone` resolving and the END-wait Promise constructing).
//
// Wire-payload encoding split:
//   - Framing (line-delimited GS/RS/US bytes) lives in MessageGenerator
//   - Bytes-level encoding (base64 of chunk slice, CRC-16/CCITT-FALSE) is
//     the streamer's responsibility. CRC is computed over the decoded
//     chunk bytes via `crc16CcittFalseHex` and emitted as 4 lowercase hex
//     chars; the firmware's `parseHex16` requires exactly that shape.
//
// `fs.promises.readFile` is the only fs touch — `TransferSpec.source.path`
// resolves to a Buffer at run() entry. 1.2 MB ESP firmware fits in memory;
// streaming-from-disk per chunk would complicate Go-Back-N (file-handle
// seek-back) without bounded benefit.
//
// All cleanup (subscriber dispose, chunk-timer drain, watchdog clear,
// abort-listener removal, inFlight + chunkPhaseActive reset) runs in the
// outer `finally` regardless of which path throws. The "Cleanup invariants
// verification" describe block in `chunk_streamer.test.ts` pins this.

import crypto from 'crypto';
import { promises as fsp } from 'fs';
import { v4 as uuid_v4 } from 'uuid';
import { logger } from '../logger.js';
import { crc16CcittFalseHex } from '../utility/crc16.js';
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
  FwBackpressure,
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
//
// `ackTimeoutMs` is sized for the worst-case round trip when the sliding
// window is full: the timer is armed at `bus.send` return, but bytes then
// sit in the worker IPC + Node SerialPort write queue + kernel TTY buffer
// before reaching the UART. At 115200 baud a ~5.5 KB FW_CHUNK takes
// ~480 ms on the wire, so a windowSize=16 fill puts the last chunk
// ~7.2 s behind its timer-arm time. 15 000 ms gives ~2× margin over that
// bound. If `windowSize` or the link baud changes materially, recompute.
//
// NOTE: production wiring overrides `windowSize` to 1 (stop-and-wait) at
// `defaultStreamerFactory` in `flash_orchestrator.ts` — see the comment
// there for why the current AstrOs master+UART deployment doesn't benefit
// from a wider window. These defaults stay tuned for the general
// sliding-window case so the streamer's tests (which exercise window > 1
// behavior) keep working without per-test overrides.
export const TRANSPORT_DEFAULTS: TransportConfig = {
  chunkSizeBytes: 4096,
  windowSize: 16,
  ackTimeoutMs: 15_000,
  transferTimeoutMs: 300_000,
  maxRetriesPerChunk: 5,
};

export interface ChunkStreamerOpts {
  bus: SerialBus;
  config?: Partial<TransportConfig>;
}

export interface ChunkStreamerRunOpts {
  // The orchestrator aborts this signal on panic-stop / job-cancel.
  // An abort during any phase (BEGIN-wait, chunk-streaming, END-wait)
  // rejects `run()` with TransferError('aborted', ...). A signal already
  // aborted at entry rejects immediately, before BEGIN is sent.
  signal?: AbortSignal;
}

// Compact discriminator alias for the waiter machinery. `waitFor` is only
// ever called with these two phases — chunk-phase acks go through the
// separate `chunkPhaseActive` machine (the block comment on currentWaiter
// below explains why). Keeping the union narrow lets `Extract<FwInboundAck,
// ...>` resolve cleanly and stops a future caller from mistakenly using
// the single-slot waiter for chunk acks.
type WaitableKind = 'beginAck' | 'transferEndAck';

// `reject` is the external-reject path for the single-slot waiter used
// by BEGIN-wait and END-wait. `rejectRun` reaches into `currentWaiter.reject`
// when abort fires during BEGIN-wait or END-wait; the per-phase timeout
// paths (begin_timeout / end_timeout) reach in directly.
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
    opts?: ChunkStreamerRunOpts,
  ): Promise<TransferResult> {
    const startedAt = Date.now();
    // Wrap fs read so any fs error surfaces as TransferError with a stable
    // code rather than a bare NodeJS.ErrnoException. The throw happens
    // before any subscriber is installed or any timer is armed, so no
    // cleanup is required at this point — the throw propagates out of
    // `run()` to the caller's `.catch`. We still keep the wrap inside
    // run() (not at construction) so each `run()` call gets fresh error
    // routing and the streamer remains reusable across retries that
    // re-read the source.
    //
    // If a future change adds resource allocation above this readFile,
    // either defer the allocation until after the readFile + size-mismatch
    // checks succeed, OR move both checks inside the outer try block so
    // the allocation gets torn down on a pre-subscribe throw.
    let sourceBuffer: Buffer;
    try {
      sourceBuffer = await fsp.readFile(spec.source.path);
    } catch (err) {
      const errnoCode = (err as NodeJS.ErrnoException).code;
      const message = err instanceof Error ? err.message : String(err);
      const detail = errnoCode
        ? `failed to read source ${spec.source.path}: ${message} (${errnoCode})`
        : `failed to read source ${spec.source.path}: ${message}`;
      throw new TransferError('source_read_failed', spec.transferId, detail);
    }
    // Validate that the on-disk artifact matches the metadata the
    // orchestrator was given (c.4's CachedAsset manifest, c.5's
    // StoredUpload metadata). A mismatch means upstream state has
    // drifted — cache file truncated/corrupted between manifest write
    // and our read, upload metadata stale after overwrite, partial
    // download. Surfacing this here as a fast-fail is much cheaper
    // than letting the master discover it via HASH_MISMATCH at END_ACK
    // time after the entire file is on the wire. Distinct from
    // hash_mismatch (which is master-side computation) so the
    // orchestrator can route the two failure modes to different
    // remediations: size_mismatch → re-cache or re-prompt upload;
    // hash_mismatch → retry transfer (transient) or re-cache.
    //
    // Same pre-subscribe path as source_read_failed: the throw
    // propagates out of run() with no cleanup required because no
    // subscriber, timer, or listener has been allocated yet.
    if (sourceBuffer.length !== spec.source.sizeBytes) {
      throw new TransferError(
        'source_size_mismatch',
        spec.transferId,
        `source size mismatch for ${spec.source.path}: expected ${spec.source.sizeBytes} bytes, read ${sourceBuffer.length}`,
      );
    }
    // Diagnostic: re-hash sourceBuffer and compare to spec.source.sha256.
    // If they diverge, the on-disk .bin was modified between cache.fetch()
    // and this readFile — proves a cache-sha-drift bug rather than a
    // wire-layer fault when the master later reports HASH_MISMATCH.
    {
      const reHash = crypto.createHash('sha256').update(sourceBuffer).digest('hex');
      if (reHash !== spec.source.sha256) {
        logger.warn(
          `cache-sha-drift transferId=${spec.transferId} path=${spec.source.path} sizeBytes=${spec.source.sizeBytes} specSha=${spec.source.sha256} reHash=${reHash}`,
        );
      }
    }
    const totalChunks = Math.max(1, Math.ceil(sourceBuffer.length / this.config.chunkSizeBytes));
    const lastSeq = totalChunks - 1;
    const { chunkSizeBytes, windowSize } = this.config;

    // Sliding-window state. `inFlight`: seq → bookkeeping for chunks sent
    // but not yet cumulatively acked (sentAt/retries used by retry and NAK
    // logic). `nextToSend`: next seq to put on the wire when the window has
    // room. `highestAcked`: greatest cumulatively-acked seq, or -1 before
    // any ACK. Initialized eagerly so the `finally` block can always clear
    // `inFlight` regardless of which phase we error in.
    const inFlight = new Map<number, { sentAt: number; retries: number }>();
    let nextToSend = 0;
    let highestAcked = -1;

    // Per-chunk ack timers — parallel structure to `inFlight`, keyed by the
    // same seq. The cumulative-ACK retire path clears per retired seq; the
    // NAK Go-Back-N path clears all timers in lockstep with `inFlight.clear()`;
    // the `finally` block drains any leftover timers so a rejected run
    // doesn't leak a setTimeout past return. `ackTimeoutMs` and
    // `maxRetriesPerChunk` are hoisted into locals for timer callbacks.
    const chunkTimers = new Map<number, NodeJS.Timeout>();
    const { ackTimeoutMs, maxRetriesPerChunk } = this.config;

    // Whole-transfer watchdog — single setTimeout (not a Map; exactly one
    // per run). Armed on entry to the chunk-streaming phase, cleared on the
    // success path AND in `finally`. Both clears are intentional: the
    // success-path clear ensures no late fire after resolve(), the finally
    // clear handles every rejection path. `clearTransferWatchdog` is
    // idempotent (null-guarded) so running both on the success path is safe.
    let transferWatchdogTimer: NodeJS.Timeout | null = null;

    // Backpressure state — the master is assumed willing to receive until
    // it explicitly says otherwise via FW_BACKPRESSURE { action: 'PAUSE' }.
    // While paused:
    //   - `topUpWindow` no-ops (no new chunks placed on the wire); in-flight
    //     count can only shrink, never grow.
    //   - cumulative ACKs continue retiring entries.
    //   - per-chunk timers still fire and still count toward
    //     maxRetriesPerChunk, but their resend is suppressed (see
    //     onChunkTimeout). The retry budget therefore acts as a watchdog
    //     on a master that PAUSEs and never RESUMEs.
    // RESUME clears the flag and calls topUpWindow once to refill from
    // `nextToSend`.
    let backpressurePaused = false;

    // Single waiter slot — used by BEGIN-wait and END-wait phases only. The
    // chunk phase drives off `inFlight` / `highestAcked` and is released
    // by `chunkPhaseDone`, not this slot.
    let currentWaiter: Waiter<WaitableKind> | null = null;

    // Explicit chunk-phase gate. Set true ONLY after FW_TRANSFER_BEGIN_ACK
    // arrives with status='OK', cleared before END-wait begins (and again
    // in `finally` as a defensive belt). The dispatcher uses this — not
    // `currentWaiter === null` — to gate chunkAck/chunkNak/backpressure
    // routing into the sliding-window machine.
    //
    // Why a separate flag: `currentWaiter === null` is true in three
    // narrow windows where we are NOT in the chunk phase:
    //   1. Between subscribeFwAcks() and the BEGIN-wait Promise being
    //      constructed (purely synchronous setup window in run()).
    //   2. After BEGIN_ACK arrives and the waiter resolves, before
    //      topUpWindow() is called.
    //   3. After `await chunkPhaseDone` resolves (success path), before
    //      the END-wait Promise is constructed.
    // A stale chunkAck (e.g. from a master that's still sending acks for
    // a previous transferId, or from an out-of-protocol race) arriving in
    // any of those windows would mutate `highestAcked` / `inFlight` and
    // could even fire `resolveChunkPhaseDone()` if its claimed
    // `highestContiguousSeq >= lastSeq` — the streamer would skip the
    // chunk phase entirely and send END after BEGIN with no chunks on
    // the wire. The explicit phase flag closes those windows.
    let chunkPhaseActive = false;

    // Resolves when `highestAcked === lastSeq`. The chunk-phase ack handler
    // calls `resolveChunkPhaseDone` after the cumulative ACK that completes
    // the transfer; the main loop awaits this before sending TRANSFER_END.
    // `rejectChunkPhase` lets the chunk-phase awaiter throw from outside the
    // `await chunkPhaseDone` — used by the FLASH_FULL NAK path, the
    // whole-transfer watchdog, and the AbortSignal listener (via `rejectRun`).
    //
    // Constructed eagerly at the top of run() — BEFORE the BEGIN-wait await
    // — so the abort listener registered immediately after can safely
    // delegate to rejectChunkPhase even if abort fires before the chunk
    // phase has begun. (Reaching into `rejectChunkPhase` during BEGIN-wait
    // is a no-op rejection — nothing is awaiting `chunkPhaseDone` yet — but
    // the construction order eliminates a TDZ-style "rejectChunkPhase is
    // null" race the lazy form would have introduced.)
    //
    // First-error-wins semantics rely on the Promise spec: the underlying
    // `reject` function latches the first call and silently drops every
    // subsequent reject/resolve attempt. Two real cases this protects:
    //   1. Watchdog fires AND abort fires in the same microtask. Whichever
    //      `rejectChunkPhase(err)` lands first sets the rejection reason;
    //      the second is dropped. Operators see one cause, not a confusing
    //      pair, and the run still settles deterministically.
    //   2. A late cumulative-ACK arrives *after* a reject has already
    //      latched (e.g. the master's ACK for the final chunk lands in the
    //      same turn as our watchdog fires). `handleChunkAck` will call
    //      `resolveChunkPhaseDone()` on a promise that is already rejected;
    //      Promise spec guarantees this is a no-op, so the rejection wins
    //      and the success path never resumes. We rely on this rather than
    //      tracking phase state externally.
    let resolveChunkPhaseDone: (() => void) | null = null;
    let rejectChunkPhase: ((err: Error) => void) | null = null;
    const chunkPhaseDone = new Promise<void>((resolve, reject) => {
      resolveChunkPhaseDone = resolve;
      rejectChunkPhase = reject;
    });
    // Suppress UnhandledPromiseRejection if abort fires during BEGIN-wait /
    // END-wait: in those phases nothing is `await`ing `chunkPhaseDone`, so
    // a `rejectChunkPhase(err)` from `rejectRun` would otherwise surface as
    // an unhandled rejection on the next microtask. Attaching a no-op
    // catcher marks the promise as handled; the actual abort error is
    // surfaced via `currentWaiter.reject` in those phases (and via the
    // direct `await chunkPhaseDone` in the chunk phase).
    chunkPhaseDone.catch(() => {
      // intentionally empty — handler installed only to mark the promise
      // as handled; see comment above.
    });

    // Build the wire payload + send for a single seq. Used by both the
    // initial top-up loop and the retry path on per-chunk timeout. Centralizing
    // the FW_CHUNK build keeps the two call sites in lockstep — they must
    // agree on payload shape, message-id strategy, and bus.send 'firmware'
    // tagging so a future protocol tweak doesn't drift between them.
    const sendChunk = (seq: number): void => {
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
        // CRC-16/CCITT-FALSE over the DECODED chunk bytes (protocol-doc
        // serial scope: "over the decoded payload bytes" — not the base64
        // envelope). 4-char lowercase hex matches the firmware's
        // parseHex16 contract.
        crc16Hex: crc16CcittFalseHex(chunkBytes),
      };
      const chunkMsg = this.messageGenerator.generateMessage(
        SerialMessageType.FW_CHUNK,
        uuid_v4(),
        chunkPayload,
      );
      // Wrap bus.send so a Worker-channel / IPC failure surfaces as
      // TransferError('bus_send_failed', ...) instead of escaping uncaught.
      // The throw propagates to the caller — `topUpWindow` (synchronous
      // from inside run()) lets it bubble out via the outer
      // try/catch/finally. The resend path inside `onChunkTimeout` (a
      // setTimeout callback) catches and routes to `rejectChunkPhase` since
      // a throw from a timer callback would otherwise become an uncaught
      // exception at the Node runtime level.
      try {
        this.bus.send(chunkMsg.msg, { kind: 'firmware' });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new TransferError(
          'bus_send_failed',
          spec.transferId,
          `bus.send threw on FW_CHUNK seq=${seq}: ${message}`,
        );
      }
    };

    // The `if (existing) clearTimeout(existing)` pre-clear in armChunkTimer
    // is unreachable today — every call site either ran
    // `chunkTimers.delete(seq)` immediately before (onChunkTimeout deletes
    // at the top of its handler) or has just allocated a fresh seq with no
    // prior timer (topUpWindow). Kept as defense-in-depth so a future arm
    // site (e.g. a "rearm-on-NAK" optimization) cannot accidentally
    // double-arm.
    const armChunkTimer = (seq: number): void => {
      const existing = chunkTimers.get(seq);
      if (existing) clearTimeout(existing);
      const timer = setTimeout(() => onChunkTimeout(seq), ackTimeoutMs);
      chunkTimers.set(seq, timer);
    };

    const clearChunkTimer = (seq: number): void => {
      const timer = chunkTimers.get(seq);
      if (timer) {
        clearTimeout(timer);
        chunkTimers.delete(seq);
      }
    };

    // `armTransferWatchdog` is called exactly once per run — post-BEGIN_ACK,
    // on entry to the chunk-streaming phase — so the `if
    // (transferWatchdogTimer)` pre-clear is unreachable today. Kept as
    // defense-in-depth against a future second arm site (e.g. resetting
    // the watchdog on progress milestones so an under-budget-but-slow
    // master extends rather than aborts the run). `clearTransferWatchdog`
    // is idempotent (null check) so the success-path call AND the
    // `finally` cleanup call can safely both run on a happy-path resolution.
    const armTransferWatchdog = (): void => {
      if (transferWatchdogTimer) clearTimeout(transferWatchdogTimer);
      transferWatchdogTimer = setTimeout(() => {
        rejectChunkPhase?.(
          new TransferError(
            'transfer_timeout',
            spec.transferId,
            `transfer exceeded ${this.config.transferTimeoutMs}ms watchdog`,
          ),
        );
      }, this.config.transferTimeoutMs);
    };

    const clearTransferWatchdog = (): void => {
      if (transferWatchdogTimer) {
        clearTimeout(transferWatchdogTimer);
        transferWatchdogTimer = null;
      }
    };

    const onChunkTimeout = (seq: number): void => {
      // The timer just fired — its ID is now garbage. Remove it from
      // chunkTimers immediately so the forward invariant
      //   chunkTimers.has(seq) ⇒ inFlight.has(seq) AND its timer is pending
      // holds for any future reader (e.g. observability metrics that read
      // chunkTimers as the "actively timed-out-able" set). The converse
      // direction (inFlight ⇒ chunkTimers) is NOT maintained on the
      // exhausted-retry path below — `chunkTimers.delete(seq)` runs here,
      // but the matching `inFlight` entry persists until the outer
      // `finally` clears it. The non-exhausted paths either re-arm the
      // timer (restoring the entry within the same synchronous turn) or
      // are interrupted by `rejectChunkPhase`, in which case the `finally`
      // drains both maps in lockstep. Holding only the forward direction
      // tight is enough — readers only ever ask "do I have an active
      // timer for seq N?", never "do I have an in-flight chunk for every
      // active timer?"
      chunkTimers.delete(seq);

      const entry = inFlight.get(seq);
      if (!entry) {
        // Defense-in-depth: a timer whose callback was already pulled
        // from the runtime's timer queue can't be retroactively
        // unscheduled by a sibling clearTimeout. Real cases:
        //   - vi.advanceTimersByTimeAsync fires multiple armed timers
        //     in one batch, and a cumulative ACK inside one callback
        //     retires others whose timers are already pending execution
        //   - post-NAK Go-Back-N drains inFlight + chunkTimers, but a
        //     timer already in the about-to-fire queue still fires
        // In both cases inFlight.get(seq) returns undefined; no-op.
        return;
      }

      // retries counts attempts INCLUDING the one that just timed out.
      // When retries reaches maxRetriesPerChunk, we've spent our budget;
      // reject instead of resending one more time (so maxRetriesPerChunk
      // = 3 means 2 resends + 1 reject, not 3 resends).
      entry.retries += 1;

      if (entry.retries >= maxRetriesPerChunk) {
        // Exhausted — reject the chunk-phase awaiter. The outer try/finally
        // propagates the error and the finally block drains chunkTimers,
        // disposes the subscriber, and clears inFlight.
        rejectChunkPhase?.(
          new TransferError(
            'chunk_retry_exhausted',
            spec.transferId,
            `seq=${seq} exhausted ${maxRetriesPerChunk} retries`,
          ),
        );
        return;
      }

      // Notify the observer BEFORE the resend so listeners see the retry
      // event in causal order with the wire send that follows it.
      observer.onRetry?.(seq, entry.retries);

      if (backpressurePaused) {
        // Master told us to PAUSE — re-sending now would overflow its
        // receive buffer with a chunk it has already buffered. We DO let
        // the retry counter increment (above) so a master that PAUSEs
        // and never RESUMEs eventually exhausts the chunk-retry budget
        // and surfaces as `chunk_retry_exhausted` rather than hanging
        // on the chunk-phase await indefinitely. Re-arm the timer so
        // the next tick of the budget can fire on schedule, and skip
        // the wire send.
        armChunkTimer(seq);
        return;
      }

      // Resend the same seq with a fresh FW_CHUNK payload + new timer. A
      // throw from sendChunk (bus.send threw — converted to
      // TransferError('bus_send_failed') inside the helper) cannot
      // propagate out of this setTimeout callback without becoming an
      // uncaughtException. Catch and route to rejectChunkPhase so the
      // chunk-phase awaiter rejects with the right code; the outer
      // try/finally then runs cleanup. Re-arming the timer is also
      // skipped — the run is over.
      try {
        sendChunk(seq);
      } catch (err) {
        rejectChunkPhase?.(err instanceof Error ? err : new Error(String(err)));
        return;
      }
      entry.sentAt = Date.now();
      armChunkTimer(seq);
    };

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
      // Each retired seq's pending ack timer is cleared in lockstep so a
      // retired chunk cannot fire a phantom retry after its ACK.
      for (const seq of Array.from(inFlight.keys())) {
        if (seq <= ack.highestContiguousSeq) {
          clearChunkTimer(seq);
          inFlight.delete(seq);
        }
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
      // Bounds guard: a malformed master that sends nextExpectedSeq beyond
      // the valid chunk range would otherwise set nextToSend out of range
      // and stall the streamer. Concretely: setting nextToSend = totalChunks
      // (or higher) makes topUpWindow's `nextToSend <= lastSeq` loop exit
      // immediately with no chunks sent. inFlight stays empty, so no ACK
      // ever arrives, so resolveChunkPhaseDone is never called. The only
      // exit is the whole-transfer watchdog firing with the opaque
      // `transfer_timeout` error. Fail loudly with `master_io_error` here
      // so the operator log says exactly what happened.
      //
      // Valid seq range is 0..=lastSeq (= 0..=totalChunks-1). Any
      // nextExpectedSeq >= totalChunks asks for a chunk that doesn't exist;
      // the `>=` (not `>`) catches the exact fencepost where
      // nextExpectedSeq == totalChunks would point one past the last chunk.
      //
      // FLASH_FULL is exempt — it ends the transfer either way.
      if (nak.nextExpectedSeq >= totalChunks && nak.reasonCode !== 'FLASH_FULL') {
        rejectChunkPhase?.(
          new TransferError(
            'master_io_error',
            spec.transferId,
            `FW_CHUNK_NAK nextExpectedSeq=${nak.nextExpectedSeq} is not a valid chunk (totalChunks=${totalChunks}, valid range 0..${totalChunks - 1} inclusive)`,
          ),
        );
        return;
      }

      // Stale-NAK guard: a NAK whose nextExpectedSeq is at or behind our
      // current highestAcked is from a retransmit-pair the streamer has
      // already moved past (master retransmitted the NAK; both arrive
      // after we already restarted). Both the observer call AND the Go-
      // Back-N mutation must be skipped: rewinding nextToSend / highest-
      // Acked here would roll back the monotonic cumulative-progress
      // cursor and fire a phantom onChunkNak to the UI for a NAK we've
      // already recovered from.
      //
      // Why `nextExpectedSeq <= highestAcked` and not `lastGoodSeq <
      // highestAcked`: nextExpectedSeq is now the authoritative resume
      // cursor (since the amendment that added it). The previous guard
      // form was vulnerable to the equality case after a first-chunk NAK
      // recovery — a duplicate first-chunk NAK arriving with
      // lastGoodSeq=0 when highestAcked had advanced to 0 (because the
      // post-NAK Go-Back-N refill of seq 0 was ACKed) would compute
      // `0 < 0 = false` and be processed as fresh, silently rewinding
      // the transfer. Using nextExpectedSeq closes that hole.
      //
      // FLASH_FULL is exempt — it's terminal regardless of when the master
      // sent it. A late-arriving FLASH_FULL still means flash is exhausted;
      // we must reject the transfer rather than silently swallow it.
      const isStale = nak.nextExpectedSeq <= highestAcked;
      if (isStale && nak.reasonCode !== 'FLASH_FULL') {
        return;
      }

      // Observer fires before any state mutation so listeners see the NAK
      // even when FLASH_FULL is about to terminate the transfer. Symmetric
      // to handleChunkAck calling onChunkAck before the early return on
      // completion. Pass both lastGoodSeq (diagnostic) and nextExpectedSeq
      // (operational — the seq we're actually resuming from) so the
      // observer can distinguish a first-chunk NAK (nothing yet committed,
      // nextExpectedSeq=0) from a NAK where seq 0 was previously committed
      // and a later chunk failed (nextExpectedSeq > 0).
      observer.onChunkNak?.(nak.lastGoodSeq, nak.nextExpectedSeq, nak.reasonCode);

      if (nak.reasonCode === 'FLASH_FULL') {
        // Master's flash is exhausted — there's no recovery path. Reject the
        // chunk-phase awaiter; the outer try/catch/finally propagates the
        // error and the finally block clears in-flight state and disposes
        // the subscriber.
        //
        // Both seq fields are surfaced in the detail string: a misbehaving
        // master could send FLASH_FULL with a bogus nextExpectedSeq (the
        // bounds guard above intentionally exempts FLASH_FULL because it's
        // terminal either way). Logging both fields means cross-firmware
        // debugging doesn't require a separate protocol trace.
        rejectChunkPhase?.(
          new TransferError(
            'flash_full',
            spec.transferId,
            `master refused chunk after seq=${nak.lastGoodSeq} (nextExpectedSeq=${nak.nextExpectedSeq}): FLASH_FULL`,
          ),
        );
        return;
      }

      // CRC / SIZE / OUT_OF_ORDER → Go-Back-N. Wipe the in-flight window,
      // rewind cursors to resume from `nak.nextExpectedSeq`, and let
      // topUpWindow refill. The `inFlight.clear()` here makes the
      // finally-block's `inFlight.clear()` a no-op on the post-NAK happy
      // path, which is fine — clearing an empty Map is cheap.
      //
      // We must use `nextExpectedSeq` and NOT `lastGoodSeq + 1`. On the
      // first-chunk NAK the master sends lastGoodSeq=0 (the only value
      // it can — unsigned, no chunk committed yet) and nextExpectedSeq=0.
      // Computing `lastGoodSeq + 1 = 1` would skip seq 0 entirely and
      // the transfer would deadlock — master keeps NAKing missing seq 0;
      // sender keeps sending from seq 1. The protocol amendment that
      // added `next-expected-seq` to FW_CHUNK_NAK exists precisely to
      // make this case unambiguous.
      //
      // highestAcked = nextExpectedSeq - 1 produces -1 on first-chunk
      // NAK, matching the initial value at the top of run() — semantically
      // "nothing committed yet."
      //
      // chunkTimers must be drained in lockstep with inFlight. Otherwise a
      // stale per-chunk timer for a now-discarded seq would fire after the
      // resend, find no inFlight entry (the early-return guard in
      // onChunkTimeout would catch it), but in the racy case where the new
      // top-up has already re-armed seq=N before the old timer fires, the
      // old fire would walk an entry that "looks valid" and double-count
      // its retries.
      for (const timer of chunkTimers.values()) clearTimeout(timer);
      chunkTimers.clear();
      inFlight.clear();
      nextToSend = nak.nextExpectedSeq;
      highestAcked = nak.nextExpectedSeq - 1;
      topUpWindow();
    };

    const handleBackpressure = (bp: FwBackpressure): void => {
      const newPausedState = bp.action === 'PAUSE';

      // Idempotent: a duplicate PAUSE / duplicate RESUME (master-side
      // retransmit, or a benign repeat) leaves the flag unchanged and
      // suppresses the observer notification. Without this guard,
      // observer.onBackpressure would fire twice for the same logical
      // state transition and the UI would see spurious paused/resumed
      // events. RESUME's `topUpWindow` call is also gated by this
      // guard — a duplicate RESUME would otherwise re-enter top-up
      // when there's nothing new to do.
      if (newPausedState === backpressurePaused) {
        return;
      }

      backpressurePaused = newPausedState;
      observer.onBackpressure?.(backpressurePaused);

      if (!backpressurePaused) {
        // Resumed — top up the window from current state. Cumulative ACKs
        // that arrived while paused have advanced highestAcked / shrunk
        // inFlight, so this top-up will refill from the post-PAUSE
        // nextToSend up to windowSize.
        topUpWindow();
      }
    };

    const topUpWindow = (): void => {
      while (!backpressurePaused && inFlight.size < windowSize && nextToSend <= lastSeq) {
        const seq = nextToSend++;
        // sendChunk converts bus.send throws to TransferError
        // ('bus_send_failed'). topUpWindow runs both synchronously from
        // run() (initial fill + post-BEGIN entry) AND from inside the
        // subscriber callback (handleChunkAck, handleChunkNak,
        // handleBackpressure). A throw from the subscriber-callback path
        // would propagate out to the bus dispatcher rather than rejecting
        // the chunk-phase awaiter, so we catch here and route through
        // rejectChunkPhase. From the synchronous-run path the outer
        // try/catch/finally would also catch it, but routing through
        // rejectChunkPhase keeps both paths uniform.
        try {
          sendChunk(seq);
        } catch (err) {
          rejectChunkPhase?.(err instanceof Error ? err : new Error(String(err)));
          return;
        }
        inFlight.set(seq, { sentAt: Date.now(), retries: 0 });
        armChunkTimer(seq);
      }
    };

    const unsubscribe = this.bus.subscribeFwAcks(spec.transferId, (ack) => {
      // Phase-aware dispatch: the chunk phase routes chunkAck, chunkNak,
      // and backpressure into the sliding-window machine; BEGIN-wait /
      // END-wait route their ack-of-interest into the single-slot waiter.
      if (ack.kind === 'chunkAck' || ack.kind === 'chunkNak' || ack.kind === 'backpressure') {
        // Gate on the explicit `chunkPhaseActive` flag, NOT
        // `currentWaiter === null`. The waiter-null check is true in
        // three windows where we are NOT in the chunk phase (see the
        // `chunkPhaseActive` declaration above for the enumeration); a
        // chunk-phase ack arriving in any of those windows would mutate
        // sliding-window state before the transfer is accepted. The
        // master only emits FW_BACKPRESSURE during chunk streaming, so
        // the same gating that protects chunkAck/chunkNak applies to
        // backpressure.
        if (!chunkPhaseActive) return;
        if (ack.kind === 'chunkAck') {
          handleChunkAck(ack);
        } else if (ack.kind === 'chunkNak') {
          handleChunkNak(ack);
        } else {
          handleBackpressure(ack);
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

    // `rejectRun` is the single entry point for external rejection; it
    // routes the error to whichever phase is currently active:
    //   - chunk-streaming phase: `rejectChunkPhase(err)` releases the
    //     `await chunkPhaseDone` (also used by FLASH_FULL NAK and the
    //     whole-transfer watchdog).
    //   - BEGIN-wait / END-wait: `currentWaiter.reject(err)` releases the
    //     single-slot waiter installed by `waitFor()`.
    // Both paths run unconditionally — the chunk-phase reject is a no-op
    // outside the chunk phase (its catcher is attached above) and the
    // waiter reject is a no-op when no waiter is active. Calling both
    // means we don't have to track which phase we're in from outside the
    // closures.
    const rejectRun = (err: Error): void => {
      rejectChunkPhase?.(err);
      if (currentWaiter !== null) {
        const w = currentWaiter;
        currentWaiter = null;
        w.reject(err);
      }
    };

    const abortListener = (): void => {
      const reason = opts?.signal?.reason;
      const reasonText =
        reason instanceof Error
          ? reason.message
          : typeof reason === 'string' && reason.length > 0
            ? reason
            : 'no reason';
      rejectRun(new TransferError('aborted', spec.transferId, `transfer aborted: ${reasonText}`));
    };
    // `{ once: true }` auto-removes the listener after fire, but we still
    // call `removeEventListener` explicitly in `finally` for the success
    // path (where abort never fires and the listener would otherwise
    // outlive the run, holding `spec` / closure refs alive against the
    // signal's lifetime).
    opts?.signal?.addEventListener('abort', abortListener, { once: true });

    try {
      // Pre-aborted signal at entry: reject immediately, before sending
      // FW_TRANSFER_BEGIN. The listener above won't fire (abort already
      // happened), so we synthesize the rejection directly. The throw
      // exits via the outer try/finally so cleanup (subscriber dispose,
      // listener remove, timer drain) still runs.
      if (opts?.signal?.aborted) {
        const reason = opts.signal.reason;
        const reasonText =
          reason instanceof Error
            ? reason.message
            : typeof reason === 'string' && reason.length > 0
              ? reason
              : 'pre-aborted';
        throw new TransferError('aborted', spec.transferId, `transfer aborted: ${reasonText}`);
      }

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
      // Wrap bus.send. A throw here exits via the outer try/finally so
      // subscriber disposal, abort-listener removal, and the (yet-unarmed)
      // timer drains all run.
      try {
        this.bus.send(beginMsg.msg, { kind: 'firmware' });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new TransferError(
          'bus_send_failed',
          spec.transferId,
          `bus.send threw on FW_TRANSFER_BEGIN: ${message}`,
        );
      }

      // Race the BEGIN_ACK wait against ackTimeoutMs. If the master never
      // replies, `begin_timeout` fires; the timer is explicitly cleared on
      // the ack-arrival path so a successful BEGIN doesn't leak a pending
      // setTimeout past this scope. We also clear the single-slot waiter
      // on the timeout path — the dispatcher would otherwise resolve a
      // stale waiter into the (already-rejected) Promise on a late ack
      // arrival; harmless, but explicit teardown makes the post-condition
      // obvious.
      let beginAckTimer: NodeJS.Timeout | null = null;
      let beginAck;
      try {
        beginAck = await new Promise<Extract<FwInboundAck, { kind: 'beginAck' }>>(
          (resolve, reject) => {
            beginAckTimer = setTimeout(() => {
              if (currentWaiter?.kind === 'beginAck') {
                currentWaiter = null;
              }
              reject(
                new TransferError(
                  'begin_timeout',
                  spec.transferId,
                  `no FW_TRANSFER_BEGIN_ACK within ${ackTimeoutMs}ms`,
                ),
              );
            }, ackTimeoutMs);
            waitFor('beginAck').then(resolve, reject);
          },
        );
      } finally {
        if (beginAckTimer) clearTimeout(beginAckTimer);
      }

      // Master rejects the transfer (sd_full, busy, version mismatch, …).
      // Per protocol.md the `status` field is open-ended; 'OK' is the only
      // happy-path value, every other string is a rejection reason.
      // Surfacing the raw status in `detail` lets the orchestrator
      // log/report the specific cause without this module needing to
      // enumerate every possible rejection code.
      if (beginAck.status !== 'OK') {
        throw new TransferError(
          'begin_rejected',
          spec.transferId,
          `master rejected transfer: status=${beginAck.status}`,
        );
      }

      observer.onTransferBegun?.(beginAck);

      // Arm the whole-transfer watchdog on entry to the chunk-streaming
      // phase. If the chunk loop hangs for any reason that per-chunk
      // retries don't surface (e.g. a pathological PAUSE/RESUME dance, or
      // a master that ACKs slowly enough to stay under the per-chunk
      // budget but exceed transferTimeoutMs in aggregate), the watchdog
      // rejects the chunk-phase awaiter via `rejectChunkPhase`.
      armTransferWatchdog();

      // Open the chunk-phase gate. From here until the matching clear
      // below, the dispatcher routes chunkAck/chunkNak/backpressure into
      // the sliding-window machine. Set AFTER `armTransferWatchdog` so a
      // racing ack delivered during watchdog setup still has a watchdog
      // armed by the time it lands; set BEFORE `topUpWindow` so the
      // first wire send is paired with an open gate (acks for the very
      // first chunk could otherwise return before the gate opens).
      chunkPhaseActive = true;

      // ---------- CHUNK (sliding window) ----------
      // currentWaiter is null here — the chunk-phase dispatcher uses
      // inFlight/highestAcked instead. Initial fill kicks off the window;
      // each subsequent CHUNK_ACK arrival in handleChunkAck() retires
      // entries and tops the window back up.
      topUpWindow();
      await chunkPhaseDone;

      // Close the chunk-phase gate before END-wait. Any chunkAck arriving
      // from here on is stale — the streamer's window state has already
      // been retired by the cumulative ACK that resolved chunkPhaseDone,
      // and entering it now would mutate state we no longer act on. The
      // outer `finally` block also clears this as a defensive belt
      // against the chunk-phase reject paths (FLASH_FULL, watchdog,
      // abort) that exit the await without reaching this line.
      chunkPhaseActive = false;

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
      // Wrap bus.send. By this point the watchdog and (likely) some chunk
      // timers may still be armed; an exception here exits to the outer
      // `finally` which drains them all.
      try {
        this.bus.send(endMsg.msg, { kind: 'firmware' });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new TransferError(
          'bus_send_failed',
          spec.transferId,
          `bus.send threw on FW_TRANSFER_END: ${message}`,
        );
      }

      // Race the END_ACK wait against ackTimeoutMs (symmetric to the
      // BEGIN-wait race). If the master never replies, `end_timeout`
      // fires; the timer is explicitly cleared in the inner `finally` so a
      // successful END doesn't leak a pending setTimeout past this scope.
      // We also clear the single-slot waiter on the timeout path — the
      // dispatcher would otherwise resolve a stale waiter into the
      // (already-rejected) Promise on a late ack arrival; harmless, but
      // explicit teardown makes the post-condition obvious.
      //
      // The whole-transfer watchdog is still armed and would also fire
      // eventually, but with a much longer budget. `TRANSPORT_DEFAULTS`
      // carries the streamer's test invariants (`ackTimeoutMs: 15_000`,
      // `transferTimeoutMs: 300_000`); production overrides via
      // `DEFAULT_STREAMER_CONFIG` in `flash_orchestrator.ts`
      // (`ackTimeoutMs: 5_000`, `transferTimeoutMs: 600_000`). The
      // end_timeout race surfaces a faster, more specific code so the
      // operator gets "the master didn't reply to END" rather than the
      // catch-all "the whole transfer hung." The ack/watchdog gap stays
      // wide on both: ~20× under test defaults (15 s ack vs 5 min
      // watchdog) and ~120× in production (5 s ack vs 10 min watchdog),
      // so the end_timeout race wins in every realistic case.
      let endAckTimer: NodeJS.Timeout | null = null;
      let endAck;
      try {
        endAck = await new Promise<Extract<FwInboundAck, { kind: 'transferEndAck' }>>(
          (resolve, reject) => {
            endAckTimer = setTimeout(() => {
              if (currentWaiter?.kind === 'transferEndAck') {
                currentWaiter = null;
              }
              reject(
                new TransferError(
                  'end_timeout',
                  spec.transferId,
                  `no FW_TRANSFER_END_ACK within ${ackTimeoutMs}ms`,
                ),
              );
            }, ackTimeoutMs);
            waitFor('transferEndAck').then(resolve, reject);
          },
        );
      } finally {
        if (endAckTimer) clearTimeout(endAckTimer);
      }
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

      // Clear the whole-transfer watchdog on the success path BEFORE
      // returning. The `finally` block also clears it (idempotent), but
      // doing so here ensures no late fire can race the resolve and
      // reject an already-resolved run.
      clearTransferWatchdog();

      return {
        transferId: spec.transferId,
        totalBytesSent: sourceBuffer.length,
        totalChunks,
        durationMs: Date.now() - startedAt,
        endAck,
      };
    } finally {
      // Order matters here:
      //   - removeEventListener FIRST so a fire-during-cleanup race
      //     (signal aborts in the same microtask we settle the run)
      //     cannot re-enter `rejectRun` and try to reject already-
      //     disposed state.
      //   - chunkPhaseActive cleared BEFORE unsubscribe so the dispatcher
      //     (still attached until unsubscribe returns) drops any
      //     chunk-phase ack that lands during the cleanup window.
      //   - clearTransferWatchdog is idempotent (null-guarded), so the
      //     success-path call and this one cooperate safely.
      // The chunkTimers drain + inFlight.clear() prevent leaked setTimeouts
      // and stale window state from outliving a rejected run.
      opts?.signal?.removeEventListener('abort', abortListener);
      chunkPhaseActive = false;
      clearTransferWatchdog();
      for (const timer of chunkTimers.values()) clearTimeout(timer);
      chunkTimers.clear();
      inFlight.clear();
      // Wrap unsubscribe so a bus mid-shutdown / double-disposed handle
      // can't replace the run's settled state with a TypeError that
      // would surface as the catch-all `streamer_unknown_error` rather
      // than the real terminal code. The dispatcher is already detached
      // logically (chunkPhaseActive=false above), so a throw here is
      // post-resolve and safe to log + swallow.
      try {
        unsubscribe();
      } catch (err) {
        logger.error(
          err,
          `chunk streamer: subscriber unsubscribe threw during run cleanup for transferId=${spec.transferId}`,
        );
      }
    }
  }
}
