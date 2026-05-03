# c.6c.1 — FlashJob orchestrator + source resolver + HTTP/WS surface

**Branch:** `feature/firmware-ota-c-6c-1-orchestrator` (off `develop`).
**PR target base:** `develop`.
**References:**
- [decomposition plan](../plans/20260427-2202-firmware-ota-decomposition.md) §§ "Sub-project decomposition" + "C. Server ↔ Master / Vue"
- [c.6a plan](../plans/20260502-1500-firmware-ota-c-6a-flash-job-state.md) — FlashJob FSM types + transitions (consumed)
- [c.6b spec](./20260502-1700-firmware-ota-c-6b-chunk-streamer-design.md) — sliding-window chunk streamer (consumed)
- [c.4 firmware cache](./../../astros_api/src/firmware/firmware_cache.ts) — `FirmwareCache.fetch()` source
- [c.5 firmware uploads](./../../astros_api/src/firmware/firmware_upload_store.ts) — `FirmwareUploadStore.latest()` source

## Context

c.6c is the third sub-project of c.6 under the by-layer split. c.6a shipped pure FSM types + transitions; c.6b shipped the sliding-window chunk streamer (transport). c.6c composes both, adds JobLock-aware single-flight gating, source resolution, HTTP triggers, and WebSocket emit points.

c.6c is itself split two ways: this spec (**c.6c.1**) ships the orchestrator + source resolver + HTTP/WS surface, all unit-tested with fakes. **c.6c.2** (separate spec/plan/PR) ships the PTY-stub harness + integration tests. The split keeps the orchestrator review focused on state-machine correctness; c.6c.2 owns the external-dependency-heavy `node-pty` / `socat` work.

c.6c.1's payoff: by the time c.6c.2 is written, the orchestrator's failure routing, JobLock lifecycle, and WS emit semantics are pinned in tests. The harness exercises the integration but doesn't have to re-litigate orchestrator-internal correctness.

## Architecture

```
HTTP                            WS (broadcast to clients)
 │                              ▲
 ├── POST /api/firmware/flash   │ flashJobStarted / flashControllerUpdate /
 ├── DELETE  /api/firmware/flash│ flashControllerResult / flashJobDone /
 └── GET     /api/firmware/flash│ flashJobFailed / lockStateChanged
       │                        │
       ▼                        │
 firmware_flash_controller ─────┤
       │                        │
       ▼                        │
 FlashJobOrchestrator ──────────┤
   ├── currentJob: FlashJobState│ (also sourced for late-join snapshot)
   ├── abortController          │
   ├── reboot timer (15 s)      │
   ├── streamerFactory          │
   └── deploy-event subscriber  │
       │                        │
       ├──┬──── transitionControllerState() / deriveJobLifecycle() (c.6a)
       │  │
       │  ├──── ChunkStreamer.run(spec, observer, { signal })   (c.6b)
       │  │       └── SerialBus.subscribeFwAcks (existing channel)
       │  │
       │  └──── SerialBus.subscribeDeployEvents (NEW typed channel)
       │             ↑
       │             │ FW_PROGRESS / FW_DEPLOY_DONE
       │
       ├──── JobLock.acquire/release (c.0)
       │
       └──── resolveFlashSource() ──┬──── FirmwareCache.fetch()  (c.4)
                                    └──── FirmwareUploadStore.latest() (c.5)
```

The orchestrator owns at most one `currentJob: FlashJobState | null` at a time (JobLock-enforced), drives FSM transitions in response to streamer events + deploy events + the post-reboot heartbeat callback, and emits 6 typed WS events.

Two-phase flow per job:

- **Upload phase** — drive `ChunkStreamer.run()` with all controllers in `UploadingToMaster`. Streamer events (`onChunkAck`, `onTransferEnd`, etc.) translate to throttled `flashControllerUpdate` emissions
- **Deploy phase** — after streamer succeeds, send `FW_DEPLOY_BEGIN`, then per-controller `FW_PROGRESS` / `FW_DEPLOY_DONE` events drive each controller through `Sending → Verifying → Rebooting → VersionConfirmed` (or `→ Failed`)

