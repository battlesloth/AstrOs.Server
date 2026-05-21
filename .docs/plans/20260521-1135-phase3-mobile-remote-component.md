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
  trigger spurious page flips. (Subsequently extracted into the
  `useSwipeGesture` composable — see "Deviations from original plan"
  below.)

## Deviations from original plan (as shipped)

The task descriptions above describe the original intent. The implementation
diverged in a handful of small ways; each is noted here so a future reader
isn't misled by the original text. Commit messages on each implementation
commit also document these.

- **`useHoldGesture` is a 3-state machine, not 4-state.** Task 1's
  description sketches `'idle' | 'arming' | 'active' | 'cooldown'`. The
  implementation collapsed the trailing two into a single `'active'`
  state because the design's STOPPED visual covers the entire lockout
  window with no observable distinction between "just-fired" and
  "cooling down". See `useHoldGesture.ts` header comment for the
  rationale. Re-introducing `'cooldown'` is straightforward if a future
  visual treatment needs to distinguish them.
- **Vacuous-fix guard mutation in Task 1's description was wrong.** The
  plan claimed reverting `holdMs` to 0 would make the cancel-during-arming
  test fail, but under `vi.useFakeTimers()` a 0ms callback only fires when
  time is advanced — and the test DOES advance 300ms before cancel, so
  the mutation IS caught. The real mutation the test pins is "drop the
  `clearArmTimer()` from cancel". The spec file's inline comment now
  enumerates both mutations the test catches.
- **i18n keys and icon registration landed in Task 2, not Task 3.** Task
  3's description lists `mobile_remote.*` keys and `MdDescription` /
  `MdFolder` registration; in practice they shipped in Task 2 because the
  component cannot render without them. Task 3 became "Storybook stories
  only" plus the manual visual verification step.
- **Storybook has six stories, not four.** Task 3 listed Page 1 mixed,
  Page 2 sparse, Page 3 empty, Compact preview. The implementation also
  includes `Disconnected` and `EmptyPagesArray` (safety-branch coverage).
- **CSS approach is scoped BEM with `--mr-*` CSS variables, not Tailwind
  utility classes.** Task 2's description suggested Tailwind-first with
  inline style only as fallback; in practice the design needs ~10
  mobile-remote-specific tokens (panic red, toast slate, base-100/200,
  border-strong, etc.) that aren't in the global Tailwind config, so
  scoped-CSS-with-variables is cleaner than ten `bg-[#hex]` arbitrary
  values per slot. Local to this component; no styles.css change.
- **Wordmark font is `distant_galaxyregular` (existing) via the
  `font-starwars` class, not `Audiowide`.** The handoff used Audiowide as
  a placeholder for the proprietary AstrOs wordmark. The existing
  `distant_galaxyregular` woff (already loaded by styles.css) IS that
  proprietary wordmark, so the component uses it directly — no font swap
  pending.
- **Icon names are `md-description` / `md-folder` (oh-vue-icons MD set),
  not `Icon.Doc` / `Icon.Folder`.** The latter was the handoff's React
  vocabulary; oh-vue-icons's Material Design set uses the
  `md-description` / `md-folder` IDs.
- **Swipe gesture extracted to `useSwipeGesture` composable.** Initially
  inlined into the component (~40 lines). After the pre-push toolkit
  flagged the multi-touch guard as a defensive feature requiring mutation-
  test coverage, the swipe state machine was extracted into
  `composables/useSwipeGesture.ts` with an 11-test spec file. Mirrors the
  `useHoldGesture` pattern.

## Phase 4 contract requirements (load-bearing for next phase)

These items are intentionally deferred to Phase 4 but must be respected by
the standalone-route wiring or the operator UX will be misleading or unsafe.

- **Panic delivery confirmation.** The component fires `emit('panic')` and
  shows the STOPPED visual + "STOP ALL — sent" toast unconditionally. Phase
  4 MUST gate the STOPPED visual on websocket-PANIC delivery
  confirmation (either via a `panicStatus: 'idle' | 'sending' | 'sent' |
  'failed'` prop the component reflects in the toast/visual, or by emitting
  the panic synchronously and showing the lockout only on success). Safety-
  critical: a failed panic with confirmed-success feedback would convince
  the operator the droid stopped when it didn't.
- **Press delivery confirmation.** Same shape: `emit('press', button)` is
  fire-and-forget. Phase 4 must surface API/WS failures so the "Sent: {name}"
  toast doesn't lie. Less critical than panic but still violates the
  project's no-silent-failure rule.
- **`connected` prop coupling.** Phase 4 will drive `connected: boolean`
  from the WebSocket connection store. If the team wants a tri-state
  (`'connected' | 'connecting' | 'disconnected'`) to show a connecting
  spinner during retry windows, widen the prop in Phase 4 — the type
  change is non-breaking for current consumers since `true` still works as
  the default.
- **Component-level a11y pass.** Forward-looking per memory's a11y rule:
  `aria-pressed="mixed"` during arming, `aria-describedby` linking the
  panic button to its caption, i18n on the wordmark `aria-label`, and
  considering `role="img"` on the empty-slot buttons since they are not
  actionable. Batch into the planned a11y pass rather than this PR.

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
