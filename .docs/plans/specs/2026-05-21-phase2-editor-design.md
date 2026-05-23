# Phase 2 — Direction B editor design spec

**Status:** approved (brainstorm complete 2026-05-21)
**Phase:** 2 of the Remote Control Redesign multi-phase project
**Tracker:** [`.docs/plans/current_project.md`](../current_project.md)
**Sequencing:** Phases 0, 1, 3, 6 shipped. Phase 2 ships ahead of Phases 4 and 5 because Phase 4 (mobile operator route) doesn't depend on it.

This spec defines the design for the Phase 2 Direction B editor port. It does NOT prescribe step-by-step implementation — each of the four sub-phases gets its own `.docs/plans/YYYYMMDD-HHmm-phase2X-<slug>.md` plan file written at the start of that sub-phase. The spec is the design contract those plans implement.

---

## 1. Goal

Replace the current single-pane Remote Control Configuration view (one page at a time, manual back/next, no preview) with the Direction B three-pane editor: page list (with mini previews + page CRUD) | center 3×3 button grid (with inline popover editor per slot) | live phone preview (consuming the Phase 3 `AstrosMobileRemote` in compact, read-only mode).

The mobile remote operator UX is unchanged by this phase — Phase 2 only touches the desktop config editor. The deployed JSON remote-config shape is unchanged (Phase 1 already added id/name; this phase consumes them).

---

## 2. Decisions baked in from brainstorming (2026-05-21)

These are settled. Do not re-litigate during implementation; deviations from them must be flagged and discussed.

1. **Live preview is read-only.** The right-rail `<AstrosMobileRemote>` renders the selected page at compact size but does NOT fire `press` or `panic` to backend. Avoids the "I clicked a button in the editor and the droid moved" surprise.
2. **Delete page requires a DaisyUI confirm modal.** Matches the existing destructive-action pattern in this codebase. Modal message names the page being deleted.
3. **The all-empty save filter is removed.** Every page in the array persists on save, named or not. Users get explicit control via Add/Delete buttons; no "I made a page and it disappeared" surprises.
4. **Button card visual shape**: neutral white card (empty) / tinted blue `#eaf1f8` (assigned). BUTTON N label centered horizontally at top. Action name centered in the middle. Type chip (SCRIPT blue / PLAYLIST orange) centered below the name. Equal-width Edit / Clear buttons in a row at the bottom. Configure → button for empty slots.
5. **Page list row actions are always visible on every row.** Rename / Duplicate / Delete icons render unconditionally per row (not hover-reveal, not selected-only). Best for keyboard / touch / discoverability; costs a few px of name width which is acceptable.
6. **Button editor opens as a popover anchored to the clicked card.** Editor floats over the grid; cards behind dim. Click outside, Esc, or successful selection close it. Lighter visual disruption than a full-row inline expansion.
7. **`selectedIdx` lives in the store, not the view.** The page list and preview both consume it; store ownership lets a later `?page=N` URL sync land without touching components.
8. **`renamePage` no-ops on empty / whitespace-only string.** Inline rename UI cancels on empty-Enter rather than committing a blank name.
9. **No unsaved-changes navigation guard in v1.** The "Unsaved" header badge gives the visual signal; full `beforeRouteLeave` guard is deferred unless the badge proves insufficient in QA.
10. **No optimistic mutations on save.** Saves go straight to PUT; `isDirty` only clears on 200. Failed save leaves `isDirty` true so the user can retry.

---

