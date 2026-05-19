# Firmware `clearUpload` — DELETE endpoint (stub)

**Origin:** `/pr-review-toolkit:review-pr` Silent I4 finding on `feature/firmware-allow-downgrade`.

## Problem

Today's `clearUpload` (`astros_vue/src/stores/firmware.ts:907-912`) is **client-only**: it resets the Pinia store's `uploadedFile` / `uploadState` / `uploadedFilename` refs but does NOT issue a DELETE to the server. The server's upload slot (`FirmwareUploadStore` at `~/.config/astrosserver/firmware/upload-*.bin`) keeps the previous artifact until the next successful upload overwrites it.

**Concrete bench failure mode:**

1. Operator uploads `firmware-v2.bin`. Server stores it; UI confirms upload.
2. Operator clicks "Remove" in the source strip. UI shows "no file selected." `uploadedFile.value = null`.
3. Operator picks `firmware-v3.bin`. Upload starts.
4. The upload of v3 fails for a benign reason (`upload_io_failed`, disk hiccup, network blip, etc.).
5. The UI surfaces the error. The operator retries by re-picking v3 (or, distracted by the error, forgets to re-pick and just clicks Flash).
6. The flash POST resolves source via `upload.latest()` server-side — which returns **v2** because that's still in the slot. The flash succeeds; the operator believes v3 landed; the controllers are now running v2.

Today the only check preventing this is: `canFlash` requires `uploadedFile !== null`, so step 5 with no re-pick is gated. But if the operator DOES re-pick and the new upload fails AT the validation step (not the IO step), the store's error envelope might not reset `uploadedFile` to null cleanly — depending on the exact failure mode, the UI can end up showing v2's metadata as the "ready-to-flash" artifact.

Even today's gated case is bad UX: the operator clicked Remove and the server still has the file. If anything ever opens a non-canFlash-gated flash path, the wrong firmware lands.

## Proposed approach

Wire a DELETE endpoint that the client calls on `clearUpload`:

### Server

- `DELETE /api/firmware/upload` — calls a new `FirmwareUploadStore.clear()` method that unlinks the binary + `.sha256` + `.meta.json` triple. Idempotent (no-op on empty slot). Returns 204 on success, 5xx on filesystem error.
- `clear()` uses the same `wipePriorUploads` helper that `store()` already uses for atomic-replace cleanup, so the implementation is essentially calling the existing cleanup path without a follow-on store.

### Client

- `clearUpload` becomes async: POST DELETE, then reset refs on success.
- On DELETE failure: keep the store's refs as-is (don't lie about success); surface a banner via `setFlashError({ reason: 'upload_persist_failed', detail: 'Failed to clear server-side upload' })` or a new dedicated reason.

### Tests

- Integration test: upload v1, DELETE, upload v2 fails → flash POST returns `no_upload` (not v1).
- Unit test: `FirmwareUploadStore.clear()` on an empty slot is a no-op; on a populated slot removes all three files.
- Vue store test: `clearUpload` calls the API, only resets refs on success, surfaces a banner on failure.

## Out of scope

- A "preview the current server-side upload" endpoint (separate observability ask).
- Multi-slot upload history (the FirmwareUploadStore is single-slot by design — see existing notes in `.docs/qa/firmware-upload.md`).

## Tasks (not yet broken into a plan)

When this work starts: light plan (3-5 tasks) is probably sufficient; this is a small endpoint + a store update + tests on both sides. No brainstorm needed — the shape is already clear.

## References

- Toolkit run synthesis: `2026-05-17` session (Silent I4).
- Related: `.docs/qa/firmware-upload.md` (existing notes on single-slot semantics).
- The c.5 upload-store plan (`.docs/plans/20260502-1100-firmware-ota-c-5-upload-store.md`) deliberately omitted a clear endpoint because nothing required it then; this is the change-of-requirements that motivates adding it.
