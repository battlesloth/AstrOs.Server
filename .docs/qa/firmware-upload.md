# Firmware upload — manual QA

Verifies the new POST `/api/firmware/upload` endpoint + UI handler. Before this work, the upload-mode flash flow couldn't complete because no HTTP route called `firmwareUploadStore.store()` and the UI's "Browse files" only stashed the filename locally.

## Preconditions

- AstrOs.Server running with this branch's build (`feature/firmware-allow-downgrade`).
- Vue dev server running, browser at `http://localhost:5173`.
- Operator logged in and on `/firmware`.
- A valid AstrOs.ESP firmware `.bin` available on disk (e.g., `.pio/build/lolin_d32_pro/firmware.bin` from a recent `pio run`).
- (Optional, for negative tests) a known-bad `.bin` — e.g., an ESP-IDF binary from a different project, or any non-firmware `.bin` file.

## Test cases

### 1. Happy path — pick a valid `.bin`, watch the upload + flash flow

1. On `/firmware`, click the `Upload` toggle in the source strip.
2. Source strip's right column shows `Browse files…`.
3. Click it and pick a valid AstrOs firmware `.bin`.
4. **Pass:** source strip middle column shows the operator's filename + `Uploading…` line (announced via `role="status"` so screen readers pick it up).
5. **Pass:** the `Browse files…` button changes to a `Remove` button. `Remove` is **disabled** while uploading (it should NOT be clickable).
6. After the upload completes (typically < 1 s on a local server):
   - **Pass:** middle column shows the **server-acknowledged** filename + version + size (e.g., `firmware.bin · v1.4.2 · 1.20 MB`).
   - **Pass:** `Remove` button becomes clickable.
7. The Flash button in the controllers panel was **disabled** during upload (gates on `canFlash` → `target` → `uploadedFile`). It now **enables** if at least one controller is selected.
8. Click `Flash firmware`, confirm in the modal, watch the flash proceed.
9. **Pass:** flash completes successfully end-to-end with the uploaded binary.
10. **Fail:** any of the above states doesn't render, OR the Flash button enables before the upload completes, OR the flash fails with `no_upload`.

### 2. Wrong project — pick an unrelated `.bin`

1. Reset (`Remove` the previous file if any). Click `Browse files…`. Pick a non-AstrOs ESP-IDF `.bin` (e.g., an ESP-IDF "hello world" example build).
2. The server's `parseEspAppDesc` reads the project name from the binary header and rejects on mismatch.
3. **Pass:** within a second or two, the panel's flash-error banner displays *"The selected file isn't a valid AstrOs firmware binary. Check the project name and version match an AstrOs build."*
4. **Pass:** source strip's middle column shows the picked filename (no "Uploading…" line; it returns to the picked-filename-only state).
5. **Pass:** `Remove` button is clickable (operator can retry with a different file).
6. **Pass:** the Flash button stays disabled — `uploadedFile` is null, `target` is null, `canFlash` is false.
7. **Fail:** flash banner doesn't appear, OR the operator can proceed to flash despite the error.

### 3. Unparseable version — corrupt or truncated `.bin`

1. Create a 16-byte file (`head -c 16 /dev/urandom > /tmp/bad.bin`) and pick it.
2. The server's `store()` reads the head buffer for `esp_app_desc`; a too-short / non-ESP-IDF binary fails the parse.
3. **Pass:** the flash-error banner displays *"The selected file isn't a valid AstrOs firmware binary…"* (same i18n key as the project-mismatch case — both surface as `invalid_firmware`).
4. **Fail:** silent acceptance, OR a 500-level error showing instead of the validation banner.

### 4. Replace an uploaded file

1. Complete test 1 (happy path) so an upload is staged on the server.
2. Click `Remove`. **Pass:** source strip resets to `No file selected`, Flash button disables.
3. Pick a different valid `.bin`. **Pass:** new upload completes, server-acknowledged metadata reflects the new file (different version or size).
4. **Pass:** server-side, the previous artifact has been wiped (only one slot — the `FirmwareUploadStore.store()` docstring guarantees atomic replace). Confirm via `ls ~/.config/astrosserver/firmware/upload-*.bin` — only one upload-*.bin file present.

### 5. Page refresh mid-upload

1. Pick a valid `.bin`. While the `Uploading…` state is visible (use a slow connection or a large file to widen the window), press F5 / Cmd-R.
2. **Pass:** the page reloads. `uploadState` resets to `'idle'`. Source strip shows `No file selected` (the operator's pick is gone; they must re-pick to retry).
3. **Pass:** server-side, the in-flight upload either completed (the artifact is in the slot) or was aborted (no artifact). Either is acceptable — the operator's UX is the same: they have to re-pick on the new page load.

### 6. Server restart between upload and flash

1. Complete test 1's upload (server now has the artifact on disk).
2. Restart the server: `Ctrl-C` the API process, then `npm run start:tsx` again.
3. Back in the browser, the UI still shows the uploaded file in the source strip (UI state survives because it's local).
4. Try to flash.
5. **Pass:** the flash POST succeeds — the `FirmwareUploadStore` is filesystem-backed (`~/.config/astrosserver/firmware/upload-*.bin` + sidecar `.meta.json`), so a server restart preserves the upload slot. `upload.latest()` finds it.
6. **Fail:** flash returns `no_upload` after server restart (would indicate the store isn't persisting through restarts as the design claims).

### 7. Cross-source-mode flips don't leak state

1. Pick a valid `.bin`, upload completes, source strip shows the metadata.
2. Click the `GitHub` toggle in the source strip.
3. **Pass:** source strip switches to release-picker mode. Pick a release.
4. **Pass:** the Flash button reflects the `selectedReleaseTag`-derived target, not the uploaded file. The previous upload state is preserved in the store (in case operator flips back) but doesn't bleed into the GitHub flow.
5. Click `Upload` toggle again.
6. **Pass:** the uploaded file's metadata is still shown (state preserved). The operator can flash without re-uploading.

### 8. Audio file uploads still work (regression smoke)

The existing `/audio/savefile` route (`file_controller.ts`) uses the same `express-fileupload` middleware. Verify the new firmware-upload route doesn't break it by exercising audio upload from wherever the audio-upload UI lives. **Pass:** audio upload still works as before. (If you don't have audio-upload UX exposed, skip — the route is independent.)

## Notes

- Server-side `FirmwareUploadStore` is single-slot by design; uploading a second file atomically replaces the first. No history is kept.
- Error envelope routing: the server's three distinct errors (`invalid_firmware`, `upload_io_failed`, `upload_persist_failed`) all surface through the existing `flashError` panel banner — `invalid_firmware` carries the most actionable detail and is the operator's typical encounter.
- This work specifically does NOT include a progress indicator beyond the binary `Uploading…` flag. Files are ~1-2 MB, typically < 1 s on local. If a slower link makes the lack of progress feedback annoying, ask and we'll add an XHR + `progress` event wiring.
