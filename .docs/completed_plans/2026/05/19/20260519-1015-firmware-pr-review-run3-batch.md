# Firmware PR review — run-3 fix batch

Follows `.docs/plans/20260518-0902-firmware-pr-review-pre-push-batch.md`. The third pre-push toolkit run on `feature/firmware-allow-downgrade` surfaced 3 Critical and 15 Important items across 5 agents. They cluster into 3 coherent tasks rather than 18 independent fixes — the underlying patterns are partial-fix-sweep misses from runs 1 and 2.

## What the run-3 review caught

**Pattern 1 — Run-2 belt fix is incomplete in 4 sibling places.** The `.catch` belt added in commit `3fcdf29` correctly wrapped `releaseLock`'s disposer calls (`deployUnsubscriber`, `throttle.dispose`) in their own try/catch. But the same protection is missing at:

- `handleDeployDone` (`flash_orchestrator.ts:1230-1233`) — calls `this.deployUnsubscriber()` unwrapped on the success path. If the disposer throws, `flashJobDone` never emits, `rebootTimer` never arms, lock stays held forever. **Operator-visible bug; Critical.**
- The belt itself (`flash_orchestrator.ts:880`) — releases `JobLock` but never calls `broadcastLockState()`. Other tabs/operators see the stale "Firmware update in progress" banner until manual refresh.
- `releaseLock`'s `clearTimeout` (`flash_orchestrator.ts:1051-1054`) — unwrapped. Production `Clock` doesn't throw but test clocks could, which would propagate to the belt and emit a duplicate `streamer_unknown_error` overwriting the operator's real banner.
- Test coverage: no test mutates a disposer to throw and asserts the wrapping holds (per `releaseLock`'s own forensic comment, removing either try/catch fails the operator). The belt test pins 4 obligations but not lock-state broadcast or inner-emit-throw.

**Pattern 2 — Doc drift in 4 sibling places.** Run-2 fixed two prose drifts (`upload.ts` disclaimer, class header). Four more remain:

- `upload.ts:43-50` — claims `FirmwareUploadErrorCode` is mirrored in `astros_vue/src/types/firmware.ts`; symbol was deleted in `9c82c4d`. **Four independent agents corroborated. Critical for future-contributor confusion.**
- `astros_vue/src/types/firmware.ts:117-119` — JSDoc claims "Mirror of `FlashOrchestratorErrorReason` plus a couple of client-side reasons"; reality is THREE server unions (orchestrator + transfer + upload).
- `flash_orchestrator.ts:363-370` — enumerates 10 pre-streamer reasons; misses `controllers_unknown` (HTTP 400 pre-streamer-validation).
- `chunk_streamer.ts:956-957` — cites stale `TRANSPORT_DEFAULTS` watchdog/ack-timeout values without the production-override disclaimer that runs 1+2 added at the sibling sites in the same file.
- `message_helper.ts:54-57` — dead FW_CHUNK 1500ms entry. **Third toolkit run flagging this; promote from "pre-existing".**

**Pattern 3 — New contracts lack test guards.** Run-2 introduced path-scoped middleware mounts and the belt's lock release. Six coverage holes left:

- Path-scoped middleware contract — no test asserts `/api/audio/savefile` does NOT return a firmware-typed JSON 413 (audio-regression unguarded against future revert to global form).
- Belt inner `try { emit } catch {}` — no test forces `emitWs` to throw to drive the "UI emit also failed" log branch.
- `releaseLock` per-disposer try/catch isolation — no test mutates a disposer to throw and asserts protection holds.
- `it.each` over 11 streamer reasons (`firmware.spec.ts:1498-1520`) — hardcoded literal list duplicating `TransferErrorCode`. **Run-2 I2 still open.** Pattern model: `firmwareStageMapping.spec.ts:127-141` iterates `FLASH_ERROR_REASONS` directly.
- Round-trip WS handler — no test exercises `handleMessage → handleFlashJobFailed → applyJobFailed` (existing tests call `applyJobFailed` directly).
- `flash_orchestrator.test.ts:1133` and `api_server` `wanted.has(id)` filter — `listFlashTargets` mock receives any args silently; the request-scoping filter has zero unit coverage.

Plus 5 lower-priority Important items (silent-failure hardening + type-design tightening).

## Scope guard

This batch is 3 task clusters with ~5-7 sub-items each. Layers stay narrow: server `firmware/` module, one Vue type file, tests on both sides. All items are mechanical and self-contained — no architecture rework. Stays inside the light-plan threshold.

**Out of scope (filed for follow-up or already in stubs):**

- Type I1 / I2 / I6 — `.docs/plans/20260518-0926-firmware-type-design-orphaned-followups.md` (this batch only updates the I1 scope to include `nextTransferId`).
- Silent I2 / I5 / I6 — need their own UX brainstorms.
- File controller MIME map (pre-existing, now in scope due to 50 MB limit) — file separately if not auto-handled.
- `useTempFiles` + writeGuard 423/503 orphan temp-file leak — narrow window, file follow-up.
- Belt comment overstating leak claim, belt's throttle non-disposal, `WINDOW_SIZE` ALL_CAPS in header, orphan-stub line numbers off by 4 — cosmetic; defer or roll into Cluster 2 if cheap.

## Tasks

- [ ] **Cluster 1 — Belt-protection sweep** (1 commit):
  - Wrap `handleDeployDone`'s `this.deployUnsubscriber()` call in try/catch + `logger.error` (mirror the pattern at `releaseLock:1065-1085`). **Critical.**
  - Add `this.broadcastLockState()` to the `.catch` belt right after `this.jobLock.release(jobId)`.
  - Wrap `releaseLock`'s `this.clock.clearTimeout(this.rebootTimer)` in try/catch + `logger.warn`.
  - **Test additions** in `flash_orchestrator.test.ts`:
    - Mutation-discipline test: spoof `deployUnsubscriber` to throw; assert the belt does NOT emit a generic `streamer_unknown_error` after the real `flashJobFailed` (i.e., the wrap holds).
    - Belt inner-emit-throw test: inject `fx.emitWs = vi.fn().mockImplementation(() => { throw new Error('ws-down') })` before the spoofed `routeStartFailure`; assert lock-release + state-null + "UI emit also failed" log branch.
    - 5th belt obligation: assert `lockStateChanged` is broadcast after the belt fires.
  - **New test file** `astros_api/src/api_server.test.ts` (or addition to firmware_upload_controller.test.ts): supertest-level test asserting an oversize POST to `/api/audio/savefile` does NOT return the firmware-typed `payload_too_large` JSON body.
- [ ] **Cluster 2 — Doc drift sweep** (1 commit):
  - Rewrite `upload.ts:43-50` header to point at `FLASH_ERROR_REASONS` in `astros_vue/src/types/firmware.ts` as the mirror, and clarify that the codes are a subset of the unified union.
  - Fix `FLASH_ERROR_REASONS` JSDoc at `astros_vue/src/types/firmware.ts:117-119` to enumerate the 3 server-side sources (orchestrator + transfer + upload) instead of 1.
  - Add `controllers_unknown` to the pre-streamer enumeration in `flash_orchestrator.ts:363-370`.
  - Rewrite the watchdog/ack-timeout paragraph at `chunk_streamer.ts:956-957` to cite `DEFAULT_STREAMER_CONFIG` production values and note the test-vs-production gap (mirror the comment pattern at `chunk_streamer.test.ts:1898-1911`).
  - Remove the dead FW_CHUNK 1500ms entry in `serial/message_helper.ts:54-57` (promote from "pre-existing" to in-scope — third-run signal).
  - Re-type `firmwareUploadLimitHandler` from `any` to `RequestHandler` from `express`; remove the three `eslint-disable` comments.
  - Check off completed tasks in `.docs/plans/20260518-0902-firmware-pr-review-pre-push-batch.md` and correct the audio-route claim to match as-built behavior.
  - Fix the orphan-stub line numbers (`20260518-0926-...md` cites off-by-4 lines for `FlashOrchestratorErrorReason`, `FirmwareUploadErrorCode`, `FLASH_ERROR_REASONS`, `DEFAULT_STREAMER_CONFIG`).
- [ ] **Cluster 3 — Silent-failure hardening + test surface** (1 commit):
  - Add `logger.warn` to `firmwareUploadLimitHandler` with `req.ip` and `req.headers['content-length']`. **Critical (admin debugging gap).**
  - Add `logger.warn(err.code, ...)` before returning `null` in `firmware_upload_store.ts:latest()` (or equivalent) so EACCES/EISDIR/EIO surface to the server log even though the operator path continues to return null.
  - Wrap `chunk_streamer.ts:1029` `unsubscribe()` in try/catch + `logger.error`.
  - **Test additions:**
    - Derive `firmware.spec.ts:1498-1520`'s `it.each` array from `FLASH_ERROR_REASONS` filtered to the streamer subset (close run-2 I2 drift hazard).
    - Add one round-trip WS test: `handleMessage` with well-formed `flashJobFailed` payload → assert `store.flashError?.reason` matches.
    - Add `expect(fx.controllersStore.listFlashTargets).toHaveBeenCalledWith(fx.request.controllers)` to at least one happy-path test in `flash_orchestrator.test.ts`.
    - Add unit test for the api_server inline `wanted.has(id)` `listFlashTargets` callback: 3-entry cache + 2-entry `requestedIds` → only the intersection comes out.
- [ ] **Type I1 orphan stub update** (1 commit, no code changes):
  - Edit `.docs/plans/20260518-0926-firmware-type-design-orphaned-followups.md` to add `nextTransferId: number` (`flash_orchestrator.ts:546`) to the I1 brand scope. Note that the brand sweep needs to cover both producer fields.
- [ ] **Pre-commit gate per cluster** — prettier:write + lint:fix + build + vitest (`npx vitest run`) + `superpowers:requesting-code-review` on the diff. Address Critical/Important findings before committing. The carve-out for plan-only / comment-only changes applies to the Type I1 stub update and the 0902 plan checkboxes only.

## References

- Toolkit run-3 synthesis (2026-05-19).
- Cross-corroboration: 4 agents flagged `upload.ts:44` doc drift independently.
- Partial-fix-sweep promotions: `message_helper.ts:54-57` (third-run signal), `handleDeployDone` disposer (sibling-of-fixed-site miss).
- Plan-trail: `20260517-0751`, `20260517-0817`, `20260518-0902` (parent), `20260518-0926` (orphan stub, updated here).
