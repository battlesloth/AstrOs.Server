# Phase 5 — Page drag-reorder (Remote Control config)

## Context

The `/remote` config editor's left **PAGES** list (`AstrosRemotePageList`) lets users
add / select / rename / duplicate / delete pages, but **not reorder them**. Phase 5 of
the Remote Redesign (the last queued sub-feature) adds page reordering by **pointer
drag and keyboard**, persisted through the existing Save (page order is just the array
order the save already serializes — no backend/migration). Approved design decisions:
keyboard reorder is **in scope now** (not deferred to the a11y pass), via a **grab
handle** (Space/Enter → ↑/↓ → drop), and pointer drag uses **`vue-draggable-plus`**
(SortableJS, touch).

**Branch:** `feature/phase5-page-drag-reorder` off `develop`. Independent of the merged
modal PR (touches different files).

## Approach

- **Library:** `vue-draggable-plus` for pointer drag only (touch via `force-fallback`).
  Keyboard reorder is custom.
- **Grip handle** (`≡`) as the leftmost element of each row; pointer drag starts only
  from it (SortableJS `handle` selector). Click-to-select, inline rename, and the
  rename/dup/delete buttons stay untouched.
- **Store-authoritative** (no in-place prop mutation): the component keeps a local copy
  of `pages` synced from the prop; on drop it resets the copy and emits
  `reorder { fromIdx, toIdx }`; the view calls `store.reorderPages`; the store mutation
  flows back through the prop. One code path (the store action) always runs the
  selectedIdx-follow + `isDirty` logic.
- **Keyboard grab pattern** on the handle, with `aria-live` announcements (skip the
  **deprecated** `aria-grabbed`; use a visual "grabbed" ring + `aria-describedby`
  instructions + the live region). Grab is disabled while any row is renaming.
- **Persistence:** reorder → `isDirty=true` → existing Save PUT. No new endpoint.

## Critical files

| File | Change |
|---|---|
| `astros_vue/package.json` | add `vue-draggable-plus` dep |
| `astros_vue/src/stores/remoteControl.ts` | new `reorderPages(fromIdx, toIdx)` action (+ export) |
| `astros_vue/src/stores/__tests__/remoteControl.spec.ts` | `describe('reorderPages')` — 14 mutation-guard cases |
| `astros_vue/src/components/remoteControl/remotePageList/AstrosRemotePageList.vue` | grip handle, `VueDraggable` wiring, keyboard grab machine, `aria-live` region, `reorder` emit |
| `astros_vue/src/components/remoteControl/remotePageList/AstrosRemotePageList.spec.ts` | keyboard grab/move/drop/cancel + emit-contract + handle tests |
| `astros_vue/src/views/RemoteControlConfigView.vue` | `onReorderPage` handler + `@reorder` binding |
| `astros_vue/src/views/__tests__/RemoteControlConfigView.spec.ts` | add `'reorder'` to the page-list stub emits + a forwarding test |
| `astros_vue/src/locales/enUS.json` | `pageList.{grab,grabbed,moved,dropped,cancelled}` keys |
| `.docs/qa/remote-page-reorder.md` | manual QA plan (pointer drag) |

## Store action (the core logic)

Match the existing `Number.isInteger` / out-of-range `console.warn`-then-return guard
style and the `deletePage` selectedIdx-tracking pattern in `remoteControl.ts`:

```ts
function reorderPages(fromIdx: number, toIdx: number) {
  if (!Number.isInteger(fromIdx) || !Number.isInteger(toIdx)) { console.warn(/* … */); return; }
  const lastIdx = remoteControlPages.value.length - 1;
  if (fromIdx < 0 || fromIdx > lastIdx || toIdx < 0 || toIdx > lastIdx) { console.warn(/* … */); return; }
  if (fromIdx === toIdx) return;                       // no-op, does NOT flip isDirty
  // selectedIdx follows the selected page across the move (id capture, like rename-commit)
  const selectedId = remoteControlPages.value[selectedIdx.value]?.id ?? null;
  const [page] = remoteControlPages.value.splice(fromIdx, 1);
  remoteControlPages.value.splice(toIdx, 0, page!);
  if (selectedId !== null) {
    const i = remoteControlPages.value.findIndex((p) => p.id === selectedId);
    if (i !== -1) selectedIdx.value = i;
  }
  isDirty.value = true;
}
```

## Component (`AstrosRemotePageList.vue`)

