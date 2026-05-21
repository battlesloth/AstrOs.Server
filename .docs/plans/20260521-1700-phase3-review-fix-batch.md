# Phase 3 — Pre-push review fix batch

**Date:** 2026-05-21
**Tier:** Light plan (per CLAUDE.md Planning section)
**Parent project:** [`current_project.md`](./current_project.md) — Remote Control Redesign + Mobile Remote
**Branch:** `feature/phase3-mobile-remote-component` (continuing — same branch, per solo-dev branch hygiene)
**Source:** Findings from the second `/pr-review-toolkit:review-pr` run on this branch (5 agents).

## Goal

Address the second-round pre-push toolkit findings before pushing the Phase 3 branch.
The first round was addressed in commit `1ada630`; this batch covers what the second
round surfaced after those fixes landed.

## Triage decisions (push-back / YAGNI)

- **Skip M10** ("verify mutation (b)"). Re-read of the plan deviations section
  (lines 143-149) and the spec comment (`useHoldGesture.spec.ts:50-67`) shows they
  agree: both say the original plan's vacuous-fix claim was wrong, and the test
  *does* catch the mutation. No contradiction; no action.
- **Skip M11** ("introduce `ConnectionStatus` union now"). YAGNI — zero in-tree
  consumers of the component exist yet. The plan's "Phase 4 contract requirements"
  section (lines 199-204) explicitly notes the widening is non-breaking at that
  time because `true` continues to work as the default. Deferring follows the
  CLAUDE.md "Don't design for hypothetical future requirements" rule.

## Commit plan

Each commit below is independently shippable and gets the standard pre-commit
toolkit (prettier:write → lint:fix → build + vitest → `requesting-code-review`
subagent on the diff against the prior commit). Plan-only commits skip the
code-review step per the carve-out.

- [x] **Commit 1 — Plan file (this file).** Plan-only commit; ships before any
      source change per the Planning section.
- [ ] **Commit 2 — C1 + I4: panic delivery contract + composable safety
      docstring.** (a) Change `mobile_remote.panic_toast` from `"STOP ALL — sent"`
      to `"STOP ALL — sending…"` in `enUS.json`. (b) Add an `onError?: (err:
      unknown) => void` option to `UseHoldGestureOptions`; the existing
      `console.error` branch falls back to that path so consumers can route to
      their real logger. (c) Add a docstring on `useHoldGesture.start()`
      explicitly noting "MUST be idempotent — consumers (e.g.,
      `AstrosMobileRemote`) rely on this to absorb the synthesized mousedown
      after touchstart." (d) Trim the `// Phase 4 contract:` block in
      `AstrosMobileRemote.vue` `onFire` to a single WHY line about
      fire-and-forget; the toast copy carries the rest.
- [ ] **Commit 3 — I1 + M7: clamp `idx` at init.** Replace `const idx =
      ref(props.initialIdx)` with a clamp using `Math.min/Math.max`. Introduce a
      `currentIdx` computed (or reuse `safeIdx` from the existing
      `currentPage` computed by extracting it) and route the pagination header
      `{{ idx + 1 }} / {{ totalPages }}` and both `:disabled` checks through it
      so out-of-range `initialIdx` no longer leaks into pagination UI. Side
      effect: the EmptyPagesArray story's Next button correctly disables.
      Update the read-time clamp comment to reflect the new structure.
- [ ] **Commit 4 — I2: i18n the wordmark aria-label.** Replace
      `aria-label="AstrOs"` with `:aria-label="$t('astros')"`. Key already
      exists at `enUS.json:2`.
- [ ] **Commit 5 — I6: `isFilledPageButton` type guard.** Add the predicate in
      `types.ts`; replace the `button as AstrosMobileRemotePressEvent` cast in
      `handlePress` with the guard so TypeScript proves the narrowing. Remove
      the now-redundant cast-narrowing comment block (handles M6's
      `handlePress` what-comment as a side effect).
