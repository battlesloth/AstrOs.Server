# c.6b — Sliding-window chunk streamer

Full plan for the second sub-project of c.6 under the by-layer split. c.6b ships the upload-phase transport — `FW_TRANSFER_BEGIN` → sliding-window of `FW_CHUNK` frames → `FW_TRANSFER_END` — as a pure, testable module with no orchestration, no JobLock, no FSM coupling. c.6c will compose this with the c.6a state machine into a full FlashJob orchestrator.

**Branch:** `feature/firmware-ota-c-6b-chunk-streamer` (off `develop`).
**PR target base:** `develop`.
**Spec:** [`.docs/specs/20260502-1700-firmware-ota-c-6b-chunk-streamer-design.md`](../specs/20260502-1700-firmware-ota-c-6b-chunk-streamer-design.md) (committed earlier on this branch — read it first; this plan is the task list, not the design).
**References:** [decomposition](./20260427-2202-firmware-ota-decomposition.md) § "Sub-project decomposition" + § "C. Server ↔ Master (serial)"; [`.docs/protocol.md`](../protocol.md) § A.

## Context

c.6 was decomposed into c.6a (FSM types, merged in PR #72) + c.6b (transport, this PR) + c.6c (orchestrator, future). c.6b's single responsibility: drive the upload phase of the OTA protocol to completion, surface per-chunk events. The protocol contract is locked (4 KB chunks, window 16, 1500 ms ACK timeout, 3 retries, 5 min watchdog, Go-Back-N retransmits); c.6b implements the sender state machine for that contract.

c.6b has **no relationship to `JobLock`, `FlashJobState`, source resolution, or WS emit**. Those compose at c.6c. The `kind` parameter on `SerialBus.send()` is a deliberate seam reserved for c.6c's drop-policy guard (documented under "Out of scope" + the SerialBus interface comment).

## API overview

See the spec for the full architecture diagram and design rationale. At a glance:

```typescript
class ChunkStreamer {
  constructor(deps: { bus: SerialBus; config?: Partial<TransportConfig> });
  run(spec: TransferSpec, observer: StreamObserver, opts?: { signal?: AbortSignal }):
    Promise<TransferResult>;
}

interface SerialBus {
  send(payload: string, opts: { kind: 'firmware' | 'normal' }): void;
  subscribeFwAcks(transferId: string, handler: (ack: FwInboundAck) => void): () => void;
}
```

`TRANSPORT_DEFAULTS`: `CHUNK_SIZE_BYTES = 4096`, `WINDOW_SIZE = 16`, `ACK_TIMEOUT_MS = 1500`, `TRANSFER_TIMEOUT_MS = 300_000`, `MAX_RETRIES_PER_CHUNK = 3`.

## Tasks

Each task is one logical commit. TDD where applicable (write tests, watch them fail, implement to pass). Per the new pre-commit rule in CLAUDE.md, run `superpowers:requesting-code-review` between tests-passing and `git commit` for each implementation task.

- [ ] **Typed models + bus interface** (new `astros_api/src/models/firmware/chunk_streamer.ts`):
  - `TransferSpec` — `{ transferId: string, source: { path: string, sha256: string, sizeBytes: number }, targets: string[] }`
  - `StreamObserver` — typed callbacks per the spec's API section (`onTransferBegun?`, `onChunkAck?`, `onChunkNak?`, `onRetry?`, `onBackpressure?`, `onTransferEnd?`)
  - `TransferResult` — `{ transferId, totalBytesSent, totalChunks, durationMs, endAck }`
  - `FwInboundAck` discriminated union — `{ kind: 'beginAck', ... } | { kind: 'chunkAck', ... } | { kind: 'chunkNak', ... } | { kind: 'transferEndAck', ... } | { kind: 'backpressure', ... }`
  - `SerialBus` interface — `send(payload, opts: { kind })` + `subscribeFwAcks(transferId, handler)` returning a disposer
  - `TransferError` class extending `Error` with `code: TransferErrorCode`, `transferId`, `detail?`. `TransferErrorCode` is the 11-value union from the spec's error-handling section.
  - `TransportConfig` — partial-overridable shape mirroring `TRANSPORT_DEFAULTS`
  - Inline comments only where the type's role isn't obvious (mirrors c.6a discipline).

- [ ] **`WorkerSerialBus` production adapter** (new `astros_api/src/firmware/serial_bus.ts`):
  - Constructor takes `{ worker: Worker }` (the Node `worker_threads.Worker`)
  - `send(payload, { kind })`: forwards every send via `worker.postMessage(payload)` — `kind` is recorded but **NOT** used for filtering yet (c.6c picks up the JobLock-aware drop policy)
  - `subscribeFwAcks(transferId, handler)`: registers a worker `'message'` listener that parses inbound `FW_*_ACK` / `FW_*_NAK` / `FW_BACKPRESSURE` messages, filters by `transferId`, and invokes `handler` with the typed `FwInboundAck`. Returns a disposer that removes the listener.
  - **Tests** (light): unit-test the `subscribeFwAcks` filtering using a mock `Worker`-like EventEmitter; verify the disposer removes the listener; verify non-matching `transferId` is ignored.

- [x] **Inline `FakeSerialBus` test helper** (in `astros_api/src/firmware/chunk_streamer.test.ts`):
  - Implements `SerialBus`. Stores all `send()` calls in `sent: Array<{ payload: string; kind: SendKind }>`.
  - `subscribeFwAcks(transferId, handler)` stores the handler keyed by `transferId`; returns a disposer.
  - Test-only `deliver(transferId: string, ack: FwInboundAck)` synthesizes inbound messages.
  - Designed for inline use; lift to `chunk_streamer_testing.ts` if c.6c needs to share.

- [x] **`ChunkStreamer` skeleton + happy-path single-chunk transfer** (new `astros_api/src/firmware/chunk_streamer.ts`):
  - Class with constructor taking `{ bus: SerialBus; config?: Partial<TransportConfig> }`. Stores merged config. `TRANSPORT_DEFAULTS` constants at module top.
  - `run(spec, observer, opts?)` returns `Promise<TransferResult>`. Initial implementation handles only the trivial path: send `FW_TRANSFER_BEGIN`, wait for `BEGIN_ACK`, send single `FW_CHUNK`, wait for `CHUNK_ACK`, send `FW_TRANSFER_END`, wait for `END_ACK`, resolve. No window, no retries, no watchdog yet — just enough to wire the message flow.
  - Uses `MessageGenerator` from `astros_api/src/serial/message_generator.ts` to build outbound payloads (do NOT reimplement framing / base64 / CRC).
  - **Tests:** single-chunk happy path (a small Buffer that fits in one chunk); the streamer subscribes, sends BEGIN, FakeSerialBus delivers BEGIN_ACK, streamer sends one CHUNK, FakeSerialBus delivers CHUNK_ACK, streamer sends END, FakeSerialBus delivers END_ACK, run() resolves with the right `TransferResult`.

- [ ] **Multi-chunk sliding window** (extend `chunk_streamer.ts`):
  - Replace the trivial single-chunk send with a sliding-window loop. State: `inFlight: Map<seq, { sentAt: number, retries: number }>`, `nextToSend: number`, `highestAcked: number`, `lastSeq: number`. Window grows up to `WINDOW_SIZE`; advances on `CHUNK_ACK`.
  - On each `CHUNK_ACK`, drop entries with `seq <= highestContiguousSeq`, advance `highestAcked`, top up the window from `nextToSend`. Cumulative-ACK semantics: a single ACK can retire many chunks at once.
  - `observer.onChunkAck(highestContiguousSeq, bytesSent)` where `bytesSent = (highestAcked + 1) * CHUNK_SIZE_BYTES` (capped at `source.sizeBytes`).
  - **Tests:** multi-chunk window-aligned (e.g., 16 chunks fit one full window); larger transfer (300 chunks for 1.2 MB); cumulative ACK consolidation (one `CHUNK_ACK` retires 5 in-flight chunks at once, top-up sends next 5).

- [x] **NAK + Go-Back-N** (extend `chunk_streamer.ts`):
  - On `FW_CHUNK_NAK`: `observer.onChunkNak(lastGoodSeq, reason)`. If `reason === 'FLASH_FULL'`, reject with `TransferError('flash_full', ...)`. Otherwise (CRC, SIZE, OUT_OF_ORDER): clear `inFlight`, set `nextToSend = lastGoodSeq + 1`, set `highestAcked = lastGoodSeq`. Loop continues, refills window from new `nextToSend`.
  - **Tests:** NAK at seq=N clears the in-flight window and restarts from N+1; consecutive NAKs converge correctly; NAK with `FLASH_FULL` rejects with the right error code.

- [ ] **Per-chunk timeout + retry counter** (extend `chunk_streamer.ts`):
  - Each chunk armed with a `setTimeout(ACK_TIMEOUT_MS)` on send. On fire (chunk still in `inFlight`): increment `retries`. If `retries >= MAX_RETRIES_PER_CHUNK`, reject with `TransferError('chunk_retry_exhausted', ...)`. Otherwise call `observer.onRetry(seq, retries)`, resend the chunk (new `MessageGenerator.generateFwChunk` payload), re-arm the timer.
  - On `CHUNK_ACK` retiring a chunk, clear that chunk's timer (`clearTimeout`).
  - **Tests:** single timeout → resend → ACK (retries=1, completes); 3 timeouts on the same chunk → `chunk_retry_exhausted`; concurrent in-flight chunks timing out independently. Use `vi.useFakeTimers()`.

- [ ] **Backpressure pause/resume** (extend `chunk_streamer.ts`):
  - State flag `backpressurePaused: boolean`. On `FW_BACKPRESSURE { state: 'PAUSE' }`, set `true` and call `observer.onBackpressure(true)`. On `'RESUME'`, set `false`, call `observer.onBackpressure(false)`, top up the window from current state.
  - During pause: in-flight ACKs still drain (advance `highestAcked`), but no new chunks sent until resume.
  - **Tests:** PAUSE arrives mid-window → no new sends until RESUME; PAUSE during full window → in-flight ACKs still retire entries (verify `inFlight.size` shrinks); RESUME refills the window from the now-current `nextToSend`.

- [ ] **Whole-transfer watchdog** (extend `chunk_streamer.ts`):
  - On entry to the chunk-loop phase (after BEGIN_ACK), arm `setTimeout(TRANSFER_TIMEOUT_MS)`. On fire: reject with `TransferError('transfer_timeout', ...)`.
  - On any successful transfer (END_ACK status=OK), clear the watchdog before resolving.
  - On any rejection, clear the watchdog in the `finally` cleanup.
  - **Tests:** transfer that hangs past 5 min → `transfer_timeout`; successful transfer doesn't fire a stale watchdog after resolution (assert no late warn / setTimeout still pending). Use `vi.useFakeTimers()`.

- [ ] **AbortSignal cancellation** (extend `chunk_streamer.ts`):
  - In `run(_, _, opts)`, register `opts.signal?.addEventListener('abort', ...)`. On abort: reject with `TransferError('aborted', ...)`. Cleanup unregisters the listener.
  - **Tests:** abort during BEGIN-wait rejects; abort during chunk-loop rejects; abort during END-wait rejects; cleanup runs (subscriber disposer called, all timers cleared). Verify no listener leak after run() settles via `signal.removeEventListener` spy.

- [ ] **Pre-transfer error codes** (extend `chunk_streamer.ts`):
  - `source_read_failed`: wrap `fs.readFile` (or `fsp.open` + `read`) in try/catch; on fs error, reject with `TransferError('source_read_failed', err.message, transferId, err.code)`.
  - `begin_timeout`: BEGIN_ACK wait uses `setTimeout(ACK_TIMEOUT_MS)`. Reject if no ACK arrives.
  - `begin_rejected`: BEGIN_ACK with non-READY status rejects with the master's reason code in `detail`.
  - **Tests:** mock `fsp.readFile` to throw; deliver no BEGIN_ACK; deliver BEGIN_ACK with reject status. Each rejects with the right code + cleanup runs.

- [ ] **Post-transfer error codes** (extend `chunk_streamer.ts`):
  - `end_timeout`: END_ACK wait uses `setTimeout(ACK_TIMEOUT_MS)`. Reject if no ACK arrives.
  - `hash_mismatch`: END_ACK with `status: 'HASH_MISMATCH'` rejects with master's computed-hash in `detail`.
  - `master_io_error`: END_ACK with `status: 'IO_ERROR'` rejects.
  - **Tests:** deliver no END_ACK; deliver END_ACK with each non-OK status; cleanup runs in each case.

- [ ] **`bus_send_failed` + cleanup invariants verification** (extend `chunk_streamer.ts` + tests):
  - On any thrown error from `bus.send()`, reject with `TransferError('bus_send_failed', ...)`. The subscriber and timers must still clean up.
  - **Tests:** `FakeSerialBus.send = vi.fn(() => { throw ... })` — assert rejection + cleanup. Cross-cutting cleanup tests: for every error path, assert (a) subscriber disposer called, (b) all per-chunk `setTimeout` IDs cleared, (c) transfer watchdog cleared, (d) AbortSignal listener removed, (e) Buffer reference dropped (verify via `WeakRef` or by ensuring `result.totalBytesSent === 0` after early failures so the buffer is no longer referenced by the streamer).

## Verification

- [ ] `npm run build` clean (lint + tsc).
- [ ] `npm run test` green (post-c.6a baseline 483 + ~40 new tests = ~523).
- [ ] `npm run prettier:write` and `npm run lint:fix` clean.
- [ ] Pre-commit code review (`superpowers:requesting-code-review`) run on each implementation commit per CLAUDE.md.
- [ ] No new fs / network / serial imports in `chunk_streamer.ts` — only `SerialBus` consumption + `MessageGenerator` for payload building. (`fs.readFile` is the one fs touch; document why.)
- [ ] `WorkerSerialBus` adapter is the only file with `worker_threads` imports.
- [ ] Manual smoke deferred to c.6c (where the orchestrator + PTY harness exercises the full flow against a fake-master).

## Source files in scope (3)

1. `astros_api/src/models/firmware/chunk_streamer.ts` — types: `TransferSpec`, `StreamObserver`, `TransferResult`, `FwInboundAck`, `SerialBus` interface, `TransferError`, `TransportConfig`
2. `astros_api/src/firmware/serial_bus.ts` — `WorkerSerialBus` production adapter
3. `astros_api/src/firmware/chunk_streamer.ts` — `ChunkStreamer` class + `TRANSPORT_DEFAULTS`

Plus tests:
4. `astros_api/src/firmware/chunk_streamer.test.ts` — tests + inline `FakeSerialBus`

4 files, well under the 10-file cap. **Does not modify any existing source module** — types reference `FwStage` from c.1 only via `MessageGenerator`'s message types; no inbound dep on c.6a's FSM.

**Also in this PR's diff (out of c.6b's feature scope):** the design spec at `.docs/specs/20260502-1700-firmware-ota-c-6b-chunk-streamer-design.md` (already committed) and this plan file.

