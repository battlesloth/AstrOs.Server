# Firmware UI: "transfer" step shows green even when transfer not implemented — stub

**Status: stub — reproduction + WS-event trace required before implementation.**

## Problem

During the 2026-05-16 bench validation of the OTA stabilization work, the operator observed:

> "the upload succeeded but the transfer failed (not implemented) yet the UI shows green for transfer on up"

Translation: the OTA chunk-upload phase completed successfully (server received END_ACK from master, `flashJobDone` emitted on WS — or at least progressed past the upload stage). The downstream "transfer" / deploy phase isn't fully implemented on the firmware side (this is Phase 3 wire-up; `OtaReceiver::handleChunk` validates but doesn't persist to flash, deploy isn't wired). Yet the per-controller stage rendered green ✓ for the "transfer" step in `FirmwareView`.

The bug is a false-success indicator. An operator looking at the UI thinks the flash succeeded when in fact no firmware was actually written. If they reboot the device expecting the new firmware, they'll be confused when the old version comes back up.

## Suspect surface

The stage-mapping pipeline runs through:

- Server emits `flashControllerUpdate` / `flashJobDone` / `flashJobFailed` on WS as the orchestrator drives state forward.
- Client `useWebsocket.ts` dispatches into the firmware store's `applyControllerUpdate` / `applyJobDone` / `applyJobFailed`.
- Store maps the server-side `FwStage` enum (e.g., `UploadingToMaster`, `Sending`, `VersionConfirmed`, `Failed`) onto a UI-friendly stage enum via `mapServerStageToUiStage` (firmware.ts:435ish).
- `FirmwareView.vue` / progress-bar component reads the UI stage and paints green/yellow/red.

The bug is likely one of:

1. **`applyJobDone` normalizing non-terminal controllers to `VERSION_CONFIRMED`** (firmware.ts:510-528). The current code has a documented trade-off: if the server emits `flashJobDone` while controllers are still mid-flow, the client normalizes them to `VERSION_CONFIRMED` (with the marker `"unknown:normalize-on-done"`) to avoid visual contradiction ("✓ all updated" footer over still-spinning rows). This MASKS real bugs where the server emits done prematurely. Probably load-bearing for THIS bug — the server emitted `flashJobDone` after upload but before any real deploy work happened, and the normalization painted everything green.
2. **Server-side: orchestrator emitting `flashJobDone` too eagerly.** Given Phase 3 wire-up status (no actual flash write yet), the deploy phase probably immediately reports DONE because the firmware isn't doing real work. The orchestrator's `handleDeployDone` then emits the WS terminal event.
3. **Server-side: master sending FW_DEPLOY_DONE with success outcomes** even though no actual flash happened. This is a firmware-side issue — `OtaReceiver` or the deploy handler stub is returning OK without doing the work.

## First investigative steps

1. **Capture a full WS trace from the bench run** — every `flashJobStarted` / `flashControllerUpdate` / `flashJobDone` / `flashJobFailed` event with its `data` payload. The Vue devtools or a manual `console.log` in `useWebsocket.ts` would suffice. Order matters: when did each stage transition fire, and did `flashJobDone` come from the server or from the client's normalization?
2. **Check the master's firmware-side deploy handling.** Phase 3 wire-up status of `OtaReceiver::handleEnd` and any FW_DEPLOY_BEGIN handler — do they immediately return success (because the actual work isn't implemented)? If yes, that's the root cause: the firmware lies about success.
3. **Audit `applyJobDone`'s normalization at firmware.ts:510-528.** The comment explicitly notes this MASKS real bugs. Decide whether to keep the visual-consistency normalization (preserve the trade-off) OR surface the real state (render those rows as "unknown" or fail-warning).

## Where the right fix lives

Depending on root cause:

- **Firmware-side ("master falsely reports success"):** the right fix is in `lib/OtaReceiver/` and the deploy stub. Surface the not-implemented state as a typed failure (`master_io_error`, `not_implemented`, etc.) so the server sees real failure and emits `flashJobFailed`.
- **Client-side ("normalization masks the issue"):** firmware.ts's `applyJobDone`. The current normalization is documented as a trade-off; making it more conservative (render non-terminal stages as "?" or "warning" rather than ✓) might be the right answer regardless of the firmware fix.

Likely BOTH fixes are needed — the firmware should report truthfully AND the client shouldn't paper over inconsistencies.

## Relevant code locations

- `astros_vue/src/stores/firmware.ts:480-540` — `applyJobDone` including the normalization block
- `astros_vue/src/stores/firmware.ts:~435` — `mapServerStageToUiStage`
- `astros_vue/src/views/FirmwareView.vue` — the green-stage rendering
- `astros_api/src/firmware/flash_orchestrator.ts:1064+` — `handleDeployDone`
- `lib/OtaReceiver/src/OtaReceiver.cpp` — `handleEnd`, `handleDeployBegin` (firmware-side, in the AstrOs.ESP repo)

## Acceptance criteria for the eventual fix

- An OTA flash where the firmware-side deploy isn't implemented (or fails for any reason) renders the corresponding controller step as **failed / warning**, not green ✓.
- The operator's UI accurately reflects whether real firmware was written.
- Existing happy-path flashes (where the firmware-side deploy actually works) continue to render green.

## Out of scope (for this stub)

- Implementing the firmware-side flash write itself. That's Phase 3.5 or Phase 4 work — separate, larger plan. This stub is about making the UI honest about the current state.
- The lock-conflict banner race hardening — see `20260516-1707-lock-conflict-race-hardening-followup.md` (separate stub).
