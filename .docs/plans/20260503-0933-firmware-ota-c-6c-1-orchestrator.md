# c.6c.1 — FlashJob orchestrator + source resolver + HTTP/WS surface

Full plan for c.6c.1, the orchestrator-and-surface half of c.6c. Composes c.6a's FSM with c.6b's chunk streamer behind a `JobLock` single-flight gate, plus source resolution, HTTP triggers, and 6 typed WebSocket events. PTY-stub harness is c.6c.2's scope (separate plan).

**Branch:** `feature/firmware-ota-c-6c-1-orchestrator` (off `develop`).
**PR target base:** `develop`.
**Spec:** [`.docs/specs/20260503-0910-firmware-ota-c-6c-1-orchestrator-design.md`](../specs/20260503-0910-firmware-ota-c-6c-1-orchestrator-design.md) (committed earlier on this branch — read it first; this plan is the task list, not the design).
**References:** [decomposition](./20260427-2202-firmware-ota-decomposition.md) §§ "Sub-project decomposition" + "C. Server ↔ Master / Vue"; c.6a / c.6b plans on the same branch lineage.

## Context

c.6a (PR #72) shipped pure FSM types + transitions (consumed via `transitionControllerState`, `deriveJobLifecycle`, `isControllerStageTerminal`). c.6b (PR #73) shipped the sliding-window chunk streamer (consumed via `ChunkStreamer.run()` + `SerialBus`). c.6c.1 composes both into the operator-facing flash flow.

Two-phase per job: **upload** drives `ChunkStreamer.run()` (all controllers `UploadingToMaster`); **deploy** sends `FW_DEPLOY_BEGIN` then observes per-controller `FW_PROGRESS` plus the job-wide `FW_DEPLOY_DONE` carrying `results: FwDeployDoneResult[]`. After all controllers terminal, `flashJobDone` fires; `JobLock` releases on `notifyMasterHeartbeat()` callback OR a 15-second reboot timer (whichever first).

`POLL_ACK` version-field protocol extension is a cross-repo dep (AstrOs.ESP) deferred to a follow-up PR. c.6c.1 wires the `notifyMasterHeartbeat(version?)` method but `api_server` does NOT call it in v1 — the timer is the only release path.

## API overview

```typescript
class FlashJobOrchestrator {
  constructor(opts: {
    bus: SerialBus;
    jobLock: JobLock;
    cache: { fetch(release: ReleaseInfo, asset: AssetInfo): Promise<CachedAsset> };
    upload: { latest(): Promise<StoredUpload | null> };
    controllersStore: { listInLocation(): Promise<string[]> };
    emitWs: (msg: TransmissionMessage) => void;
    streamerFactory?: (opts: ChunkStreamerOpts) => Streamer;  // default: real ChunkStreamer
    clock?: Clock;                                             // default: real timers
    config?: { rebootTimeoutMs?: number; throttleWindowMs?: number };
  });
  start(request: FlashRequest): Promise<{ jobId, transferId, source: FlashSource, targets: string[] }>;
  cancel(reason: string): Promise<{ jobId } | null>;
  notifyMasterHeartbeat(version?: string): void;
  getCurrentJob(): FlashJobState | null;
}

interface SerialBus {
  send(payload: string, opts: { kind: 'firmware' | 'normal' }): void;
  subscribeFwAcks(transferId: string, handler: (ack: FwInboundAck) => void): () => void;
  subscribeDeployEvents(transferId: string, handler: (event: FwDeployEvent) => void): () => void;  // NEW
}

type FwDeployEvent =
  | { kind: 'progress'; payload: FwProgress }
  | { kind: 'done';     payload: FwDeployDone };
```

**Defaults:** `rebootTimeoutMs = 15_000`, `throttleWindowMs = 250` (4 Hz per-controller).

## File structure

**New source files (5):**

| Path | Responsibility |
|------|----------------|
| `astros_api/src/firmware/flash_orchestrator.ts` | `FlashJobOrchestrator` class + exported helpers `resolveFlashSource()`, `flashProgressThrottle()` |
| `astros_api/src/firmware/flash_orchestrator.test.ts` | Orchestrator unit tests + helper unit tests, `FakeSerialBus` extension, scripted `streamerFactory` |
| `astros_api/src/controllers/firmware_flash_controller.ts` | Express routes: `POST /api/firmware/flash`, `DELETE /api/firmware/flash`, `GET /api/firmware/flash` |
| `astros_api/src/controllers/firmware_flash_controller.test.ts` | HTTP tests with supertest + injected fake orchestrator |
| `astros_api/src/models/firmware/flash_orchestrator.ts` | Typed `FlashRequest`, `FwDeployEvent` discriminated union, `Streamer` narrow interface, `Clock` interface |

**Modified source files (4):**

| Path | Change |
|------|--------|
| `astros_api/src/models/firmware/chunk_streamer.ts` | Extend `SerialBus` with `subscribeDeployEvents(transferId, handler)` returning a disposer |
| `astros_api/src/firmware/serial_bus.ts` | `WorkerSerialBus.subscribeDeployEvents()` impl — separate listener that maps `FwProgressResponse` / `FwDeployDoneResponse` to typed `FwDeployEvent` and filters by `transferId` |
| `astros_api/src/firmware/serial_bus.test.ts` | Tests for `subscribeDeployEvents` (filter by transferId, dispose detaches, cross-talk between subscribers, ignores non-deploy worker messages) |
| `astros_api/src/models/enums.ts` | Replace placeholder `flashJobActive` with the 5 new flash event types in `TransmissionType` enum (keep `lockStateChanged` as-is) |
| `astros_api/src/api_server.ts` | Instantiate `FlashJobOrchestrator`; register flash routes; wire late-join WS snapshot via `orchestrator.getCurrentJob()`. `notifyMasterHeartbeat` wiring deferred (see spec § "Out of scope") |

**Spec / plan / QA docs:**

- `.docs/specs/20260503-0910-firmware-ota-c-6c-1-orchestrator-design.md` (committed)
- `.docs/plans/20260503-0933-firmware-ota-c-6c-1-orchestrator.md` (this file)
- `.docs/qa/firmware-ota-flash.md` (Task 13)

## Failure-mode inventory

This module hits multiple FMI triggers per CLAUDE.md (concurrency, network-adjacent I/O via serial worker, resource lifecycle for streamer/timer/subscriber, cross-process state via JobLock). Sections §1–§7 inventoried below.

### §1 External-call error coverage

| Call | Error / condition | Response |
|------|-------------------|----------|
| `cache.fetch(release, asset)` | rejects (network failure, hash mismatch on disk, ENOSPC during persist) | release JobLock; emit `flashJobFailed { reason: 'source_resolution_failed', detail }`; HTTP 4xx with detail |
| `upload.latest()` | resolves to `null` (no upload exists) | release JobLock; emit `flashJobFailed { reason: 'no_upload' }`; HTTP 400 |
| `upload.latest()` | rejects (fs error reading sidecar/meta) | same as cache.fetch reject path |
| `controllersStore.listInLocation()` | resolves to `[]` (empty location) | release JobLock; emit `flashJobFailed { reason: 'no_controllers' }`; HTTP 400 |
| `controllersStore.listInLocation()` | rejects | same as cache reject path |
| `streamer.run()` | rejects with any of c.6b's 12 `TransferErrorCode` values | error path B (set abortReason, fail non-terminal controllers, emit `flashJobFailed`, release lock) |
| `bus.send(deployBeginPayload, { kind: 'firmware' })` | throws (Worker channel dead) | wrap as `flashJobFailed { reason: 'bus_send_failed', detail }`; transition all controllers to Failed; release lock |
| `bus.subscribeDeployEvents(...)` (subscription itself) | should not throw under any normal condition | if it does (e.g., listener limit), surface as `flashJobFailed { reason: 'subscriber_attach_failed' }` |
| `clock.setTimeout(rebootTimeoutMs)` | should not throw | N/A |
| `emitWs(msg)` | might throw if WS server is mid-shutdown | swallow + log; do NOT fail the orchestrator on WS emit failure (best-effort broadcast already silently drops disconnected clients per existing `updateClients` pattern) |

**Common gotchas to watch for:**
- `cache.fetch()` returns a `CachedAsset` whose `path` may have been swept by a concurrent `pruneToN` between fetch return and orchestrator read — c.4 documents single-flight via inFlight Map but JobLock here adds another layer of single-flight. Verify path still exists at streamer-run time? (No — c.6b's `source_read_failed` already catches this. Documented dependency on c.6b's pre-subscribe error path.)
- An empty `FwDeployDone.results[]` array (master sends "done" with no per-controller entries) → all controllers stuck mid-stage; treat as protocol violation, fail the job.
- A `FwDeployDone` arriving twice (master retransmit) — second invocation finds all controllers already terminal → no-op (idempotent).

### §2 State matrix

The orchestrator's state at every key boundary:

| Boundary | currentJob | JobLock | abortController | rebootTimer | deployUnsubscriber | streamer running |
|----------|-----------|---------|-----------------|-------------|---------------------|------------------|
| At rest (no job) | null | unlocked | null | null | null | no |
| Post-`acquire`, mid-resolve | null | locked | null | null | null | no |
| Post-`flashJobStarted` emit | set (Queued) | locked | new | null | null | no |
| Mid-upload (streamer.run pending) | set (UploadingToMaster) | locked | armed | null | null | yes |
| Post-streamer-success, pre-deploy-subscribe | set (Sending) | locked | armed | null | null | no |
| Mid-deploy (subscribed, awaiting events) | set (Sending+) | locked | armed | null | active | no |
| Post-`FW_DEPLOY_DONE`, pre-`flashJobDone` | set (all terminal) | locked | armed | null | active (about to dispose) | no |
| Post-`flashJobDone`, awaiting heartbeat-or-timer | set (all terminal) | locked | disposed | armed | disposed | no |
| Post-release (heartbeat OR timer fired) | null | unlocked | null | null | null | no |

**Inconsistent rows = bugs.** Specific concerns to test:
- "Cancel during mid-upload" → must transition to "release" with abortController fired, streamer rejected, currentJob cleared
- "Cancel during mid-deploy" → must dispose deployUnsubscriber, set abortReason, terminal-fail non-terminal controllers, release lock
- "Heartbeat arrives during mid-upload" (out-of-protocol — master can't be rebooted yet) → orchestrator IGNORES heartbeat (no rebootTimer armed; nothing to clear)
- "Cancel arrives between flashJobDone and lock release" → cancel returns 404 (currentJob still set but job is done; no-op)
- "Second start arrives during mid-anything" → JobLock.acquire() returns false → throw → HTTP 409

### §3 Concurrency

| Shared resource | Touched by | Sync mechanism | Miss-sync consequence |
|-----------------|-----------|----------------|------------------------|
| `currentJob` (orchestrator instance field) | `start()`, `cancel()`, `getCurrentJob()`, deploy event handler, streamer observer, heartbeat callback, reboot timer | All mutations on the JS event-loop thread; no cross-thread access. JobLock gates `start()` so concurrent `start()` calls are rejected before touching `currentJob` | If JobLock check were missed: second start clobbers first job's state. Tested by mutation discipline. |
| `JobLock` state | `start()`, `cancel()`, internal release path; lock-state subscriber | Synchronous boolean gate (c.0) | Race window: `start()` between `acquire()` returning true and the orchestrator setting up state — `cancel()` arriving in this window returns 404 (no `currentJob` yet). Documented in spec §"Cancel race windows". |
| `abortController` | `start()` (creates), `cancel()` (fires `.abort()`), streamer.run consumes signal | Single owner = orchestrator | If `cancel()` fires after streamer already settled: AbortController `.abort()` is a no-op. Safe. |
| `rebootTimer` | armed in deploy-done handler, cleared by `notifyMasterHeartbeat()` OR fired by clock | Single timer ID stored as instance field | First-fire-wins via guard: timer callback checks `if (rebootTimer === null) return` (heartbeat already cleared it); heartbeat checks `if (rebootTimer === null) return` (timer already fired). Both cleared paths converge to the same release sequence. |
| `deployUnsubscriber` | armed after FW_DEPLOY_BEGIN, disposed at deploy-done OR cancel OR error | Single instance field | If not disposed: stale handler fires for next job's events. Tested. |
| `flashProgressThrottle` per-controller pending state | per-update (orchestrator → throttle), timer flush | per-controller `Map` keyed by controllerId; single-threaded | If Map grew without cleanup: memory leak across jobs. Cleared on `flashJobDone`/`flashJobFailed`/`cancel`. Tested. |

### §4 Cross-platform / cross-environment

c.6c.1 has no fs writes (cache + upload do that; orchestrator only reads via their interfaces) and no platform-specific concerns:

- **`fs.rename` / atomic writes**: N/A — orchestrator doesn't write files
- **Path separators**: N/A — orchestrator passes `spec.source.path` to streamer; resolver receives it from cache/upload
- **`worker_threads.Worker`**: same on all platforms supported by Node 18+
- **Express HTTP routes**: standard
- **`AbortController`**: Node ≥ 16

N/A: this module is composition-layer and pure-TypeScript above the fs / serial layer.

### §5 Pre-existing on-disk state

N/A: orchestrator holds no on-disk state. JobLock is in-memory; `currentJob` is in-memory; reboot timer is in-memory.

If the server crashes mid-flash:
- The flash is interrupted (master may be left mid-deploy with partial state — that's a master-side problem, not c.6c.1's)
- On restart, no orchestrator state survives — fresh start
- Operator can flash again; if master is still running old firmware (didn't reboot after partial deploy), the flash starts cleanly. If master is in a stuck state, operator-side recovery (manual master reboot via existing controls) is needed
- Persistence / restart-survival is explicit non-goal per the decomp; documented in spec §"Out of scope"

### §6 Hostile / malformed input

| Input | Trust boundary | Defense |
|-------|----------------|---------|
| `FlashRequest.source.kind` | HTTP request → orchestrator | TS discriminated union typed; runtime validation via `request.source.kind === 'github' \|\| request.source.kind === 'upload'`; reject with HTTP 400 otherwise |
| `FlashRequest.source.version` (when kind=github) | HTTP request → cache.fetch | Validated against `PATH_SAFE_RE` (existing pattern in c.4). Cache-side validation is authoritative; orchestrator passes through after type check |
| `FwProgress.controllerId` (from worker) | Master → server | Validate against current `state.controllers[]` membership; ignore events for unknown controllerIds (could be a stale-job leak, log + drop) |
| `FwProgress.stage` | Master → server | Validate against `FwStage` enum values; reject unknown stages with `flashJobFailed { reason: 'protocol_violation' }` |
| `FwDeployDone.results[].controllerId` | Master → server | Same as FwProgress: ignore unknown |
| `FwDeployDone.results[].outcome` | Master → server | Closed enum `'OK' \| 'FAILED'`; unknown values → `flashJobFailed { reason: 'protocol_violation' }` |
| `notifyMasterHeartbeat(version)` argument | Worker / api_server → orchestrator | When wired (deferred to follow-up): no validation needed because it just clears the reboot timer; version comparison happens in caller |

### §7 Resource lifecycle

| Resource | Created | Cleanup happy path | If cleanup doesn't run |
|----------|---------|--------------------|------------------------|
| `currentJob` (FlashJobState reference) | `start()` step 6 | Cleared in release path (heartbeat/timer/cancel/error) | Memory leak; next `start()` rejected by JobLock anyway, but `getCurrentJob()` returns stale |
| `JobLock` lock holder | `start()` step 2 | Release in lock-release sequence (heartbeat/timer/cancel/error) | Permanent lock — no further flashes possible until server restart. Test mutations: ensure every error path releases |
| `abortController` instance | `start()` step 3 | Discarded on lock release (just dropped reference) | GC collects; no leak |
| `rebootTimer` setTimeout ID | deploy-done handler | Cleared by `notifyMasterHeartbeat()` first-wins OR fires once | Timer fires later, calls release; but if cleared by heartbeat path, no leak. Test: timer cleared on cancel/error before reboot phase reached |
| `deployUnsubscriber` returned by `subscribeDeployEvents` | post-`FW_DEPLOY_BEGIN` | Disposed in release path (every exit) | Stale listener leak — next job's `subscribeDeployEvents` adds a new listener; old one fires for unrelated events. Tested |
| `streamer` instance | `start()` step 8 | Goes out of scope after `streamer.run()` settles | GC; no leak. AbortController `.abort()` releases internal streamer state per c.6b cleanup invariants |
| `flashProgressThrottle` per-controller pending timers | per-update inside throttle | Cleared on flush OR on job termination | Stale timer leaks across jobs. Cleared via `throttle.dispose()` in release path. Tested |
| WS subscriber `lockStateChanged` listener (existing JobLock pattern) | api_server initial setup | Survives orchestrator lifetime | N/A — orchestrator doesn't own this |

## Tasks

Each task is one logical commit. TDD where applicable. Per CLAUDE.md, `superpowers:requesting-code-review` runs between tests-passing and `git commit` for every implementation task. Subagent-driven dev expected; controller (parent agent) provides per-task context to fresh implementer subagents.

- [ ] **Task 1 — Typed models + WS event enum** (new `astros_api/src/models/firmware/flash_orchestrator.ts`; modify `astros_api/src/models/enums.ts`):
  - In `models/enums.ts`, ADD the 5 new flash event types to the `TransmissionType` enum, immediately after the existing `flashJobActive` entry: `flashJobStarted, flashControllerUpdate, flashControllerResult, flashJobDone, flashJobFailed`. Keep `flashJobActive` as-is — it ships from c.2 (`ws_lock_guard.ts` + `write_guard.ts` build a `FlashJobActiveResponse` frame using it as the `type` discriminator on a write-class WS rejection while a flash job holds the JobLock; the `error` field literal `'flashJobActive'` is part of that wire shape). The 5 new entries serve a different purpose (job lifecycle progress); they don't replace the existing entry.
  - In `models/firmware/flash_orchestrator.ts`:
    - `FlashRequest` discriminated union: `{ source: { kind: 'github', version: string } | { kind: 'upload' } }`
    - `FwDeployEvent`: `{ kind: 'progress', payload: FwProgress } | { kind: 'done', payload: FwDeployDone }`
    - `Streamer` narrow interface: `{ run(spec: TransferSpec, observer: StreamObserver, opts?: { signal?: AbortSignal }): Promise<TransferResult> }`
    - `Clock` interface: `{ now(): number; setTimeout(cb, ms): NodeJS.Timeout; clearTimeout(t): void }` — minimal abstraction so reboot timer + throttle window are deterministic under fake timers
  - **Tests:** none — types-only file. Existing tests (i.e. `system_status.test.ts` if it depends on TransmissionType ordering) should still pass after enum change.

- [ ] **Task 2 — `SerialBus.subscribeDeployEvents` interface + `WorkerSerialBus` impl** (modify `astros_api/src/models/firmware/chunk_streamer.ts`, `astros_api/src/firmware/serial_bus.ts`, `astros_api/src/firmware/serial_bus.test.ts`):
  - Extend the `SerialBus` interface in `models/firmware/chunk_streamer.ts` with `subscribeDeployEvents(transferId: string, handler: (event: FwDeployEvent) => void): () => void`. Include doc-comment explaining: separate typed channel from `subscribeFwAcks`; deploy events flow during the deploy phase (post-FW_DEPLOY_BEGIN); orchestrator owns this subscriber (streamer doesn't).
  - In `serial_bus.ts`, add the impl to `WorkerSerialBus`: separate `worker.on('message', ...)` listener that maps `SerialWorkerResponseType.FW_PROGRESS → { kind: 'progress', payload: msg.payload }` and `FW_DEPLOY_DONE → { kind: 'done', payload: msg.payload }`. Filter by `transferId` (msg.payload.transferId === transferId; otherwise drop). Returns disposer that detaches the listener.
  - **Tests** in `serial_bus.test.ts`:
    - dispatches `FW_PROGRESS` matching transferId with the `progress` kind discriminator + payload
    - dispatches `FW_DEPLOY_DONE` matching transferId with the `done` kind + payload
    - filters out `FW_PROGRESS` whose `transferId` doesn't match
    - filters out non-deploy messages (FW_CHUNK_ACK, POLL responses, etc.)
    - disposer detaches the listener (subsequent emits not delivered)
    - multiple concurrent subscribers (two transferIds) are independent

- [ ] **Task 3 — `resolveFlashSource` exported helper** (new `astros_api/src/firmware/flash_orchestrator.ts`):
  - Module-level export `async function resolveFlashSource(request: FlashRequest, cache, upload): Promise<FlashSource>`. Pseudocode:
    ```ts
    export async function resolveFlashSource(
      request: FlashRequest,
      cache: { fetch(release, asset): Promise<CachedAsset> },
      upload: { latest(): Promise<StoredUpload | null> },
    ): Promise<FlashSource> {
      if (request.source.kind === 'github') {
        const cached = await cache.fetch(/* release, asset derived from version */);
        return {
          kind: 'github',
          version: cached.meta.version,
          sha256: cached.sha256,
          sizeBytes: cached.sizeBytes,
          displayName: `astros-esp ${cached.meta.version}`,
        };
      }
      // kind === 'upload'
      const stored = await upload.latest();
      if (stored === null) throw new Error('no_upload');
      return {
        kind: 'upload',
        version: stored.meta.version,
        sha256: stored.sha256,
        sizeBytes: stored.sizeBytes,
        displayName: stored.meta.originalFilename,
      };
    }
    ```
  - Inline in `flash_orchestrator.ts` (rather than a separate file) per spec §"Components"; exported for direct unit testing.
  - **Tests** in `flash_orchestrator.test.ts`:
    - github source: cache.fetch resolves with valid CachedAsset → returns FlashSource with kind='github'
    - upload source: upload.latest resolves with valid StoredUpload → returns FlashSource with kind='upload', displayName from originalFilename
    - upload source: upload.latest resolves with null → throws Error('no_upload')
    - cache.fetch rejects → propagates the rejection (orchestrator-level catch maps to `flashJobFailed`)
    - upload.latest rejects → propagates

- [ ] **Task 4 — `flashProgressThrottle` exported helper** (extend `flash_orchestrator.ts`):
  - Per-controller leading-edge throttle, configurable `windowMs` (default 250 ms = 4 Hz). Shape:
    ```ts
    export interface FlashProgressThrottle {
      submit(controllerId: string, state: ControllerFlashState, force?: boolean): void;
      dispose(): void;
    }
    export function createFlashProgressThrottle(opts: {
      emit: (state: ControllerFlashState) => void;
      windowMs: number;
      clock: Clock;
    }): FlashProgressThrottle;
    ```
  - Behavior:
    - `submit(id, state, force=false)`: if `force === true` → flush pending for that controller, emit immediately, reset `lastEmittedAt` to now
    - else: if `now - lastEmittedAt[id] >= windowMs` → emit immediately, set `lastEmittedAt[id] = now`
    - else: store as `pending[id] = state`; schedule a flush timer at `lastEmittedAt[id] + windowMs` (idempotent — don't re-arm if already scheduled)
    - When timer fires: if `pending[id]` set → emit it, clear pending, set `lastEmittedAt[id] = now`
    - `dispose()` clears all pending timers + state
  - Stage-transition path: orchestrator calls `submit(id, state, force=true)` on every stage transition (UploadingToMaster→Sending, Sending→Verifying, etc.) and on terminal transitions
  - **Tests** in `flash_orchestrator.test.ts` (use `vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })`):
    - leading-edge: first submit emits immediately
    - mid-window: second submit within `windowMs` does not emit; pending stored
    - mid-window flush: advance time by `windowMs` → pending emits
    - mid-window with `force=true`: emits immediately, clears pending, resets lastEmittedAt
    - per-controller independence: submits for controller A don't affect controller B
    - dispose: clears any scheduled flush timers (verify via `vi.getTimerCount()`)

- [ ] **Task 5 — `FlashJobOrchestrator` class skeleton with happy-path `start()`** (extend `flash_orchestrator.ts`; new `flash_orchestrator.test.ts`):
  - Scaffold the class with constructor accepting all injected deps (per "API overview" above). Module-level defaults for `rebootTimeoutMs = 15_000`, `throttleWindowMs = 250`.
  - `start(request)`: synchronously try `jobLock.acquire(jobId)` — on fail, throw `Error('job_already_running')` with `currentJobId` attached. On success: emit `lockStateChanged`, call `resolveFlashSource()`, call `controllersStore.listInLocation()`, build `currentJob: FlashJobState`, emit `flashJobStarted`, call `streamerFactory({ bus })` and await `streamer.run(spec, observer, { signal })` — but with a no-op observer for now (events are wired in Task 6).
  - On streamer success: skip deploy phase for now (Task 7 wires it). Set all controllers to terminal `VersionConfirmed` with `finalVersion = source.version` (placeholder), emit `flashJobDone`, immediately release JobLock + clear currentJob (no reboot timer yet — that's Task 8).
  - **Test fixture additions:**
    - In `flash_orchestrator.test.ts`, build `FakeSerialBus` extending the c.6b pattern with a `subscribeDeployEvents` method (test-only `deliverDeployEvent(transferId, event)`)
    - Build a scripted `streamerFactory` returning a `Streamer` whose `run` returns a controllable `Promise<TransferResult>` — tests resolve/reject as needed
    - Build fake `cache`, `upload`, `controllersStore` interfaces returning canned data
    - Use the real `JobLock` (c.0) since it's already simple; no fake needed
    - Build a `mockClock: Clock` that wraps `vi.setTimeout`/`clearTimeout`/`Date.now()` for fake-timer tests
  - **Tests** (this is the foundation — many follow-up tasks add to this file):
    - happy path with github source: lock acquired, source resolved, controllers loaded, `flashJobStarted` emitted, streamer awaited, `flashJobDone` emitted, lock released
    - happy path with upload source: same shape, displayName from upload's originalFilename
    - concurrent start: second `start()` while lock held throws `Error('job_already_running')` with `currentJobId`; first job state unchanged
    - controllersStore returns `[]`: lock released, `flashJobFailed { reason: 'no_controllers' }` emitted, currentJob never set, throw HTTP-4xx-shaped error
    - `getCurrentJob()` returns `null` after release; returns the in-flight state mid-flow

- [ ] **Task 6 — Upload-phase wiring (streamer observer translates to controller updates)** (extend `flash_orchestrator.ts`):
  - Replace the no-op observer in `start()` with a real one:
    - On `streamer.run` start: transition all controllers `Queued → UploadingToMaster` (via `transitionControllerState`); emit `flashControllerUpdate` per controller via the throttle (force=true on stage transition)
    - `onChunkAck(highestContiguousSeq, bytesSent)`: update `bytesSent` / `totalBytes` on every controller (same value for all — single-target upload to master); emit throttled `flashControllerUpdate` per controller
    - `onChunkNak(lastGoodSeq, reason)`: log only — c.6b's streamer handles Go-Back-N internally; orchestrator doesn't react. Document.
    - `onTransferEnd(endAck)`: no controller transition (deploy phase is next, not yet wired)
  - **Tests:**
    - streamer start triggers Queued→UploadingToMaster transition for all controllers; `flashControllerUpdate` emitted per controller
    - `onChunkAck` advances `bytesSent` and emits throttled updates; rapid acks coalesce per the throttle's leading-edge behavior
    - throttle bypass on stage transition: every controller's pre-transition pending update flushes (via `force=true`) before the transition emit
    - large transfer (10 chunks, 5 controllers): final `bytesSent` matches `source.sizeBytes` for every controller
    - `onChunkNak` is observed but does NOT mutate controller state

- [ ] **Task 7 — Deploy-phase wiring** (extend `flash_orchestrator.ts`):
  - After `streamer.run()` resolves OK:
    - Transition all controllers `UploadingToMaster → Sending`; emit `flashControllerUpdate` per controller (force=true)
    - Generate FW_DEPLOY_BEGIN payload via `MessageGenerator.generateMessage(SerialMessageType.FW_DEPLOY_BEGIN, ..., { transferId, order: targetIds })`; call `bus.send(msg, { kind: 'firmware' })` wrapped in try/catch (throw → flashJobFailed { reason: 'bus_send_failed' })
    - Subscribe via `bus.subscribeDeployEvents(transferId, handleDeployEvent)`; store disposer in instance field `deployUnsubscriber`
  - `handleDeployEvent`:
    - `{ kind: 'progress', payload }`:
      - Look up controller by `payload.controllerId`; if unknown, log + drop (hostile-input guard per FMI §6)
      - Validate `payload.stage` against `FwStage` enum; unknown → `flashJobFailed { reason: 'protocol_violation' }`
      - `transitionControllerState()` to new stage with bytesSent/totalBytes/detail; if stage changed from prior → throttle.submit(force=true), else throttle.submit(force=false)
      - Emit throttled `flashControllerUpdate`
    - `{ kind: 'done', payload }` (job-wide):
      - For each `result` in `payload.results[]`:
        - Validate `result.controllerId` is known (skip if not — log)
        - Validate `result.outcome` is `'OK' | 'FAILED'` (else `flashJobFailed { reason: 'protocol_violation' }`)
        - Terminal transition: `OK → VersionConfirmed { finalVersion }`, `FAILED → Failed { error }`
        - Emit `flashControllerResult` per controller (bypasses throttle)
      - Dispose deployUnsubscriber (single-shot — done is terminal for the deploy phase)
  - **Tests:**
    - happy path: streamer succeeds → FW_DEPLOY_BEGIN sent on the bus → bus.deliverDeployEvent({ kind: 'progress', ... }) for each stage transition → `flashControllerUpdate` emitted → bus.deliverDeployEvent({ kind: 'done', results: [all OK] }) → `flashControllerResult` per controller, all VersionConfirmed
    - mixed terminal: results[] has one OK + one FAILED → `flashControllerResult` per controller; `deriveJobLifecycle === 'done'` (not failed)
    - protocol violation: payload.stage = 'Bogus' → `flashJobFailed { reason: 'protocol_violation' }`; controllers transition to Failed; lock released
    - unknown controllerId in FW_PROGRESS: dropped silently (logged); other controllers' state unchanged
    - bus.send throws on FW_DEPLOY_BEGIN: `flashJobFailed { reason: 'bus_send_failed' }`; controllers transition to Failed; lock released
    - empty results[]: protocol violation; `flashJobFailed { reason: 'protocol_violation' }`

- [ ] **Task 8 — `flashJobDone` + reboot timer + heartbeat callback** (extend `flash_orchestrator.ts`):
  - When `deriveJobLifecycle(currentJob) === 'done'` (all controllers terminal): emit `flashJobDone { jobId, endedAt }`, arm reboot timer via `clock.setTimeout(rebootTimeoutMs, () => releaseLock('timeout'))`. Store timer ID as `rebootTimer` instance field.
  - Add `notifyMasterHeartbeat(version?: string): void` method:
    - If `rebootTimer === null`: ignore (no job in deploy-done state, OR heartbeat already fired)
    - Else: `clock.clearTimeout(rebootTimer)`, set `rebootTimer = null`, `releaseLock('heartbeat')`
  - `releaseLock(reason)` private method: clear `currentJob = null`, dispose any remaining `deployUnsubscriber`, `throttle.dispose()`, `jobLock.release(jobId)`, emit `lockStateChanged { locked: false }`
  - First-fire-wins: timer callback ALSO checks `if (rebootTimer === null) return` (heartbeat got there first); same guard on heartbeat path
  - **Tests:**
    - all controllers terminal → `flashJobDone` emitted; reboot timer armed
    - heartbeat called pre-timer: lock released; `lockStateChanged` emitted; reboot timer cleared (verify no leak via `vi.getTimerCount() === 0`)
    - timer fires (advance fake time by `rebootTimeoutMs`): lock released; `lockStateChanged` emitted; subsequent `notifyMasterHeartbeat()` is a no-op
    - heartbeat called twice: first releases; second is a no-op (no double-release)
    - heartbeat called with no active job: no-op (no `currentJob`)
    - heartbeat called mid-upload (out-of-protocol): no-op (rebootTimer null)

- [ ] **Task 9 — Cancel mechanism (AbortController + cancel methods)** (extend `flash_orchestrator.ts`):
  - In `start()`, create `this.abortController = new AbortController()` and pass `signal` to `streamer.run`
  - `cancel(reason)` method:
    - If `currentJob === null`: return null
    - Capture `jobId` from currentJob
    - If streamer is still running (we're in upload phase): call `abortController.abort(reason)` → streamer rejects with `TransferError 'aborted'` → falls through to error path B in Task 10
    - If streamer already settled (we're in deploy or post-deploy): dispose `deployUnsubscriber`, set `abortReason = reason` on currentJob, transition all currently-non-terminal controllers to `Failed` with error from the cancel reason, emit `flashControllerResult` for each, emit `flashJobFailed { jobId, abortReason: reason, endedAt }`, `releaseLock('cancel')`
    - Return `{ jobId }`
  - Track upload-vs-deploy phase via `phase: 'upload' | 'deploy' | 'done' | null` instance field updated at phase boundaries
  - **Tests:**
    - cancel during upload: `abortController.abort` fires; streamer mock rejects with TransferError aborted; falls to error path (verified more thoroughly in Task 10)
    - cancel during deploy: deployUnsubscriber disposed, controllers fail-cleanup'd with the cancel reason, `flashJobFailed` emitted with abortReason
    - cancel with no active job: returns null
    - cancel during reboot-timer wait (post-flashJobDone, pre-release): job is "done" — cancel is a no-op (returns null because phase==='done' OR currentJob mid-cleanup)
    - cancel race: cancel arrives before currentJob set (mid-source-resolution): returns null (currentJob === null); start continues to completion (operator can retry cancel after flashJobStarted)

- [ ] **Task 10 — Error paths consolidated (TransferError, source resolution, hostile input)** (extend `flash_orchestrator.ts`):
  - Wrap the `start()` body in try/catch capturing all error sources:
    - **Source resolution failure** (`resolveFlashSource` rejects, `controllersStore.listInLocation()` rejects/empty): release JobLock, emit `flashJobFailed { reason: <derived>, detail }`, throw to HTTP layer with appropriate status
    - **Streamer rejects with `TransferError`**: set `currentJob.abortReason = error.code`, transition all currently-non-terminal controllers to `Failed` with `error: error.detail || error.message`, emit `flashControllerResult` per affected controller, emit `flashJobFailed { jobId, abortReason: error.code }`, releaseLock('failed')
    - **Streamer rejects with non-TransferError**: surface as `flashJobFailed { reason: 'streamer_unknown_error', detail: error.message }`, same cleanup
    - **Bus.send throws on FW_DEPLOY_BEGIN**: covered by Task 7 — included in the same wrap so cleanup is uniform
    - **Protocol violation in deploy event**: same shape — `flashJobFailed { reason: 'protocol_violation', detail }` + cleanup
  - Centralize the cleanup-on-fail logic in a private `failJob(reason, detail)` method to keep error paths DRY
  - **Tests:**
    - each c.6b TransferError code (12 cases) propagates as `flashJobFailed` with `abortReason === code`; controller cleanup verified
    - non-TransferError streamer rejection: `reason: 'streamer_unknown_error'`
    - source resolution: cache.fetch rejects → `reason: 'source_resolution_failed'`
    - source resolution: upload.latest returns null → `reason: 'no_upload'`
    - source resolution: controllersStore returns [] → `reason: 'no_controllers'`
    - mid-deploy TransferError-shaped error (e.g., bus.send throws on FW_DEPLOY_BEGIN): `reason: 'bus_send_failed'`
    - lock state: every error path releases the lock (parameterized over all reasons)
    - currentJob state: every error path clears `currentJob` to null

- [ ] **Task 11 — HTTP controller (Express routes)** (new `astros_api/src/controllers/firmware_flash_controller.ts` + `firmware_flash_controller.test.ts`):
  - `registerFirmwareFlashRoutes(router: Router, auth: any, orchestrator: FlashJobOrchestrator)` — follow audio_controller.ts pattern
  - `POST /api/firmware/flash`:
    - validate `req.body.source` shape
    - call `orchestrator.start(req.body)`
    - on success: 200 with `{ jobId, transferId, source, targets }`
    - on `Error('job_already_running')`: 409 with `{ error: 'job_already_running', currentJobId }`
    - on `Error('no_controllers')`: 400
    - on `Error('source_resolution_failed' | 'no_upload')`: 400 with detail
    - on other: 500
  - `DELETE /api/firmware/flash`:
    - call `orchestrator.cancel(req.body?.reason ?? 'http')`
    - if returned object: 200 with `{ jobId, cancelled: true }`
    - if returned null: 404 with `{ error: 'no_active_job' }`
  - `GET /api/firmware/flash`:
    - return `orchestrator.getCurrentJob()` as 200 (`null` allowed — clients handle empty body)
  - **Tests** (use supertest or vitest's HTTP mocking; existing `controllers/*.test.ts` for pattern):
    - POST happy path → 200 with expected envelope
    - POST concurrent → 409 with currentJobId
    - POST source-resolution-failed → 400
    - DELETE active job → 200 with cancelled:true
    - DELETE no active job → 404
    - GET with active job → 200 with FlashJobState
    - GET with no active job → 200 with null body

- [ ] **Task 12 — `api_server.ts` wiring** (modify `astros_api/src/api_server.ts`):
  - Import `FlashJobOrchestrator`, `WorkerSerialBus`, `registerFirmwareFlashRoutes`
  - In `setupSerialPort()` (or wherever the worker is constructed), build:
    ```ts
    this.workerSerialBus = new WorkerSerialBus({ worker: this.serialWorker });
    this.flashOrchestrator = new FlashJobOrchestrator({
      bus: this.workerSerialBus,
      jobLock: this.jobLock,                              // existing instance
      cache: this.firmwareCache,                          // existing
      upload: this.firmwareUploadStore,                   // existing
      controllersStore: { listInLocation: () => /* derive from existing controllers data */ },
      emitWs: (msg) => this.updateClients(msg),
    });
    ```
  - In route registration block: `registerFirmwareFlashRoutes(this.router, this.authHandler, this.flashOrchestrator);`
  - In WS connect handler: after sending systemStatus snapshot, also send `flashJobStarted` snapshot if `this.flashOrchestrator.getCurrentJob() !== null`:
    ```ts
    const currentJob = this.flashOrchestrator.getCurrentJob();
    if (currentJob !== null) {
      ws.send(JSON.stringify({ type: TransmissionType.flashJobStarted, data: currentJob }));
    }
    ```
  - **Do NOT wire `notifyMasterHeartbeat` into the POLL handler** — deferred per spec §"Out of scope". Add a TODO comment in the POLL handler citing the future PR
  - **Tests:** none directly (api_server.ts is integration-tested via existing test infrastructure; smoke verified manually + via QA plan)
  - Smoke check: `npm run build` clean; `npm run start:tsx` boots without errors

- [ ] **Task 13 — QA test plan + verification** (new `.docs/qa/firmware-ota-flash.md`):
  - QA plan with preconditions (server running, master + controllers connected via PTY harness when c.6c.2 lands; stub via mocked Vue button + curl until then), step-by-step test cases, expected results, edge cases
  - Sections:
    - Trigger flash from cache (POST with kind=github)
    - Trigger flash from upload (POST with kind=upload)
    - Concurrent flash rejection (409)
    - Cancel during upload (DELETE)
    - Cancel during deploy (DELETE)
    - WS late-join mid-flash (open new WS client; verify flashJobStarted received with correct state)
    - Source resolution failure (post unknown github version)
    - Server-shutdown during flash (verify lock auto-release on next start)
  - Verification (run before opening PR):
    - `npm run prettier:write` clean
    - `npm run lint:fix` clean
    - `npm run build` clean
    - `npx vitest run` — full suite green; `flash_orchestrator.test.ts` ~50+ tests, `firmware_flash_controller.test.ts` ~10 tests, `serial_bus.test.ts` extended by ~6 tests
    - `superpowers:requesting-code-review` on the full diff vs `develop`

## Verification

- [ ] `npm run build` clean (lint + tsc).
- [ ] `npm run test` green (existing 548 + ~70 new = ~620 total).
- [ ] `npm run prettier:write` and `npm run lint:fix` clean.
- [ ] No new fs / network imports in `flash_orchestrator.ts` — only existing typed deps + `models/firmware/*`.
- [ ] All FMI §1–§7 items have corresponding tests OR are explicitly marked N/A.
- [ ] FMI §8 reviewer pre-flight checklist completed before PR open.

## Files in scope (9 source + 3 docs)

1. `astros_api/src/models/enums.ts` — modified (TransmissionType enum entries)
2. `astros_api/src/models/firmware/chunk_streamer.ts` — modified (SerialBus interface extension)
3. `astros_api/src/models/firmware/flash_orchestrator.ts` — new
4. `astros_api/src/firmware/serial_bus.ts` — modified
5. `astros_api/src/firmware/serial_bus.test.ts` — modified
6. `astros_api/src/firmware/flash_orchestrator.ts` — new
7. `astros_api/src/firmware/flash_orchestrator.test.ts` — new
8. `astros_api/src/controllers/firmware_flash_controller.ts` — new
9. `astros_api/src/controllers/firmware_flash_controller.test.ts` — new
10. `astros_api/src/api_server.ts` — modified
11. `.docs/specs/20260503-0910-firmware-ota-c-6c-1-orchestrator-design.md` (committed)
12. `.docs/plans/20260503-0933-firmware-ota-c-6c-1-orchestrator.md` (this file)
13. `.docs/qa/firmware-ota-flash.md` — new (Task 13)

9 source files. Same range as c.6b.

## Out of scope (deferred)

Per spec §"Out of scope":
- PTY-stub harness + integration tests (c.6c.2)
- POLL_ACK version-field protocol extension (cross-repo dep with AstrOs.ESP)
- Empty-firmware defense at resolver
- Multi-job queue
- Per-controller targeting
- History persistence
- 4 Hz throttle outside the orchestrator (potential c.7 work)

## Notes for the reviewer

- **Why no `mockClock` injection by default.** `Clock` is an interface with a default impl that delegates to `globalThis.setTimeout`/`Date.now()`. Tests override via constructor injection; production wiring uses default. Keeps the orchestrator's call sites unchanged (`this.clock.setTimeout(...)` always); only the implementation differs.
- **Why the `Streamer` interface narrows `ChunkStreamer`.** Orchestrator tests don't need the streamer's full surface — just `run()`. Narrowing the interface lets `streamerFactory` injection be straightforward (`() => ({ run: ... })` is a valid Streamer). Production wiring constructs a real `ChunkStreamer` whose class shape happens to satisfy `Streamer`.
- **Why `registerFirmwareFlashRoutes` takes the orchestrator instance directly** rather than fetching from a registry. Matches the existing pattern in `audio_controller.ts` (which takes a Kysely DB instance as a parameter) and avoids singleton-state tangle.
- **Why `FwDeployDone` results array gets iterated even if some entries have unknown controllerIds.** The orchestrator drops unknown ones and processes the known ones — partial results are still useful for the controllers we *do* care about. Failing the whole job because the master included a phantom controllerId would be brittle.
- **Why `flashJobActive` is retained alongside the 5 new entries.** Initial plan assumed `flashJobActive` was an unused placeholder; that was wrong — c.2 ships it as the `type` discriminator on a write-class WS rejection frame (`models/networking/lock_responses.ts` → `buildFlashJobActiveResponse()`, called from `guard/ws_lock_guard.ts:29` when a write-class message arrives during a JobLock-held flash). Removing the symbol would break that wire shape. The 5 new entries (`flashJobStarted`, `flashControllerUpdate`, `flashControllerResult`, `flashJobDone`, `flashJobFailed`) describe job lifecycle progress and complement `flashJobActive`'s "your write was rejected because a flash is in progress" semantics. Both stay.
