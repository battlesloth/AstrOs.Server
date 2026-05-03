# c.6c.1 — FlashJob orchestrator + source resolver + HTTP/WS surface

Full plan for c.6c.1, the orchestrator-and-surface half of c.6c. Composes c.6a's FSM with c.6b's chunk streamer behind a `JobLock` single-flight gate, plus source resolution, HTTP triggers, 6 typed WebSocket events, and the POLL_ACK protocol extensions (variant per controller + version on post-reboot heartbeat). PTY-stub harness is c.6c.2's scope (separate plan).

**Branch:** `feature/firmware-ota-c-6c-1-orchestrator` (off `develop`).
**PR target base:** `develop`.
**Spec:** [`.docs/specs/20260503-0910-firmware-ota-c-6c-1-orchestrator-design.md`](../specs/20260503-0910-firmware-ota-c-6c-1-orchestrator-design.md) (committed earlier on this branch — read it first; this plan is the task list, not the design).
**References:** [decomposition](./20260427-2202-firmware-ota-decomposition.md) §§ "Sub-project decomposition" + "C. Server ↔ Master / Vue"; c.6a / c.6b plans on the same branch lineage.

## Context

c.6a (PR #72) shipped pure FSM types + transitions (consumed via `transitionControllerState`, `deriveJobLifecycle`, `isControllerStageTerminal`). c.6b (PR #73) shipped the sliding-window chunk streamer (consumed via `ChunkStreamer.run()` + `SerialBus`). c.6c.1 composes both into the operator-facing flash flow.

Two-phase per job: **upload** drives `ChunkStreamer.run()` (all controllers `UploadingToMaster`); **deploy** sends `FW_DEPLOY_BEGIN` then observes per-controller `FW_PROGRESS` plus the job-wide `FW_DEPLOY_DONE` carrying `results: FwDeployDoneResult[]`. After all controllers terminal, `flashJobDone` fires; `JobLock` releases on `notifyMasterHeartbeat(version)` (primary path) OR a 15-second reboot timer fallback (whichever first).

**POLL_ACK protocol extension is in-scope** for c.6c.1 (per user redirect — ships as a whole feature, not piecewise with placeholders for cross-repo work). The `POLL_ACK` payload gains `variant: string` per controller as a 5th wire-position field (populated from firmware). The version field is NOT a new addition — `firmwareVersion` has already shipped on `ControlModule` since firmware 1.2.0+ (`parts[3]` of POLL_ACK), and the heartbeat-vs-deploy version match reuses that existing field. Server-side parsing extracts variant; `api_server`'s POLL handler updates an in-memory controllers cache with `variant` and calls `orchestrator.notifyMasterHeartbeat(firmwareVersion)` post-deploy when version matches the deployed target. AstrOs.ESP work to populate the new `variant` field lands in lockstep with this PR.

**Shipping in two PRs.** c.6c.1 itself partitions into:

- **Part 1 (this branch's first PR):** Tasks 1-6. Typed models + WS-enum entries, `SerialBus.subscribeDeployEvents`, POLL_ACK `variant` extension, `resolveFlashSource` + `flashProgressThrottle` helpers, `FlashJobOrchestrator` class skeleton with happy-path `start()` + variant validation. The orchestrator class is exposed as importable surface but is NOT wired into `api_server.ts`, so no flash capability ships in part 1 — it's pure scaffolding. Merging part 1 to `develop` activates only the POLL_ACK variant parsing + the `ControlModule.variant` field; everything else is dormant.
- **Part 2 (follow-up branch):** Tasks 7-14. Real upload-phase observer wiring, deploy-phase event handler, reboot-timer + heartbeat callback, cancel mechanism, error-path consolidation, HTTP controller, `api_server.ts` instantiation + POLL handler hookup, QA plan + final verification.

This is intra-feature partitioning to manage review burden; it's NOT the same as the cross-repo deferral pattern (POLL_ACK extensions stay in-scope, AstrOs.ESP work lands in lockstep). The split is justified by the scaffolding-without-wiring property: nothing in part 1 is operator-facing, so reviewers can engage on type contracts and unit-test coverage without worrying about half-shipped behavior.

## API overview

```typescript
class FlashJobOrchestrator {
  constructor(opts: {
    bus: SerialBus;
    jobLock: JobLock;
    cache: { fetch(release: ReleaseInfo, asset: AssetInfo): Promise<CachedAsset> };
    upload: { latest(): Promise<StoredUpload | null> };
    releaseService: { getReleases(): Promise<ReleaseInfo[]> };
    controllersStore: { listInLocation(): Promise<Array<{ id: string; variant: string }>> };
    emitWs: (msg: TransmissionMessage) => void;
    streamerFactory?: (opts: ChunkStreamerOpts) => Streamer;  // default: real ChunkStreamer
    clock?: Clock;                                             // default: real timers
    config?: { rebootTimeoutMs?: number; throttleWindowMs?: number };
  });
  start(request: FlashRequest): Promise<{ jobId, transferId, source: FlashSource, targets: string[] }>;
  cancel(reason: string): Promise<{ jobId } | null>;
  notifyMasterHeartbeat(version: string): void;
  getCurrentJob(): FlashJobState | null;
}

interface SerialBus {
  send(payload: string, opts: { kind: 'firmware' | 'normal' }): void;
  subscribeFwAcks(transferId: string, handler: (ack: FwInboundAck) => void): () => void;
  subscribeDeployEvents(transferId: string, handler: (event: FwDeployEvent) => void): () => void;
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
| `astros_api/src/firmware/flash_orchestrator.test.ts` | Orchestrator unit tests + helper unit tests, `FakeSerialBus` extension, scripted `streamerFactory`, fakes for cache/upload/releaseService/controllersStore |
| `astros_api/src/controllers/firmware_flash_controller.ts` | Express routes: `POST /api/firmware/flash`, `DELETE /api/firmware/flash`, `GET /api/firmware/flash` |
| `astros_api/src/controllers/firmware_flash_controller.test.ts` | HTTP tests with supertest + injected fake orchestrator |
| `astros_api/src/models/firmware/flash_orchestrator.ts` | Typed `FlashRequest`, `FwDeployEvent` discriminated union, `Streamer` narrow interface, `Clock` interface |

**Modified source files (7):**

| Path | Change |
|------|--------|
| `astros_api/src/models/firmware/chunk_streamer.ts` | Extend `SerialBus` with `subscribeDeployEvents(transferId, handler)` returning a disposer |
| `astros_api/src/firmware/serial_bus.ts` | `WorkerSerialBus.subscribeDeployEvents()` impl — separate listener that maps `FwProgressResponse` / `FwDeployDoneResponse` to typed `FwDeployEvent` and filters by `transferId` |
| `astros_api/src/firmware/serial_bus.test.ts` | Tests for `subscribeDeployEvents` |
| `astros_api/src/models/enums.ts` | ADD 5 new flash event types (`flashJobStarted`, `flashControllerUpdate`, `flashControllerResult`, `flashJobDone`, `flashJobFailed`) to `TransmissionType` after the existing `flashJobActive` (keep that one — c.2 ships it) |
| `astros_api/src/models/control_module/control_module.ts` | Extend `ControlModule` with `variant?: string` (per-controller hardware variant, populated from `parts[4]` of POLL_ACK). The `firmwareVersion?: string` field is already there since firmware 1.2.0+ — no separate `version` field added |
| `astros_api/src/serial/message_handler.ts` | Extend `handlePollAck()` to accept 5-field POLL_ACK and extract `parts[4]` as `variant`; relax existing `firmwareVersion` guard so it still extracts on 5-field payloads. Backward-compatible with 3-field and 4-field POLL_ACKs |
| `astros_api/src/api_server.ts` | Instantiate `FlashJobOrchestrator`; register flash routes; wire late-join WS snapshot via `orchestrator.getCurrentJob()`; POLL handler reads `module.variant` per controller into in-memory cache, reads `module.firmwareVersion` and calls `orchestrator.notifyMasterHeartbeat(firmwareVersion)` when a flash is in flight and the version matches the deployed target |

**Spec / plan / QA docs:**

- `.docs/specs/20260503-0910-firmware-ota-c-6c-1-orchestrator-design.md` (committed)
- `.docs/plans/20260503-0933-firmware-ota-c-6c-1-orchestrator.md` (this file)
- `.docs/qa/firmware-ota-flash.md` (Task 14)

**Scope-guard note:** ~12 source files / 14 tasks — at the upper edge of CLAUDE.md's `~8 tasks / 10 files` threshold but consistent with the user's "ship as a whole feature" framing (POLL_ACK extensions absorbed into c.6c.1 scope rather than deferred). c.6b shipped at similar size via subagent-driven development. Plan-time scope check: if planning surfaces unexpected complexity in the POLL_ACK extension or the orchestrator state machine, sub-split into c.6c.1.a (orchestrator core + POLL_ACK extensions, Tasks 1–10) and c.6c.1.b (HTTP/WS surface + api_server wiring, Tasks 11–14) before implementation begins.

## Failure-mode inventory

This module hits multiple FMI triggers per CLAUDE.md (concurrency, network-adjacent I/O via serial worker, resource lifecycle for streamer/timer/subscriber, cross-process state via JobLock). Sections §1–§7 inventoried below.

### §1 External-call error coverage

| Call | Error / condition | Response |
|------|-------------------|----------|
| `releaseService.getReleases()` | rejects (network failure, GitHub rate limit) | release JobLock; emit `flashJobFailed { reason: 'release_lookup_failed', detail }`; HTTP 4xx |
| `releaseService.getReleases()` | resolves but no release matches `request.source.version` | release JobLock; emit `flashJobFailed { reason: 'release_not_found', detail: version }`; HTTP 400 |
| Asset selection | release found, but no asset matches the controllers' (validated-uniform) variant | release JobLock; emit `flashJobFailed { reason: 'asset_not_found', detail: variant }`; HTTP 400 |
| `cache.fetch(release, asset)` | rejects (network, hash mismatch on disk, ENOSPC during persist) | release JobLock; emit `flashJobFailed { reason: 'source_resolution_failed', detail }`; HTTP 4xx |
| `upload.latest()` | resolves to `null` (no upload exists) | release JobLock; emit `flashJobFailed { reason: 'no_upload' }`; HTTP 400 |
| `upload.latest()` | rejects (fs error reading sidecar/meta) | same as cache.fetch reject path |
| `controllersStore.listInLocation()` | resolves to `[]` (empty location) | release JobLock; emit `flashJobFailed { reason: 'no_controllers' }`; HTTP 400 |
| `controllersStore.listInLocation()` | resolves to non-empty list with mixed `variant` values | release JobLock; emit `flashJobFailed { reason: 'variant_mismatch', detail: <variants> }`; HTTP 400 |
| `controllersStore.listInLocation()` | resolves with one or more controllers whose `variant` is empty/missing (POLL_ACK never seen yet) | release JobLock; emit `flashJobFailed { reason: 'variant_unknown', detail: <controllerIds> }`; HTTP 400 |
| `controllersStore.listInLocation()` | rejects | same as cache reject path |
| `streamer.run()` | rejects with any of c.6b's 12 `TransferErrorCode` values | error path B (set abortReason, fail non-terminal controllers, emit `flashJobFailed`, release lock) |
| `bus.send(deployBeginPayload, { kind: 'firmware' })` | throws (Worker channel dead) | wrap as `flashJobFailed { reason: 'bus_send_failed', detail }`; transition all controllers to Failed; release lock |
| `bus.subscribeDeployEvents(...)` (subscription itself) | should not throw under normal conditions | if it does (e.g., listener limit), surface as `flashJobFailed { reason: 'subscriber_attach_failed' }` |
| `clock.setTimeout(rebootTimeoutMs)` | should not throw | N/A |
| `emitWs(msg)` | might throw if WS server is mid-shutdown | swallow + log; do NOT fail the orchestrator on WS emit failure (best-effort broadcast already silently drops disconnected clients per existing `updateClients` pattern) |

**Common gotchas to watch for:**
- `cache.fetch()` returns a `CachedAsset` whose `path` may have been swept by a concurrent `pruneToN` — c.6b's `source_read_failed` already catches this. Documented dependency on c.6b's pre-subscribe error path.
- An empty `FwDeployDone.results[]` array (master sends "done" with no per-controller entries) → all controllers stuck mid-stage; treat as protocol violation, fail the job.
- A `FwDeployDone` arriving twice (master retransmit) — second invocation finds all controllers already terminal → no-op (idempotent).
- POLL_ACK arriving with `variant` for a `controllerId` not yet in the controllers cache → controllers cache lazily inserts (POLL_ACK is the source of truth for "this controller exists and reports variant X").

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
- "Heartbeat arrives post-flashJobDone with stale version" → orchestrator's caller (api_server) compares incoming version against expected (`source.version`); only calls `notifyMasterHeartbeat()` on match. Mismatch caller is responsible for logging; orchestrator never sees it

### §3 Concurrency

| Shared resource | Touched by | Sync mechanism | Miss-sync consequence |
|-----------------|-----------|----------------|------------------------|
| `currentJob` (orchestrator instance field) | `start()`, `cancel()`, `getCurrentJob()`, deploy event handler, streamer observer, heartbeat callback, reboot timer | All mutations on the JS event-loop thread; no cross-thread access. JobLock gates `start()` so concurrent `start()` calls are rejected before touching `currentJob` | If JobLock check were missed: second start clobbers first job's state. Tested by mutation discipline. |
| `JobLock` state | `start()`, `cancel()`, internal release path; lock-state subscriber | Synchronous boolean gate (c.0) | Race window: `start()` between `acquire()` returning true and the orchestrator setting up state — `cancel()` arriving in this window returns 404 (no `currentJob` yet). Documented in spec §"Cancel race windows". |
| `abortController` | `start()` (creates), `cancel()` (fires `.abort()`), streamer.run consumes signal | Single owner = orchestrator | If `cancel()` fires after streamer already settled: AbortController `.abort()` is a no-op. Safe. |
| `rebootTimer` | armed in deploy-done handler, cleared by `notifyMasterHeartbeat()` OR fired by clock | Single timer ID stored as instance field | First-fire-wins via guard: timer callback checks `if (rebootTimer === null) return` (heartbeat already cleared it); heartbeat checks `if (rebootTimer === null) return` (timer already fired). Both cleared paths converge to the same release sequence. |
| `deployUnsubscriber` | armed after FW_DEPLOY_BEGIN, disposed at deploy-done OR cancel OR error | Single instance field | If not disposed: stale handler fires for next job's events. Tested. |
| `flashProgressThrottle` per-controller pending state | per-update (orchestrator → throttle), timer flush | per-controller `Map` keyed by controllerId; single-threaded | If Map grew without cleanup: memory leak across jobs. Cleared on `flashJobDone`/`flashJobFailed`/`cancel`. Tested. |
| In-memory controllers cache (api_server) — variant per controller | POLL handler (writes), `controllersStore.listInLocation()` (reads via api_server) | Synchronous on JS event loop; POLL_ACK arrival is single-threaded by the worker message dispatch | If a flash starts during a POLL_ACK update mid-write: cache might transiently lack a controller's variant → `variant_unknown` failure. Operator retries; not a corruption risk. |

### §4 Cross-platform / cross-environment

c.6c.1 has no fs writes (cache + upload do that; orchestrator only reads via their interfaces) and no platform-specific concerns:

- **`fs.rename` / atomic writes**: N/A — orchestrator doesn't write files
- **Path separators**: N/A — orchestrator passes `spec.source.path` to streamer; resolver receives it from cache/upload
- **`worker_threads.Worker`**: same on all platforms supported by Node 18+
- **Express HTTP routes**: standard
- **`AbortController`**: Node ≥ 16
- **POLL_ACK protocol extension**: cross-repo (AstrOs.ESP) coupling — not a platform issue but worth noting that the new POLL_ACK fields ship in lockstep with this PR; mismatched server/firmware versions during a deploy could surface as `variant_unknown`. Document the version-coupling in the PR body and the Notes-for-the-reviewer section.

N/A for fs/path concerns: this module is composition-layer and pure-TypeScript above the fs / serial layer.

### §5 Pre-existing on-disk state

N/A: orchestrator holds no on-disk state. JobLock is in-memory; `currentJob` is in-memory; reboot timer is in-memory; controllers variant cache is in-memory.

If the server crashes mid-flash:
- The flash is interrupted (master may be left mid-deploy with partial state — that's a master-side problem, not c.6c.1's)
- On restart, no orchestrator state survives — fresh start
- Operator can flash again; if master is still running old firmware (didn't reboot after partial deploy), the flash starts cleanly. If master is in a stuck state, operator-side recovery (manual master reboot via existing controls) is needed
- After server restart, the controllers variant cache is empty until the next POLL_ACK cycle populates it. A flash attempted before the next poll will fail with `variant_unknown` — that's correct fail-safe behavior.
- Persistence / restart-survival is explicit non-goal per the decomp; documented in spec §"Out of scope"

### §6 Hostile / malformed input

| Input | Trust boundary | Defense |
|-------|----------------|---------|
| `FlashRequest.source.kind` | HTTP request → orchestrator | TS discriminated union typed; runtime validation via `request.source.kind === 'github' \|\| request.source.kind === 'upload'`; reject with HTTP 400 otherwise |
| `FlashRequest.source.version` (when kind=github) | HTTP request → cache.fetch | Validated against `PATH_SAFE_RE` (existing pattern in c.4). Cache-side validation is authoritative; orchestrator passes through after type check |
| `controllersStore.listInLocation()` returned `variant` per controller | In-memory cache populated from POLL_ACK | Validated for non-empty + uniformity across targets at orchestrator level. Empty → `variant_unknown`; mixed → `variant_mismatch`. The variant string itself flows into `release.assets.find(a => a.variant === variant)` lookup; if attacker-controlled they can only force `asset_not_found` |
| `FwProgress.controllerId` (from worker) | Master → server | Validate against current `state.controllers[]` membership; ignore events for unknown controllerIds (could be a stale-job leak, log + drop) |
| `FwProgress.stage` | Master → server | Validate against `FwStage` enum values; reject unknown stages with `flashJobFailed { reason: 'protocol_violation' }` |
| `FwDeployDone.results[].controllerId` | Master → server | Same as FwProgress: ignore unknown |
| `FwDeployDone.results[].outcome` | Master → server | Closed enum `'OK' \| 'FAILED'`; unknown values → `flashJobFailed { reason: 'protocol_violation' }` |
| `notifyMasterHeartbeat(version)` argument | api_server → orchestrator | api_server validates version match against expected before calling; orchestrator just clears the reboot timer + releases lock |
| POLL_ACK `variant` field | Firmware → server | Length-limited string; treat as opaque token; only used for asset matching (no path interpolation, no shell). Empty string treated as "unknown" |
| POLL_ACK `version` field (heartbeat) | Firmware → server | Validated against expected `source.version`; mismatch → log + ignore (orchestrator's reboot timer eventually fires as fallback) |

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
| In-memory controllers cache entries | POLL handler (writes per POLL_ACK) | Persist across job lifetime; refreshed on each POLL_ACK | Cache entries become stale if a controller is physically disconnected; next POLL_ACK absent for that controller could leave a stale entry. Out of scope for c.6c.1 — controllers cache lifecycle is a shared concern for the api_server, not the orchestrator. |
| WS subscriber `lockStateChanged` listener (existing JobLock pattern) | api_server initial setup | Survives orchestrator lifetime | N/A — orchestrator doesn't own this |

## Tasks

Each task is one logical commit. TDD where applicable. Per CLAUDE.md, `superpowers:requesting-code-review` runs between tests-passing and `git commit` for every implementation task. Subagent-driven dev expected; controller (parent agent) provides per-task context to fresh implementer subagents.

- [x] **Task 1 — Typed models + WS event enum** (new `astros_api/src/models/firmware/flash_orchestrator.ts`; modify `astros_api/src/models/enums.ts`):
  - In `models/enums.ts`, ADD the 5 new flash event types to the `TransmissionType` enum, immediately after the existing `flashJobActive` entry: `flashJobStarted, flashControllerUpdate, flashControllerResult, flashJobDone, flashJobFailed`. Keep `flashJobActive` as-is — it ships from c.2 (`ws_lock_guard.ts` + `write_guard.ts` build a `FlashJobActiveResponse` frame using it as the `type` discriminator on a write-class WS rejection while a flash job holds the JobLock; the `error` field literal `'flashJobActive'` is part of that wire shape). The 5 new entries serve a different purpose (job lifecycle progress); they don't replace the existing entry.
  - In `models/firmware/flash_orchestrator.ts`:
    - `FlashRequest` discriminated union: `{ source: { kind: 'github', version: string } | { kind: 'upload' } }`
    - `FwDeployEvent`: `{ kind: 'progress', payload: FwProgress } | { kind: 'done', payload: FwDeployDone }`
    - `Streamer` narrow interface: `{ run(spec: TransferSpec, observer: StreamObserver, opts?: { signal?: AbortSignal }): Promise<TransferResult> }`
    - `Clock` interface: `{ now(): number; setTimeout(cb, ms): NodeJS.Timeout; clearTimeout(t): void }` — minimal abstraction so reboot timer + throttle window are deterministic under fake timers
  - **Tests:** none — types-only file. Existing tests should still pass after enum change.

- [x] **Task 2 — `SerialBus.subscribeDeployEvents` interface + `WorkerSerialBus` impl** (modify `astros_api/src/models/firmware/chunk_streamer.ts`, `astros_api/src/firmware/serial_bus.ts`, `astros_api/src/firmware/serial_bus.test.ts`):
  - Extend the `SerialBus` interface in `models/firmware/chunk_streamer.ts` with `subscribeDeployEvents(transferId: string, handler: (event: FwDeployEvent) => void): () => void`. Include doc-comment explaining: separate typed channel from `subscribeFwAcks`; deploy events flow during the deploy phase (post-FW_DEPLOY_BEGIN); orchestrator owns this subscriber (streamer doesn't).
  - In `serial_bus.ts`, add the impl to `WorkerSerialBus`: separate `worker.on('message', ...)` listener that maps `SerialWorkerResponseType.FW_PROGRESS → { kind: 'progress', payload: msg.payload }` and `FW_DEPLOY_DONE → { kind: 'done', payload: msg.payload }`. Filter by `transferId` (msg.payload.transferId === transferId; otherwise drop). Returns disposer that detaches the listener.
  - **Tests** in `serial_bus.test.ts`:
    - dispatches `FW_PROGRESS` matching transferId with the `progress` kind discriminator + payload
    - dispatches `FW_DEPLOY_DONE` matching transferId with the `done` kind + payload
    - filters out `FW_PROGRESS` whose `transferId` doesn't match
    - filters out non-deploy messages (FW_CHUNK_ACK, POLL responses, etc.)
    - disposer detaches the listener (subsequent emits not delivered)
    - multiple concurrent subscribers (two transferIds) are independent

- [x] **Task 3 — POLL_ACK protocol extension (variant)** (modify `astros_api/src/models/control_module/control_module.ts`, `astros_api/src/serial/message_handler.ts`, `astros_api/src/serial/message_handler.test.ts`):
  - **Pre-flight discovery (preserved here for future readers):** POLL_ACK is positional (US-separated `parts[]`). Fields shipped to date: `parts[0]` mac, `parts[1]` name, `parts[2]` fingerprint, `parts[3]` firmwareVersion (added in firmware 1.2.0+ and surfaced as `ControlModule.firmwareVersion`). The c.6c.1 work adds `parts[4]` for `variant` only — the heartbeat-vs-deploy version match reuses the existing `firmwareVersion` field. No separate `version` field is added.
  - In `control_module.ts`: add `variant?: string` to `ControlModule` (optional — older firmware doesn't ship it). Brief inline comment explaining the role: PlatformIO board variant reported via POLL_ACK; orchestrator consumes for asset selection at flash time.
  - In `message_handler.ts` `handlePollAck()`: widen length check from `> 4` to `> 5`; relax the `firmwareVersion` extraction guard from `=== 4` to `>= 4` so 5-field POLL_ACKs still set firmwareVersion from `parts[3]`; add `parts[4]` → `variant` extraction (trim + non-empty length-check) mirroring the existing firmwareVersion pattern.
  - In `message_handler.test.ts`: add 5 new test cases — 3-field legacy yields undefined variant; 4-field 1.2.0+ yields populated firmwareVersion + undefined variant; 5-field with variant yields both populated; 5-field with empty variant yields undefined variant; 5-field with whitespace variant yields undefined variant. Replace the now-obsolete "5-field rejected as UNKNOWN" test with "6-field rejected as UNKNOWN" to lock the upper-bound check.
  - `serial_worker_response.ts` is NOT modified — `PollResponse.controller: ControlModule` flows the new field transitively, no plumbing change needed.

- [x] **Task 4 — `resolveFlashSource` exported helper with variant-aware asset selection** (new `astros_api/src/firmware/flash_orchestrator.ts`):
  - Module-level export:
    ```ts
    export async function resolveFlashSource(
      request: FlashRequest,
      cache: { fetch(release: ReleaseInfo, asset: AssetInfo): Promise<CachedAsset> },
      upload: { latest(): Promise<StoredUpload | null> },
      releaseService: { getReleases(): Promise<ReleaseInfo[]> },
      variant: string,  // controllers' validated-uniform variant; required for github path
    ): Promise<FlashSource> {
      if (request.source.kind === 'github') {
        const releases = await releaseService.getReleases();
        const release = releases.find(r => r.tag === request.source.version);
        if (!release) throw new Error('release_not_found');
        const asset = release.assets.find(a => a.variant === variant);
        if (!asset) throw new Error('asset_not_found');
        const cached = await cache.fetch(release, asset);
        return {
          kind: 'github',
          version: cached.meta.version,
          sha256: cached.sha256,
          sizeBytes: cached.sizeBytes,
          displayName: `astros-esp ${cached.meta.version} (${variant})`,
        };
      }
      // kind === 'upload'
      const stored = await upload.latest();
      if (stored === null) throw new Error('no_upload');
      // Upload path doesn't validate variant — operator-uploaded artifact is operator-responsibility.
      // The orchestrator's variant-uniformity check still applies upstream so all targets share a variant.
      return {
        kind: 'upload',
        version: stored.meta.version,
        sha256: stored.sha256,
        sizeBytes: stored.sizeBytes,
        displayName: stored.meta.originalFilename,
      };
    }
    ```
  - Inline in `flash_orchestrator.ts` per spec §"Components"; exported for unit testing.
  - **Tests** in `flash_orchestrator.test.ts`:
    - github source happy: releases contains matching tag with matching variant asset → returns FlashSource with `kind='github'`, displayName includes variant
    - github source: no matching release → throws `Error('release_not_found')`
    - github source: matching release but no asset for variant → throws `Error('asset_not_found')`
    - upload source happy: upload.latest returns valid StoredUpload → returns FlashSource with `kind='upload'`, displayName from originalFilename. Note: variant not validated for upload path (operator responsibility)
    - upload source: upload.latest returns null → throws `Error('no_upload')`
    - releaseService.getReleases rejects → propagates rejection (orchestrator-level catch maps to `flashJobFailed { reason: 'release_lookup_failed' }`)
    - cache.fetch rejects → propagates rejection (orchestrator-level catch maps to `flashJobFailed { reason: 'source_resolution_failed' }`)
    - upload.latest rejects → propagates

- [x] **Task 5 — `flashProgressThrottle` exported helper** (extend `flash_orchestrator.ts`):
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

- [x] **Task 6 — `FlashJobOrchestrator` class skeleton with happy-path `start()`** (extend `flash_orchestrator.ts`; new `flash_orchestrator.test.ts`):
  - Scaffold the class with constructor accepting all injected deps (per "API overview" above — including `releaseService` and the `controllersStore` whose `listInLocation()` returns `Array<{ id: string; variant: string }>`). Module-level defaults for `rebootTimeoutMs = 15_000`, `throttleWindowMs = 250`.
  - `start(request)`:
    1. synchronously try `jobLock.acquire(jobId)` — on fail, throw `Error('job_already_running')` with `currentJobId` attached
    2. on acquire: emit `lockStateChanged`
    3. call `controllersStore.listInLocation()` → list of `{ id, variant }`
    4. Validate: list non-empty (`no_controllers`), every `variant` non-empty (`variant_unknown`), all variants identical (`variant_mismatch`). Failures release lock + throw appropriate Error
    5. extract the shared `variant` (any; they're uniform)
    6. call `resolveFlashSource(request, cache, upload, releaseService, variant)` → FlashSource
    7. build `currentJob: FlashJobState` with controllers (all `Queued`), source, jobId, transferId, startedAt
    8. emit `flashJobStarted`
    9. call `streamerFactory({ bus })` and await `streamer.run(spec, observer, { signal })` — but with a no-op observer for now (events wired in Task 7).
  - On streamer success: skip deploy phase for now (Task 8 wires it). Set all controllers to terminal `VersionConfirmed` with `finalVersion = source.version` (placeholder), emit `flashJobDone`, immediately release JobLock + clear currentJob (no reboot timer yet — that's Task 9).
  - **Test fixture additions:**
    - In `flash_orchestrator.test.ts`, build `FakeSerialBus` extending the c.6b pattern with a `subscribeDeployEvents` method (test-only `deliverDeployEvent(transferId, event)`)
    - Build a scripted `streamerFactory` returning a `Streamer` whose `run` returns a controllable `Promise<TransferResult>` — tests resolve/reject as needed
    - Build fake `cache`, `upload`, `releaseService`, `controllersStore` interfaces returning canned data
    - Use the real `JobLock` (c.0) since it's already simple; no fake needed
    - Build a `mockClock: Clock` that wraps `vi.setTimeout`/`clearTimeout`/`Date.now()` for fake-timer tests
  - **Tests** (this is the foundation — many follow-up tasks add to this file):
    - happy path with github source: lock acquired, controllers loaded with uniform variant, source resolved with that variant, `flashJobStarted` emitted, streamer awaited, `flashJobDone` emitted, lock released
    - happy path with upload source: same shape, displayName from upload's originalFilename
    - concurrent start: second `start()` while lock held throws `Error('job_already_running')` with `currentJobId`; first job state unchanged
    - controllersStore returns `[]`: lock released, `flashJobFailed { reason: 'no_controllers' }` emitted, currentJob never set, throw HTTP-4xx-shaped error
    - controllersStore returns mixed variants: lock released, `flashJobFailed { reason: 'variant_mismatch', detail: <variants list> }` emitted, currentJob never set
    - controllersStore returns one controller with empty variant: lock released, `flashJobFailed { reason: 'variant_unknown', detail: <controllerId> }` emitted
    - github source with no matching variant asset: lock released, `flashJobFailed { reason: 'asset_not_found', detail: variant }` emitted
    - `getCurrentJob()` returns `null` after release; returns the in-flight state mid-flow

- [x] **Task 7 — Upload-phase wiring (streamer observer translates to controller updates)** (extend `flash_orchestrator.ts`):
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

- [x] **Task 8 — Deploy-phase wiring** (extend `flash_orchestrator.ts`):
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

- [x] **Task 9 — `flashJobDone` + reboot timer + heartbeat callback (real wiring)** (extend `flash_orchestrator.ts`):
  - When `deriveJobLifecycle(currentJob) === 'done'` (all controllers terminal): emit `flashJobDone { jobId, endedAt }`, arm reboot timer via `clock.setTimeout(rebootTimeoutMs, () => releaseLock('timeout'))`. Store timer ID as `rebootTimer` instance field.
  - Add `notifyMasterHeartbeat(version: string): void` method:
    - If `rebootTimer === null`: ignore (no job in deploy-done state, OR heartbeat already fired)
    - Else: `clock.clearTimeout(rebootTimer)`, set `rebootTimer = null`, `releaseLock('heartbeat')`
    - Note: the orchestrator doesn't validate the version argument — that's `api_server`'s POLL handler responsibility (call `notifyMasterHeartbeat()` only when `version` matches the expected `currentJob.source.version`). Orchestrator just clears the timer.
  - `releaseLock(reason)` private method: clear `currentJob = null`, dispose any remaining `deployUnsubscriber`, `throttle.dispose()`, `jobLock.release(jobId)`, emit `lockStateChanged { locked: false }`
  - First-fire-wins: timer callback ALSO checks `if (rebootTimer === null) return` (heartbeat got there first); same guard on heartbeat path
  - **Tests:**
    - all controllers terminal → `flashJobDone` emitted; reboot timer armed
    - heartbeat called pre-timer: lock released; `lockStateChanged` emitted; reboot timer cleared (verify no leak via `vi.getTimerCount() === 0`)
    - timer fires (advance fake time by `rebootTimeoutMs`): lock released; `lockStateChanged` emitted; subsequent `notifyMasterHeartbeat()` is a no-op
    - heartbeat called twice: first releases; second is a no-op (no double-release)
    - heartbeat called with no active job: no-op (no `currentJob`)
    - heartbeat called mid-upload (out-of-protocol): no-op (rebootTimer null)

- [x] **Task 10 — Cancel mechanism (AbortController + cancel methods)** (extend `flash_orchestrator.ts`):
  - In `start()`, create `this.abortController = new AbortController()` and pass `signal` to `streamer.run`
  - `cancel(reason)` method:
    - If `currentJob === null`: return null
    - Capture `jobId` from currentJob
    - If streamer is still running (we're in upload phase): call `abortController.abort(reason)` → streamer rejects with `TransferError 'aborted'` → falls through to error path B in Task 11
    - If streamer already settled (we're in deploy or post-deploy): dispose `deployUnsubscriber`, set `abortReason = reason` on currentJob, transition all currently-non-terminal controllers to `Failed` with error from the cancel reason, emit `flashControllerResult` for each, emit `flashJobFailed { jobId, abortReason: reason, endedAt }`, `releaseLock('cancel')`
    - Return `{ jobId }`
  - Track upload-vs-deploy phase via `phase: 'upload' | 'deploy' | 'done' | null` instance field updated at phase boundaries
  - **Tests:**
    - cancel during upload: `abortController.abort` fires; streamer mock rejects with TransferError aborted; falls to error path (verified more thoroughly in Task 11)
    - cancel during deploy: deployUnsubscriber disposed, controllers fail-cleanup'd with the cancel reason, `flashJobFailed` emitted with abortReason
    - cancel with no active job: returns null
    - cancel during reboot-timer wait (post-flashJobDone, pre-release): job is "done" — cancel is a no-op (returns null because phase==='done' OR currentJob mid-cleanup)
    - cancel race: cancel arrives before currentJob set (mid-source-resolution): returns null (currentJob === null); start continues to completion (operator can retry cancel after flashJobStarted)

- [x] **Task 11 — Error paths consolidated (TransferError, source resolution, hostile input)** (extend `flash_orchestrator.ts`):
  - Wrap the `start()` body in try/catch capturing all error sources. Centralize cleanup-on-fail in a private `failJob(reason, detail)` method. Reasons:
    - `release_lookup_failed` — `releaseService.getReleases()` rejects
    - `release_not_found` — version doesn't match any release
    - `asset_not_found` — release found, no asset matches the controllers' variant
    - `source_resolution_failed` — `cache.fetch()` rejects (network, hash, ENOSPC)
    - `no_upload` — upload.latest() returns null
    - `no_controllers` — controllersStore returns []
    - `variant_mismatch` — controllers have differing variants
    - `variant_unknown` — one or more controllers report empty variant (POLL_ACK never seen)
    - `bus_send_failed` — bus.send throws
    - `subscriber_attach_failed` — bus.subscribeDeployEvents throws
    - `protocol_violation` — invalid stage or outcome in deploy event
    - any of c.6b's 12 `TransferErrorCode` values (passed through as `abortReason = error.code`)
    - `streamer_unknown_error` — non-TransferError streamer rejection
  - Per-failure handling:
    - Pre-streamer failures (controllers / source resolve): release JobLock; emit `flashJobFailed { reason, detail }`; HTTP 4xx; `currentJob` never set
    - Streamer-rejection failures: set `currentJob.abortReason = error.code`, transition all currently-non-terminal controllers to `Failed`, emit `flashControllerResult` per affected controller, emit `flashJobFailed`, `releaseLock`
    - Mid-deploy failures (bus.send, protocol violation): same shape as streamer-rejection but post-streamer-success
  - **Tests:**
    - each c.6b TransferError code (12 cases) propagates as `flashJobFailed` with `abortReason === code`; controller cleanup verified
    - non-TransferError streamer rejection: `reason: 'streamer_unknown_error'`
    - `release_lookup_failed`, `release_not_found`, `asset_not_found`, `source_resolution_failed`, `no_upload`, `no_controllers`, `variant_mismatch`, `variant_unknown` — each emits `flashJobFailed` with the right reason; lock released; currentJob never set
    - `bus_send_failed` (mid-deploy) — controllers transition to Failed; lock released
    - `protocol_violation` (invalid stage / outcome / empty results) — same shape
    - lock state: every error path releases the lock (parameterized over all reasons)
    - currentJob state: every error path clears `currentJob` to null (or never sets it)

- [ ] **Task 12 — HTTP controller (Express routes)** (new `astros_api/src/controllers/firmware_flash_controller.ts` + `firmware_flash_controller.test.ts`):
  - `registerFirmwareFlashRoutes(router: Router, auth: any, orchestrator: FlashJobOrchestrator)` — follow audio_controller.ts pattern
  - `POST /api/firmware/flash`:
    - validate `req.body.source` shape
    - call `orchestrator.start(req.body)`
    - on success: 200 with `{ jobId, transferId, source, targets }`
    - on `Error('job_already_running')`: 409 with `{ error: 'job_already_running', currentJobId }`
    - on `Error('no_controllers' | 'variant_mismatch' | 'variant_unknown' | 'release_not_found' | 'asset_not_found' | 'no_upload')`: 400 with detail
    - on `Error('release_lookup_failed' | 'source_resolution_failed')`: 502 (upstream-dependency failure) with detail
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
    - POST no_controllers → 400
    - POST variant_mismatch → 400 with the mismatched-variants detail
    - POST variant_unknown → 400 with the controller-id detail
    - POST asset_not_found → 400
    - POST release_not_found → 400
    - POST source_resolution_failed → 502
    - DELETE active job → 200 with cancelled:true
    - DELETE no active job → 404
    - GET with active job → 200 with FlashJobState
    - GET with no active job → 200 with null body

- [ ] **Task 13 — `api_server.ts` wiring** (modify `astros_api/src/api_server.ts`):
  - Import `FlashJobOrchestrator`, `WorkerSerialBus`, `registerFirmwareFlashRoutes`
  - In `setupSerialPort()` (or wherever the worker is constructed), build:
    ```ts
    this.workerSerialBus = new WorkerSerialBus({ worker: this.serialWorker });
    this.flashOrchestrator = new FlashJobOrchestrator({
      bus: this.workerSerialBus,
      jobLock: this.jobLock,
      cache: this.firmwareCache,
      upload: this.firmwareUploadStore,
      releaseService: this.githubReleaseService,
      controllersStore: { listInLocation: () => /* derive from existing controllers data + variant cache */ },
      emitWs: (msg) => this.updateClients(msg),
    });
    ```
  - Wire `controllersStore.listInLocation()` against an in-memory controllers cache populated by the POLL handler. The cache stores `{ id: string; variant: string }` per controller, last seen via POLL_ACK. Lookup at flash time reads the cache; controllers without a recent POLL_ACK (variant === '') surface as `variant_unknown`.
  - In the existing POLL handler (the `case POLL_ACK:` or equivalent in `handleSerialWorkerMessage`):
    - Extract `variant` from the parsed POLL_ACK payload; update the in-memory controllers cache for that controllerId.
    - If `version` is present on the POLL_ACK (post-reboot heartbeat) AND a flash is in flight (`this.flashOrchestrator.getCurrentJob() !== null`) AND `version === currentJob.source.version`: call `this.flashOrchestrator.notifyMasterHeartbeat(version)`.
    - If `version` present but doesn't match expected: log + ignore (orchestrator's reboot timer remains the fallback).
  - In route registration block: `registerFirmwareFlashRoutes(this.router, this.authHandler, this.flashOrchestrator);`
  - In WS connect handler: after sending systemStatus snapshot, also send `flashJobStarted` snapshot if `this.flashOrchestrator.getCurrentJob() !== null`:
    ```ts
    const currentJob = this.flashOrchestrator.getCurrentJob();
    if (currentJob !== null) {
      ws.send(JSON.stringify({ type: TransmissionType.flashJobStarted, data: currentJob }));
    }
    ```
  - **Tests:** none directly (api_server.ts is integration-tested via existing test infrastructure; smoke verified manually + via QA plan in Task 14)
  - Smoke check: `npm run build` clean; `npm run start:tsx` boots without errors

- [ ] **Task 14 — QA test plan + verification** (new `.docs/qa/firmware-ota-flash.md`):
  - QA plan with preconditions (server running, master + controllers connected — PTY harness when c.6c.2 lands; mocked Vue button + curl until then), step-by-step test cases, expected results, edge cases
  - Sections:
    - Trigger flash from cache (POST with kind=github)
    - Trigger flash from upload (POST with kind=upload)
    - Concurrent flash rejection (409)
    - Cancel during upload (DELETE)
    - Cancel during deploy (DELETE)
    - WS late-join mid-flash (open new WS client; verify flashJobStarted received with correct state)
    - Source resolution failure (post unknown github version)
    - Variant mismatch (controllers in location report differing variants)
    - Variant unknown (controller reports empty variant — POLL_ACK never received)
    - Asset not found (release lacks the controllers' variant)
    - Server-shutdown during flash (verify lock auto-release on next start)
    - Master heartbeat post-deploy releases lock (POLL_ACK with version match before timer)
    - Master never heartbeats (timer fallback fires after 15-sec)
  - Verification (run before opening PR):
    - `npm run prettier:write` clean
    - `npm run lint:fix` clean
    - `npm run build` clean
    - `npx vitest run` — full suite green; `flash_orchestrator.test.ts` ~50+ tests, `firmware_flash_controller.test.ts` ~12 tests, `serial_bus.test.ts` extended by ~6 tests, `message_handler.test.ts` extended by POLL_ACK tests
    - `superpowers:requesting-code-review` on the full diff vs `develop`

## Verification

- [ ] `npm run build` clean (lint + tsc).
- [ ] `npm run test` green (existing 554 + ~75 new = ~630 total).
- [ ] `npm run prettier:write` and `npm run lint:fix` clean.
- [ ] No new fs / network imports in `flash_orchestrator.ts` — only existing typed deps + `models/firmware/*`.
- [ ] All FMI §1–§7 items have corresponding tests OR are explicitly marked N/A.
- [ ] FMI §8 reviewer pre-flight checklist completed before PR open.

## Files in scope (11 source + 3 docs)

1. `astros_api/src/models/enums.ts` — modified (TransmissionType enum entries)
2. `astros_api/src/models/firmware/chunk_streamer.ts` — modified (SerialBus interface extension)
3. `astros_api/src/models/firmware/flash_orchestrator.ts` — new
4. `astros_api/src/models/control_module/control_module.ts` — modified (added `variant?: string`)
5. `astros_api/src/firmware/serial_bus.ts` — modified
6. `astros_api/src/firmware/serial_bus.test.ts` — modified
7. `astros_api/src/firmware/flash_orchestrator.ts` — new
8. `astros_api/src/firmware/flash_orchestrator.test.ts` — new
9. `astros_api/src/serial/message_handler.ts` — modified (extended POLL_ACK parser to 5 fields)
10. `astros_api/src/serial/message_handler.test.ts` — modified (added 5-field POLL_ACK tests)
11. `astros_api/src/controllers/firmware_flash_controller.ts` — new
12. `astros_api/src/controllers/firmware_flash_controller.test.ts` — new
13. `astros_api/src/api_server.ts` — modified
14. `.docs/specs/20260503-0910-firmware-ota-c-6c-1-orchestrator-design.md` (committed)
15. `.docs/plans/20260503-0933-firmware-ota-c-6c-1-orchestrator.md` (this file)
16. `.docs/qa/firmware-ota-flash.md` — new (Task 14)

12 source files. Above c.6b's 9-file footprint but consistent with the user's "ship as a whole feature" framing — POLL_ACK extension consumed 3 files that would otherwise be a deferred follow-up PR.

## Out of scope (deferred)

Per spec §"Out of scope":
- PTY-stub harness + integration tests (c.6c.2)
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
- **Why `flashJobActive` is retained alongside the 5 new entries.** Initial plan assumed `flashJobActive` was an unused placeholder; that was wrong — c.2 ships it as the `type` discriminator on a write-class WS rejection frame (`models/networking/lock_responses.ts` → `buildFlashJobActiveResponse()`, called from `guard/ws_lock_guard.ts:29` when a write-class message arrives during a JobLock-held flash). Removing the symbol would break that wire shape. The 5 new entries describe job lifecycle progress and complement `flashJobActive`'s "your write was rejected because a flash is in progress" semantics. Both stay.
- **Why POLL_ACK extensions land in this PR rather than a follow-up.** Earlier plan version deferred the POLL_ACK extension to a follow-up cross-repo PR (server-side wiring waiting for AstrOs.ESP firmware to populate the new fields). Per user redirect: c.6c.1 ships as a whole feature. AstrOs.ESP work and server-side type/parser changes land in lockstep; placeholders or proxies for the cross-repo work would create rework on merge. The protocol change is a single coordinated PR pair.
- **Why orchestrator-level variant validation rather than per-asset filter.** Variant uniformity across targets is a *job-level* invariant: a single binary flashes all controllers in a job, so they must share a variant. Pushing the variant filter down into the asset selection alone would still allow mixed-variant target lists to slip past (with whichever-variant-the-first-asset-matches winning silently). Validating uniformity at the orchestrator level + picking the asset based on that validated variant catches mismatches at the earliest point.
