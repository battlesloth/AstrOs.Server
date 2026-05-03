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
// Task 5: wires FW_CHUNK_NAK into the phase-aware dispatcher.
// FLASH_FULL is unrecoverable — `handleChunkNak` rejects the chunk-phase
// awaiter via `rejectChunkPhase`, propagating a TransferError('flash_full')
// out to the outer try/catch/finally. CRC / SIZE / OUT_OF_ORDER trigger
// Go-Back-N: clear `inFlight`, set nextToSend = lastGoodSeq + 1, set
// highestAcked = lastGoodSeq, and let the existing top-up refill the window.
// Task 6: per-chunk ack timeout + retry counter. Each chunk is armed with
// `setTimeout(ackTimeoutMs)` on send. On fire, retries++ and if we've hit
// `maxRetriesPerChunk`, reject the chunk phase with
// TransferError('chunk_retry_exhausted'); otherwise observer.onRetry, build
// a fresh FW_CHUNK payload, resend, re-arm. Timer is cleared on the
// cumulative ACK that retires the seq, on the all-clear of NAK Go-Back-N,
// and on cleanup in the `finally` block.
// Task 7: backpressure pause/resume. A `backpressurePaused` flag local to
// `run()` gates `topUpWindow` so PAUSE halts NEW sends while in-flight ACKs
// continue draining the window. RESUME clears the flag and tops the window
// up from current state. `handleBackpressure` is idempotent — duplicate
// PAUSE/PAUSE or RESUME/RESUME do not refire the observer. Per-chunk
// timeouts during PAUSE re-arm (so retries still count toward exhaustion —
// the master's pause does not extend our retry budget) but do NOT resend;
// resending while the master is paused would overflow its receive buffer
// with chunks it has already buffered.
// Task 8: whole-transfer watchdog. A single
// `setTimeout(transferTimeoutMs)` (default 300_000 ms = 5 min) is armed on
// entry to the chunk-streaming phase (post-BEGIN_ACK). On fire it rejects
// the chunk-phase awaiter with TransferError('transfer_timeout', ...).
// Cleared on the success path (post-END_ACK status=OK, before resolve)
// AND in the `finally` cleanup, so a rejected run never leaks a pending
// timer past return. Reuses Task 5's `rejectChunkPhase` mechanism — the
// watchdog is the second consumer after FLASH_FULL.
// Task 9 (this revision): external cancellation via AbortSignal. The
// orchestrator (c.6c) passes `opts.signal` that aborts on panic-stop /
// job-cancel. An abort listener is registered at the top of `run()`
// before any await. On fire, `rejectRun(err)` delegates to BOTH
// `rejectChunkPhase` (covers the chunk-streaming phase) AND
// `currentWaiter.reject` (covers BEGIN-wait / END-wait phases) — abort
// can land in any phase, so both reject paths must be wired. The
// listener is removed in `finally` via `removeEventListener` so a late
// abort after a settled run() can't fire into a void. A signal that is
// already aborted at run() entry rejects immediately, before the
// streamer even sends FW_TRANSFER_BEGIN. Reuses Task 5's `Waiter.reject`
// (reserved at the time for "Task 8+ external reject paths") and
// Task 5/8's `rejectChunkPhase`.
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
  // Wired by Task 9. The orchestrator (c.6c) aborts this signal on
  // panic-stop / job-cancel. An abort during any phase (BEGIN-wait,
  // chunk-streaming, END-wait) rejects `run()` with
  // TransferError('aborted', ...). A signal that is already aborted at
  // entry rejects immediately, before BEGIN is sent.
  signal?: AbortSignal;
}

// Compact discriminator alias for the waiter machinery. Listing the kinds we
// actually wait on (BEGIN_ACK / CHUNK_ACK / END_ACK) keeps the inferred
// types tight and lets `Extract<FwInboundAck, ...>` resolve cleanly.
type WaitableKind = 'beginAck' | 'chunkAck' | 'transferEndAck';