After all controllers terminal, orchestrator emits `flashJobDone` and starts a 15-sec reboot timer; JobLock releases on heartbeat callback OR timer expiry (whichever first), emitting `lockStateChanged`.

## Components

**New source files (5):**

| Path | Responsibility |
|---|---|
| `astros_api/src/firmware/flash_orchestrator.ts` | `FlashJobOrchestrator` class. Public surface: `start(request)`, `cancel(reason)`, `notifyMasterHeartbeat(version?)`, `getCurrentJob()`. Includes the small private helpers `resolveFlashSource()` (~40 lines) and `flashProgressThrottle()` (~30 lines) inline rather than separate files |
| `astros_api/src/firmware/flash_orchestrator.test.ts` | Orchestrator unit tests against fake bus + fake streamerFactory + fake cache/upload + fake controllersStore + real JobLock |
| `astros_api/src/controllers/firmware_flash_controller.ts` | Express routes — `POST /api/firmware/flash`, `DELETE /api/firmware/flash`, `GET /api/firmware/flash` |
| `astros_api/src/controllers/firmware_flash_controller.test.ts` | HTTP-level tests with supertest |
| `astros_api/src/models/firmware/flash_orchestrator.ts` | Typed `FlashRequest`, `FwDeployEvent` discriminated union (FW_PROGRESS / FW_DEPLOY_DONE variants) |

**Modified source files (4):**

| Path | Change |
|---|---|
| `astros_api/src/firmware/serial_bus.ts` | Add `subscribeDeployEvents(transferId, handler)` to `WorkerSerialBus`. The handler receives typed `FwDeployEvent` variants (FW_PROGRESS / FW_DEPLOY_DONE). Returns disposer |
| `astros_api/src/firmware/serial_bus.test.ts` | Tests for the new method (filter by transferId, dispose detaches listener, cross-talk between subscribers) |
| `astros_api/src/models/firmware/chunk_streamer.ts` (the types module) | Extend `SerialBus` interface with `subscribeDeployEvents`. `FwInboundAck` stays unchanged — deploy events are a separate typed channel |
| `astros_api/src/api_server.ts` | Instantiate `FlashJobOrchestrator` (passing the existing serial worker via `WorkerSerialBus`); register flash routes; wire late-join WS snapshot via `orchestrator.getCurrentJob()`; the `notifyMasterHeartbeat` wiring into the POLL handler is **deferred** to a follow-up PR (see "Out of scope") |

**Spec / plan / QA docs:**

- `.docs/specs/20260503-0910-firmware-ota-c-6c-1-orchestrator-design.md` (this file)
- `.docs/plans/<timestamp>-firmware-ota-c-6c-1-orchestrator.md` (lands next, includes FMI section)
- `.docs/qa/firmware-ota-flash.md`

**Scope-guard note:** ~9 source files / ~13 tasks — at the upper edge of CLAUDE.md's `~8 tasks / 10 files` threshold. c.6b shipped at similar size via subagent-driven development. Plan-time scope check: if the plan surfaces work as larger than expected, sub-split into c.6c.1.a (orchestrator core) + c.6c.1.b (HTTP/WS surface) before implementation begins.

## Public API

**`FlashJobOrchestrator`** (constructed once in `api_server.ts`):

