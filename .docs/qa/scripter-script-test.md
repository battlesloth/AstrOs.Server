# QA: Scripter — Script Test modal (upload + run)

**Preconditions:** server running against real hardware with the Body and Core
controllers UP on the Status page (Dome optional); a saved script with at least
one channel event (e.g. "Servo Test"); a browser on `/scripter/<id>` with the
WebSocket connected and the console open.

## Test cases

1. **Test on a previously uploaded script.** Precondition: the Scripts page shows
   green Body/Core badges with dates for this script (it has been uploaded
   before). Click **Test**. Expected: "Saving script..." interrupt, then the
   Script Test modal opens; Body and Core captions read "Uploading"; **Run** is
   disabled; no console errors — specifically none of
   `Cannot access 'setCaption' before initialization`,
   `reading 'subTree'`, `reading 'nextSibling'`.
2. **Per-location ack.** Expected: each assigned location flips to "Success"
   only when its own controller acks; the other stays "Uploading" meanwhile.
   Run stays disabled until every assigned location reads "Success"; then the
   status line reads "Upload Complete." and Run enables.
3. **Unassigned location.** With no Dome controller assigned. Expected: Dome
   caption reads "Not Assigned" from the start; completion does not wait for it.
4. **Run.** Click **Run**. Expected: the script runs on the droid; the modal
   closes.
5. **Repeat without reload.** Click **Test** again on the same script. Expected:
   captions start at "Uploading" again (not a carried-over "Success"), Run is
   disabled again until both acks arrive; no console errors.
6. **New script.** New Script → add a channel and an event → **Test**. Expected:
   same flow as case 1 (a new script carries NOT_UPLOADED entries for every
   location).
7. **Scripts page badges.** After case 2, open the Scripts page. Expected: the
   Body/Core badges show the new upload timestamp (tooltip).
8. **Cancel mid-upload.** Click **Test**, then **Cancel** before the acks arrive.
   Expected: modal closes; late acks update the Scripts page badge without
   console errors.

## Negative / edge

- **Failed ack** (controller NAKs, or serial timeout): the location caption reads
  "Failed". Known gap: Run may still enable because the completion check is
  sum-based (Backlog, from T-002) — record, do not block on it.
- **Route-leave prompt.** After a Test with no edits, navigating away must NOT
  prompt "unsaved changes" — the upload-status reset does not dirty the script.
- **Previously deployed, now unassigned location** (controller removed after an
  earlier upload): the stale entry is ignored; the caption stays "Not Assigned"
  and it does not block completion.
- **Late ack from a cancelled run.** Acks carry no run id. If **Test** is clicked
  again while a previous run's ack is still in flight, that ack can flip its
  location to "Success" early in the new run. Known gap (Backlog, from the T-002
  review); avoid back-to-back Test clicks when reading results.
- **No assigned locations** (degenerate — the setup wizard requires a Body
  controller): the modal stays at "Uploading script..." with Run disabled; use
  Cancel.
- **Console noise (expected, Backlog):** `[intlify] Not found 'Saving script...'`,
  the `<Suspense>` single-root warning on route load, and
  `Script status update skipped: <id> not found in store` (logged when the
  scripter was opened by direct navigation, so the scripts-list store is empty)
  are known and harmless.
