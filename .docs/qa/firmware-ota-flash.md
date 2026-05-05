# Firmware OTA flash (c.6c.1) QA

Manual test plan for the FlashJob orchestrator, source resolver, and HTTP/WS surface
shipped by c.6c.1. Exercises the operator-facing flow that triggers a firmware-over-the-air
flash to all controllers in the current location, observes progress over WebSocket, and
unwinds the JobLock on either the master's post-deploy heartbeat or a 15-second timer
fallback. Run against the bench rig (or the c.6c.2 PTY-stub harness, when it lands)
before opening the Part 2 PR against `develop`.

## What landed in Part 2 (Tasks 7-13 + writeGuard / FIRMWARE_REPO follow-ups)

Tasks 1-6 (Part 1) shipped scaffolding only — types, `subscribeDeployEvents`, the
POLL_ACK `variant` extension, source resolver, throttle helper, and a class skeleton
with no api_server wiring. Part 2 adds the real behavior:

- Streamer observer translates upload-phase chunk acks to throttled
  `flashControllerUpdate` events (Task 7).
- Deploy-phase wiring sends `FW_DEPLOY_BEGIN`, subscribes via
  `bus.subscribeDeployEvents`, and processes `FW_PROGRESS` per-controller plus
  the job-wide `FW_DEPLOY_DONE.results[]` array (Task 8).
- `flashJobDone` + 15-second reboot timer + `notifyMasterHeartbeat()` (Task 9).
- `cancel()` mechanism with AbortController (upload phase) and inline cleanup
  (deploy phase) (Task 10).
- All error paths consolidated through a `failJob(reason, detail)` helper —
  every reason releases the lock and clears `currentJob` (Task 11).
- HTTP routes `POST /DELETE /GET /api/firmware/flash` registered via
  `firmware_flash_controller.ts` (Task 12).
- `api_server.ts` instantiates the orchestrator, registers routes, wires the
  WS late-join `flashJobStarted` snapshot, and feeds the controller variant
  cache + `notifyMasterHeartbeat()` from the POLL handler (Task 13).

Two follow-ups from the Task 13 review (`110e7d9`):

- **writeGuard carve-out for cancel.** `ALLOWED_DURING_FLASH` originally listed
  only `/login` and `/reauth`, so `DELETE /api/firmware/flash` was 423-blocked
  by the very lock the cancel was trying to release. The cancel HTTP path is
  now in the allowlist; other DELETE routes still 423.
- **`FIRMWARE_REPO` env var documented.** `api_server.ts` reads
  `process.env.FIRMWARE_REPO ?? 'battlesloth/AstrOs.ESP'` to build the GitHub
  release service. The default is documented in `.env.example` so operators
  know the override exists (e.g., to point at a fork during testing).

## Preconditions (cross-cutting)

- AstrOs.Server running. Either:
  - **Local dev:** `cd astros_api && npm run start:tsx` (uses the live serial
    port + real `WorkerSerialBus`), or
  - **Container:** `docker compose up`. Ports 3000 (API), 5000 (WebSocket),
    8080 (Vue/nginx).
- Master ESP32 + at least 2 controllers connected and powered, running firmware
  that emits a 5-field POLL_ACK (carries `variant` per controller). The c.6c.2
  PTY-stub harness will replace this when it lands; until then, hardware is
  required for end-to-end runs and most failure scenarios.
- A valid `.env` populated with `JWT_KEY`, `API_PORT=3000`, `WEBSOCKET_PORT=5000`,
  `SERIAL_PORT`, `BAUD_RATE`. `FIRMWARE_REPO` defaults to `battlesloth/AstrOs.ESP`;
  override only if testing against a fork.
- Operator has a valid auth session. Get a JWT once at the start of the run:
  ```bash
  TOKEN=$(curl -s -X POST http://localhost:3000/api/login \
    -H 'Content-Type: application/json' \
    -d '{"username":"<op>","password":"<pw>"}' | jq -r .token)
  ```
  (Replace credentials with the dev admin set via the setup wizard.) Re-export
  `TOKEN` if the session expires mid-run.
- WebSocket inspector open: any WS client connected to `ws://localhost:5000`.
  Browser devtools console works (`new WebSocket('ws://localhost:5000')` then
  attach an `onmessage` printing `JSON.parse(e.data)`); `wscat` from the CLI is
  fine too.
