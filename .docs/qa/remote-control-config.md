# Remote Control Configuration — Manual QA Plan

**Feature:** Direction B 3-pane editor (Phase 2d capstone)
**Routes covered:** `/remote`
**Last updated:** 2026-05-24

## Preconditions

- Backend API running (`npm run start:tsx` in `astros_api/`)
- Vue dev server running (`npm run dev` in `astros_vue/`)
- Browser at `http://localhost:5173/remote`
- Authenticated session (log in via `/auth` first if redirected)
- At least one script + one playlist exist (use `/scripts` and `/playlists` to seed if needed)

## Test cases

### 1. First load — no prior config

1. Open a fresh browser session at `/remote` (clear stored config server-side first, if needed)
2. **Expected:** A single page named "Page 1" renders in the left rail; all 9 button cards show "Configure →" (empty state); right rail shows the bezel with the embedded compact remote, also empty.
3. **Expected:** Header shows "1 page · 0 actions". Unsaved badge IS visible (fresh-seed dirty flag from store).
4. **Expected:** Save button is enabled.
5. Click Save.
6. **Expected:** Success toast appears; Unsaved badge disappears.

### 2. Adding pages

1. Click the "+" Add button in the page list header.
2. **Expected:** A new "Page 2" appears in the list, scrolled into view, selected.
3. **Expected:** Header now shows "2 pages · 0 actions". Unsaved badge visible.
4. Repeat 3 more times to get to 5 pages.
5. **Expected:** All 5 pages render. List scrolls if there are too many to fit.

### 3. Selecting pages

1. Click on "Page 3" in the page list.
2. **Expected:** Page 3 row highlights; the center grid re-renders for Page 3's slots; right-rail bezel re-renders to show Page 3.
3. Click "Page 1".
4. **Expected:** All three panes sync back to Page 1.

### 4. Renaming pages (inline)

1. Click the pencil icon on "Page 2".
2. **Expected:** The name span is replaced by an input; the input is autofocused.
3. Type "Performance" and press Enter.
4. **Expected:** Input disappears; row shows "Performance".
5. Click the pencil icon again, clear the input, press Enter.
6. **Expected:** Input disappears; row STILL shows "Performance" (empty no-op).
7. Click pencil, type "Songs", press Escape.
8. **Expected:** Input disappears; row STILL shows "Performance" (Esc cancels).
9. Click pencil, type "Songs", click somewhere else (lose focus).
10. **Expected:** Input commits "Songs" on blur.

### 5. Duplicating pages

1. With "Performance" selected, click the duplicate icon on its row.
2. **Expected:** A new row "Performance (copy)" appears immediately after Performance; it is selected; center grid + preview re-render to it.
3. **Expected:** Header shows the new page count; Unsaved badge visible.

### 6. Deleting pages — happy path

1. Click the × delete icon on "Performance (copy)".
2. **Expected:** A confirm modal appears. Title "Delete page". Message includes "Performance (copy)".
3. Click Cancel.
4. **Expected:** Modal closes; the page is NOT deleted; row still in list.
5. Click × again; this time click Confirm.
6. **Expected:** Modal closes; the page is removed; selectedIdx adjusts (stays on previous sibling).

### 7. Deleting pages — disabled at length 1

1. Delete down to a single page.
2. **Expected:** The × icon on the only remaining row is visibly disabled (gray, no hover effect).
3. Click it anyway.
4. **Expected:** No modal opens; nothing happens.

### 8. Configuring buttons — script

1. On a fresh empty card, click "Configure →".
2. **Expected:** A popover opens anchored to the card; the editor is in the Script tab; the result list contains all available scripts plus a "None" row at top.
3. Click any script name.
4. **Expected:** Popover closes; the card transitions to the assigned state (tinted blue background, BUTTON N label at top, script name middle, SCRIPT chip below); right-rail preview shows the same slot filled; the row's mini 3×3 preview in the page list also shows the corresponding dot in blue.
5. **Expected:** Unsaved badge visible; "actions" header count incremented by 1.

### 9. Configuring buttons — playlist

1. On another empty card, click "Configure →".
2. Switch to the Playlists tab.
3. Click any playlist name.
4. **Expected:** Card shows the assigned state with PLAYLIST chip (orange); preview button is filled; page list mini-preview dot is orange.

### 10. Clearing a button

1. On an assigned card, click Clear.
2. **Expected:** Card transitions back to empty state (white, "Configure →"); preview slot empties; page list dot turns gray.

### 11. Editing an assigned button

1. On an assigned card, click Edit.
2. **Expected:** Popover opens with the editor in the tab matching the current assignment; the current selection is highlighted in the list (if the editor highlights selections).
3. Pick a different item.
4. **Expected:** Card reflects the new assignment.

### 12. Editor — close behaviors

1. Open the editor on a card.
2. Press Escape.
3. **Expected:** Popover closes; card returns to its prior state.
4. Open the editor again.
5. Click outside the popover (on the page list, the preview, the header, the document).
6. **Expected:** Popover closes.
7. Open the editor.
8. Click the × close button inside the editor.
9. **Expected:** Popover closes.

### 13. Save success

1. Configure 2 buttons across 2 different pages.
2. Click Save.
3. **Expected:** Success toast; Unsaved badge disappears.
4. Reload the browser.
5. **Expected:** The 2 configured buttons are still there.

### 14. Save failure (simulated)

1. Stop the backend API.
2. Configure a button.
3. Click Save.
4. **Expected:** Error toast; Unsaved badge stays visible.
5. Restart the API; click Save again.
6. **Expected:** Success toast; badge disappears.

### 15. Load failure

1. With config in a non-JSON-parseable state on the server (or simulate by killing the API at fetch time), reload `/remote`.
2. **Expected:** Error toast about load failure; Save button is disabled even when isDirty is true; editing is otherwise locked.

### 16. Live preview — read-only

1. Open `/remote` with at least one assigned button.
2. In the right-rail preview, click a filled button.
3. **Expected:** The preview shows its own internal "Sent: …" toast (the mobile-remote component fires it), but NO toast appears in the main view header AND no actual script/playlist runs on the droid (no backend POST to `/scripts/run` etc.).
4. Press and hold the preview's STOP ALL button.
5. **Expected:** The preview shows its arming animation; on release-after-600ms it shows its own "STOP ALL — sending…" toast — but NO websocket PANIC is sent and no actual hardware halt happens. (Verify with backend logs or a network inspector.)

### 17. Pluralization

1. With 1 page and 1 action: header reads "1 page · 1 action" (singular both).
2. With 2 pages and 0 actions: header reads "2 pages · 0 actions".
3. With 1 page and 5 actions: header reads "1 page · 5 actions".

## Edge cases / negative tests

- **Very long page names** — should truncate with ellipsis in the page list; full name visible on hover (title attribute).
- **Rapid clicks on Add** — each click adds a page, no duplicate IDs (UUIDs).
- **Rapid clicks on × → Cancel → × → Cancel** — modal opens/closes cleanly; no stuck modal.
- **Browser back/forward** — navigating away with the Unsaved badge visible does NOT prompt (no beforeRouteLeave guard in v1; deferred per Decision 9).
- **F5 reload with Unsaved badge** — the browser's default unload warning may or may not fire (browser-dependent); the badge serves as the visible signal regardless.

## Sign-off

- [ ] All test cases pass
- [ ] No console errors in the browser during the full flow
- [ ] Network tab shows GET `/remoteConfig` on load and PUT `/remoteConfig` on save (no other surprise endpoints)
