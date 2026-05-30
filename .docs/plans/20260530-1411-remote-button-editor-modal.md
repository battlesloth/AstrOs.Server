# Refactor: button editor popover → view-owned modal (singleton)

**Branch:** `feature/remote-button-editor-modal` (off `develop`)
**Tier:** Light plan (UI refactor, single layer)
**Date:** 2026-05-30

## Goal

Replace the floating-ui popover that hosts `AstrosRemoteButtonEditor` (one per
button card) with a **single view-owned modal**, matching the app's existing
pattern (ScripterView's `showModal` + self-contained `<dialog class="modal
modal-open">` form modals in `components/modals/{domain}/`).

## Design (approved 2026-05-30)

- **View owns it.** `RemoteControlConfigView` gets `editingButtonKey =
  ref<ButtonKey | null>(null)`; renders ONE editor modal when non-null.
- **New `AstrosRemoteButtonEditorModal.vue`** (`components/modals/remoteControl/`):
  `<dialog class="modal modal-open"> → modal-box → modal-backdrop` shell wrapping
  the **unchanged** `AstrosRemoteButtonEditor` content. Props: `buttonNumber`,
  `currentValue`, `scripts`, `playlists`. Emits: `change`, `close`. Backdrop
  click + the editor's existing `×`/Escape all close.
- **Card sheds the popover.** `AstrosRemoteButtonCard` drops `@floating-ui/vue`,
  `<Teleport>`, the capture-phase click-outside listener + its lifecycle, the
  editor import, and the open/close/handleChange plumbing. It emits `edit`
  (open) and keeps `change` (the direct Clear action).
- **Remove `@floating-ui/vue`** from `package.json` (this card was its only
  consumer).

## Tasks

- [ ] Create `components/modals/remoteControl/AstrosRemoteButtonEditorModal.vue`
      (dialog shell wrapping `AstrosRemoteButtonEditor`; forwards `change`,
      emits `close` on backdrop/×/Escape). Export from the modals barrel.
- [ ] Modal spec: renders editor content; forwards `change` on item-select;
      `close` on backdrop click, on editor `×`, and on Escape. (Mutation-check
      the close paths.)
- [ ] Strip `AstrosRemoteButtonCard.vue`: remove floating-ui / Teleport /
      click-outside / editor import / open-close-handleChange; emit `edit`;
      keep `change` for Clear. Update card spec (drop the popover-host block;
      add `edit`-emit + `change(none)`-on-Clear coverage).
- [ ] Wire `RemoteControlConfigView.vue`: `editingButtonKey` state, render the
      modal singleton, `onEditRequested(key)` / `onEditorChange(v)` (→
      `setButton(selectedIdx, editingButtonKey, v)` + close) / close. Update
      view spec (card `edit` opens modal; modal `change` → `setButton`; close
      clears state).
- [ ] Remove `@floating-ui/vue` from `package.json` + lockfile; confirm no
      remaining imports.
- [ ] Pre-commit gate: `lint`, `build` (vue-tsc + vite build), affected specs
      (modal / card / view / editor) green. Commit.

## Notes

- `AstrosRemoteButtonEditor` content + its 32 tests stay **unchanged** — only
  the shell around it changes (popover → modal).
- Emit is `change` (not `save`): selecting a list item is the immediate action;
  there's no separate Save button. The view does `setButton` + close on change.
- TDD exception (UI rendering) applies to layout, but the emit/close **contract**
  is plain logic — covered by the modal + view specs and mutation-checked.
