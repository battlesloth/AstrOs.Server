# Fix: FW_PROGRESS terminal stages (VERSION_CONFIRMED / FAILED) crash the deploy

**Branch:** `fix/firmware-progress-terminal-stage` (off `develop`; bench runs develop)
**Type:** Light plan — self-contained orchestrator bug fix + test-harness alignment

## Symptom

On the bench, an OTA deploy that *succeeds on hardware* never completes in the UI.
Server logs show the deploy progressing through VERIFYING → FLASHING → REBOOTING,
then `handleFwDeployDone entered` in the worker — but the orchestrator's
`handleDeployDone` never runs and the UI never sees `flashJobDone`.

## Root cause (traced end-to-end)

The real master firmware emits `FW_PROGRESS … VERSION_CONFIRMED` per protocol
(`.docs/protocol.md` §A table, lines 37/48/136 — "master saw new version in
heartbeat"), then sends the authoritative `FW_DEPLOY_DONE` at the end.

1. `message_handler.handleFwProgress` accepts it (`FW_STAGE_VALUES` = all `FwStage`).
2. `flash_orchestrator.handleDeployProgress` routes it into
   `transitionControllerState(target, VersionConfirmed, {bytesSent,totalBytes,detail})`.
   `Rebooting → VersionConfirmed` is a **legal** edge, but `VersionConfirmed`
   **requires `finalVersion`** in the payload (`flash_job_state_machine.ts:139-144`);
   an FW_PROGRESS frame has no `finalVersion` (version rides in `detail`) → **throws**.
3. The `catch` at `flash_orchestrator.ts:1252` misclassifies it as
   `failDeployPhase('protocol_violation', …)` → `failJob` → `releaseLock`, which
   **disposes the deploy subscriber** (`flash_orchestrator.ts:1571-72`).
4. ~30ms later `FW_DEPLOY_DONE` arrives, parses fine in the worker, is posted to
   the main thread — but the `subscribeDeployEvents` listener is **gone**, so
   `mapToFwDeployEvent` never runs and the DONE event is silently dropped.

The orchestrator comment at line 1233 ("Terminal stages arrive via
FW_DEPLOY_DONE; handleDeployProgress only sees in-flight stages") and the stub
master (`stub_master.ts:221`, "VersionConfirmed/Failed come from FW_DEPLOY_DONE,
not a final FW_PROGRESS") both encode an assumption that **contradicts
`protocol.md:136`** — which is why CI passed but the real firmware fails.

## Approach (chosen: "forward to UI, DONE stays authoritative")

`handleDeployProgress`, on a **terminal** stage (`VersionConfirmed` / `Failed`)
arriving via FW_PROGRESS:
- Emit a UI update (`flashControllerUpdate`) reflecting the terminal stage,
  sourcing the version/error from the FW_PROGRESS `detail` field, so operators
  get real-time per-controller confirmation (the new UI's STAGES grid wants this
  staggered "Core confirmed → Dome confirmed" progression).
- **Do NOT** mutate the FSM (`currentJob.controllers`) to a terminal stage — the
  authoritative `Rebooting → VersionConfirmed` (with `finalVersion`) transition
  still happens in `handleDeployDone` when `FW_DEPLOY_DONE` lands. Mutating here
  would make the DONE transition illegal (terminal→terminal) and re-drop the row.
- In-flight stages: unchanged.

The emit-only terminal `ControllerFlashState` is constructed directly (not via
`transitionControllerState`) — it is a *preview of the master's reported status*,
not a state transition, so it must not be subject to the FSM legality/payload
throw that caused this bug.

## Tasks

- [ ] **Failing test first (TDD red).** In `flash_orchestrator.test.ts`: drive a
  controller to `Rebooting` via FW_PROGRESS, then deliver `FW_PROGRESS
  VERSION_CONFIRMED` (detail=version). Assert: NO `flashJobFailed`; a
  `flashControllerUpdate` with `stage=VersionConfirmed` + `finalVersion`=detail is
  emitted; subscriber stays armed (`getCurrentJob()` non-null, still in_flight);
  then a subsequent `FW_DEPLOY_DONE OK` drives the authoritative transition and
  emits `flashControllerResult` + `flashJobDone`. Add a sibling test for
  `FW_PROGRESS FAILED` (detail=error). Confirm both FAIL against current code.
- [ ] **Implement** the terminal-stage forwarding branch in `handleDeployProgress`
  (`flash_orchestrator.ts`). Make the tests pass.
- [ ] **Mutation check** (per defensive-feature rule): revert the new branch and
  confirm the new tests fail (no vacuous assertions), then restore.
- [ ] **Align the harness + comments to protocol:** update `stub_master.ts` to
  emit `FW_PROGRESS VERSION_CONFIRMED` before `FW_DEPLOY_DONE` (per
  `protocol.md:136`); correct the misleading comments at
  `flash_orchestrator.ts:1233` and `stub_master.ts:221`. Re-confirm the existing
  happy-path test still passes (now exercising the real firmware sequence).
- [ ] **Pre-commit:** `prettier:write`, `lint:fix`, `build`, `vitest run`;
  `superpowers:requesting-code-review` on the diff (include the consumer side:
  protocol.md, message_handler, the Vue store's wire→state mapper note).
  Address Critical/Important. Then commit. (User pushes via VS Code → PR into develop.)

## Out of scope (logged for the UI redesign phase)

- Vue store must accept `stage=VersionConfirmed` arriving via `flashControllerUpdate`
  (today it only arrived via `flashControllerResult`).
- `UPLOADING_TO_MASTER` is currently emitted for padawans too; new UI makes
  "Download" master-only — revisit the emit or map it store-side then.