- For `kind: 'github'` flashes: server has either populated `firmwareCache`
  (run a successful flash once, or call the c.4 fetch path) OR network
  reachable to GitHub for the configured repo. For `kind: 'upload'` flashes:
  upload a `.bin` via the existing firmware-upload endpoint first.
- The Vue UI for triggering a flash is **not yet wired** — that's a separate
  follow-up. All scenarios below drive the API directly via curl. Notes are
  added per-case where the eventual button click would replace the curl.

## Wire-shape reminders

`POST /api/firmware/flash` body:
```json
{ "source": { "kind": "github", "version": "1.4.0" } }
```
or
```json
{ "source": { "kind": "upload" } }
```

`POST` success → 200 with `{ jobId, transferId, source, targets }`.

WebSocket events (all wrapped as `{ type: <TransmissionType>, data: <payload> }`):

| `type` | Trigger |
|---|---|
| `lockStateChanged` | JobLock acquire / release |
| `flashJobStarted` | Job acquired lock + `currentJob` set; also sent on WS late-join |
| `flashControllerUpdate` | Per-controller progress (4 Hz, leading-edge throttled) |
| `flashControllerResult` | Per-controller terminal transition (bypasses throttle) |
| `flashJobDone` | All controllers terminal |
| `flashJobFailed` | `abortReason` set (cancel, streamer error, mid-deploy failure) |

Expected order on a happy path: `lockStateChanged{locked:true}` → `flashJobStarted`
→ stream of `flashControllerUpdate` → `flashControllerUpdate` (stage transition,
forced) → more `flashControllerUpdate` (deploy progress) → `flashControllerResult`
per controller → `flashJobDone` → (15-sec window) → `lockStateChanged{locked:false}`.

## Test cases

### 1. Trigger flash from cache (POST kind=github)

**Currently testable how:** real hardware (master + at least 2 same-variant
controllers) with cached or fetchable firmware. PTY-stub harness will exercise
the same path deterministically once c.6c.2 lands.

1. Verify cache contains the target version: `ls ~/.config/astrosserver/firmware-cache/`
   shows a `<variant>-<version>.bin`.
2. Confirm WebSocket inspector is connected and idle (no in-flight job).
3. POST the flash request:
   ```bash
   curl -s -X POST http://localhost:3000/api/firmware/flash \
     -H "Authorization: Bearer $TOKEN" \
     -H 'Content-Type: application/json' \
     -d '{"source":{"kind":"github","version":"1.4.0"}}' | jq
   ```
4. **Pass:** HTTP 200 with body `{ jobId, transferId, source: { kind: 'github', version: '1.4.0', sha256, sizeBytes, displayName }, targets: [<controllerIds>] }`.
5. **Pass:** WS frames in order:
   - `lockStateChanged` with `data.state.locked === true` and `data.state.owner === jobId`.
   - `flashJobStarted` with full `FlashJobState` (controllers all in `Queued`).
   - `flashControllerUpdate` per controller transitioning to `UploadingToMaster`.
   - Stream of throttled `flashControllerUpdate` advancing `bytesSent` toward `totalBytes`.
   - `flashControllerUpdate` per controller transitioning to `Sending` (forced, after upload completes).
   - `flashControllerUpdate` per controller transitioning through `Verifying` → `Rebooting`.
   - `flashControllerResult` per controller with `outcome.kind === 'VersionConfirmed'` and `finalVersion === '1.4.0'`.
   - `flashJobDone` with `{ jobId, endedAt }`.
   - Within ≤15 sec (master heartbeat) or at exactly 15 sec (timer fallback): `lockStateChanged` with `locked === false`.
6. **Pass:** Hardware: each controller's onboard LED / status reflects the new firmware (specific to the rig); master logs reflect the post-deploy reboot.
7. **Fail:** HTTP non-200 (see edge cases below for expected non-200 paths); missing or out-of-order WS frames; controllers stuck mid-stage.

**Vue UI not yet wired.** When the button lands, clicking "Flash from cache → 1.4.0"
should produce the same WS event stream + a 200 from the same endpoint.

### 2. Trigger flash from upload (POST kind=upload)

**Currently testable how:** real hardware with a previously-uploaded
controller-variant binary. Otherwise same as case 1.