- [ ] **Commit 6 — I3: `AstrosMobileRemote` component tests.** New
      `AstrosMobileRemote.spec.ts` covering:
      - press-during-`active` lockout is suppressed (mounts, fires panic,
        advances 600ms, clicks a button, asserts no `press` emit).
      - unmount clears all three local timers (mounts, starts press timer,
        unmounts before 220ms, advances 220ms, asserts no Vue warning + no
        ref mutation).
      - panic `onFire` cancels an in-flight press toast (mount, press a
        button, fire panic 200ms later, advance to T+1700ms, assert toast
        still shows panic text).
      - emit-shape narrowing: pressing a `type: 'script'` button emits a
        `FilledPageButton` whose `type` is not `'none'`.
      - initialIdx out-of-range clamp on mount: mount with `initialIdx=10,
        pages.length=3`, assert pagination header reads `"3 / 3"` and Next
        button is disabled (validates the Commit 3 fix).
      Follows the existing `AstrosFirmwareVersionDelta.spec.ts` i18n-stub
      pattern.
- [ ] **Commit 7 — Cleanup batch (M1, M2, M3, M4, M5, M6, M8).**
      - **M1**: drop `@mouseleave="handlePanicUp"` from the panic button so a
        drag-off mid-hold doesn't silently cancel. Matches touch-end-anywhere
        UX and is more forgiving for a safety gesture.
      - **M2**: consolidate `pressClearTimer`/`toastClearTimer`/`panicToastTimer`
        + `clearToastTimer`/`clearPanicToastTimer` + the inline toast assignment
        into a single `showToast(message: string, durationMs: number)` helper
        owning one slot + one timer. Press toast and panic toast both call it.
      - **M3**: drop the stale "until the real woff replaces
        distant_galaxyregular" CSS comment fragment; keep the rationale
        clause.
      - **M4**: trim the `(mirrors the React useEffect in mobileRemote.jsx).
        Important for Phase 2's preview rail…` caller-reference comment to the
        WHY ("Reseat idx if the parent updates initialIdx after mount.").
      - **M5**: covered by Commit 2's trim of the Phase 4 block.
      - **M6**: trim what-comments on `slots` computed and `types.ts:3-8` to
        one-line WHY. (`handlePress` what-comment is removed by Commit 5.)
      - **M8**: add exactly-at-threshold boundary tests to
        `useSwipeGesture.spec.ts` (deltaX = ±60 fires; deltaY = 40 still
        fires for a horizontal swipe).
- [ ] **Commit 8 — I5: plan-vs-code drift fixes (plan-only).** Edit
      `20260521-1135-phase3-mobile-remote-component.md`:
      - Hidden gotcha #3 (line 46-47): drop "and gate the timer callbacks on
        a mounted ref"; shipped code uses `clearTimeout` alone.
      - Out of scope (line 216-217): drop the Audiowide-wordmark-swap bullet;
        the deviations section already states `distant_galaxyregular` is the
        proprietary wordmark and no swap is pending.
      - Verification gate (line 226): change "all four stories" to "all six
        stories" (or "all stories"). Six shipped per the deviations section.

## Verification gates

- `npm run build` clean after each commit.
- `npx vitest run` clean after each commit (including the new
  `AstrosMobileRemote.spec.ts` in Commit 6).
- `npm run lint` + `npm run prettier:write` clean before each commit.
- `superpowers:requesting-code-review` on each implementation commit's diff
  against the prior commit (per CLAUDE.md). Skip for plan-only commits 1 & 8.
- Final pre-push: do NOT re-run `/pr-review-toolkit:review-pr` automatically;
  the user can decide. The user runs `git push` manually via VS Code.

## Out of scope

- M11 (`ConnectionStatus` union widening) — deferred to Phase 4 per the YAGNI
  triage above.
- Any new functionality. This batch is strictly review-fix.
- Component a11y batch (deferred to the planned a11y pass per memory).

## Critical files touched

- `astros_vue/src/components/mobileRemote/mobileRemote/AstrosMobileRemote.vue` (commits 2, 3, 4, 5, 7)
- `astros_vue/src/components/mobileRemote/mobileRemote/types.ts` (commits 5, 7)
- `astros_vue/src/components/mobileRemote/mobileRemote/AstrosMobileRemote.spec.ts` (commit 6, new)
- `astros_vue/src/composables/useHoldGesture.ts` (commit 2)
- `astros_vue/src/composables/__tests__/useSwipeGesture.spec.ts` (commit 7)
- `astros_vue/src/locales/enUS.json` (commit 2)
- `.docs/plans/20260521-1135-phase3-mobile-remote-component.md` (commit 8)