## Out of scope (deferred to c.6c)

- **JobLock injection into `WorkerSerialBus`.** When `kind === 'normal'` and JobLock is held, the adapter should silently discard the message and `logger.warn({ lockOwner }, 'serial send dropped — JobLock held')`. Discard rather than throw — an unhandled rejection from a background-emitted serial send could crash the worker. Primary defense remains c.0/c.2's `writeGuard` + `rejectIfLocked`.
- **Migration of existing direct `worker.postMessage` callers** (in `api_server.ts` etc.) to go through `SerialBus`. Each migrated send site declares its `kind`. This is the broader refactor that gives the system one canonical serial-write entry point.
- **Drop counter** for operability surfaced in `system_status.ts` (or wherever metrics live). Operator-visible signal: "during flash job X, N normal sends were dropped" — anything > 0 means a `writeGuard` regression slipped past or a background task is sending without going through the guard.
- **End-to-end drop-policy test** in c.6c's PTY harness: hold JobLock, fire a `normal` send, assert nothing reaches the wire.
- **Deploy phase** (`FW_DEPLOY_BEGIN` send + receive `FW_PROGRESS` from master + `FW_DEPLOY_DONE`). Different mechanics than upload (no sliding window, master-driven progress reports).
- **`FlashJobState` / `ControllerFlashState` translation** from transport events. c.6c's responsibility — it observes `onChunkAck` and calls `transitionControllerState` on each tracked controller.
- **Source resolution** (cache vs upload, variant matching). c.6c picks the source given a request; c.6b takes a resolved `TransferSpec`.
- **Real Worker integration smoke test.** The `WorkerSerialBus` adapter ships untested against a real `serial_worker.js`. Verified in c.6c's PTY harness.