1. Upload a controller-variant `.bin` via the firmware-upload endpoint (out of
   scope here; see c.5 QA). Confirm `astros_api`'s upload store reports the new
   upload as latest.
2. POST:
   ```bash
   curl -s -X POST http://localhost:3000/api/firmware/flash \
     -H "Authorization: Bearer $TOKEN" \
     -H 'Content-Type: application/json' \
     -d '{"source":{"kind":"upload"}}' | jq
   ```
3. **Pass:** HTTP 200 with body shaped as case 1 except `source.kind === 'upload'`
   and `source.displayName` matches the uploaded file's `originalFilename`.
4. **Pass:** WS event stream identical to case 1.
5. **Note:** the upload path does not validate variant — operator-uploaded
   artifacts are operator-responsibility. The orchestrator's variant-uniformity
   check still applies upstream so all targets share a variant; if the operator
   uploaded the wrong variant binary, expect per-controller `Failed` results
   from the master (the hash + variant mismatch surfaces at deploy time).
6. **Fail:** HTTP 400 with `error: 'no_upload'` if the upload store is empty —
   that's case 7's territory, not this one.

### 3. Concurrent flash rejection (HTTP 409)

**Currently testable how:** real hardware (need an in-flight flash). The PTY
harness's controllable upload-phase pause will make this race-free; today, fire
the second POST as fast as possible after the first.

1. Trigger a flash via case 1's POST. Note the returned `jobId` (call it `J1`).
2. **Immediately** (within ~1-2 sec) fire a second POST with the same body.
3. **Pass:** second POST returns HTTP 409 with body `{ error: 'job_already_running', currentJobId: 'J1' }`.
4. **Pass:** the in-flight job continues uninterrupted — no extra `flashJobStarted`
   or `lockStateChanged` frames; the original WS event stream completes normally.
5. **Fail:** second POST gets 200 (lock was clobbered — critical bug); or 5xx;
   or 409 with the wrong `currentJobId`.

### 4. Cancel during upload (DELETE)

**Currently testable how:** real hardware. To reliably hit the upload window,
target a moderately-large firmware binary (~1 MB) so the upload phase lasts
several seconds.

1. POST a flash (case 1 or 2). Wait for the first `flashControllerUpdate` showing
   `bytesSent > 0` but `bytesSent < totalBytes`.
2. DELETE:
   ```bash
   curl -s -X DELETE http://localhost:3000/api/firmware/flash \
     -H "Authorization: Bearer $TOKEN" \
     -H 'Content-Type: application/json' \
     -d '{"reason":"qa-cancel-upload"}' | jq
   ```
3. **Pass:** HTTP 200 with body `{ jobId, cancelled: true }`.
4. **Pass:** WS frames following the cancel:
   - `flashControllerResult` per still-non-terminal controller with `outcome.kind === 'Failed'` and the cancel reason in `error`.
   - `flashJobFailed` with `{ jobId, abortReason: 'aborted' /* TransferError code from streamer */, endedAt }`.
   - `lockStateChanged` with `locked === false`.
5. **Pass:** the AbortController fires on the streamer; streamer rejects with
   `TransferError 'aborted'`; orchestrator routes through error path B.
6. **Pass:** subsequent POST flash succeeds (lock was cleanly released).
7. **Fail:** HTTP 423 (writeGuard mis-blocked the cancel — the
   `ALLOWED_DURING_FLASH` carve-out regressed); job continues despite the cancel;
   lock not released; subsequent POST returns 409.

### 5. Cancel during deploy (DELETE)

**Currently testable how:** real hardware. The deploy phase is short (master
broadcasts to controllers, controllers verify + reboot); to hit this window,
fire the DELETE as soon as the first `flashControllerUpdate` showing
`stage === 'Sending'` arrives.

1. POST a flash. Watch WS for `flashControllerUpdate` carrying any controller's
   stage as `Sending` (deploy phase started).
2. Immediately DELETE (same command as case 4 with reason `qa-cancel-deploy`).
3. **Pass:** HTTP 200 with body `{ jobId, cancelled: true }`.
4. **Pass:** WS frames:
   - `flashControllerResult` per still-non-terminal controller (those not yet
     `VersionConfirmed`/`Failed`) with `outcome.kind === 'Failed'`.
   - `flashJobFailed` with `{ jobId, abortReason: 'qa-cancel-deploy', endedAt }`.
   - `lockStateChanged` with `locked === false`.
