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
- [x] **Banner tests + story.** Extended existing `AstrosLockStateBanner.spec.ts` (3 → 7 tests) covering readonly precedence + CTA href/copy + /firmware-route suppression + reactive route-flip (catches snapshot-vs-reactive refactors). Added `AstrosLockStateBanner.stories.ts` with Visible / HiddenIdle / HiddenOwnJob / HiddenReadonly stories driven by Pinia + an in-memory router installed in `.storybook/preview.ts` (replaces the original RouterLink-only stub idea since `useRoute()` requires a real router instance).
- [x] **Modal write-action audit + conversion.** Convert the primary submit button in each modal that issues a write to `AstrosWriteButton`. Cancel/Close stays raw. Final scope after audit:
  - **Converted (genuine write surfaces):**
    - `AstrosServoTestModal` — Enable Test button (direct WS `SERVO_TEST` send via `wsSendMessage`). Replaced d.6's hand-rolled inline `:disabled`/`:title` with the primitive; the `writesBlocked` computed + watcher stay because they still gate the slider, the auto-disable, and the `lock-active-notice` region.
    - `AstrosScriptTestModal` — Run button (`scriptStore.runScript` → `apiService.get(SCRIPTS_RUN)`).
    - `AstrosConfirmModal` — generic Confirm. Today's callers (`ModulesView.handleRemoveModule`, ScripterView/PlaylistEditor confirms) update local Pinia only, so this conversion is forward-looking — but ConfirmModal is the canonical "are you sure you want to do this dangerous thing" primitive, and disabling Confirm-during-flash with Close still available is the right default for the next caller that DOES wrap a real write.
  - **Audited and NOT converted (parent-save-button gates the real write):**
    - `AstrosAddModuleModal` — emits `add` → `ModulesView.handleAddModule` → `useModuleManagement.addModule` → pushes to local `location.uartModules`. The actual API write happens at ModulesView's "Save Module Settings" button, which is already `AstrosWriteButton`-wrapped from d.6.
    - `AstrosAddChannelModal`, `AstrosChannelSwapModal`, and all 6 event-editor modals (`AstrosServoEventModal`, `AstrosGpioEventModal`, `AstrosI2cEventModal`, `AstrosKangarooEventModal`, `AstrosUartEventModal`, `AstrosHumanCyborgModal`) — Save/Add/Confirm/Remove emit events that `ScripterView` handles by mutating `scripterStore` locally. The actual API write is `scripterStore.saveScript()` (called from ScripterView's "Save Script" button), already `AstrosWriteButton`-wrapped from d.6. Per the plan's own scoping rule ("skip any whose action is purely client-side state — the parent's downstream write button will handle the lock"), these stay as raw `<button>`. Users can still draft / edit / queue changes during a flash and persist after; only the actual `Save Script` (or `Save Module Settings`) write is lock-gated, which is the correct UX.
  - **Out of scope (no writes at all):** `AstrosAlertModal`, `AstrosLoadingModal`, `AstrosHtmlModal`, `AstrosInterruptModal`, and Cancel/Close buttons everywhere.
  - **Testid handling:** kept each modal's existing `data-testid` (e.g., `modal-confirm`, `enable-test-button`, `run-button`). The original plan suggested a uniform `lock-aware-submit` testid, but downstream tests already pin the original IDs and `AstrosWriteButton` forwards `data-testid` to its inner `<button>` unchanged.
  - **Audit history:** initial pass over-converted 8 scripter modals + AddModuleModal — the code-reviewer subagent caught that those buttons emit-to-parent only, and the d.6-shipped parent Save buttons already enforce the lock at the real write site. Reverted before push. Lesson captured in the plan rule: trace `@click` to its terminal API/WS call before converting; don't infer "feels write-class" from button text.
- [x] **Tests for modal lock-awareness.** Picked 3 modals per the plan: `AstrosServoTestModal` (direct WS write — 6 existing tests from d.6 cover the lock-aware contract; conversion left them all green), `AstrosConfirmModal` (generic — 4 new tests including click-suppression-under-lock + cancel-stays-enabled-and-still-fires), `AstrosAddModuleModal` (was over-converted, then audit revealed it's a local-state modal — spec rewritten to cover form-validation only; the upstream "Save Module Settings" button is the real lock-gated write surface). Plus extended `AstrosLockStateBanner.spec.ts` from 3 → 7 tests covering precedence, CTA, /firmware-route suppression, and reactive route navigation.
- [x] **Pre-commit + pre-push.** Per-commit: `npm run format` → `npm run lint` → `npm run build` → `npx vitest run` → `superpowers:requesting-code-review` on each implementation commit. Pre-push: `/pr-review-toolkit:review-pr` run twice (first pass surfaced the banner-on-/firmware contradiction + several drift issues, all addressed in commit `9275112`; second pass verified fixes and surfaced two HIGH out-of-scope items — see "Out of scope follow-ups" below).

## Acceptance criteria

- `AstrosLockStateBanner` hidden when (a) unlocked, (b) own-job, (c) system readonly. Visible only when locked AND not own-job AND not readonly.
- Banner shows a "View progress" link on every route except `/firmware`; clicking navigates to `/firmware`.
- Storybook renders all four banner states without console errors or warnings.
- Audited modals: primary submit button is disabled with the `firmware_view.lock_active` tooltip when `jobLockStore.locked === true`. Cancel/Close stays enabled (operator can always escape a modal during a flash).
- No console errors / warnings in dev or in any new Storybook story.
- A11y: banner keeps `role="status"` + `aria-live="polite"` (do NOT escalate to `alert` — see d.6 architectural note); CTA link has an accessible name from i18n; modal submit buttons inherit `AstrosWriteButton`'s tooltip semantics.
- Lighthouse a11y ≥ 95 on `/scripts` (representative non-firmware page) with lock active.

## Out of scope follow-ups (surfaced by pre-push toolkit, file as separate work)

- **jobLock HTTP hydrate (HIGH)** — `astros_vue/src/stores/jobLock.ts` is populated only by WS `lockStateChanged` messages. `astros_vue/src/App.vue:onMounted` does a belt-and-braces HTTP hydrate for `systemStatusStore` but not for `jobLockStore`. A user deep-linking to `/firmware` during a foreign flash sees the source strip interactive until the WS handshake completes — they can click "Push Firmware" and only learn writes are blocked via the server's 423 response. Add a `GET /api/firmware/lock-state` endpoint and mirror the systemStatus hydrate pattern. Mostly server-side work + a one-liner in App.vue.
- **`AstrosConfirmModal` consumer wiring bug (HIGH)** — `ModulesView.vue:436-441` and `ScripterView.vue:422-425` use Vue event syntax (`@confirm="..."` / `@close="..."`) against `AstrosConfirmModal`'s function-prop API (`onConfirm: () => void`). The fallthrough listeners attach to the underlying `<dialog>` and never fire — confirms in those views are no-ops today. Only `AstrosPlaylistEditor.vue:398-399` uses the correct `:on-confirm` / `:on-close` binding. Pre-existing; the d.7 lock-aware tests for ConfirmModal pass `onConfirm` as a prop correctly, so the tests are sound — but they give false confidence for the two view consumers. Fix is small (swap event syntax for prop binding in 2 places) but needs QA pass for each affected confirm flow. **Ordering constraint**: this fix must land BEFORE any new `AstrosConfirmModal` caller wraps a real write — otherwise the lock-aware Confirm button silently won't fire even when unlocked, masking the d.7 lock-gating intent at the new call site.
- **`AstrosServoTestModal` slider lacks readonly check (MINOR)** — pre-existing from d.6. `writesBlocked = jobLockLocked.value` doesn't include `systemStatusStore.readOnly`. The Enable Test button itself disables correctly (AstrosWriteButton ORs both), but the slider + handler-body early-returns only check the job lock. If readonly flips on with the modal open and the test active, the slider keeps firing SERVO_TEST WS messages until the next Enable toggle.

## Out of scope (deliberately deferred or already shipped)

- Layout banner itself — shipped in d.6.
- `AstrosWriteButton` primitive — shipped in c0/d.6.
- Lock-aware behavior on the firmware view — shipped in d.6 (in-page `role="alert"` region).
- Full e2e Playwright coverage of every modal under lock — `C_01_firmware-page.spec.ts` already covers banner suppression on the firmware view; representative unit tests cover modal adoption. A full operator-flow e2e for every write surface is deferred to the integrated `qa` phase per the umbrella.
- Hot-key / keyboard-shortcut paths that bypass buttons — none currently exist in the codebase (verified during d.7 audit); document the absence so future shortcut work knows to check lock state.
- Banner i18n into non-English locales — `enUS.json` is the source of truth per CLAUDE.md; locale parity is a separate cross-cutting task.

## Files touched

**New:**

- `astros_vue/src/components/common/lockStateBanner/AstrosLockStateBanner.stories.ts`
- `astros_vue/src/components/modals/__tests__/AstrosConfirmModal.spec.ts`
- `astros_vue/src/components/modals/modules/__tests__/AstrosAddModuleModal.spec.ts` (form-validation only — see Task 3 audit history)

**Modified:**

- `astros_vue/src/components/common/lockStateBanner/AstrosLockStateBanner.vue` (readonly precedence + CTA link + /firmware-route suppression)
- `astros_vue/src/components/common/__tests__/AstrosLockStateBanner.spec.ts` (extended 3 → 7 tests)
- `astros_vue/.storybook/preview.ts` (in-memory vue-router for stories that touch `useRoute()` or `<RouterLink>`)
- `astros_vue/src/locales/enUS.json` (new key `firmware_view.lock_banner_cta`)
- `astros_vue/src/components/modals/AstrosConfirmModal.vue` (Confirm → AstrosWriteButton)
- `astros_vue/src/components/modals/modules/AstrosServoTestModal.vue` (Enable Test refactored to use AstrosWriteButton; writesBlocked retained for slider + handler-body guards)
- `astros_vue/src/components/modals/scripter/AstrosScriptTestModal.vue` (Run → AstrosWriteButton)

## Risk + reviewer notes

- **Audit completeness is the real risk, not any single conversion.** The reviewer should grep for raw `<button` inside `astros_vue/src/components/modals/` after this PR and confirm every remaining instance is Cancel/Close or non-write. Frame the review prompt as "find modals that still issue writes through raw buttons" rather than "verify these conversions are correct."
- **System-status banner stacking.** Manually test with `systemStatus.readOnly = true` + `jobLock.locked = true` simultaneously to confirm only the readonly banner shows.
- **Late-clear race.** If the firmware store clears `currentJob` before `jobLockStore.locked` flips false (heartbeat path), `isOwnJob` returns false and the banner would briefly show on the firmware view. The route-check guard in §1 covers this; reviewer should confirm.