// `reject` is the external-reject path for the single-slot waiter used
// by BEGIN-wait and END-wait. Task 9 (AbortSignal cancellation) is the
// first consumer — `rejectRun` reaches into `currentWaiter.reject` when
// abort fires during BEGIN-wait or END-wait. Per-phase timeout paths
// (Tasks 10–11) will likely reuse the same hook.
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
    const sourceBuffer = await fsp.readFile(spec.source.path);
    const totalChunks = Math.max(1, Math.ceil(sourceBuffer.length / this.config.chunkSizeBytes));
    const lastSeq = totalChunks - 1;
    const { chunkSizeBytes, windowSize } = this.config;

    // ---- Sliding-window state (Task 4). Initialized eagerly so the `finally`
    // block can always clear `inFlight` regardless of which phase we error in.
    // `inFlight`: seq → bookkeeping for chunks sent but not yet cumulatively
    //   acked. Task 5 reads `sentAt`/`retries` for retry & NAK logic.
    // `nextToSend`: next seq to put on the wire when the window has room.
    // `highestAcked`: greatest cumulatively-acked seq, or -1 before any ACK.
    const inFlight = new Map<number, { sentAt: number; retries: number }>();
    let nextToSend = 0;
    let highestAcked = -1;

    // ---- Per-chunk ack timers (Task 6). Parallel structure to `inFlight`,
    // keyed by the same seq. Each `setTimeout` ID is stored so:
    //   - the cumulative-ACK retire path can clearTimeout per retired seq,
    //   - the NAK Go-Back-N path can clear all timers in lockstep with
    //     `inFlight.clear()`,
    //   - and the `finally` block can drain any leftover timers on error
    //     so a rejected run doesn't leak a node `setTimeout` past return.
    // The `chunkSizeBytes` and `ackTimeoutMs` reads below are hoisted into a
    // local for the timer callbacks; the rest of the streamer reads via
    // `this.config.*`.
    const chunkTimers = new Map<number, NodeJS.Timeout>();
    const { ackTimeoutMs, maxRetriesPerChunk } = this.config;

    // ---- Whole-transfer watchdog (Task 8). A single setTimeout — NOT a Map
    // like `chunkTimers`, since exactly one watchdog runs per `run()`. Armed
    // on entry to the chunk-streaming phase (after BEGIN_ACK) and cleared
    // on the success path (post-END_ACK status=OK) AND in the `finally`
    // cleanup. The two clear sites are intentional: the success-path clear
    // ensures no late fire after resolve(), the finally clear handles every
    // rejection path. `clearTransferWatchdog` is idempotent (null-guarded)
    // so running both on the success path is safe.
    let transferWatchdogTimer: NodeJS.Timeout | null = null;

    // ---- Backpressure state (Task 7). Defaults to `false` — the master is
    // assumed willing to receive until it explicitly says otherwise via
    // FW_BACKPRESSURE { action: 'PAUSE' }. While paused:
    //   - `topUpWindow` no-ops (no new chunks placed on the wire), so the
    //     in-flight count can only shrink, never grow.
    //   - cumulative ACKs continue retiring entries (handleChunkAck still
    //     runs; topUpWindow inside it is a no-op).
    //   - per-chunk timers still fire and still count toward
    //     maxRetriesPerChunk, but their resend is suppressed — see
    //     onChunkTimeout. The retry budget therefore acts as a watchdog on
    //     a master that PAUSEs and never RESUMEs.
    // RESUME clears the flag and calls topUpWindow once to refill the
    // window from `nextToSend`. This boolean is a primitive local to
    // `run()` and goes out of scope when the function returns; no `finally`
    // cleanup needed.
    let backpressurePaused = false;

    // Single waiter slot — used by BEGIN-wait and END-wait phases only. The
    // chunk phase (Task 4+) drives off `inFlight` / `highestAcked` and is
    // released by `chunkPhaseDone`, not this slot.
    let currentWaiter: Waiter<WaitableKind> | null = null;

    // Resolves when `highestAcked === lastSeq`. The chunk-phase ack handler
    // calls `resolveChunkPhaseDone` after the cumulative ACK that completes
    // the transfer; the main loop awaits this before sending TRANSFER_END.
    // `rejectChunkPhase` lets the chunk-phase awaiter throw from outside the
    // `await chunkPhaseDone` — used by the FLASH_FULL NAK path (Task 5),
    // the whole-transfer watchdog (Task 8), and the AbortSignal listener
    // (Task 9, via `rejectRun`).
    //
    // Constructed eagerly at the top of run() — BEFORE the BEGIN-wait await
    // — so the abort listener registered immediately after can safely
    // delegate to rejectChunkPhase even if abort fires before the chunk
    // phase has begun. (Reaching into `rejectChunkPhase` during BEGIN-wait
    // is a no-op rejection — nothing is awaiting `chunkPhaseDone` yet — but
    // the construction order eliminates a TDZ-style "rejectChunkPhase is
    // null" race the lazy form would have introduced.)
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
    };

    // Per-chunk timer helpers. `armChunkTimer` clears any prior timer for the
    // same seq before re-arming so a resend that calls into here cannot leak
    // the previous timer (defense in depth — the resend path already calls
    // clearChunkTimer first, but a future caller adding a second arm site
    // would still be safe).
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

    // Whole-transfer watchdog helpers (Task 8). `armTransferWatchdog` is
    // called exactly once per run, post-BEGIN_ACK, on entry to the
    // chunk-streaming phase. The defensive clear here is belt-and-suspenders:
    // a future caller adding a second arm site would still be safe from
    // leaking the prior timer. `clearTransferWatchdog` is idempotent (null
    // check) so the success-path call AND the `finally` cleanup call can
    // safely both run on a happy-path resolution.
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
      // chunkTimers immediately so the lockstep invariant
      //   chunkTimers.has(seq) ⇔ inFlight.has(seq)
      //     AND the corresponding timer is still pending
      // holds for any future reader (e.g. c.6c observability metrics).
      // The re-arm path below calls armChunkTimer, which adds the new
      // timer back to chunkTimers within the same synchronous turn, so
      // the invariant is restored before any other code can observe it.
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

      // Resend the same seq with a fresh FW_CHUNK payload + new timer.
      sendChunk(seq);
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
      // Each retired seq's pending ack timer (Task 6) is cleared in lockstep
      // so a retired chunk cannot fire a phantom retry after its ACK.
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
      // Stale-NAK guard: a NAK whose lastGoodSeq is below our current
      // highestAcked is from a retransmit-pair the streamer has already
      // moved past (master retransmitted the NAK; both arrive after we
      // already restarted). Both the observer call AND the Go-Back-N
      // mutation must be skipped: rewinding nextToSend / highestAcked
      // here would roll back the monotonic cumulative-progress cursor
      // (handleChunkAck has the symmetric guard at the top of its
      // observer/early-return path), and firing observer.onChunkNak
      // would surface a phantom error to the UI for a NAK we've already
      // recovered from.
      //
      // FLASH_FULL is exempt — it's terminal regardless of when the master
      // sent it. A late-arriving FLASH_FULL still means flash is exhausted;
      // we must reject the transfer rather than silently swallow it.
      const isStale = nak.lastGoodSeq < highestAcked;
      if (isStale && nak.reasonCode !== 'FLASH_FULL') {
        return;
      }

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
      //
      // Task 6: chunkTimers must be drained in lockstep with inFlight.
      // Otherwise a stale per-chunk timer for a now-discarded seq would
      // fire after the resend, find no inFlight entry (the early-return
      // guard in onChunkTimeout would catch it), but in the racy case
      // where the new top-up has already re-armed seq=N before the old
      // timer fires, the old fire would walk an entry that "looks valid"
      // and double-count its retries.
      for (const timer of chunkTimers.values()) clearTimeout(timer);
      chunkTimers.clear();
      inFlight.clear();
      nextToSend = nak.lastGoodSeq + 1;
      highestAcked = nak.lastGoodSeq;
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
        sendChunk(seq);
        inFlight.set(seq, { sentAt: Date.now(), retries: 0 });
        // Arm the per-chunk ack timer (Task 6). The timer fires after
        // ackTimeoutMs if no cumulative ACK has retired this seq by then;
        // see onChunkTimeout for the retry/exhaust logic.
        armChunkTimer(seq);
      }
    };

    const unsubscribe = this.bus.subscribeFwAcks(spec.transferId, (ack) => {
      // Phase-aware dispatch: the chunk phase routes chunkAck, chunkNak,
      // and backpressure into the sliding-window machine; BEGIN-wait /
      // END-wait route their ack-of-interest into the single-slot waiter.
      if (ack.kind === 'chunkAck' || ack.kind === 'chunkNak' || ack.kind === 'backpressure') {
        // Chunk-phase signals are handled directly. If we somehow receive
        // one outside the chunk phase (BEGIN-wait, post-END-wait), it's a
        // protocol oddity; ignoring it matches the Task 3 "out-of-phase ack"
        // policy. The master only emits FW_BACKPRESSURE during chunk
        // streaming, so the same gating that protects chunkAck/chunkNak
        // applies to backpressure.
        if (currentWaiter !== null) return;
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

    // ---- AbortSignal cancellation (Task 9). `rejectRun` is the single
    // entry point for external rejection; it routes the error to whichever
    // phase is currently active:
    //   - chunk-streaming phase: `rejectChunkPhase(err)` releases the
    //     `await chunkPhaseDone` (also used by FLASH_FULL NAK in Task 5
    //     and the watchdog in Task 8).
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
      this.bus.send(beginMsg.msg, { kind: 'firmware' });
      const beginAck = await waitFor('beginAck');
      observer.onTransferBegun?.(beginAck);

      // Task 8: arm the whole-transfer watchdog on entry to the
      // chunk-streaming phase. If the chunk loop hangs for any reason that
      // per-chunk retries don't surface (e.g. a pathological PAUSE/RESUME
      // dance, or a master that ACKs slowly enough to stay under the
      // per-chunk budget but exceed transferTimeoutMs in aggregate), the
      // watchdog rejects the chunk-phase awaiter via `rejectChunkPhase`.
      armTransferWatchdog();

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

      // Task 8: clear the whole-transfer watchdog on the success path BEFORE
      // returning. The `finally` block also clears it (idempotent), but
      // doing so here ensures no late fire can race the resolve and reject
      // an already-resolved run.
      clearTransferWatchdog();

      return {
        transferId: spec.transferId,
        totalBytesSent: sourceBuffer.length,
        totalChunks,
        durationMs: Date.now() - startedAt,
        endAck,
      };
    } finally {
      // Cleanup invariants: this block extends as later tasks add state.
      // Task 4 added: clear the in-flight Map. Task 6 added: drain the
      // per-chunk timer Map so a rejected run doesn't leak a node
      // setTimeout past return. Task 8 added: clear the whole-transfer
      // watchdog (idempotent — null-guarded — so the success-path call
      // above and this one cooperate safely). Task 9 added: remove the
      // abort listener — done FIRST so a fire-during-cleanup race
      // (signal aborts in the same microtask we settle the run) cannot
      // re-enter `rejectRun` and try to reject already-disposed state.
      opts?.signal?.removeEventListener('abort', abortListener);
      clearTransferWatchdog();
      for (const timer of chunkTimers.values()) clearTimeout(timer);
      chunkTimers.clear();
      inFlight.clear();
      unsubscribe();
    }
  }
}