## 3. Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ RemoteControlConfigView.vue                  (replaces RemoteView.vue mount) │
│ ┌─ header bar (orange #f49446) ──────────────────────────────────────────┐ │
│ │  "Remote Control Configuration"   • 3 pages · 7 actions • [Unsaved] [Save] │
│ └────────────────────────────────────────────────────────────────────────┘ │
│ ┌────────────┬─────────────────────────────────┬──────────────────────────┐│
│ │ AstrosRemote   AstrosRemoteButtonCard (×9 in   AstrosRemoteLivePreview  ││
│ │  PageList     3×3 grid, capped at 540px wide)  (MiniPhone bezel +       ││
│ │  (220px)      │                                AstrosMobileRemote in    ││
│ │               │  on Edit / Configure click:    compact, read-only)      ││
│ │               │  AstrosRemoteButtonEditor      (280px)                  ││
│ │               │  opens as anchored popover                              ││
│ └───────────────┴────────────────────────────────┴──────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
                                  ▲
                                  │ reactive subscribe
                                  ▼
                  useRemoteControlStore (Pinia)
                  • remoteControlPages: Ref<RemoteControlPage[]>
                  • selectedIdx:        Ref<number>
                  • isLoading:          Ref<boolean>
                  • isDirty:            Ref<boolean>
                  • loadRemoteControl() / saveRemoteControl()
                  • addPage / duplicatePage / deletePage
                  • renamePage / selectPage
```

**Five new components**, each in its own camelCase folder per project naming convention (memory: vue-component-naming):
- `views/RemoteControlConfigView.vue`
- `components/remoteControl/remotePageList/AstrosRemotePageList.vue`
- `components/remoteControl/remoteButtonCard/AstrosRemoteButtonCard.vue`
- `components/remoteControl/remoteButtonEditor/AstrosRemoteButtonEditor.vue`
- `components/remoteControl/remoteLivePreview/AstrosRemoteLivePreview.vue`

**Store extension** (additive on existing `useRemoteControlStore`).

**Old code removed** in the final sub-phase (`RemoteView.vue`, `AstrosRemoteControl.vue`, `AstrosRemoteButton.vue` and stories).

---

## 4. Component interfaces

The contract that lets sub-phases ship independently. Each component is self-contained: props in, semantic events out. No component calls the store directly except `RemoteControlConfigView`.

### `AstrosRemoteButtonEditor` — popover content

```ts
// Props
{
  buttonNumber: number;                  // 1..9, shown in popover header
  currentValue: PageButton;              // current assignment (may be type:'none')
  scripts: { id: string; name: string }[];
  playlists: { id: string; name: string }[];
}

// Emits
'change'  payload: PageButton            // selection committed (incl. revert-to-none)
'close'   payload: void                  // Esc / × / click outside
```

Opens with tab derived from `currentValue.type` (defaults to `'script'` if `'none'`). "None" row at top of result list emits `change` with `{id:'0', name:'None', type:'none'}` (matches existing store contract). Tab switch does NOT auto-clear current value — clearing is the card's Clear button's job.

### `AstrosRemoteButtonCard` — display state + popover host

```ts
// Props
{
  buttonNumber: number;
  value: PageButton;
  scripts: { id: string; name: string }[];
  playlists: { id: string; name: string }[];
}

// Emits
'change'  payload: PageButton            // forwards editor change OR Clear's {type:'none'}
```

Owns popover open/close state internally. Renders display state per Decision 4. Clear button emits `change` with `{type:'none'}` WITHOUT opening the editor. Configure / Edit buttons open the popover. Popover closes on Esc, click outside, or successful selection.

### `AstrosRemotePageList` — left rail

```ts
// Props
{
  pages: RemoteControlPage[];
  selectedIdx: number;
}

// Emits
'select'     payload: number
'rename'     payload: { idx: number; name: string }
'duplicate'  payload: number
'delete'     payload: number                          // consumer triggers confirm modal
'add'        payload: void
```

Per-row: drag handle (visible but inert in Phase 2 — wired in Phase 5), mini 3×3 preview (script=blue, playlist=orange, none=gray), name (truncate w/ ellipsis), three always-visible icon buttons (rename ✎, duplicate ⎘, delete ×).

Inline rename: pencil click → input replaces name → commit on Enter or blur → cancel on Esc. Rename emit includes both `idx` and `name`. Empty / whitespace-only rename does NOT emit. Delete × is disabled when `pages.length === 1`.

Sticky header with "Pages" label + Add button. Long names truncate visually; full name surfaced via `title` attribute.

### `AstrosRemoteLivePreview` — right rail

```ts
// Props
{
  pages: RemoteControlPage[];
  selectedIdx: number;
}

// No emits
```

Inlines a `MiniPhone` bezel (~200×380 dark wrapper) containing `<AstrosMobileRemote :pages="pages" :initial-idx="selectedIdx" compact :connected="true" />`. Press / panic handlers are no-ops (Decision 1). MiniPhone bezel is presentational-only and lives inside this component since it has no other consumer.

### `useRemoteControlStore` extension

```ts
// Existing — unchanged
remoteControlPages: Ref<RemoteControlPage[]>;
isLoading: Ref<boolean>;
loadRemoteControl();    // on success: clears isDirty
saveRemoteControl();    // now persists ALL pages (no all-empty filter); on 200: clears isDirty

// NEW state
selectedIdx: Ref<number>;                              // 0 default; clamped on load
isDirty: Ref<boolean>;                                 // false until first mutation post-load

// NEW methods (each sets isDirty = true on mutation)
addPage();                                             // pushes default page; selectedIdx = new index
duplicatePage(idx: number);                            // splices "(copy)" suffix copy after idx; selects it
deletePage(idx: number);                               // no-op if pages.length <= 1; clamps selectedIdx
renamePage(idx: number, name: string): boolean;        // trims; no-op on empty/whitespace; returns true if applied
selectPage(idx: number);                               // clamps to valid range; does NOT set isDirty
setButton(slotIdx: number, key: ButtonKey, value: PageButton);  // writes slot + flips isDirty; warns on out-of-range
```

**Dirty tracking is a plain flag, not a snapshot comparison.** Each mutation method sets `isDirty = true`; `loadRemoteControl` (on success) and `saveRemoteControl` (on 200) set it back to `false`. Rationale: snapshot-comparison via `JSON.stringify` has two edge cases (badge flashes before first load resolves; failed-load leaves snapshot null so subsequent mutations never flip dirty). Flag-based tracking avoids both. The minor pessimism — mutate-then-revert-to-original keeps `isDirty` true — is acceptable; user clicks Save, save succeeds (a no-op PUT with unchanged payload), flag clears.

**Slot mutations** — button assignments from `AstrosRemoteButtonCard.change` are written by `RemoteControlConfigView` via `store.setButton(selectedIdx, buttonKey, value)`. The method atomically writes the slot and sets `isDirty = true`. (This spec originally deferred `setButton` on the rationale of a one-call-site mutation; surfaced during Phase 2a PR review as a forget-prone protocol regardless of consumer count, so the helper was added to make the dirty mark impossible to forget.)

---

## 5. Data flow

### Flow A — Selecting a page

```
User clicks page-list row "Performance"
  → AstrosRemotePageList emits 'select' (idx=1)
  → RemoteControlConfigView: store.selectPage(1)
  → store.selectedIdx = 1 (clamped)
  → Pinia subscribers re-render:
      • Page list: row 1 highlights, row 0 dims
      • Grid: 9 cards re-derive from pages[1]
      • Live preview: AstrosMobileRemote.initialIdx watcher reseats internal idx
```

No mutation to pages. `isDirty` stays unchanged.

### Flow B — Assigning a button via the popover

```
User clicks "Configure →" on empty BUTTON 5
  → AstrosRemoteButtonCard: popoverOpen = true (local)
  → AstrosRemoteButtonEditor renders, tab='script' (derived from currentValue.type='none')
User types "wave", filters, clicks "Wave Hello"
  → editor emits 'change' { id:'wave', name:'Wave Hello', type:'script' }
  → card re-emits 'change', closes popover
  → view handler: store.setButton(selectedIdx, 'button5', newValue)
  → subscribers re-render:
      • That card: assigned state (tinted blue, chip, name)
      • Live preview: button 5 now filled
      • Page list: that row's mini-preview dot 5 turns blue
      • Header: action count + isDirty flip
```

Popover state is component-local because only one card can have it open at a time (enforced by each card, not via a `currentlyEditingCardId` store field — over-engineering).

### Flow C — Deleting a page (with confirmation)

```
User clicks × icon on row "Performance"
  → AstrosRemotePageList emits 'delete' (idx=1)
  → view: pendingDeleteIdx = 1; open DaisyUI <dialog>
       "Delete 'Performance'? Buttons on this page will be lost."
User clicks "Cancel" → modal closes; pendingDeleteIdx = null; NO mutation
User clicks "Delete" → store.deletePage(1); modal closes; pendingDeleteIdx = null
  → store: pages.splice(1, 1); selectedIdx = clamp(selectedIdx, pages.length - 1)
  → subscribers re-render
```

Card disables × when `pages.length === 1` so the modal can't open in the impossible case. Store's defensive no-op is belt-and-suspenders.

### Cross-cutting

- **Add page** → `store.addPage()` pushes default, `selectedIdx = pages.length - 1`. Page list scrolls to bring it into view (`scrollIntoView` in a `nextTick`).
- **Duplicate page** → splices `"${src.name} (copy)"` after `idx`, selects copy.
- **Rename page (inline)** → page list emits `rename(idx, name)` → handler calls `store.renamePage`.
- **Save** → `store.saveRemoteControl()` → success: `isDirty` flips false, success toast. Failure: `isDirty` stays true, error toast.

---

## 6. Phasing — four sub-phases, four PRs

The user explicitly chose phasing over a single full plan ("we have had a lot of churn, even on things that started as small PRs ... if we do the UI parts first as components, there should be less stubbing and we can test them in storybook, then wire everything up as a final pr").

Each sub-phase gets its own `.docs/plans/YYYYMMDD-HHmm-phase2X-<slug>.md` plan file, its own feature branch, and its own PR into `develop`.

| Phase | Subject | Tasks | PR target |
|---|---|---|---|
| **2a** | Store CRUD foundation | Store methods + state + tests; remove all-empty save filter | ~300 LOC |
| **2b** | `AstrosRemoteButtonCard` + `AstrosRemoteButtonEditor` (paired) | Both components + stories + tests; i18n for editor/card | ~700 LOC |
| **2c** | `AstrosRemotePageList` | Component + stories + tests; i18n for page list | ~500 LOC |
| **2d** | `AstrosRemoteLivePreview` + `RemoteControlConfigView` + router swap | Preview component + view assembly + router update + delete-confirm modal + i18n sweep + manual QA + old code deletion | ~800 LOC |

**Sequencing constraint:** 2a must land first (store contract). After 2a, 2b and 2c are independent and could run in parallel, but should ship sequentially for review focus. 2d must land last (it deletes the old view).

**Verification gate by sub-phase:**
- 2a: vitest + mutation-test guards
- 2b: Storybook (primary) + vitest
- 2c: Storybook (primary) + vitest
- 2d: vitest + manual QA in browser (the integration check; old view is gone post-2d, so manual sweep matters)

**Each sub-phase ends in a working main view.** Old `RemoteView.vue` keeps rendering through 2a/2b/2c. The new components in 2b/2c sit unused until 2d wires them up. No half-broken UI states between sub-phase merges.

---

## 7. Testing strategy

Detail per the brainstorming Section 4 walkthrough. Summary by sub-phase:

### 2a — Store
10+ tests in `remoteControl.spec.ts` covering each new method, the isDirty flag interaction with load/save/mutate, and the filter removal. Mutation-test guards (vacuous-fix checks) on every defensive guard: deletePage's `pages.length <= 1`, selectedIdx clamps, renamePage's trim, addPage's selectedIdx invariant, and the `isDirty = false` clears in load/save success paths.

### 2b — Card + editor
**Editor**: tab toggle, search filter, selection emits, Esc/close emit, "None" row emit, tab-switch-doesn't-clear.
**Card**: unassigned vs assigned rendering, Configure/Edit opens popover, Clear emits without opening, editor change forwards + closes, editor close doesn't forward, Esc / click-outside closes, popover-leak-on-unmount vacuous-fix guard.
**Storybook**: empty/long/filtered editor states; assigned/unassigned/popover-open card states.

### 2c — Page list
Row rendering with mini-preview color-coding; select emit; inline-rename commits (Enter / blur), cancels (Esc); empty rename doesn't emit; duplicate/delete emits; × disabled when `pages.length === 1`; add emit; long-name truncation invariant.
**Storybook**: 1 page (× disabled), 3 pages, 30 pages (scroll), long names, inline-rename state.

### 2d — Preview + view
**Preview**: renders inner mobile remote with passed pages + selectedIdx + compact + read-only contract (no press/panic forwarding).
**View**: header counts, Unsaved badge visibility, Save button calls store, delete modal lifecycle, page-list events wire to store, card change mutates correct slot, save-failure UX.
**Manual QA**: `.docs/qa/remote-control-config.md` covering all flows from Section 5 in a real browser.

**No e2e Playwright tests for Phase 2.** Composition is covered by component units + view unit + manual QA.

---

## 8. Files to create / modify (full inventory by sub-phase)

### 2a
- (M) `astros_vue/src/stores/remoteControl.ts`
- (M) `astros_vue/src/stores/__tests__/remoteControl.spec.ts`

### 2b
- (N) `components/remoteControl/remoteButtonEditor/AstrosRemoteButtonEditor.vue` + `.stories.ts` + `.spec.ts` + `types.ts` + `index.ts`
- (N) `components/remoteControl/remoteButtonCard/AstrosRemoteButtonCard.vue` + `.stories.ts` + `.spec.ts` + `index.ts`
- (M) `astros_vue/src/locales/enUS.json` (editor + card keys under `remote_control_config.*`)

### 2c
- (N) `components/remoteControl/remotePageList/AstrosRemotePageList.vue` + `.stories.ts` + `.spec.ts` + `types.ts` + `index.ts`
- (M) `astros_vue/src/locales/enUS.json` (page list keys)

### 2d
- (N) `components/remoteControl/remoteLivePreview/AstrosRemoteLivePreview.vue` + `.stories.ts` + `.spec.ts` + `index.ts`
- (N) `views/RemoteControlConfigView.vue` + `views/__tests__/RemoteControlConfigView.spec.ts`
- (M) `astros_vue/src/router/index.ts` — swap the `/remote` route's component import from `RemoteView.vue` to `RemoteControlConfigView.vue`. URL stays `/remote`; route name stays `'remote'`. No alias needed (no URL change).
- (M) `astros_vue/src/components/index.ts` (export new components, remove deleted)
- (D) `views/RemoteView.vue`, `components/remoteControl/AstrosRemoteControl.vue`(+ stories), `components/remoteControl/AstrosRemoteButton.vue` (+ stories)
- (M) `astros_vue/src/locales/enUS.json` (view keys; remove old `remote_view.*`)
- (N) `.docs/qa/remote-control-config.md`

### Cross-cutting trackers
- (M) `.docs/plans/current_project.md` — nested sub-phase checkboxes added when 2a starts
- (N) `.docs/plans/specs/2026-05-21-phase2-editor-design.md` — **THIS spec**, committed with 2a
- (N) `.docs/plans/YYYYMMDD-HHmm-phase2{a,b,c,d}-<slug>.md` — one per sub-phase, written when work on that sub-phase begins

---

## 9. Deferred / out of scope (intentional)

- **Drag-reorder of pages.** Already deferred to Phase 5 in the master plan. Phase 2 renders the drag handle but it's inert.
- **Unsaved-changes navigation guard.** Deferred per Decision 9. Revisit if QA shows users navigating away with unsaved changes too easily.
- **URL sync of selectedIdx** (`?page=N`). Out of scope; selectedIdx defaults to 0 on load. Easy to add later without component touches because selectedIdx already lives in the store.
- **Connection chip in editor preview**: rendered as "Connected" with the default `:connected="true"` prop. Wiring to real WebSocket state is Phase 4's job (the mobile operator route is where connection state actually matters).
- **Responsive collapse at narrow widths.** Phase 2 targets typical desktop widths (1280px+). If the 3-pane layout breaks under a narrower viewport, manual QA flags it and we triage a follow-up. Not a hard requirement for v1.
- **Page-list keyboard navigation** (arrow keys up/down to select). Defer to the planned a11y pass (project memory `project_a11y_pass`).

---

## 10. References

- Direction B JSX reference: `.tmp/design_handoff_remote_control/directionB.jsx`
- Mobile remote design source: `.tmp/design_handoff_remote_control/mobileRemote.jsx`
- Brainstorm session content: `.superpowers/brainstorm/8193-1779398310/content/` (button-card-final, button-card-equal-buttons, page-list-actions, button-editor-expansion)
- Phase 3 component spec: shipped via PR #92, source at `components/mobileRemote/mobileRemote/AstrosMobileRemote.vue`
- Master plan (out of repo): `~/.claude/plans/take-a-look-at-optimized-blossom.md` — Part D Phase 2 sketch
- Project tracker: `.docs/plans/current_project.md`
- Chrome / shell pattern precedent: `astros_vue/src/views/ModulesView.vue` (header bar with action count) and `astros_vue/src/views/FirmwareView.vue` (multi-pane chrome)
- Existing button selection store contract: `astros_vue/src/components/remoteControl/AstrosRemoteButton.vue` (current `selectionChange` emit, replaced by `change`)
