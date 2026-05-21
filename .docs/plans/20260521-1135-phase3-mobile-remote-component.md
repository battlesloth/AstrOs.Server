# Phase 3 — Shared `AstrosMobileRemote` component

**Date:** 2026-05-21
**Tier:** Light plan (per CLAUDE.md Planning section)
**Parent project:** [`current_project.md`](./current_project.md) — Remote Control Redesign + Mobile Remote
**Branch:** `feature/phase3-mobile-remote-component`

## Goal

Port the handheld mobile remote design from the Direction B handoff
(`.tmp/design_handoff_remote_control/mobileRemote.jsx`) to a reusable Vue 3 component.
The component is used in two places:

- **Phase 2's preview rail** (compact mode, inside a `MiniPhone` bezel).
- **Phase 4's standalone mobile operator route** (full size).

This phase ships ONLY the component itself. Wiring it to script/playlist run endpoints
and a real WebSocket connection chip is Phase 4 territory; this phase exposes those as
props/emits so Phase 4 can plug in without touching the component internals.

## Failure-mode inventory

Not required. Pure UI component — no filesystem state, no real network I/O (the press
and panic actions are callback props that the parent wires later), no concurrency
beyond a single local hold-timer, no crash-recovery surface.

## Why this phase ships before Phase 2

Phase 2's `AstrosRemoteLivePreview.vue` imports `AstrosMobileRemote`. Building Phase 2
first would either require a stub preview that gets re-touched in Phase 3, or inlining a
throwaway minimal remote. Reordering 3→2 means Phase 2 can fully implement the preview
rail at first commit without re-touching files later. Decision made 2026-05-21; reflected
in `current_project.md`.

## Hidden gotchas surfaced during planning

1. **The "connected" indicator has no data source in Phase 3.** The handoff shows a green
   "Connected" chip in the top bar driven by WebSocket state, which doesn't exist until
   Phase 4. Expose it as a `connected?: boolean` prop (defaulting to `true`) so Phase 4
   can drive it from the WS store without changing the component shape.
2. **Battery glyph is dropped entirely** (per [[project-active-remote-redesign]]). The
   handoff's `Icon.Battery` does NOT need registering. Top bar = wordmark + Connected
   chip only.
3. **Toast and panic-active timers must clean up on unmount.** The 1.6s press-toast and
   2.2s panic-active lockout both use `setTimeout`. If the component unmounts mid-timer
   (e.g., page route change), the timer's setState would leak. Use `onBeforeUnmount` to
   clear pending handles, and gate the timer callbacks on a mounted ref.
4. **`MobileRemote.jsx` uses both mouse and touch handlers** with `preventDefault` on
   touch to suppress synthetic mouse events. Vue's standard `@mousedown` / `@touchstart`
   bindings won't auto-deduplicate; the composable must accept both.
5. **The `compact` mode is mostly sizing tweaks**, not a different layout. Specifically:
   `paddingTop` shrinks, font sizes and gap/radius values reduce, the panic button label
   gets tighter. Express as Tailwind class branches via `:class="compact ? ... : ..."`
   rather than two parallel templates.

## Tasks

- [x] **Task 1 — `useHoldGesture` composable + TDD tests.** Create
      `astros_vue/src/composables/useHoldGesture.ts` exposing a state machine:
      `'idle' | 'arming' | 'active' | 'cooldown'`. API:
      `useHoldGesture({ holdMs: 600, cooldownMs: 2200, onFire })` returns
      `{ state, start(), cancel(), reset() }`. State transitions: `idle → arming` on
      `start()`; `arming → active` after `holdMs` (fires `onFire`); `arming → idle` if
      `cancel()` before timeout; `active → cooldown → idle` after `cooldownMs`. Tests in
      `astros_vue/src/composables/__tests__/useHoldGesture.spec.ts` cover: fires after
      `holdMs`, releases before `holdMs` cancels cleanly, repeated `start()` while
      arming is a no-op, `cancel()` after fire stays in cooldown, `reset()` clears
      pending timers. **Vacuous-fix guard:** revert the `holdMs` timeout to fire at 0ms
      and verify the "releases before holdMs cancels cleanly" test fails.
- [x] **Task 2 — `AstrosMobileRemote.vue` component file.** Create
      `astros_vue/src/components/mobileRemote/mobileRemote/AstrosMobileRemote.vue` with
      the props/emits and full layout from the handoff. Props:
      `pages: RemoteControlPage[]`, `initialIdx?: number = 0`, `compact?: boolean = false`,
      `connected?: boolean = true`. Emits: `press(buttonValue: PageButton)`,
      `panic()`. Local state: `idx`, `pressed` (button id during 220ms press flash),
      `toastMessage`. Uses `useHoldGesture` for the panic button. Layout: orange top bar
      (`bg-r2-complement` — wordmark "AstrOs" in `Audiowide`, conditional Connected
      chip with `bg-success` dot), page header (page name + "{idx+1} / {total}"
      pagination text), 3×3 button grid (filled buttons → `bg-r2-primary` with
      action-type chip via `Icon.Doc`/`Icon.Folder`; empty slots → `bg-r2-base-200`
      with dashed `border-r2-border-strong` and em-dash), pagination row (prev/next
      arrow icon buttons + dot strip with elongated active pill), toast overlay
      (transient, absolute-positioned), STOP ALL button (3 states driven by
      `useHoldGesture`). Tailwind-first; inline `style` only where Tailwind cannot
      express the value (e.g., the exact shadow stack on filled buttons, the
      `transform: scale(0.96)` press animation). Component-scoped types in
      sibling `types.ts` (mainly `PressEvent` type alias). **Unmount cleanup** for
      press-flash + toast timers (see Hidden gotcha 3).