```ts
interface FlashJobOrchestratorOpts {
  bus: SerialBus;
  jobLock: JobLock;
  cache: { fetch(release, asset): Promise<CachedAsset> };
  upload: { latest(): Promise<StoredUpload | null> };
  controllersStore: { listInLocation(): Promise<string[]> };
  emitWs: (msg: TransmissionMessage) => void;
  streamerFactory?: (opts: ChunkStreamerOpts) => Streamer;  // default returns real ChunkStreamer
  clock?: Clock;                                             // default = real timers
  config?: { rebootTimeoutMs?: number; throttleWindowMs?: number };
}

class FlashJobOrchestrator {
  constructor(opts: FlashJobOrchestratorOpts);
  start(request: FlashRequest): Promise<{ jobId: string; transferId: string; source: FlashSource; targets: string[] }>;
  cancel(reason: string): Promise<{ jobId: string } | null>;  // null if no active job
  notifyMasterHeartbeat(version?: string): void;
  getCurrentJob(): FlashJobState | null;
}
```

`Streamer` is a narrow interface that `ChunkStreamer` satisfies — keeps the test seam tight:

```ts
interface Streamer {
  run(spec: TransferSpec, observer: StreamObserver, opts?: { signal?: AbortSignal }): Promise<TransferResult>;
}
```

## HTTP API

```
POST /api/firmware/flash
  body: { source: { kind: 'github', version: string } | { kind: 'upload' } }
  200 → { jobId, transferId, source: FlashSource, targets: string[] }
  409 → { error: 'job_already_running', currentJobId }
  4xx → { error: 'source_resolution_failed' | 'no_controllers' | 'invalid_request', detail }

DELETE /api/firmware/flash
  200 → { jobId, cancelled: true }      # active job → cancel reasons logged
  404 → { error: 'no_active_job' }

GET /api/firmware/flash
  200 → FlashJobState | null            # polling fallback; WS is the primary channel
```

## WebSocket events

All wrapped as `{ type: TransmissionType, data: ... }`:

| Type | Trigger | Payload |
|---|---|---|
| `flashJobStarted` | Job acquired lock + `currentJob` set; *also sent on WS late-join* if a job is in flight | full `FlashJobState` |
| `flashControllerUpdate` | Per-controller progress (throttled — 4 Hz per-controller, leading edge) | `{ jobId, controller: ControllerFlashState }` |
| `flashControllerResult` | Per-controller terminal transition (`VersionConfirmed` or `Failed`) — bypasses throttle | `{ jobId, controller: ControllerFlashState }` |
| `flashJobDone` | All controllers terminal (`deriveJobLifecycle === 'done'`) | `{ jobId, endedAt }` |
| `flashJobFailed` | `abortReason` set | `{ jobId, abortReason, endedAt }` |
| `lockStateChanged` | JobLock acquire / release | `LockState` (existing shape) |

