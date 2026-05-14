# d.7 — Lock-aware UI: rest-of-app coverage

## Context

Final slice of phase **d** (umbrella: `./20260507-2153-firmware-ota-d-vue-firmware-view.md`; decomposition: `./20260427-2202-firmware-ota-decomposition.md`). Closes the cross-cutting lock-awareness gap left after d.6 (live wiring).

d.6 already shipped most of the lock-aware UX:

- `AstrosLockStateBanner.vue` mounted in `AstrosLayout.vue` — visible on every route except the firmware view itself (`firmwareStore.isOwnJob` suppresses double-up).
- `AstrosWriteButton.vue` ORs `jobLockStore.locked` into its disabled state and surfaces the `firmware_view.lock_active` tooltip.
- `AstrosWriteButton` adopted by `ScripterView`, `ScriptsView`, `PlaylistsView`, `ModulesView`, `UtilityView`, `AstrosRemoteControl`, `AstrosPlaylistEditor`.
- i18n keys `firmware_view.lock_active` / `lock_banner` / `lock_conflict` in `enUS.json`.

d.7 closes the remaining cross-cutting gaps:

1. **Modal save/apply/confirm buttons still bypass the lock.** Audited (`astros_vue/src/components/modals/**`): ~16 modal files use raw `<button>` for their primary submit action. Server-side write-guard returns 423 if the user manages to fire one during a flash, but the UI doesn't tell them the action is disabled until they click. Convert primary actions in modals that issue writes (HTTP or WS) to `AstrosWriteButton`. Cancel/Close stays raw.
2. **Banner stacking against `AstrosSystemStatusBanner`.** d.6 decided readonly takes precedence over lock (broader condition wins), but the current `AstrosLockStateBanner` only checks `firmwareStore.isOwnJob` — it'll render alongside the readonly banner. Add the precedence rule.
3. **Banner has no tests or Storybook story.** d.6 absorbed the component into the layout but skipped the per-component test surface other primitives in `components/common/` have.
4. **No "Go to Firmware" affordance.** When the banner shows on Scripter/Modules/etc., operators have to navigate manually to monitor progress. A small `<router-link to="/firmware">` chip inside the banner closes that.

## Scope guard

- Task count: 5 tasks (within light-plan ceiling).
- Layers: 1 substantive (Vue components/stores) + tests/Storybook.
- No FMI required — no concurrency, no crash recovery, no filesystem or network state in this PR. Lock state itself is already covered by `jobLockStore` tests from c0.

## Tasks