5. **Pass / known limitation:** the master continues forwarding chunks to the
   controllers regardless — this is a protocol-level limitation, documented in
   the spec §"Error paths" row E. Some controllers may complete their flash in
   hardware even though the orchestrator marked them `Failed`. Operator must
   re-flash if that mismatch matters.
6. **Pass:** subsequent POST flash succeeds.
7. **Fail:** HTTP 423; lock not released; deployUnsubscriber leaks (next job's
   events trigger handlers from this job — observable as ghost
   `flashControllerUpdate` events on the new job's WS stream).

### 6. WS late-join mid-flash

**Currently testable how:** real hardware with a long-enough flash to give the
new client time to connect mid-flight.

1. POST a flash (case 1).
2. After the first `flashControllerUpdate` arrives on the existing WS client
   (job is mid-upload), open a **second** WS client to `ws://localhost:5000`.
3. **Pass:** the new client receives, on connect, in order:
   - `systemStatus` (existing initial-send).
   - `lockStateChanged` with `locked === true` (existing initial-send).
   - `flashJobStarted` with the current `FlashJobState` snapshot — controllers
     reflecting the in-flight stages and `bytesSent` values applied to date.
4. **Pass:** subsequent live events (`flashControllerUpdate`, `flashJobDone`, etc.)
   reach both clients identically.
5. **Pass:** if a second WS client connects **after** the job has finished
   (`flashJobDone` already fired and lock released), no `flashJobStarted` frame
   is sent — completed jobs are not retained (no history persistence in v1).
6. **Fail:** new client receives no `flashJobStarted`; or gets `flashJobStarted`
   with a stale snapshot (controllers all in `Queued` despite job mid-deploy);
   or gets a `flashJobStarted` for a completed job.

### 7. Source resolution failure (unknown github version)

**Currently testable how:** any environment with the API up — does not require
master/controllers to be powered on (variant cache must still be populated;
this case fails before the streamer runs but after the controllers list +
release service are queried).

1. POST with a version that does not exist in the configured `FIRMWARE_REPO`'s
   releases:
   ```bash
   curl -s -X POST http://localhost:3000/api/firmware/flash \
     -H "Authorization: Bearer $TOKEN" \
     -H 'Content-Type: application/json' \
     -d '{"source":{"kind":"github","version":"99.99.99"}}' | jq
   ```
2. **Pass:** HTTP 400 with body `{ error: 'release_not_found', detail: '99.99.99' }`.
3. **Pass:** WS frame `flashJobFailed` with `{ jobId, reason: 'release_not_found', detail: '99.99.99', endedAt }`.
4. **Pass:** WS frame `lockStateChanged` with `locked === false`.
5. **Pass:** no `flashJobStarted` was emitted (currentJob never set per spec).
6. **Pass:** subsequent `GET /api/firmware/flash` returns 200 with body `null`.
7. **Variant — `release_lookup_failed`:** if `releaseService.getReleases()`
   itself rejects (network down, GitHub rate-limited, repo not found), HTTP
   returns **502** (upstream-dependency) with `{ error: 'release_lookup_failed', detail }`.
   Reproduce by either disconnecting the network or pointing `FIRMWARE_REPO` at
   a non-existent repo and restarting the server.
8. **Variant — `source_resolution_failed`:** cache.fetch reject (hash mismatch
   on disk, ENOSPC, etc.) returns HTTP 502 with `{ error: 'source_resolution_failed', detail }`.
9. **Fail:** HTTP 200 (orchestrator should never start this job); 5xx for the
   400-mapped reasons; `flashJobStarted` emitted before the failure.

### 8. Variant mismatch (controllers report differing variants)

**Currently testable how:** hardware-with-mixed-variants is unusual (the bench
typically has matching boards). Easiest reproduction is an operator-set bench
with a `lolin_d32_pro` body controller and a `metro_s3` dome controller. The
PTY-stub harness will inject mixed-variant POLL_ACKs deterministically.

1. Confirm POLL_ACKs from at least 2 controllers reporting different `variant`
   values are populating the in-memory cache (visible in server logs as the
   POLL handler updates `controllerVariantCache.set(addr, variant)` with
   different values).
2. POST a flash (any source kind):
   ```bash
   curl -s -X POST http://localhost:3000/api/firmware/flash \
     -H "Authorization: Bearer $TOKEN" \
     -H 'Content-Type: application/json' \
     -d '{"source":{"kind":"github","version":"1.4.0"}}' | jq
   ```
3. **Pass:** HTTP 400 with body `{ error: 'variant_mismatch', detail: <list of mismatched variants> }`.
4. **Pass:** WS frame `flashJobFailed` with `{ jobId, reason: 'variant_mismatch', detail, endedAt }`.
5. **Pass:** WS frame `lockStateChanged` with `locked === false`.
6. **Recovery:** operator must either (a) flash variants separately by
   physically isolating one controller at a time, or (b) correct the
   underlying location data so all controllers in a location share a variant.

### 9. Variant unknown (controller never POLL_ACK'd)

**Currently testable how:** real hardware. Easiest repro: cold-boot the server
(empty variant cache) and immediately POST a flash before any POLL_ACK arrives.
Alternatively, physically disconnect a controller mid-run so its cache entry
goes stale (won't help — the cache only writes; entries never time out in v1).

1. Restart `npm run start:tsx`. Wait for the API to listen on port 3000 but
   immediately fire a flash POST (within the first ~5 sec, before the first
   POLL cycle has populated the variant cache for at least one controller).
2. **Pass:** HTTP 400 with body `{ error: 'variant_unknown', detail: <list of controllerIds with empty variant> }`.

   *Caveat:* with the current `controllersStore.listInLocation` impl, the
   variant cache is populated **only** by POLL_ACKs that carried a non-empty
   variant. Controllers that never POLL_ACK'd at all are absent from the cache
   — `listInLocation()` returns `[]`, which routes to `no_controllers` (case
   below) instead of `variant_unknown`. To trigger `variant_unknown` cleanly,
   one or more controllers must have been seen in the cache previously with a
   variant string and then have it stripped — not currently reproducible
   against real hardware. This case is primarily defensive; full validation
   awaits the c.6c.2 PTY harness which can inject empty-string variants.
3. **Pass:** WS `flashJobFailed { jobId, reason: 'variant_unknown', detail, endedAt }`
   + `lockStateChanged { locked: false }`.
4. **Recovery:** wait for the next POLL cycle (~5 sec) to populate the cache, retry.

### 10. Asset not found (release lacks the controllers' variant)

**Currently testable how:** real hardware. Pick a github version that exists
in the configured `FIRMWARE_REPO` releases but does NOT publish an asset
matching the controllers' shared variant. (Older releases of AstrOs.ESP only
shipped `lolin_d32_pro`; flashing onto a `metro_s3`-only bench against one
of those releases reproduces this case.)

1. Confirm controllers report a uniform variant `metro_s3` (or whatever the
   bench actually is).
2. POST with a version known to lack a `metro_s3` asset:
   ```bash
   curl -s -X POST http://localhost:3000/api/firmware/flash \
     -H "Authorization: Bearer $TOKEN" \
     -H 'Content-Type: application/json' \
     -d '{"source":{"kind":"github","version":"1.0.0"}}' | jq
   ```
3. **Pass:** HTTP 400 with body `{ error: 'asset_not_found', detail: 'metro_s3' }`.
4. **Pass:** WS `flashJobFailed { jobId, reason: 'asset_not_found', detail: 'metro_s3', endedAt }`
   + `lockStateChanged { locked: false }`.

### 11. Server shutdown during flash (lock auto-release on next start)

**Currently testable how:** real hardware. Hard process kill is the cleanest
repro; clean shutdown via Ctrl-C also works.

1. POST a flash (case 1). Confirm WS `flashJobStarted` arrived (job in flight).
2. While the upload phase is mid-stream, **kill the server process** (`Ctrl-C`
   in the terminal running `npm run start:tsx`, or `docker compose down` for
   the container variant).
3. **Pass:** server exits. WS clients receive `close` events (no
   `lockStateChanged` since the server doesn't gracefully release on shutdown
   in v1 — the orchestrator + JobLock are pure in-memory).
4. Re-start the server (`npm run start:tsx`).
5. **Pass:** on restart, JobLock is in its default `unlocked` state — there
   is no on-disk persistence of orchestrator state per the FMI §5. The next
   POST flash returns 200, not 409.
6. **Pass:** WS clients reconnecting to the new server see `lockStateChanged { locked: false }`
   on connect (initial-send), confirming the lock is clean.
7. **Note:** the master may have been left mid-deploy with partial state —
   that is a master-side recovery problem, not the orchestrator's. Operator
   may need to manually reboot the master before retrying.

### 12. Master heartbeat post-deploy releases lock (primary path)

**Currently testable how:** real hardware. The c.6c.2 PTY-stub harness will
control master reboot timing precisely; today, observe the live race.

1. POST a flash. Wait for the full happy-path WS stream up to and including
   `flashJobDone`.
2. Continue watching WS. Time-stamp the moment of `flashJobDone` (`T0`).
3. **Pass:** within ≤15 sec of `T0` — typically much sooner (~1-3 sec) — a
   `lockStateChanged { locked: false }` frame arrives. The 15-sec timer is the
   fallback, not the primary; on a healthy bench, the master reboots and sends
   its post-reboot POLL_ACK well before then.
4. **Pass:** server log line: `flashOrchestrator received heartbeat from
   POLL handler ... releasing lock` (or similar — verify log key matches).
5. **Pass:** `GET /api/firmware/flash` returns `null` after the heartbeat
   release (currentJob cleared).
6. **Pass:** subsequent POST flash returns 200 (lock was cleanly released).
7. **Fail:** `lockStateChanged` doesn't arrive until exactly 15 sec after
   `T0` on a healthy bench (heartbeat path is dead — likely the POLL handler's
   version-match guard regressed; check server logs for the "does not match
   expected" line, which would indicate the firmware is reporting a different
   version than the orchestrator's `source.version`).

### 13. Master never heartbeats (timer fallback fires after 15 sec)

**Currently testable how:** **deferred to c.6c.2 PTY-stub harness** for a
deterministic master-no-reboot simulation. Until then, validate by
**physically powering off the master** between `flashJobDone` and the
expected heartbeat (within ≤15 sec). The master not sending its post-reboot
POLL_ACK forces the orchestrator onto the timer fallback.

1. POST a flash. Watch WS until `flashJobDone` arrives.
2. **Immediately** (within ~1 sec) cut power to the master. Note the
   wall-clock time of `flashJobDone` as `T0`.
3. **Pass:** at exactly `T0 + 15 sec` (the configured `rebootTimeoutMs`),
   WS frame `lockStateChanged { locked: false }` arrives.
4. **Pass:** server log line indicating the timer fallback fired
   (e.g., `releaseLock('timeout')`).
5. **Pass:** subsequent POST flash returns 200.
6. **Pass:** if the master is then powered back on and emits a POLL_ACK with
   the deployed version, the heartbeat callback is a no-op (lock already
   released by timer; `rebootTimer === null` short-circuits) — no double
   release, no extra `lockStateChanged` frame. Observed via log line
   `flashOrchestrator: no rebootTimer armed; ignoring heartbeat` or
   equivalent.
7. **Fail:** `lockStateChanged` fires twice (once from timer, once from
   late heartbeat — first-fire-wins guard regressed); or never (timer never
   armed, or armed against a stale `rebootTimer` reference).

## Edge cases / negative observations

- `DELETE /api/firmware/flash` with no active job → 404 with `{ error: 'no_active_job' }`.
- `GET /api/firmware/flash` → 200 with `null` body when no job is in flight,
  or 200 with the full `FlashJobState` when one is.
- `POST /api/firmware/flash` with malformed body (missing `source`,
  unknown `kind`, github with empty version) → 400 with `{ error: 'invalid_body', detail }`.
- `DELETE /api/firmware/flash` while a flash is in progress is allowed despite
  the JobLock-held `writeGuard` — verify directly by attempting any other
  write-class API call (e.g., `DELETE /api/scripts/<id>`) during the flash and
  confirming it returns 423, while the cancel returns 200.
- WebSocket write-class messages during a flash are still rejected per-connection
  with `lockStateChanged` + a `flashJobActive` frame (existing c.2 behavior;
  unchanged by c.6c.1).

## Integration test suite (c.6c.2)

The following scenarios are covered end-to-end by the automated integration
suite under `astros_api/src/firmware/integration/`. Each test boots a real
`ApiServer` against a `socat`-backed PTY pair driven by an in-process
`StubMaster` (a scriptable wire-protocol responder, NOT a firmware
simulator — real firmware behavior simulation lives in AstrOs.ESP). Operators
do NOT need to manually verify these scenarios unless investigating a regression
in the suite itself.

| Scenario | File | What it pins |
|---|---|---|
| Happy upload flash + heartbeat | `flash_happy_upload.integration.test.ts` | POST `kind=upload` → flashJobStarted → flashJobDone → master POLL_ACK heartbeat with deployed version → lock release in ~1-2s |
| Happy github flash + heartbeat | `flash_happy_github.integration.test.ts` | POST `kind=github version=1.5.0` with injected fake fetcher returning canned release JSON; cache hit short-circuits download |
| Cancel during upload | `flash_cancel.integration.test.ts` | DELETE while streamer awaits begin-ack → AbortController.abort → flashJobFailed{reason:'aborted'} |
| Cancel during deploy | (same file) | DELETE after FW_DEPLOY_BEGIN → inline deploy-cancel → per-controller Failed + flashJobFailed{abortReason:'http'} |
| Chunk NAK + Go-Back-N | `flash_chunk_nak.integration.test.ts` | autoAckUpload({failAtSeq:2}) NAKs once → streamer rewinds to lastGoodSeq+1 → seq=2 received twice → flashJobDone |
| Mixed OK/FAILED outcomes | `flash_partial_failure.integration.test.ts` | Master OK + padawan FAILED → flashJobDone (NOT failed) per `deriveJobLifecycle`; flashControllerResult per controller with correct stage/error |
| Heartbeat releases lock fast | `flash_heartbeat_release.integration.test.ts` | Wall-clock delta from POLL_ACK to lockStateChanged < 3000ms (heartbeat path firing, not timer) |
| Wrong-version heartbeat ignored | (same file) | sentinel POLL_ACK with non-matching firmwareVersion → orchestrator filters → timer fallback releases lock |
| Reboot timer fallback | `flash_reboot_timer_fallback.integration.test.ts` | No heartbeat after flashJobDone → timer fires → lock release in `rebootTimeoutMs` ± tolerance |
| Concurrent flash returns 409 | `flash_concurrent.integration.test.ts` | Second POST during in-flight flash → 409 with currentJobId; WS SERVO_TEST → flashJobActive rejection frame |

Run via:

```bash
cd astros_api && npm run test:integration
```

The integration suite is also covered by the default `npm test` / `npx vitest run`
sweep — `test:integration` exists for fast targeted re-runs during development.

The suite is **Linux only** — non-Linux runners skip the integration tests
via `skipIfNotLinux`, and `globalSetup` short-circuits there too so unit
tests still run normally on Windows. (macOS's `socat` emits a different PTY
path format than the helper's regex matches; rather than maintain a
per-platform matrix without hardware to test on, the suite is gated to
Linux.) First run on Linux takes ~5-15 sec extra for a `dist/` build
(Worker threads can't load TS source under vitest+tsx, so the harness runs
the production worker from compiled JS); subsequent runs skip the build.

The remaining manual scenarios in this plan still require operator attention —
they cover boundaries the integration suite intentionally doesn't:

- Real-hardware end-to-end smoke against the bench rig
- POLL_ACK protocol-level inspection with the real master firmware
- Source-resolution against the real GitHub API (rate limits, network errors)
- The Vue UI's rendering of progress + completion states

## Verification (run before opening the Part 2 PR)

From `astros_api/`:

1. `npm run prettier:write` — clean (no diff).
2. `npm run lint:fix` — clean.
3. `npm run build` — clean (lint + tsc both green).
4. `npx vitest run` — full suite green:
   - `flash_orchestrator.test.ts` — orchestrator unit tests (Tasks 1-11
     coverage).
   - `firmware_flash_controller.test.ts` — HTTP controller tests (Task 12).
   - `serial_bus.test.ts` — extended for `subscribeDeployEvents` (Task 2).
   - `message_handler.test.ts` — extended for 5-field POLL_ACK + variant
     extraction (Task 3).
   - `write_guard.test.ts` — extended for the `DELETE /firmware/flash`
     allowlist carve-out (Task 13 follow-up `110e7d9`).
5. `superpowers:requesting-code-review` on the full Part 2 diff against
   `develop` (i.e., `git diff develop...HEAD`). Address Critical/Important
   issues before opening the PR; capture Minor in the PR body for follow-up.