**Late-join**: when a new WS client connects, `api_server`'s connect handler asks `orchestrator.getCurrentJob()`. If non-null, sends `flashJobStarted` with the snapshot (carries all in-flight controller states applied to date). If null, sends nothing flash-related — late-join clients don't see completed jobs (no history persistence in v1, per decomp's "v1 non-goals").

## Data flow

### Happy path

1. `POST /api/firmware/flash` arrives → controller calls `orchestrator.start(request)`
2. Acquire `JobLock` (synchronous boolean gate). Already-held → throw, controller returns HTTP 409 with `currentJobId`. On acquire → emit `lockStateChanged { locked: true, owner: jobId }`
3. Generate `jobId` (uuid), `transferId` (uuid)
4. `resolveFlashSource(request, cache, upload)` → `FlashSource { path, sha256, sizeBytes, displayName }`. Cache misses or empty upload throw → see error path A
5. Read controllers list via `controllersStore.listInLocation()` → target IDs
6. Build initial `FlashJobState` (all controllers `Queued`); set `currentJob = state`; emit `flashJobStarted`
7. Transition all controllers `Queued → UploadingToMaster`; emit throttled `flashControllerUpdate` per controller
8. Instantiate `Streamer` (via injected factory) and `await streamer.run(spec, observer, { signal: abortController.signal })`:
    - `onChunkAck(seq, bytesSent)` → for each controller, update `bytesSent` / `totalBytes`; emit throttled `flashControllerUpdate`
    - `onTransferEnd(endAck)` → upload phase done; promise resolves with `TransferResult`
9. Transition all controllers `UploadingToMaster → Sending`; emit `flashControllerUpdate` per controller (bypasses throttle — stage transition)
10. `bus.send(generateFwDeployBegin({ transferId, order: targetIds }), { kind: 'firmware' })`
11. `bus.subscribeDeployEvents(transferId, handleDeployEvent)`. Per inbound event:
    - `FW_PROGRESS { controllerId, stage, bytesSent, totalBytes }` → `transitionControllerState()`; emit throttled `flashControllerUpdate`
    - `FW_DEPLOY_DONE { controllerId, status: 'OK' | 'ERROR', finalVersion?, error? }` → terminal transition (`VersionConfirmed` or `Failed`); emit `flashControllerResult` (bypasses throttle)
12. When `deriveJobLifecycle(state) === 'done'` (all controllers terminal): emit `flashJobDone`; start 15-sec reboot timer
13. Reboot timer expires (heartbeat detection deferred per "Out of scope"): release `JobLock`; emit `lockStateChanged { locked: false }`; clear `currentJob = null`

### Error paths

| Code | Trigger | Handling |
|---|---|---|
| **A** — source-resolution failure | Cache miss, upload empty, c.6b's `source_size_mismatch` from disk-vs-manifest divergence, etc. | Release `JobLock` (acquired in step 2); emit `flashJobFailed { reason }`; HTTP 4xx; `currentJob` never set |
| **B** — streamer rejects with `TransferError` | Any of the 12 codes from c.6b | Set `abortReason = error.code`; transition all currently-non-terminal controllers to `Failed`; emit `flashControllerResult` per affected controller, then `flashJobFailed`; release `JobLock`; clear `currentJob` |
| **C** — per-controller deploy failure | `FW_DEPLOY_DONE { status: 'ERROR' }` for one controller; others succeed | That controller transitions to `Failed`; emit `flashControllerResult`. Job *continues* for other controllers. When all terminal → emit `flashJobDone` (NOT failed — per c.6a's `deriveJobLifecycle`, "done" includes mixed terminal results). 15-sec reboot timer still runs |
| **D** — cancel during upload | `DELETE /api/firmware/flash` → `orchestrator.cancel('user')` | `abortController.abort('user-cancel')` → streamer rejects with `TransferError 'aborted'` → falls through to error path B with `reason: 'aborted'` |
| **E** — cancel during deploy | Same trigger, but past upload | Best-effort: orchestrator unsubscribes from deploy events, sets `abortReason: 'cancelled'`, transitions remaining non-terminal controllers to `Failed`, emits `flashControllerResult` + `flashJobFailed`, releases `JobLock`. Master continues forwarding to controllers regardless (protocol-level limitation) |
| **F** — master never heartbeats | 15-sec timer fires after `flashJobDone` | Normal v1 path — release `JobLock` via timer. Job state already shows done; lock release just gates the next concurrent flash |

## Throttling (`flashProgressThrottle`)

Per-controller leading-edge throttle, 250 ms window (4 Hz):

- First update in a window → emit immediately, mark `lastEmittedAt = now`
- Subsequent updates within 250 ms → store as `pendingState`, schedule a flush timer (idempotent)
- Stage transitions (`UploadingToMaster → Sending`, `Sending → Verifying`, etc.) bypass throttle — emit immediately, flush any pending. Same for terminal transitions
- Cleanup: pending timers cleared on `flashJobDone` / `flashJobFailed` / cancel

## Testing

**Test seams** (all injected via constructor):

- **`streamerFactory: (opts) => Streamer`** — interface narrows `ChunkStreamer` to its `run(spec, observer, opts)` signature. Tests inject a fake that returns a controllable promise + a scripted observer-event emitter. Default factory returns real `ChunkStreamer`
- **`bus: SerialBus`** — `FakeSerialBus` extends c.6b's pattern with `subscribeDeployEvents(...)` + a test-only `deliverDeployEvent(transferId, event)` driver
- **`cache: { fetch(...) }`, `upload: { latest() }`** — narrow interfaces matching c.4 / c.5 surfaces; tests inject fakes that resolve / reject as needed
- **`controllersStore: { listInLocation() }`** — small interface pulling target IDs from existing controllers data
- **`jobLock: JobLock`** — real c.0 `JobLock` (already simple synchronous boolean; no fake needed)
- **`clock: { now(), setTimeout, clearTimeout }`** — tiny abstraction so the 15-sec reboot timer + 250 ms throttle window are deterministic under `vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })`. Date and setImmediate stay real

**Coverage** (full enumeration in the plan):

- Happy path (start → upload → deploy → reboot timer → release)
- All 12 `TransferError` codes from c.6b → `flashJobFailed` with that reason; controller cleanup correct in each
- Each FW_PROGRESS stage transition (UploadingToMaster→Sending→Verifying→Rebooting)
- FW_DEPLOY_DONE OK and ERROR per controller; mixed terminal results → `flashJobDone` (not Failed)
- Concurrent `start()` rejected with HTTP 409 carrying `currentJobId`
- Cancel during upload (aborts streamer); cancel during deploy (best-effort stop); cancel with no active job → 404
- 15-sec timer fires lock release; `notifyMasterHeartbeat()` fires lock release pre-timer; whichever-first-wins (other gets cleared)
- Late-join snapshot via `getCurrentJob()` returns valid mid-flash state with all in-flight controller updates applied
- Throttle leading-edge fires immediately; mid-window updates pend; stage transitions flush pending
- Source resolution failure releases lock, emits `flashJobFailed`, never sets `currentJob`
- Subscriber lifecycle: `subscribeDeployEvents` filter on `transferId` (events from a stale prior job dropped)

**Mutation discipline** (per CLAUDE.md): defensive features get the revert-and-verify-test-fails treatment. Specific candidates:

- Stage-transition flush bypass (revert → throttle drops the final pre-transition update)
- Heartbeat-vs-timer first-wins (revert → both fire, double release)
- Concurrent-start rejection (revert → second job clobbers first's `currentJob`)
- `subscribeDeployEvents` filter on `transferId` (revert → events from a stale prior job leak into the current one)
- Per-controller `Failed` cleanup on streamer reject (revert → controllers stuck mid-stage)

**Failure-mode inventory** required per CLAUDE.md (concurrency, network-adjacent I/O via serial worker, resource lifecycle for the streamer/timer/subscriber, cross-process state via JobLock). Lives in the plan.

## Out of scope (deferred)

- **PTY-stub harness + integration tests** — c.6c.2's scope. The harness uses `node-pty` / `socat` PTY pair driving a stub-firmware process; verifies the orchestrator's behavior end-to-end against `serial_worker.js` + a fake master. c.6c.1's unit tests use `FakeSerialBus` and a scripted `streamerFactory`
- **`POLL_ACK` version-field protocol extension** — cross-repo dep flagged in PR #70's notes. AstrOs.ESP needs to add a `version` field to `POLL_ACK`; once that lands, a small follow-up server PR wires `api_server`'s POLL handler to extract the version and call `orchestrator.notifyMasterHeartbeat(version)`. Until then, JobLock releases via the 15-sec reboot timer only. The orchestrator method itself ships tested
- **Empty firmware defense at the resolver** — `FlashSource` with `sizeBytes: 0` should be rejected at `resolveFlashSource` time (master's eventual `HASH_MISMATCH` is a more expensive way to discover this). Carry-over from the c.6b cross-cutting review followups
- **Multi-job queue** — v1 is single-flight via JobLock; concurrent requests get HTTP 409, no queueing. Persistence + queue land later if there's demand
- **Per-controller targeting** — request body has no `targets` field; orchestrator always flashes all controllers in the current location. Subset-targeting lands later if there's demand
- **History persistence / job log** — late-join shows only the in-flight job; completed jobs are not retained across server restarts. Persistence is explicit non-goal per the decomp
- **4 Hz throttle outside the orchestrator** — c.7 (WS layer hardening) may add a generic throttle for the broadcast channel. c.6c.1's per-controller throttle is independent and load-bearing for the flash UX

## Notes for the reviewer

- **Why a separate `subscribeDeployEvents` instead of broadening `FwInboundAck`.** c.6b's chunk streamer was deliberately designed with a tight 5-variant `FwInboundAck` union; the streamer's dispatcher routes acks into its sliding-window state machine and ignores anything else. Broadening the union to include `FW_PROGRESS` / `FW_DEPLOY_DONE` would force the streamer to filter at the dispatch gate and re-open the c.6b decision to keep the streamer's contract narrow. A second typed channel keeps each layer (streamer, orchestrator) seeing exactly the events it cares about
- **Why the `streamerFactory` test seam.** Testing the orchestrator with a real `ChunkStreamer` + real `FakeSerialBus` works but is timing-sensitive (driving streamer state through fake-time advances couples orchestrator tests to streamer-internal timing). Injecting a `streamerFactory` lets orchestrator tests script observer events directly — fast and deterministic. The default factory still returns the real `ChunkStreamer`, so production wiring is unchanged
- **Why JobLock acquire happens *before* source resolution.** Per the decomposition doc, the lock acquires before the GitHub download starts — preventing two concurrent flashes from racing on the same cache file or upload-store slot. Source resolution is bounded I/O, so holding the lock across it is acceptable. If resolution fails, the lock releases via error path A
- **Why `flashJobDone` doesn't wait for master heartbeat.** "Job done" means controllers are done (data complete); JobLock release is a separate concern about gating the next concurrent job. Decoupling them lets Vue show "flash complete, master rebooting" between the two events without conflating "I'm rebooting" with "I'm not done yet"
- **Why per-controller `Failed` doesn't fail the whole job.** Per c.6a's `deriveJobLifecycle`, all-terminal controllers (any combination of `VersionConfirmed` and `Failed`) → `'done'`. The protocol's `flashJobFailed` event represents *job-wide* abort (master serial disconnect, hash mismatch on master's SD copy, upload failed), distinct from per-controller `Failed`. A single controller's flash failure is local — others can complete. This matches the user's mental model: "one droid module failed but the rest worked" is a `done` job with a partial-success result, not a wholesale failure

- **Cancel race windows.** `cancel()` returning 404 means "no `currentJob` set." That's true in two narrow windows: (1) the small slice between `JobLock` acquire and `currentJob` being set during source resolution (steps 3–5 of the happy path), and (2) after the job completes but before the reboot timer expires (between step 12 emitting `flashJobDone` and step 13 releasing the lock). The lock IS held in both windows but no job state is exposed yet (window 1) or the job is already done (window 2). Operator behavior: retry cancel a moment later in window 1 (a `flashJobStarted` event will land within ~2 sec); cancel in window 2 is a no-op since the work is already done. Documented rather than special-cased — the race windows are short and the user-visible behavior is sane

## Failure-mode inventory triggers

This module hits multiple FMI triggers per CLAUDE.md, so a full FMI lives in the plan:

- **Concurrency** — orchestrator drives streamer + deploy events + heartbeat callback + abort + reboot timer concurrently; many orderings to consider (heartbeat-during-cancel, second-start-during-release, deploy-event-after-cancel, etc.)
- **Network-adjacent I/O** — serial bus is network-like (worker thread + IPC pipe); failures surface as `bus_send_failed` from c.6b plus the new deploy-subscriber teardown concerns
- **Resource lifecycle** — streamer instance (per-job), abort controller, reboot timer, deploy event subscriber, throttle pending timers — each must be cleaned up on every exit path
- **Cross-process state** — JobLock state lives across requests; not durable but in-memory across HTTP requests + WS broadcast lifecycle
