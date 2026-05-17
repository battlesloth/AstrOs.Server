# Firmware PR review — Important sweep batch

Follows `.docs/plans/20260517-0751-firmware-pr-review-critical-fixes.md`. Picks up the cheap Important items from the toolkit run: one true silent-failure belt, a docstring drift, four comment drifts, and two dead-metadata removals. Plus stubs for the deferred Important items that need their own brainstorm + plan.

## Scope guard

Sticks to mechanical / single-file / sub-10-LOC fixes. Skips:

- **Silent I2** (`cancelFlash` 404 swallow when WS dropped) — needs WS connection state plumbing + new banner UX. Defer to follow-up; current swallow is rare-in-practice.
- **Silent I5** (`fetchReleases` error invisible) — needs a staleness banner + locale + plumbing. Defer.
- **Silent I6** (`wipePriorUploads` degraded:true) — needs a new response flag + UI affordance. Defer.
- **Type I1** (`TransferId` brand), **Type I2** (`ProdTransportConfig`), **Type I3/I4** (`Upload`/`OwnFlash` discriminated unions), **Type I6** (cross-boundary type drift) — already captured in `20260516-1734-firmware-store-discriminated-unions-followup.md`.

Filed as new stubs (see "File deferred stubs" task): **Type I5** (server-side downgrade-ack enforcement) and **Silent I4** (`clearUpload` DELETE endpoint).

## Tasks

- [x] **Silent I1** — `.catch()` belt on the background IIFE at `flash_orchestrator.ts:762-819`. If `routeStartFailure` ever throws (only path today is the FSM's "illegal flash-job transition" Error from `transitionControllerState`'s `LEGAL_NEXT_STAGES` guard), it becomes an unhandled rejection and the lock stays held. Add a `.catch` that logs + force-releases `JobLock` directly. Add a test that mutates `routeStartFailure` to throw and asserts the lock is released.
- [ ] **Code I1 + Comment sweep** — single commit covering:
  - `flash_orchestrator.ts:877-878` — rewrite the `cancel()` docstring (claims upload + deploy produce same `abortReason`; in reality upload-cancel gives tautological `"aborted"`, deploy-cancel gives the operator's reason).
  - `flash_cancel.integration.test.ts:72` — replace stale "1500ms begin-ack timeout" comment with current 5_000 ms value and cross-reference `DEFAULT_STREAMER_CONFIG`.
  - `flash_orchestrator.ts:299` — add stop-and-wait disclaimer to the class header (matches the pattern in `chunk_streamer.ts:73-78`).
  - `chunk_streamer.test.ts:1904` — fix "production-default 5-min watchdog" (production is now 10 min via `DEFAULT_STREAMER_CONFIG`).
- [ ] **Comment I2 + Code I2** — single commit removing dead members:
  - `chunk_streamer.ts:100-103` — drop `'chunkAck'` from `WaitableKind` union (no `waitFor` caller uses it; chunk acks go through `chunkPhaseActive`).
  - `models/firmware/upload.ts:46-52` — drop `export` on `FIRMWARE_UPLOAD_ERROR_CODES` (the type derivation on the next line is the only consumer).
- [ ] **File stubs for deferred Important items** — new plan files:
  - **Type I5** — server-side `DowngradePolicy` discriminated union + `validateFlashRequest` cross-check. Currently `allowDowngrade` toggle (store) + `downgradeAck` checkbox (modal) are independent booleans with no server-side gate. A future CLI/alternate-UI caller could push a downgrade without acknowledgement.
  - **Silent I4** — `clearUpload` DELETE endpoint. Operator removes file A, uploads B, B fails → server still serves A on next flash → wrong firmware lands on controllers. Wire DELETE `/api/firmware/upload` + adjust store.
- [ ] **Pre-commit gate per task** — prettier + lint:fix + build + vitest (`npx vitest run`) + `superpowers:requesting-code-review` on the diff. Address Critical/Important findings before committing.

## Carried-forward stubs already captured

For reference (no action needed on this branch):

- `.docs/plans/20260516-1706-firmware-ui-transfer-step-falsely-green.md` (UI false-green path)
- `.docs/plans/20260516-1707-lock-conflict-race-hardening-followup.md` (lock-conflict hardening)
- `.docs/plans/20260516-1734-firmware-store-discriminated-unions-followup.md` (covers Type I1/I2/I3/I4/I6 + integration-test gaps)