- **Draggable wiring (store-authoritative):** keep a `localPages` ref `watch`-synced from
  `props.pages` (`immediate`); bind `VueDraggable` `v-model="localPages"` with
  `handle="[data-drag-handle]"`, `force-fallback`, `animation: 150`, `tag="ul"` (move the
  existing `<ul>` `role="listbox"` / `aria-label` / classes onto `VueDraggable`). In
  `@end({oldIndex,newIndex})`: skip if equal, reset `localPages = [...props.pages]` (undo
  the lib's in-place move), then `emit('reorder', { fromIdx: oldIndex, toIdx: newIndex })`.
  The store move flows back via the prop watch — net no double-move.
- **Grip handle** per row: `<button data-drag-handle …>` leftmost; `cursor-grab`; on the
  renaming row → `pointer-events-none` + inert. Space/Enter/Arrow/Esc keydowns use
  `.prevent.stop` so they don't reach the row's existing `@keydown.enter/space.self`
  select handlers.
- **Keyboard grab machine** (`grabIdx`/`grabbedId` refs, `onHandleKey(evt, idx)`):
  idle + Space/Enter → grab (record idx + page id, announce); grabbed + ↑/↓ → emit
  `reorder` toward `currentIdx∓1` (re-find current pos by `grabbedId` since indices shift),
  announce; grabbed + Space/Enter → drop (clear state, announce); grabbed + Esc → emit
  `reorder` back to the original idx if moved, clear, announce. Guard: `if (renamingId.value
  !== null) return;` at the top (no grab while renaming).
- **Announcements:** `liveMessage` ref bound to a `sr-only` `role="status" aria-live="assertive"
  aria-atomic` region; `announceReorder` clears then sets on `nextTick` so repeats (e.g.
  boundary bumps) re-announce. Handle carries `aria-label` (grab) + `aria-describedby` →
  visually-hidden instructions. Grabbed row gets a visual `ring-2 ring-primary`.
- **Emit:** add `reorder: [payload: { fromIdx: number; toIdx: number }]` to `defineEmits`.

## View wiring (`RemoteControlConfigView.vue`)

```ts
function onReorderPage(p: { fromIdx: number; toIdx: number }) {
  remoteControlStore.reorderPages(p.fromIdx, p.toIdx);
}
```
Bind `@reorder="onReorderPage"` on `<AstrosRemotePageList>`.

## Tests

**TDD (write first, mutation-guarded):**
- **Store `reorderPages`** — 14 cases: happy move (low→high, high→low); selectedIdx follows
  when the *selected* page moves; selectedIdx adjusts when a non-selected page crosses it
  (both directions); `isDirty` flips; NaN/fractional/negative/out-of-range each warn+no-op;
  `fromIdx===toIdx` no-ops AND does not flip `isDirty`.
- **Component** — grab+ArrowDown emits `{0,1}`; grab+ArrowUp emits `{1,0}`; two ArrowDowns
  emit twice; Esc with no move emits nothing; Esc after moves emits back to original;
  drop/Esc clear grabbed state; handle Space/Enter does not bubble to row-select; handle is
  inert while `renamingId===page.id`; `data-drag-handle` present per row.
- **View** — add `'reorder'` to the stub emits; `forwards reorder emit to store.reorderPages`.

**Manual QA** (`.docs/qa/remote-page-reorder.md`) — SortableJS pointer drag is DOM-drag
(project UI TDD exception): drag reorders; drag inert on a renaming row; dragging the
selected page keeps it selected (grid follows); dragging a non-selected page leaves the
grid; Save → reload → order persists; touch (device or emulation).

## Verification

1. `cd astros_vue && npm run lint && npm run build` (vue-tsc + vite) clean.
2. `npx vitest run` — full frontend suite green (store + component + view specs).
3. Manual QA per the QA plan (drag + keyboard + persistence + touch).
4. Pre-commit `superpowers:requesting-code-review`; pre-push `pr-review-toolkit:review-pr`.

## Build sequence

- [x] 1. Branch `feature/phase5-page-drag-reorder` off `develop`; commit this plan to `.docs/plans/`.
- [x] 2. `npm install vue-draggable-plus`.
- [x] 3. Add i18n keys.
- [x] 4. TDD `reorderPages` store action (14 cases) → implement → green.
- [x] 5. TDD component keyboard machine + emit contract + handle tests.
- [x] 6. Implement component: emit, `VueDraggable` wiring + `localPages` sync, grip handle,
      keyboard machine, live region → green.
- [x] 7. View: `onReorderPage` + `@reorder`; update view spec stub + forwarding test → green.
- [x] 8. Pre-commit gate (prettier/lint/build/vitest) + code review; commit.
- [x] 9a. QA plan file `.docs/qa/remote-page-reorder.md` written + committed.
- [ ] 9b. Manual QA (pointer drag / touch / screen-reader) — Jeff's hands-on review pass.
- [ ] 10. Pre-push toolkit review; address; push + PR `--base develop`.

## Out of scope

- No backend / migration (order persists in the existing config array).
- M5Stack firmware: page order already follows the array; no contract change.
- Drag-reorder of buttons within a page (only page reorder).
