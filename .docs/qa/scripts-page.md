# QA: Scripts page

**Preconditions:** the API and Vue dev server running against a copy of the dev
database (never the bench's own); logged in; the Scripts page (`/scripts`)
open with the browser console and the API log visible. At least one saved
script with two or more channels and several events (e.g. "Servo Test"), and
the `sqlite3` CLI pointed at the database copy (`$DB` below).

## Copy

1. **Copy succeeds.** On the row for a script with events, click **Copy**.
   Expected: the green toast "Script copied successfully!"; a new row
   `<name> (Copy)` appears without a page reload. Its status column has a
   gray badge per location (Body, Core, …) whose tooltip reads "Not
   uploaded", even when the original was uploaded, and its Playlists column
   shows a faded 0. The API log has `POST /scripts/copy 200` and no
   `GET /scripts/copy`; no console errors.
2. **The copy's contents.** Open the `(Copy)` row in the scripter. Expected:
   the same channels as the original, each with the same events at the same
   times and with the same settings, and the same script length on the
   timeline.
3. **Stored event count.** Note both ids (from the scripter URL) and run
   `sqlite3 $DB "SELECT script_id, count(*) FROM script_events WHERE script_id IN ('<original id>', '<copy id>') GROUP BY script_id"`.
   Expected: two rows with equal counts.
4. **Copies are independent.** In the copy, move one event and **Save**; reopen
   the original. Expected: the original's event is where it was.
5. **Copy of a copy.** Click **Copy** on the `(Copy)` row. Expected: a row
   `<name> (Copy) (Copy)` appears, and it opens with the same events.
6. **After a reload.** Refresh the page. Expected: every copy made above is
   still listed.

## Negative / edge

7. **Read-only mode.** Load the Scripts page against the healthy server
   first. Then stop the API, restart it in read-only mode (scenario 1 of
   `system-readonly-mode.md`), and click **Copy** on any row **without
   reloading the page**. Scenario 1 serves an empty fallback database with no
   tables, so a reloaded page has no rows to copy; the already-loaded list and
   the still-valid login are what let the click reach the API. Expected: the
   yellow read-only toast and the red "Error copying script. Check logs."
   toast; the API answers `503` (devtools Network tab); no new row appears,
   and none appears after a refresh once the API is restarted normally on the
   database copy. Copy is not among the buttons read-only mode disables, so
   the click reaches the API.
8. **The original is gone.** Open the Scripts page in two tabs; delete a
   script in one, then click **Copy** on that row in the other. Expected: the
   red copy-error toast, the API answers `500`, and no row is added. (An
   unknown id answers 500, not 404; see T-011 Out of scope.)
9. **Copy during a firmware flash** (only if a flash is being run anyway, per
   `firmware-ota-flash.md`). Click **Copy** while a flash is in progress.
   Expected: the API answers `423`, the copy-error toast appears, and no row is
   added.
