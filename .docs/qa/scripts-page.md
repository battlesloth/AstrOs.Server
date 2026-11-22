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
   `GET /api/scripts/copy` 404 line; no console errors.
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
   tables, so a reloaded page has no rows to copy (and you cannot log in
   again). Copy is a plain button that read-only mode does not disable, so the
   click reaches the API. Expected: the yellow read-only toast and the red
   "Error copying script. Check logs." toast; the API answers `503` (devtools
   Network tab); no new row appears, and none appears after a refresh once the
   API is restarted normally on the database copy.
8. **An id that does not exist.** In the devtools console, run
   `fetch('/api/scripts/copy', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + localStorage.jwt_token }, body: JSON.stringify({ id: 'sNoSuchId' }) }).then((r) => console.log(r.status))`.
   Expected: `500`; the API log has `copyScript: copy failed` with
   `scriptId` `sNoSuchId`; a refresh shows no new row. (An unknown id answers
   500, not 404; see T-011 Out of scope.)
   **Known gap (Backlog):** a script deleted in another tab can still be
   copied. Delete only disables a script, so Copy on its stale row succeeds
   and brings the content back as a live `<name> (Copy)` row. Record it; do
   not fail T-011 on it.
9. **Copy during a firmware flash** (only if a flash is being run anyway, per
   `firmware-ota-flash.md`). Click **Copy** while a flash is in progress.
   Expected: the API answers `423`, the copy-error toast appears, and no row is
   added.

## Layout

The list area below the orange title bar is the page's only scroller: the
navbar and the title bar never move, and the window itself never scrolls.
The Playlists page uses the same layout; run cases 10–15 there too, except
that its table fits at any desktop width (no horizontal scrollbar in case
10) and its rows have no status badges (skip case 13).

10. **Narrow window.** Load the page in a window about 800 px wide, with
    enough scripts to run past the bottom of the window. The table needs
    about 930 px (890 px plus padding), more with a long list's scrollbar.
    A window under 768 px gets the mobile view when the page loads or you
    navigate to it; resizing an open page below 768 px does not switch it.
    Expected: the horizontal scrollbar is at the bottom edge of the window
    without scrolling down first, and the vertical scrollbar at its right
    edge. Scrolling sideways moves only the table, and the window itself
    scrolls neither sideways nor down.
11. **Wide window.** At 1024 px and wider: no horizontal scrollbar, and the
    table sits centered as before. A list longer than the window scrolls
    under the fixed title bar, with the mouse wheel anywhere in the list
    area, the margins beside the table included.
12. **Pinned table header.** Scroll a long list down. Expected: the blue
    column header row stays at the top of the list area, and rows (their
    status badges included) pass underneath it, not over it. Scrolled
    sideways in a narrow window, the header moves with its columns.
13. **Tooltips.** Hover a first-row status badge, then scroll down and hover
    a badge on the row just below the pinned header. Expected: each tooltip
    bubble shows in full, over the header, not hidden behind it or cut off.
    (Its small arrow can tuck under the header when the badge is right
    against it; that is expected.)
14. **Keyboard focus is never hidden.** With a long list, click in the
    filter box and press Tab until focus has gone past the bottom of the list
    area and the list has scrolled down several rows, so rows now sit under
    the pinned header. (Use Tab, not a click: clicking a row button would run
    it, and Safari does not focus buttons on click.) Then press Shift+Tab
    repeatedly. Expected: the list scrolls as needed and every
    focused button (with its focus ring) stays fully visible below the
    header, never behind it.
15. **Read-only mode layout.** In read-only mode (case 7's setup), hover the
    disabled New button. Expected: its tooltip appears, and the window does
    not scroll sideways or show a second vertical scrollbar. The tooltip may
    be cut off at the window's right edge, as it always has been.