- [x] **Banner precedence + CTA.** Update `AstrosLockStateBanner.vue` so `visible` also requires `!systemStatusStore.readOnly` (readonly banner wins). Add a `<router-link to="/firmware">` styled as a small inline link inside the alert, copy from new i18n key `firmware_view.lock_banner_cta` ("View progress"). Suppress the link when the current route is already `/firmware` (defensive — `isOwnJob` should cover this, but the route check makes the component robust if `isOwnJob` ever returns false during a still-active job, e.g. heartbeat-resolved job that the firmware store has cleared).
- [x] **Banner tests + story.** Extended existing `AstrosLockStateBanner.spec.ts` (3 → 6 tests) covering readonly precedence + CTA href/copy + route-aware CTA suppression. Added `AstrosLockStateBanner.stories.ts` with Visible / HiddenIdle / HiddenOwnJob / HiddenReadonly stories driven by Pinia + an in-memory router installed in `.storybook/preview.ts` (replaces the original RouterLink-only stub idea since `useRoute()` requires a real router instance).
- [ ] **Modal write-action audit + conversion.** Convert the primary submit button in each modal that issues a write to `AstrosWriteButton`. Cancel/Close stays raw. Scope per audit:
  - Convert: `AstrosServoTestModal` (Run), `AstrosAddModuleModal` (Add), `AstrosAddChannelModal` (Add), `AstrosChannelSwapModal` (Swap), `AstrosScriptTestModal` (Run), `AstrosServoEventModal` / `AstrosGpioEventModal` / `AstrosI2cEventModal` / `AstrosKangarooEventModal` / `AstrosUartEventModal` / `AstrosHumanCyborgModal` (Save for each event editor), `AstrosConfirmModal` (Confirm — generic, so this single change covers every confirm-style flow). Inspect each before converting to verify the primary button actually triggers an API/WS write; skip any whose action is purely client-side state (e.g., pure form-validation submit that emits an event consumed by the parent — the parent's downstream write button will handle the lock).
  - Do not convert: `AstrosAlertModal`, `AstrosLoadingModal`, `AstrosHtmlModal`, `AstrosInterruptModal` (no writes), and Cancel buttons everywhere.
  - For each converted button, add `data-testid="lock-aware-submit"` so the existing test files can assert `disabled` propagation under lock without coupling to text content.
- [ ] **Tests for modal lock-awareness.** Pick three representative modals (one per category — `AstrosServoTestModal` for direct WS write, `AstrosAddModuleModal` for HTTP write, `AstrosConfirmModal` for generic) and add a `locked-disables-primary-action` test that sets `jobLockStore.locked = true` and asserts the primary button is `disabled`. Skip exhaustive coverage; `AstrosWriteButton.spec.ts` already proves the primitive, these tests only verify adoption.
- [ ] **Pre-commit + pre-push.** `npm run prettier:write` → `npm run lint:fix` → `npm run build` → `npx vitest run` → `superpowers:requesting-code-review` on the diff against the prior commit, before each implementation commit. Before push: `/pr-review-toolkit:review-pr` on full diff vs `develop`.

## Acceptance criteria

- `AstrosLockStateBanner` hidden when (a) unlocked, (b) own-job, (c) system readonly. Visible only when locked AND not own-job AND not readonly.
- Banner shows a "View progress" link on every route except `/firmware`; clicking navigates to `/firmware`.
- Storybook renders all four banner states without console errors or warnings.
- Audited modals: primary submit button is disabled with the `firmware_view.lock_active` tooltip when `jobLockStore.locked === true`. Cancel/Close stays enabled (operator can always escape a modal during a flash).
- No console errors / warnings in dev or in any new Storybook story.
- A11y: banner keeps `role="status"` + `aria-live="polite"` (do NOT escalate to `alert` — see d.6 architectural note); CTA link has an accessible name from i18n; modal submit buttons inherit `AstrosWriteButton`'s tooltip semantics.
- Lighthouse a11y ≥ 95 on `/scripts` (representative non-firmware page) with lock active.

## Out of scope (deliberately deferred or already shipped)

- Layout banner itself — shipped in d.6.
- `AstrosWriteButton` primitive — shipped in c0/d.6.
- Lock-aware behavior on the firmware view — shipped in d.6 (in-page `role="alert"` region).
- Full e2e Playwright coverage of every modal under lock — `C_01_firmware-page.spec.ts` already covers banner suppression on the firmware view; representative unit tests cover modal adoption. A full operator-flow e2e for every write surface is deferred to the integrated `qa` phase per the umbrella.
- Hot-key / keyboard-shortcut paths that bypass buttons — none currently exist in the codebase (verified during d.7 audit); document the absence so future shortcut work knows to check lock state.
- Banner i18n into non-English locales — `enUS.json` is the source of truth per CLAUDE.md; locale parity is a separate cross-cutting task.

## Files touched

**New:**

- `astros_vue/src/components/common/lockStateBanner/AstrosLockStateBanner.spec.ts`
- `astros_vue/src/components/common/lockStateBanner/AstrosLockStateBanner.stories.ts`

**Modified:**

- `astros_vue/src/components/common/lockStateBanner/AstrosLockStateBanner.vue` (readonly precedence + CTA link)
- `astros_vue/src/locales/enUS.json` (new key `firmware_view.lock_banner_cta`)
- Modal files per audit (primary-button conversions; see Tasks §3).
- 3 modal `*.spec.ts` files (lock-awareness tests).

## Risk + reviewer notes

- **Audit completeness is the real risk, not any single conversion.** The reviewer should grep for raw `<button` inside `astros_vue/src/components/modals/` after this PR and confirm every remaining instance is Cancel/Close or non-write. Frame the review prompt as "find modals that still issue writes through raw buttons" rather than "verify these conversions are correct."
- **System-status banner stacking.** Manually test with `systemStatus.readOnly = true` + `jobLock.locked = true` simultaneously to confirm only the readonly banner shows.
- **Late-clear race.** If the firmware store clears `currentJob` before `jobLockStore.locked` flips false (heartbeat path), `isOwnJob` returns false and the banner would briefly show on the firmware view. The route-check guard in §1 covers this; reviewer should confirm.
