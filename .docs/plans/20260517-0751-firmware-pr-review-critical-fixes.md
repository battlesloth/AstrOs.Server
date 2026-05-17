# Firmware PR review — Critical fixes (C1 / C2 / C3)

Addresses the three Critical findings from `/pr-review-toolkit:review-pr` on `feature/firmware-allow-downgrade`. All three share a theme: **the backend has typed error info that the UI throws away.**

## C1 — Dead "View Logs" button

`AstrosFirmwareControllersPanel.vue:236,273` emits `view-logs` from the done and failed result bars. `FirmwareView.vue:313` does not bind the handler. Vue silently swallows the click. At the bench, after a failed flash the operator clicks "View Logs," sees nothing happen, and walks away with a half-flashed controller and no diagnostics.

**Decision**: remove the buttons + the emit + the locale key. Restore when a log-viewer UI ships. Don't ship dead UI.

## C2 — Streamer reasons collapse to "internal server error"

`FlashOrchestratorErrorReason` extends `TransferErrorCode`, which includes 11 codes (`chunk_retry_exhausted`, `bus_send_failed`, `hash_mismatch`, `flash_full`, `begin_timeout`, `end_timeout`, `transfer_timeout`, `master_io_error`, `source_size_mismatch`, `begin_rejected`, `source_read_failed`) plus `aborted` (already covered). None of these are in `FLASH_ERROR_REASONS` (`astros_vue/src/types/firmware.ts:139`). They all fall through `mapHttpErrorToFlashEnvelope` / `applyJobFailed` to `'internal_server_error'`.

The existing comment at `types/firmware.ts:130-133` claims these "arrive on the WS surface, not via this envelope" — but the WS surface uses the **same envelope and locale**. The comment is stale.

**Decision**: extend `FLASH_ERROR_REASONS` with the 11 missing codes; add bench-actionable locale strings under `firmware_view.flash_errors.*`; rewrite the stale comment to describe a single unified surface.

## C3 — 413 oversize upload renders as "internal server error"

`api_server.ts:412-420` passes `responseOnLimit: 'firmware upload exceeds 50 MB limit'` to `express-fileupload`. The library replies with a `text/plain` body. The Vue mapper `mapHttpErrorToFlashEnvelope` checks `typeof body !== 'object'` and falls through to `internal_server_error`. The operator who picks a 100 MB binary sees "check the server logs" for what is actually their own selection.

**Decision**: replace `responseOnLimit` with `limitHandler` that returns `res.status(413).json({ error: 'payload_too_large', detail })`; add `payload_too_large` to `FLASH_ERROR_REASONS` and the locale.

## Tasks

- [x] **C1** — delete `view-logs` emit declaration + the two `<AstrosFirmwareButton>` instances + the `firmware_view.controllers.result_bar.view_logs` locale key. Update any spec snapshot that references the removed buttons.
- [x] **C2** — extend `FLASH_ERROR_REASONS` with the 11 streamer reasons. Add `firmware_view.flash_errors.*` strings for each (bench-actionable, name the symptom not the code). Rewrite `types/firmware.ts:129-138` comment. Add a parameterized store test that each new reason renders the expected locale-key path through `applyJobFailed`.
- [ ] **C3** — switch `api_server.ts` to `limitHandler` returning JSON `{error:'payload_too_large', detail}`. Add `payload_too_large` to `FLASH_ERROR_REASONS` + locale. Add an integration test (or controller test) that POSTing >50 MB returns `Content-Type: application/json` with `error: 'payload_too_large'`. Add a Vue `firmwareFlashError` test that a 413 JSON response maps to `payload_too_large`.
- [ ] **Pre-commit gate (per task)** — `npm run prettier:write && npm run lint:fix` (both workspaces touched), `npm run build`, `npx vitest run`, then `superpowers:requesting-code-review` on the diff. Address Critical/Important findings before committing.

## Out of scope (filed separately)

The agent reports flagged 12 Important + 14 Minor findings. They are tracked in the existing follow-up plans (`20260516-1706-*`, `20260516-1707-*`, `20260516-1734-*`) plus two new stubs to be filed after these three Criticals ship: **server-side downgrade-ack enforcement** (type-design I5) and **cross-boundary type drift** (type-design I6).
