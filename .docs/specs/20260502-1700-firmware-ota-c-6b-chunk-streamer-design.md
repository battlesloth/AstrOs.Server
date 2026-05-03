# c.6b — Chunk-Streamer Design Spec

Design doc for c.6b, the second sub-project of c.6 (FlashJob orchestrator) under the by-layer split. c.6b ships the **sliding-window chunk streamer** — pure transport, no orchestration. The implementation plan (with task list, file scope, FMI, verification) is a separate document under `.docs/plans/`; this doc captures the architectural decisions that shape that plan.

## Context

c.6 (FlashJob orchestrator) was decomposed into three layered sub-projects so each ships independently and is reviewable in isolation:

- **c.6a (merged, PR #72)** — FSM types + transitions, pure compute. `ControllerFlashState` discriminated union, `transitionControllerState`, `deriveJobLifecycle`.
- **c.6b (this spec)** — Sliding-window chunk streamer. Drives the upload phase of the protocol: `FW_TRANSFER_BEGIN` → sliding window of `FW_CHUNK` frames → `FW_TRANSFER_END`. Pure transport — no JobLock, no source resolution, no FSM coupling, no WS emit.
- **c.6c (future)** — Orchestrator. Composes c.6a + c.6b with `JobLock`, source resolver (cache + upload), per-controller progress translation, WS emit points, and a PTY-stub harness. Also handles the deploy phase (`FW_DEPLOY_BEGIN` + receiving `FW_PROGRESS` from master + `FW_DEPLOY_DONE`).

c.6b's single responsibility: take a binary, drive the protocol's upload phase to completion, surface per-chunk events. By the time c.6c arrives, c.6b's FSM rules are locked in tests; c.6c only has to translate transport events into FSM transitions, not re-litigate sliding-window correctness against orchestrator I/O loops.

The protocol contract (see `.docs/protocol.md` § A and the decomposition doc § "C. Server ↔ Master (serial)") is locked: 4 KB chunks, sliding window of 16, 1500 ms per-frame ACK timeout with 3 retries, 5 min whole-transfer watchdog, Go-Back-N retransmits, base64 frame encoding, CRC-16 per chunk. c.6b implements the sender state machine for that contract.

## Architecture

```
┌──────────────────────────────────────────────────────┐
│  c.6c orchestrator (future)                          │
│   └─ resolves source, manages JobLock, translates    │
│      transport events → ControllerFlashState         │
└──────────────────────────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────┐
│  c.6b ChunkStreamer (this phase)                     │
│   ├─ Sliding-window send loop (16 frames)            │
│   ├─ Cumulative-ACK + NAK + Go-Back-N retransmit     │
│   ├─ Per-frame ACK timeout (1500 ms, 3 retries)      │
│   ├─ Whole-transfer watchdog (5 min)                 │
│   └─ Backpressure pause/resume                       │
└──────────────────────────────────────────────────────┘
            │                          ▲
            │ send(payload, kind)      │ subscribeFwAcks
            ▼                          │
┌──────────────────────────────────────────────────────┐
│  SerialBus interface (this phase)                    │
│   ├─ WorkerSerialBus adapter (production, real Worker)│
│   └─ FakeSerialBus (tests, in-memory message queue)  │
└──────────────────────────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────┐
│  serial_worker.js (existing, c.0/c.1 era)            │
│   ├─ Raw serial I/O                                  │
│   └─ MessageGenerator + MessageHandler from c.1      │
└──────────────────────────────────────────────────────┘
```

**c.6b is strictly the upload phase.** The deploy phase (`FW_DEPLOY_BEGIN` + master-emitted `FW_PROGRESS` per controller + `FW_DEPLOY_DONE`) has different mechanics — no sliding window, master-driven progress reports — and lives in c.6c.

## Components

| File | Role |
|---|---|
| `astros_api/src/models/firmware/chunk_streamer.ts` | Pure types: `TransferSpec`, `StreamObserver`, `TransferResult`, `FwInboundAck` discriminated union, `SerialBus` interface, `TransferError` class with `TransferErrorCode` union |
| `astros_api/src/firmware/serial_bus.ts` | `WorkerSerialBus` production adapter — wraps the existing serial Worker. Translates `bus.send(payload, { kind })` to `worker.postMessage(payload)` (no JobLock enforcement yet — that's c.6c's pickup), and Worker `'message'` events to `subscribeFwAcks` callbacks filtered by `transferId` |
| `astros_api/src/firmware/chunk_streamer.ts` | `ChunkStreamer` class. `run(spec, observer, opts?): Promise<TransferResult>`. Owns the sliding-window state machine, retry counters, both watchdog timers. **Zero `worker_threads` imports** — pure `SerialBus` consumer. `TRANSPORT_DEFAULTS` constants (chunk size 4096, window 16, ACK timeout 1500 ms, transfer timeout 300_000 ms, max retries 3) at module top |
| `astros_api/src/firmware/chunk_streamer.test.ts` | Tests + inline `FakeSerialBus` test helper (in-memory message queue with `deliver()` for synthesizing inbound ACKs) |

Splitting `serial_bus.ts` from `chunk_streamer.ts` keeps the streamer's logic file free of Node `Worker` concerns — testing requires no Worker mocking, just the FakeSerialBus.

## Public API

```typescript
class ChunkStreamer {
  constructor(deps: { bus: SerialBus; config?: Partial<TransportConfig> });
  run(
    spec: TransferSpec,
    observer: StreamObserver,
    opts?: { signal?: AbortSignal },
  ): Promise<TransferResult>;
}

interface TransferSpec {
  transferId: string;
  source: { path: string; sha256: string; sizeBytes: number };
  targets: string[]; // controller IDs the master should flash, "master" optional
}

interface StreamObserver {
  onTransferBegun?: (ack: TransferBeginAck) => void;
  onChunkAck?: (highestContiguousSeq: number, bytesSent: number) => void;
  onChunkNak?: (lastGoodSeq: number, reason: NakReason) => void;
  onRetry?: (seq: number, attempt: number) => void;
  onBackpressure?: (paused: boolean) => void;
  onTransferEnd?: (ack: TransferEndAck) => void;
}

interface TransferResult {
  transferId: string;
  totalBytesSent: number;
  totalChunks: number;
  durationMs: number;
  endAck: TransferEndAck;
}

interface SerialBus {
  send(payload: string, opts: { kind: 'firmware' | 'normal' }): void;
  subscribeFwAcks(
    transferId: string,
    handler: (ack: FwInboundAck) => void,
  ): () => void;
}
```

The `kind` parameter on `send()` is a **deliberate seam for c.6c's drop-policy guard**. c.6b's `WorkerSerialBus` adapter forwards every send regardless; c.6c will inject `JobLock` and silently discard `kind: 'normal'` sends with a warn log when the lock is held. Documented under "Out of scope (c.6c)" below.

## Data flow (one transfer)

```
ChunkStreamer.run(spec, observer, { signal? }):

 1. Subscribe to FwInboundAck for spec.transferId via bus.subscribeFwAcks
 2. Read source.path into a Buffer (one allocation; ~1.2 MB resident)
 3. Slice into chunks of CHUNK_SIZE_BYTES (4096); precompute total seq count

 4. SEND FW_TRANSFER_BEGIN { transferId, totalSize, sha256, chunkSize, targets }
    → wait for FW_TRANSFER_BEGIN_ACK (with ACK_TIMEOUT_MS deadline)
       - status='OK'        → proceed
       - status=<any other> → reject with TransferError 'begin_rejected';
                              the rejection reason (e.g. 'sd_full', 'busy',
                              'version_mismatch') is surfaced verbatim in
                              `detail`. Per .docs/protocol.md the field is
                              an open-ended string — 'OK' is the only
                              happy-path value.
       - timeout            → reject with 'begin_timeout'
    → observer.onTransferBegun(ack)

 5. Start whole-transfer watchdog (TRANSFER_TIMEOUT_MS = 300_000)
 6. Sliding-window loop:
      while highestAcked < lastSeq:
        # Fill window up to WINDOW_SIZE
        while inFlight.size < WINDOW_SIZE && nextToSend ≤ lastSeq:
          if backpressurePaused: break
          send FW_CHUNK { transferId, seq, payload, crc16 } [kind: 'firmware']
          inFlight.set(seq, { sentAt, retries: 0 })
          arm per-chunk timer for `seq`
          nextToSend++

        # Wait for next event (race):
        await race(
          inboundAck,                 # FW_CHUNK_ACK / FW_CHUNK_NAK / FW_BACKPRESSURE
          earliestPerChunkTimeout,    # ACK_TIMEOUT_MS since send
          transferWatchdogFire,       # 5 min absolute
          signal.aborted              # orchestrator cancel
        )

        # Dispatch:
        on FW_CHUNK_ACK { highestContiguousSeq, ... }:
          → drop inFlight ≤ highestContiguousSeq, clear their timers
          → highestAcked = highestContiguousSeq
          → observer.onChunkAck(...)

        on FW_CHUNK_NAK { lastGoodSeq, reasonCode }:
          → observer.onChunkNak(lastGoodSeq, reasonCode)
          → IF reason === 'FLASH_FULL': reject with 'flash_full' (unrecoverable)
          → ELSE Go-Back-N: clear inFlight, set nextToSend = lastGoodSeq + 1

        on FW_BACKPRESSURE { state }:
          → backpressurePaused = (state === 'PAUSE')
          → observer.onBackpressure(...)

        on per-chunk timeout (seq):
          → entry = inFlight.get(seq)
          → IF entry.retries >= MAX_RETRIES_PER_CHUNK: reject with 'chunk_retry_exhausted'
          → ELSE: entry.retries++, observer.onRetry(...), resend, re-arm

        on transfer watchdog fire: reject with 'transfer_timeout'
        on signal abort: reject with 'aborted'

 7. SEND FW_TRANSFER_END { transferId, totalChunks, finalSha256 }
    → wait for FW_TRANSFER_END_ACK
       - status=OK             → resolve with TransferResult
       - status=HASH_MISMATCH  → reject with 'hash_mismatch'
       - status=IO_ERROR       → reject with 'master_io_error'
       - timeout               → reject with 'end_timeout'
    → observer.onTransferEnd(ack)

 8. Cleanup (always, in finally):
    - unsubscribe bus
    - clear all per-chunk timers
    - clear transfer watchdog
    - remove AbortSignal listener
    - drop Buffer reference
```

**Key invariants:**
- Source bytes read once at start (one allocation); chunks are slices.
- `inFlight` Map is the only mutable state across loop iterations; cleared on Go-Back-N.
- Cumulative-ACK semantics: a single `FW_CHUNK_ACK` can advance `highestAcked` by many seqs.
- Observer callbacks fire synchronously from event handlers, in protocol-correct order, never after the Promise has settled.

## Error handling

`run()` rejects with a `TransferError` carrying a typed `code`. The orchestrator (c.6c) narrows on the code to decide "fail this controller" vs. "abort the whole job."

| Code | Trigger | Recoverable? |
|---|---|---|
| `source_read_failed` | fs.read fails | No — bin doesn't exist or perms broken |
| `begin_timeout` | No FW_TRANSFER_BEGIN_ACK | Yes (full retry) — likely abort |
| `begin_rejected` | Master refuses (SD full) | No |
| `chunk_retry_exhausted` | Single chunk hit MAX_RETRIES timeouts | Yes (full retry) |
| `flash_full` | FW_CHUNK_NAK reason=FLASH_FULL | No |
| `transfer_timeout` | 5 min watchdog fired | No |
| `aborted` | AbortSignal aborted | N/A |
| `end_timeout` | No FW_TRANSFER_END_ACK | Yes (one retry) |
| `hash_mismatch` | Server SHA ≠ master SHA | Yes (per protocol: one retry) |
| `master_io_error` | Master surfaced IO_ERROR on END_ACK | No |
| `bus_send_failed` | Worker died / postMessage threw | No |

**Cleanup invariants** run in `finally`:
1. Unsubscribe bus (`subscribeFwAcks` returns a disposer; call it).
2. Clear all per-chunk `setTimeout` entries.
3. Clear the transfer watchdog `setTimeout`.
4. Remove the AbortSignal listener (`signal.removeEventListener('abort', ...)`).
5. Drop the source Buffer reference so GC reclaims ~1.2 MB.

**Observer vs error split:** observer reports *progress*; rejection signals *terminal failure*. Some events appear in both — `chunkNak` fires the observer (informational) but only triggers a rejection if the reason is unrecoverable (`flash_full`); recoverable NAKs trigger Go-Back-N silently from the orchestrator's POV.

## Testing strategy

Primary surface: unit tests with `FakeSerialBus`. Inline in `chunk_streamer.test.ts`. Use `vi.useFakeTimers()` for any test exercising ACK timeouts, retry intervals, or the 5 min watchdog.

```typescript
class FakeSerialBus implements SerialBus {
  readonly sent: Array<{ payload: string; kind: SendKind }> = [];
  // ...
  deliver(transferId: string, ack: FwInboundAck) { /* test-only */ }
}
```

**Coverage matrix (~40 tests):**

- **Happy path:** single-chunk transfer; multi-chunk window-aligned; multi-chunk full-size (300 chunks for 1.2 MB); cumulative ACK consolidation
- **Go-Back-N:** NAK at seq=N clears window + restarts; consecutive NAKs; NAK during full window
- **Per-chunk retry:** 1 timeout → resend → ACK; 3 timeouts → `chunk_retry_exhausted`; concurrent timeouts retry independently
- **Backpressure:** PAUSE halts new sends; in-flight ACKs still drain; RESUME refills window
- **Pre-transfer errors:** `source_read_failed`, `begin_timeout`, `begin_rejected`
- **Post-transfer errors:** `end_timeout`, `hash_mismatch`, `master_io_error`
- **Watchdog:** 5 min timer fires `transfer_timeout`; cleared on completion (no late fire)
- **Cancellation:** `signal.aborted` rejects with `'aborted'`; cleanup runs even on abort
- **Cleanup invariants:** subscriber disposer always called; all timers cleared; Buffer reference dropped
- **`kind` parameter:** every ChunkStreamer-originated send records `kind: 'firmware'` (pins the contract for c.6c's future drop-policy tests)
- **Observer ordering:** `onChunkAck` before `onTransferEnd`; `onChunkNak` before resend loop restarts; observer completes before Promise settles

**Out of scope for c.6b's tests:**
- Real Worker integration (manual smoke at minimum; PTY harness in c.6c)
- Master-side correctness (FakeSerialBus produces protocol-shaped responses; c.6c's PTY harness drives a fake-master that genuinely follows the protocol)
- JobLock-aware drop policy in `WorkerSerialBus` (c.6c)

## Out of scope (deferred to c.6c)

- **JobLock injection into `WorkerSerialBus`.** When `kind === 'normal'` and JobLock is held, the adapter should silently discard the message and `logger.warn({ lockOwner }, 'serial send dropped — JobLock held')`. **Discard rather than throw**: an unhandled rejection from a background-emitted serial send could crash the worker; drops are a safety net, not a primary error channel. Primary defense remains c.0/c.2's `writeGuard` + `rejectIfLocked`.
- **Migration of existing direct `worker.postMessage` callers** in `api_server.ts` and elsewhere to go through `SerialBus`. Each migrated send site declares its `kind`. This is also the broader refactor that gives the system one canonical serial-write entry point.
- **Drop counter** for operability (so an operator can see "during flash job X, N normal sends were dropped"). Surfaces in `system_status.ts` (or wherever metrics live).
- **End-to-end drop-policy test** in c.6c's PTY harness: hold JobLock, fire a `normal` send, assert nothing reaches the wire.
- **Deploy phase** (`FW_DEPLOY_BEGIN` send + receive `FW_PROGRESS` per controller + `FW_DEPLOY_DONE`). Different mechanics than the upload phase; lives in the orchestrator.

## Open items

- **Failure-mode inventory** belongs in the c.6b implementation plan (not this spec). c.6b has concurrency (in-flight Map, multiple timers, AbortSignal listener), network-adjacent I/O (serial wire), and resource-lifecycle concerns (Buffer, subscriber disposer) — all FMI triggers per CLAUDE.md.
- **Transfer-ID generation** is the orchestrator's responsibility (c.6c). `TransferSpec.transferId` is an input to c.6b, not a c.6b-generated value.
- **`base64` encoding of chunk payloads** plus **CRC-16 computation** are already provided by `MessageGenerator.generateFwChunk()` (c.1, in `astros_api/src/serial/message_generator.ts`). The streamer calls that to produce the wire payload; it doesn't reimplement framing.

## Notes for the reviewer

- **The `kind` parameter on `SerialBus.send` is required** (no default). TypeScript catches every call site and forces an explicit declaration. Future c.6c migration of existing serial senders becomes a compiler-driven exercise.
- **No `EventEmitter`.** Typed observer callbacks instead. Drops the untyped string-keyed event surface, makes the contract self-documenting via TS, eliminates "did I forget to register a listener?" bugs.
- **Source Buffer is read once** at start, not streamed per-chunk. ~1.2 MB resident is acceptable for a single in-flight transfer (the protocol forbids concurrent transfers via JobLock single-flight). Streaming would complicate retries (need to seek the file handle back on Go-Back-N).
- **Why the streamer has zero `worker_threads` imports:** `chunk_streamer.ts` only consumes the `SerialBus` interface. The `WorkerSerialBus` adapter is the single Worker-aware surface. This makes `chunk_streamer.test.ts` Worker-mocking-free — the FakeSerialBus is sufficient.
