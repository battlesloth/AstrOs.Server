# `FlashJobOrchestrator.start()` — return early, run upload + deploy in background

## Problem

`FlashJobOrchestrator.start()` `await`s the entire upload phase (`streamer.run()` at `flash_orchestrator.ts:746`) before returning to the HTTP controller, which then sends its 200 response. For a 1.2 MB image at the current ~1.5 s/chunk stop-and-wait rate, this blocks the HTTP request for **7+ minutes**.

The client's `apiClient.post()` has a 30-second timeout. After 30 s:

1. Browser cuts the POST connection. Server log shows `statusCode:null, responseTime:30000` (today's bench: log line 94).
2. Client's `startFlash()` catch block fires — `pendingOwnFlashStart = false`, `phase = 'select'`, flashError populated.
3. `ownJobId` was never set (POST body never returned).
4. WS's `flashJobStarted` had already populated `currentJob`, so `currentJob.jobId !== null` but `ownJobId === null` → `isOwnJob = false`.
5. `lockLocked = true` (server still flashing) → `lockConflict` banner appears for the operator's OWN in-flight flash.

The function's own docstring (line 581-588) and inline comment (line 753-757) both describe the intended behavior: *"the operator-facing HTTP layer gets a fast 'flash started, jobId=X' response while the deploy events drive the rest asynchronously."* The deploy-half is already async — the upload-half (`await streamer.run` at line 746) is the bug. Comment-vs-code drift.

This also explains a chain of UX bugs we've spent the day patching:

- `f32948b`'s `pendingOwnFlashStart` race fix would never have been needed if HTTP returned in ~100 ms (no 1-10 s source-resolution window for the race to fire in).
- The cross-attempt lock-conflict race (banner reappearing after a failed first attempt) is hidden behind the same window.
- `FLASH_POST_TIMEOUT_MS` would have no reason to be larger than a few seconds.

## Approach

Split `start()` into two phases:

**Sync (pre-HTTP-response) — completes in ~1-10 s for github source / similar for upload:**

1. Acquire `JobLock` (already sync; lines 596-610). Reject concurrent calls.
2. Lookup controllers + validate variant (`listFlashTargets`).
3. Resolve source (`resolveFlashSource` — cache fetch or upload validation).
4. Generate `transferId`, build `currentJob`, emit `lockStateChanged` (already done) + `flashJobStarted` over WS.
5. Set up throttle, `AbortController`, mark `phase = 'upload'`.
6. **Return** `{ jobId, transferId, source, targets }` to the HTTP layer.

**Background (post-HTTP-response) — fire-and-forget, ~minutes:**

7. `streamer.run(transferSpec, observer, { signal })` — the upload itself.
8. Transition controllers to `Sending`, emit per-controller `flashControllerUpdate`.
9. Send `FW_DEPLOY_BEGIN`, subscribe to `FW_PROGRESS` + `FW_DEPLOY_DONE`.
10. Subscriber-driven deploy → terminal `flashJobDone` / `flashJobFailed` + lock release.

Steps 7-9 (and any failure within them) currently re-throw from `start()` into the controller, which maps `FlashOrchestratorError` / `TransferError` to HTTP status codes. After the refactor, those rejections route through `failJob` (the same path the existing outer catch uses today), emit `flashJobFailed` on WS, and **do not propagate to the HTTP caller** — by then HTTP has already responded 200 and the operator's truth source is the WS surface. The catch shape stays unchanged; only the propagation differs.

The background work runs as a `Promise<void>` stored on `this.runInProgress` as a test seam — `flash_orchestrator.test.ts` currently awaits `orchestrator.start(...)` and asserts on terminal state; after the refactor those tests await `orchestrator.start(...).then(() => orchestrator.runInProgress)` (or a small helper) for the same coverage. This is the only mechanical test-side churn.

Why source resolution stays in the sync portion: source-not-found is an HTTP-meaningful error today (`FlashOrchestratorError` → 400/404/etc). Moving it to background means the HTTP returns 200 even when source resolution will fail seconds later — that's a UX regression. Source resolution is bounded at 1-10 s in normal operation (github cache hit, single API call on miss, upload validation on a ~1 MB file), comfortably under the 30 s browser timeout. Keeping it sync preserves the "HTTP status reflects setup outcome" contract.

## Tasks

- [x] **Refactor `start()` into sync setup + background work.** Wrapped the post-`flashJobStarted` work (lines 746-802) in an async IIFE assigned to `this.runInProgress`. IIFE captures `streamer`/`transferSpec`/`observer`/`signal` by closure; signal hoisted into a local so the IIFE doesn't need a `!` assertion on `this.abortController`. Extracted the existing error-routing block into a private `routeStartFailure(jobId, err)` method shared by both the sync catch (re-throws) and the background catch (absorbs). `start()` returns `{ jobId, transferId, source, targets }` immediately after the IIFE spawn — no more await on `streamer.run`. Updated the docstring to describe the new sync/background split.

- [x] **`firmware_flash_controller.startFlashJob` unchanged.** Verified: 26/26 controller tests pass without modification. The controller's catch block still handles the typed `FlashOrchestratorError` cases that propagate from sync setup (job_already_running, no_controllers, source resolution failures); background failures now route through `failJob` → WS only.

- [x] **Update orchestrator tests.** Updated 17 sites in `flash_orchestrator.test.ts` and 1 site in `flash_cancel.integration.test.ts` for the new async semantics. The pattern: `await startPromise; await fx.orchestrator.awaitRunInProgressForTest();` in place of the prior `try { await startPromise; } catch (err) { ... expect(caught).toBeInstanceOf(...) ... }`. The integration test's `expect(flashRes.status).toBe(500)` for cancel-during-upload became `toBe(200)` — HTTP returns 200 when sync setup succeeds; the abort surfaces via the `flashJobFailed` WS event the test already asserts on. `runInProgress` is `private` with a `awaitRunInProgressForTest()` accessor so the contract is enforced by TypeScript rather than just commented.

- [x] **Pipeline + code review.** prettier/lint/build/vitest all green. Code-reviewer agent dispatched on the diff vs `e642f9e` — caught a missing test update at `lockReleaseScenarios` ('streamer TransferError' + 'streamer unknown error' drives), a stale `cancel()` upload-phase comment referencing the old `start()` catch path, and the `runInProgress` field's public-by-default visibility despite a comment claiming "MUST NOT be awaited." All three addressed. Full suite: 771/771 passed.

- [x] **Bench validation.** Confirmed end-to-end on the post-`4b0e081` flash run: HTTP POST returns immediately (no more 30 s `apiClient.post` timeout), UI transitions to "Flashing" without lock-conflict banner appearing, upload progresses to completion. The previously-load-bearing UX bug (banner shows for operator's own flash after 30 s) is closed at the source. One UI bug surfaced during this run unrelated to the orchestrator contract — the "transfer" step rendered green even though the firmware-side transfer-handling isn't implemented yet (Phase 3 is wire-up only; flash-write comes later) — captured as a separate follow-up.

## Files touched

- `astros_api/src/firmware/flash_orchestrator.ts` — split `start()` into sync + background; extract `runUploadAndDeploy` and `handleRunError`; add `runInProgress` test seam; clear it on every terminal path.
- `astros_api/src/controllers/firmware_flash_controller.ts` — likely no functional change; verify catch-block error mapping still applies cleanly to the now-narrower set of sync errors.
- `astros_api/src/firmware/flash_orchestrator.test.ts` + `flash_*.integration.test.ts` — await `runInProgress` in tests that assert on terminal state.

## Out of scope

- **Moving source resolution to background.** Would make the HTTP response even faster (<200 ms instead of 1-10 s) but breaks the "HTTP status reflects setup outcome" contract that the controller currently relies on for error mapping. Source resolution at 1-10 s is comfortably under any browser timeout. Revisit if/when source resolution genuinely starts exceeding 10 s in normal use.
- **Removing `FLASH_POST_TIMEOUT_MS` on the client side.** Once `start()` returns in <2 s, the 30 s client timeout becomes inert. Could be reduced to e.g. 15 s as a hygiene tightening, but no functional reason to change it.
- **Reverting the `transferTimeoutMs: 600_000` watchdog bump from `15fc6d0`.** That bump is a server-side safety net on the streamer's whole-transfer watchdog and is orthogonal to the HTTP-response refactor. Leaving it at 10 min keeps the safety margin against future master-side slowdowns.
- **Reverting the cross-attempt lock-conflict race fix discussion.** The race window we identified earlier (~30 s, triggered by client POST timeout) closes when `start()` returns early. The `pendingOwnFlashStart` flag from `f32948b` stays as belt-and-suspenders for the small ~1-10 s source-resolution window that remains. The proposed "make recovery jobId-aware" follow-up plan can stay deferred — once this lands, the race rarely fires.
- **`useWebsocket.ts`'s `handleLockStateChanged` defensive recovery path.** That path fires `applyJobDone` if `locked:false` arrives while `phase='flashing'`. Once HTTP returns early and the cross-attempt race is closed, this defensive recovery becomes much less load-bearing — but it's a separate concern and removing it could mask a genuinely lost terminal event. Leave it alone.