- [x] **Task 3 — Storybook stories + icon registration + i18n.** Create
      `AstrosMobileRemote.stories.ts` next to the component with four variants:
      "Page 1 — mixed" (uses Phase 1's `createDefaultPage` + populated buttons),
      "Page 2 — sparse" (3 buttons assigned), "Page 3 — empty" (all `'0'` slots),
      "Compact preview" (page 1 with `compact: true`). Register `MdDescription` (Doc)
      and `MdFolder` (Folder) icons in `astros_vue/src/main.ts`. Add
      `mobile_remote.*` i18n keys to `astros_vue/src/locales/enUS.json` —
      `mobile_remote.connected_label`, `mobile_remote.stop_all_idle`,
      `mobile_remote.stop_all_arming`, `mobile_remote.stop_all_active`,
      `mobile_remote.stop_all_caption`, `mobile_remote.empty_slot_aria`. Add barrel
      export in `astros_vue/src/components/mobileRemote/index.ts`.
- [ ] **Task 4 — Manual visual verification + Storybook check.** Run `npm run
      storybook` and verify all four stories render: filled buttons show the correct
      type chip, empty slots show the dashed-border em-dash, the pagination dot
      elongates on the active page, the panic button arming-fill animation runs to
      completion in 600ms and the active state locks for 2.2s. No automated coverage
      here — the layout is visual. Per memory [[feedback-tdd-exceptions]] UI layout
      doesn't get unit tests; the composable in Task 1 does. Confirm in dev tools
      that unmounting mid-press / mid-toast doesn't leak timer warnings.

## Post-Task-3 design feedback (folded in)

These came out of iterative visual review after Tasks 1-3 shipped. Each is
small enough to ship without a separate plan tier:

- **AstrOs wordmark per-letter cap scaling** (1.25× the body letter size on
  capital A and O) — enforces the proprietary branding rhythm. Implemented
  with per-letter `<span>` + `aria-label="AstrOs"` so screen readers
  announce the word as a single token.
- **Button label font shrink** — 18px → 15px (full) and 12px → 11px
  (compact) to fit longer script/playlist titles within the 3-line clamp.
- **Swipe-to-paginate on the 3×3 grid** — touchstart/touchend handlers,
  60px horizontal threshold, 40px vertical max, swipe-LEFT → next page
  (iOS Photos convention). Multi-touch guard clears any in-progress
  start coords when a second finger lands so two-handed grips don't
  trigger spurious page flips.

## Out of scope

- Wiring `@press` to `apiService.get('api/scripts/run', ...)` and `@panic` to a WebSocket
  PANIC message — Phase 4.
- A standalone route or view for the component — Phase 4.
- Replacing the `Audiowide` placeholder with the proprietary AstrOs wordmark font —
  open question for the design phase, not blocking.
- Touch-vs-mouse event coalescing optimization beyond the basic `preventDefault` on
  touch handlers — defer to Phase 4 bench-testing on real hardware.

## Verification gates

- `npm run build` (vue) clean.
- `npx vitest run` clean — includes new `useHoldGesture.spec.ts`.
- `npm run lint` + `npm run format` clean.
- `npm run storybook` — all four stories render visually correct against the handoff
  screenshots (`.tmp/design_handoff_remote_control/screenshots/03-mobile-page1.png`
  through `05-mobile-empty.png`).
- Invoke `superpowers:requesting-code-review` on each implementation commit.
- Run `/pr-review-toolkit:review-pr` on the full branch diff vs `develop` before push
  (mandatory per CLAUDE.md).

## Critical files touched

- `astros_vue/src/composables/useHoldGesture.ts` (new)
- `astros_vue/src/composables/__tests__/useHoldGesture.spec.ts` (new)
- `astros_vue/src/components/mobileRemote/index.ts` (new — barrel)
- `astros_vue/src/components/mobileRemote/mobileRemote/AstrosMobileRemote.vue` (new)
- `astros_vue/src/components/mobileRemote/mobileRemote/AstrosMobileRemote.stories.ts` (new)
- `astros_vue/src/components/mobileRemote/mobileRemote/types.ts` (new, small)
- `astros_vue/src/main.ts` (icon registration)
- `astros_vue/src/locales/enUS.json` (new `mobile_remote.*` keys)
- `.docs/plans/current_project.md` (flip Phase 6 checkbox, note Phase 3 active)
