# Firmware upload — HTTP endpoint + UI handler

## Problem

The firmware upload feature was half-built: the server has `FirmwareUploadStore` instantiated (`api_server.ts:450`) and wired into the orchestrator (`upload: this.firmwareUploadStore`), but **no HTTP route, controller, or UI handler calls `firmwareUploadStore.store()`**. The UI's `onFilePick` only stores `firmware.uploadedFilename = file.name` locally — the file never crosses the network. When the operator clicks "Flash firmware" in upload mode, the server's `upload.latest()` returns null and the orchestrator throws `no_upload` ("Upload mode is selected but no firmware file has been uploaded yet").

Same scaffolded-but-unfinished pattern as the POLL_ACK variant work that just landed in AstrOs.ESP — both halves of the upload-mode path were missed before reaching upload-mode flash testing.

## Approach

Mirror the existing `file_controller.ts` audio-upload pattern (works against `express-fileupload`, which is already wired at `api_server.ts:403`). The new route hands the file to `firmwareUploadStore.store(tempPath, originalFilename)` — the store's existing validation (`expectedProjectName` check, `esp_app_desc` parse, version normalization, atomic promote into a single slot) handles every failure case the docstring promises, so the controller is a thin adapter.

Client side: `onFilePick` becomes a real upload via `FormData`. The store gains an `uploadState` ref (`idle | uploading | uploaded | error`) — the Flash button gates on `uploaded`, the Confirm modal already gates on `target !== null`, and `target` derives from upload state rather than just-the-filename. On success the server's `StoredUpload` metadata (version, sha256 prefix, sizeBytes) replaces the optimistic filename-only state so the operator sees what the server actually accepted.

## Tasks

- [x] **Server controller + route.** Create `astros_api/src/controllers/firmware_upload_controller.ts` exporting `registerFirmwareUploadRoutes(router, authHandler, uploadStore)`. POST `/api/firmware/upload` accepts a multipart `file` field, writes via `file.mv(tempPath)` to an OS-temp path, calls `uploadStore.store(tempPath, file.name)`. Success: 200 + `StoredUpload` metadata. Validation failure (project mismatch / unparseable version / wrong-format header): 400 + `{ error: 'invalid_firmware', detail }`. IO/persist failures: 500. Register the route in `api_server.ts` alongside the existing firmware routes; thread `this.firmwareUploadStore` through. Auth via the existing `authHandler`.

- [x] **Client upload action + state machine.** Extend `astros_vue/src/stores/firmware.ts` with `uploadState: Ref<'idle' | 'uploading' | 'uploaded' | 'error'>`, `uploadError: Ref<FlashErrorEnvelope | null>` (re-use the existing envelope shape so the panel banner displays uniformly), and `uploadedFile: Ref<{ version, displayName, sizeBytes } | null>` (the server's `StoredUpload` projection). New action `uploadFirmware(file: File)` POSTs as `multipart/form-data` to the new endpoint, transitions state and stores metadata on success. Re-derive `target` from `uploadedFile` (truthy → `'local-build'`) instead of `uploadedFilename`, AND keep `uploadedFilename` as a UI-only cosmetic source for the source-strip eyebrow until upload completes. Clear upload state on `clearUploadedFile()` and on `sourceMode` flips away from `'upload'`. Add `FIRMWARE_UPLOAD` to `astros_vue/src/api/endpoints.ts`.

- [x] **Source strip UI wiring.** `AstrosFirmwareSourceStrip.vue#onFilePick` calls `firmware.uploadFirmware(file)`. Add an in-progress affordance while `uploadState === 'uploading'` (the existing pattern in the strip's middle column — eyebrow + filename row — gets a "Uploading…" line). On `error`, surface the error via the existing flash-error banner pattern (the action-bar / panel banner already render `flashError`; we can re-use that surface OR add a thin upload-specific row in the source strip — pick whichever is cheaper on integration). On `uploaded`, show the server-reported version + size in place of the filename so the operator can see the server accepted the right artifact. Browse-files button disabled while uploading.

- [x] **i18n + tests.** New `enUS.json` strings under `firmware_view.source.upload.*` (`uploading`, `uploaded_meta` with `{version, sizeBytes}`, `error_invalid_firmware`, `error_io`). Server tests in `firmware_upload_controller.test.ts`: happy path; missing file → 400; store throws validation error → 400 with detail; store throws unexpected error → 500. Client store tests: `uploadFirmware` happy path transitions state and populates `uploadedFile`; HTTP 400 transitions to `error` with envelope; canFlash gates on `uploaded` not just truthy `uploadedFilename`. Mutation-verify the canFlash gating clause.

- [x] **QA plan + final verification.** `.docs/qa/firmware-upload.md`: pick a valid `.bin` → uploaded (server-reported version visible), Flash button enables; pick a wrong-project `.bin` → upload errors before flash; pick file twice (replacement); clear file → state resets; refresh page mid-upload → state resets to idle (the request aborts); server restart between upload + flash → `no_upload` re-surfaces (existing behavior, expected). Pre-commit: prettier + lint + build + vitest on both sides. Manual: end-to-end flash via upload-mode on the bench.

## Files touched

- `astros_api/src/controllers/firmware_upload_controller.ts` (new)
- `astros_api/src/controllers/firmware_upload_controller.test.ts` (new)
- `astros_api/src/api_server.ts` — register the route
- `astros_vue/src/stores/firmware.ts` — upload action + state
- `astros_vue/src/stores/__tests__/firmware.spec.ts` — store tests
- `astros_vue/src/api/endpoints.ts` — new endpoint constant
- `astros_vue/src/components/firmware/firmwareSourceStrip/AstrosFirmwareSourceStrip.vue` — handler + state
- `astros_vue/src/locales/enUS.json` — new strings
- `.docs/qa/firmware-upload.md` (new)

## Failure-mode notes

The high-risk surface is the file upload itself — multipart parsing, filesystem state, and the upload store's atomic promote semantics. `FirmwareUploadStore.store()` already documents its contract: tempPath is unconditionally consumed (renamed on success, unlinked on failure), validation throws before any wipe so a rejected upload never destroys the prior firmware, concurrent stores are serialized via `inFlightStore`. The controller's only responsibilities are: write the multipart payload to a tempPath, call `store()`, surface the result. We do NOT need to add additional locking, retry, or cleanup — the store owns those concerns. If the controller crashes mid-write, the temp file leaks; this is acceptable (OS temp dir is GC'd on reboot, and the orphan doesn't affect the upload slot).

Size limit: the default `express-fileupload` limit is 50 MB. Firmware binaries are ~1-2 MB, so the default is generous. No explicit limit override needed.

## Out of scope

- **Upload progress indicator** beyond a simple "Uploading…" state. Real progress would need XHR with `progress` events or a custom fetch chunking layer. Defer until operator asks for it.
- **Persisting upload across page reloads.** A successful upload survives in the server's slot until replaced; the UI's `uploadState` resets on reload, so the operator has to re-pick the file. Acceptable for now.
- **Multiple staged uploads.** The store has a single slot by design (the docstring is explicit). One artifact at a time.
- **Server-side CLI hook to pre-stage uploads** (e.g., a `pio run` post-script that uploads via SCP). Out of scope; this plan covers the operator's UI flow only.
- **Auto-fill of the controller selection** for upload mode (since uploaded firmware doesn't tell you which controllers are reachable). Existing variant-cache-based selection still applies — uploaded firmware just bypasses the GitHub asset lookup.