## Failure modes

c.6b has concurrency (in-flight Map + multiple per-chunk timers + watchdog timer + AbortSignal listener), network-adjacent I/O (the serial wire), and resource-lifecycle concerns (Buffer, subscribers, timers). Per CLAUDE.md, this warrants a full FMI before implementation.

### 1. External-call error coverage

| Call | Error / condition | Response |
|------|-------------------|----------|
| `fsp.readFile(source.path)` | ENOENT | reject `source_read_failed`; cleanup runs |
| `fsp.readFile(source.path)` | EACCES / EIO | reject `source_read_failed`; cleanup |
| `bus.send(payload, kind)` | thrown error | reject `bus_send_failed`; cleanup |
| `bus.subscribeFwAcks` | thrown (shouldn't happen, but defensive) | reject `bus_send_failed`; no subscriber to dispose |
| `setTimeout` callback fires after `clearTimeout` | impossible (semantically) | N/A — `clearTimeout` is synchronous |
| AbortSignal abort fires multiple times | listener should fire only once | use `{ once: true }` option |
| `MessageGenerator.generateFwChunk` | thrown error (oversized payload, etc.) | propagate via the same `bus_send_failed` path; this is a programming bug not a runtime expectation |

**Common gotchas:**
- A `setTimeout` whose callback runs synchronously after `clearTimeout` returns is impossible in Node — `clearTimeout` removes the entry from the timer wheel before returning. So `clearTimeout` followed by `inFlight.delete(seq)` is race-free.
- Cumulative-ACK can advance `highestAcked` past entries we've never seen tracked (master is faster than our window). Defensive: only retire entries that exist in `inFlight`; no-op for the rest.
- A `BEGIN_ACK` arriving after `begin_timeout` already fired (race between timeout and ACK delivery) must not double-resolve. Track an `aborted` / `settled` flag and ignore late events.

### 2. State-transition matrix

Single transfer happy-path state progression (from `run()` entry):

| State | Mutations | Exit on |
|---|---|---|
| `awaiting_begin_ack` | subscriber registered; BEGIN sent; ACK timer armed | BEGIN_ACK arrives → `streaming`; timer fires → reject `begin_timeout`; ACK rejects → reject `begin_rejected`; abort → reject `aborted` |
| `streaming` | watchdog armed; window filling; per-chunk timers armed; CHUNK_ACK retires entries; CHUNK_NAK does Go-Back-N; BACKPRESSURE flips pause flag | All chunks acked + `nextToSend > lastSeq` → `awaiting_end_ack`; per-chunk retry exhausted → reject `chunk_retry_exhausted`; NAK FLASH_FULL → reject `flash_full`; watchdog → reject `transfer_timeout`; abort → reject `aborted`; bus error → reject `bus_send_failed` |
| `awaiting_end_ack` | END sent; ACK timer armed | END_ACK status OK → resolve; END_ACK HASH_MISMATCH → reject `hash_mismatch`; END_ACK IO_ERROR → reject `master_io_error`; timer fires → reject `end_timeout`; abort → reject `aborted` |

Every state has a single exit on every category of event. No state transition is left undefined; each terminal arrow runs the same `finally` cleanup.

### 3. Concurrency state

- **`inFlight: Map<seq, { sentAt, retries }>`:** mutated by send-loop (set), CHUNK_ACK handler (delete), CHUNK_NAK handler (clear), per-chunk timeout handler (read-and-update). All mutations happen on the JS event loop in the same `run()`'s async stack — no actual parallel mutation. **Sync mechanism:** single-threaded JS; safe by construction. **Failure mode:** none if the implementation respects the loop discipline (no `setImmediate` callbacks racing each other to mutate this state).
- **Per-chunk timer set:** one `setTimeout` ID per in-flight chunk. Cleared synchronously when the chunk is acked or when the run rejects. **Sync mechanism:** map keyed by seq; `clearTimeout` is idempotent. **Failure mode:** if a timer fires for a chunk that was just retired (race between ACK arrival and timer fire), the handler must check `inFlight.has(seq)` before acting — defensive guard.
- **AbortSignal listener:** added once on entry, removed in `finally`. **Sync mechanism:** the `{ once: true }` option ensures the handler doesn't fire twice. **Failure mode:** if added with no `once` and the signal aborts twice (operator panic-clicks), the rejection is attempted twice. Use a `settled` flag or `once: true`.
- **Subscriber:** `bus.subscribeFwAcks` returns a disposer; called once in `finally`. Subscriber receives messages in arrival order (single-threaded); no reordering risk.

### 4. Cross-platform / cross-environment

- **Node `worker_threads.Worker`:** behavior identical across Linux / macOS / Windows. `postMessage` is structured-clone; we send strings only.
- **`setTimeout` resolution:** Node defaults to ~1 ms minimum. ACK_TIMEOUT_MS = 1500 ms is comfortably above any platform jitter.
- **`AbortSignal`:** standard since Node 16; the production runtime is well past that.
- **`fs.readFile`:** synchronous behavior across platforms; ENOENT codes are stable.

### 5. Pre-existing on-disk state

c.6b touches no persistent state. The source bin is read once and the Buffer is dropped. No sidecars, no caches.

If the source path doesn't exist (orchestrator handed us a stale path because the cache evicted it, etc.), `fsp.readFile` throws ENOENT → `source_read_failed`. Orchestrator's job to verify the path is still valid before calling `run()`; c.6b just propagates the error.

### 6. Hostile / malformed input

- **`TransferSpec.transferId`:** used as a key in `subscribeFwAcks`. The subscriber filters incoming messages by `transferId` — no path interpolation, no fs use. Safe even with arbitrary strings.
- **`TransferSpec.source.path`:** passed to `fsp.readFile`. The orchestrator's responsibility to validate paths before passing them; c.6b doesn't re-validate. Documented in spec.
- **`TransferSpec.source.sha256`:** sent verbatim in `FW_TRANSFER_BEGIN`. Master verifies on its side. c.6b doesn't compute or re-verify.
- **`FwInboundAck` messages from the bus:** the bus is trusted (it's our own adapter). `FwInboundAck` shapes are typed; an adapter delivering a malformed shape is a bug. Defensive: validate `transferId` matches before processing; ignore otherwise.
- **`MessageGenerator` outputs:** trusted (c.1's surface). If `generateFwChunk` throws on oversized payload, that's a bug in our chunk-size config, not a runtime input.

### 7. Resource lifecycle audit

| Resource | Created | Cleanup happy path | If cleanup doesn't run |
|---|---|---|---|
| Source `Buffer` (~1.2 MB) | `run()` step 2 (after readFile) | reference dropped at end of `run()` (function scope ends) | If retained by a closure (e.g., the watchdog's setTimeout callback), GC delayed but bounded by process lifetime |
| Subscriber registration | `run()` step 1 | `finally` calls disposer | Bus accumulates orphan handlers; bounded by process lifetime; in c.6b's tests, a leak would surface via FakeSerialBus's subscriber count assertion |
| Per-chunk `setTimeout` IDs | each send | `clearTimeout` on ACK / NAK / cleanup | Late fire → handler checks `inFlight.has(seq)` and no-ops; no incorrect mutation |
| Whole-transfer watchdog timer | streaming-state entry | `clearTimeout` on resolve / reject | Late fire → handler checks `settled` flag and no-ops |
| AbortSignal listener | `run()` start (if signal provided) | `removeEventListener` in `finally` | Listener leaks on the signal — could fire on a future unrelated abort. Use `{ once: true }` to bound to one fire; explicit `removeEventListener` to prevent dangling listeners |
| `inFlight` Map entries | each send | `delete` on ACK; `clear` on NAK / reject | Map grows unbounded if neither happens — but the chunk-retry-exhausted / aborted / watchdog paths all hit `finally`, which can't run without clearing |

The most likely real bug: **a per-chunk timer firing for a chunk that's already been acked or retired by Go-Back-N, mutating `inFlight` it shouldn't touch.** Mitigation: every timer callback checks `inFlight.has(seq)` before doing anything; the `clearTimeout` semantics + JS event-loop ordering should prevent this in practice but the defensive guard is cheap.

## Notes for the reviewer

- **Why no FSM coupling:** ChunkStreamer doesn't know `FwStage` or `ControllerFlashState`. It produces transport-layer events; c.6c translates. Reduces test surface (no FSM fixtures needed for c.6b tests) and keeps the layers reusable.
- **Why required `kind` parameter on `SerialBus.send`:** TypeScript catches every call site at compile time. c.6c migration of existing `worker.postMessage` callers becomes a compiler-driven exercise (every site declares its kind explicitly).
- **Why discard rather than throw** for the c.6c JobLock-aware drop policy: an unhandled rejection from a background serial send could crash the worker. Drops are a safety net (the primary defense is `writeGuard`/`rejectIfLocked`); they shouldn't be a primary error channel.
- **Buffer-once vs streaming:** read the source bin into one ~1.2 MB Buffer at start. Streaming would complicate Go-Back-N (need to seek the file handle back). The protocol forbids concurrent transfers via JobLock single-flight, so the memory cost is bounded.
- **`MessageGenerator` is the framing source of truth.** c.6b doesn't reimplement base64 / CRC-16 / line-delimited framing — those land via `generateFwTransferBegin`, `generateFwChunk`, `generateFwTransferEnd` from c.1. If the framing changes, c.6b doesn't need to.
- **The PTY-stub end-to-end test deferred to c.6c is the right place for it.** c.6b's FakeSerialBus is purpose-built for sender-state-machine tests against synthetic master responses; PTY tests genuine wire-level behavior with a fake-master process. Different scopes, different tools.
