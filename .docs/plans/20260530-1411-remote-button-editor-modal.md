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

- [x] Create `components/modals/remoteControl/AstrosRemoteButtonEditorModal.vue`
      (dialog shell wrapping `AstrosRemoteButtonEditor`; forwards `change`,
      emits `close` on backdrop/×/Escape). Exported from the modals barrel
      (`remoteControl/index.ts` re-exported by `modals/index.ts`).
- [x] Modal spec (5 cases): renders editor in the dialog shell; forwards
      `change` on item-select; `close` on backdrop click, editor `×`, and Escape.
- [x] Stripped `AstrosRemoteButtonCard.vue` to presentational: removed
      floating-ui / Teleport / click-outside / editor import / open-close
      plumbing AND the `buttonNumber`/`scripts`/`playlists` props; emits `edit`
      + `change` (Clear). Card spec slimmed; stories fixed.
- [x] Wired `RemoteControlConfigView.vue`: `editingButtonKey` +
      `editingButtonValue`/`editingButtonNumber` computeds, singleton modal
      `v-if`, `onEditRequested`/`onEditorChange`(→`setButton`+close)/
      `onEditorClose`. View spec gained editor-modal-wiring tests + stub.
- [x] Removed `@floating-ui/vue` (package.json + lockfile); zero `src/` imports.
- [x] Gate: lint clean, `vue-tsc`+`vite build` clean, full suite 613 pass.
      Pre-commit review: no Critical/Important.

## Review note (recorded decision)

The old popover captured + restored keyboard focus to the trigger on close; the
modal does not. This is **intentional** — it matches every other modal in the
app (`AstrosServoEventModal` et al.), which was the goal of this refactor. Flag
for the pending a11y pass; not a regression vs. the app's convention.

## Notes

- `AstrosRemoteButtonEditor` content + its 32 tests stay **unchanged** — only
  the shell around it changes (popover → modal).
- Emit is `change` (not `save`): selecting a list item is the immediate action;
  there's no separate Save button. The view does `setButton` + close on change.
- TDD exception (UI rendering) applies to layout, but the emit/close **contract**
  is plain logic — covered by the modal + view specs and mutation-checked.
