# Remote Control — Page Reorder — Manual QA Plan

**Feature:** Phase 5 — page drag + keyboard reorder of the PAGES list
**Routes covered:** `/remote`
**Last updated:** 2026-05-31

Pointer drag (vue-draggable-plus / SortableJS) is real DOM-drag and is exempt from
unit tests (project UI-drag TDD exception); this plan is its primary coverage. The
keyboard state machine and the `reorder` emit/store contract ARE unit-tested — this
plan confirms they hold end-to-end in a browser with a real screen reader.

## Preconditions

- Backend API running (`npm run start:tsx` in `astros_api/`)
- Vue dev server running (`npm run dev` in `astros_vue/`)
- Browser at `http://localhost:5173/remote`, authenticated session
- Seed **at least 4 pages** with distinguishable names (e.g. rename them A, B, C, D via
  the pencil). Configure one button on **page C** so its mini 3×3 preview has a visible
  dot — used to confirm the row's content (not just its label) travels with the move.

## Test cases

### 1. Drag handle is present and is the only drag affordance

1. Hover each page row.
2. **Expected:** A grip handle (⠿ / drag-indicator icon) sits at the left edge of every
   row, with a "grab" cursor on hover.
3. Press-and-drag on the row body (the name, the mini-preview, empty space) — NOT the handle.
4. **Expected:** No drag starts. Dragging only initiates from the grip handle.

### 2. Pointer drag reorders (handle)

1. Drag page **D**'s handle upward and drop it above **A**.
2. **Expected:** The list animates; final order is `D, A, B, C`. A SortableJS placeholder/
   ghost follows the pointer during the drag.
3. **Expected:** Unsaved badge appears; the header page count is unchanged.

### 3. Dragging the SELECTED page keeps it selected (grid + preview follow)

1. Select page **C** (click its row) — the center grid and right-rail preview show C's
   buttons (the configured one is visible).
2. Drag **C** to the top of the list.
3. **Expected:** C is now row 1, STILL selected (highlighted), and the center grid +
   right-rail preview still show C's buttons. Selection followed the page, not the slot.

### 4. Dragging a NON-selected page leaves the selection on its page

1. Select page **B**.
2. Drag a different page (e.g. **A**) to a new position that crosses B.
3. **Expected:** The center grid + preview still show **B** (selection unchanged in terms
   of which page is shown); B's highlighted row may sit at a new index, but its content
   is unchanged.

### 5. Drag is inert on a row being renamed

1. Click the pencil on page **B** to start an inline rename (input is focused).
2. **Expected:** B's grip handle is visibly dimmed/disabled.
3. Try to drag B by its handle.
4. **Expected:** No drag starts. Other rows' handles still drag normally.
5. Commit or cancel the rename; B's handle returns to normal.

### 6. Keyboard reorder — grab, move, drop

1. Tab (or click) focus onto a page's grip handle (e.g. **A**, currently row 1).
2. Press **Space** (or Enter).
3. **Expected:** A "grabbed" visual ring appears on A's row. A screen reader announces
   "Grabbed A, position 1 of 4. Use arrow keys to move, Space to drop, Escape to cancel."
4. Press **ArrowDown** twice.
5. **Expected:** A moves down two positions (`B, C, A, D` → after 2 downs from row 1:
   `B, C, A, D`). Focus stays on A's handle (the next arrow keeps working without
   re-focusing). Each move is announced ("Moved A to position N of 4.").
6. Press **Space** (or Enter) to drop.
7. **Expected:** The ring clears; a "Dropped A at position 3 of 4." announcement fires.
   Unsaved badge is visible.

### 7. Keyboard reorder — boundaries

1. Grab the **top** row's handle, press **ArrowUp**.
2. **Expected:** Nothing moves (no reorder past the top). No error.
3. Grab the **bottom** row's handle, press **ArrowDown**.
4. **Expected:** Nothing moves (no reorder past the bottom).

### 8. Keyboard reorder — Escape cancels back to origin

1. Note the current order. Grab a mid-list page, press **ArrowUp** once or twice.
2. Press **Escape**.
3. **Expected:** The page returns to its ORIGINAL position (the moves are undone). The
   ring clears; a "Reorder cancelled. {name} returned to position N of M." announcement
   fires. Unsaved badge state reflects only the net change (Escape-to-origin is a no-op
   move, so if no other edits were made the badge should NOT remain from this action).

### 9. No keyboard reorder while renaming

1. Start an inline rename on any row (pencil → input focused).
2. While the input is focused, the grip handles are not in the tab path to grab; if you
   force focus to another row's handle and press Space/arrows,
3. **Expected:** No grab starts and no reorder happens until the rename is committed/cancelled.

### 10. Persistence

1. Reorder via drag and/or keyboard to a distinctive order. Click **Save**.
2. **Expected:** Success toast; Unsaved badge disappears.
3. Reload the browser.
4. **Expected:** The pages load in the SAVED order. The configured button on its page is
   intact.

### 11. Touch (device or emulation)

1. Open `/remote` on a touch device, or use DevTools device emulation (touch on).
2. Long-press + drag a page's grip handle.
3. **Expected:** The row lifts and follows the finger (force-fallback drag), drops into a
   new position, and the order updates. No accidental scroll-vs-drag conflict when starting
   from the handle.

## Edge cases / negative tests

- **Drag and drop in the SAME spot** — drop a page back where it started. **Expected:** No
  change; Unsaved badge does NOT appear (a no-op move is not an edit).
- **Reorder then delete** — reorder, then delete a page; the confirm modal names the right
  page and the remaining order is preserved.
- **Reorder with only 1 page** — the single handle does nothing useful; no errors. (Delete
  is disabled at length 1, so this state is reachable.)
- **Rapid keyboard arrows** — holding ArrowDown moves the page repeatedly; announcements
  may coalesce to the final position (intentional) but the final order is correct.
- **Drag during an in-flight Save** — reordering while a Save PUT is in flight keeps the
  Unsaved badge visible (post-payload edit), consistent with the existing save-in-flight guard.

## Sign-off

- [ ] All test cases pass
- [ ] No console errors during drag or keyboard reorder
- [ ] Screen-reader announcements fire for grab / move / drop / cancel (test with VoiceOver,
      NVDA, or Orca)
- [ ] Network tab shows PUT `/remoteConfig` only on Save (reorder itself makes no request)
