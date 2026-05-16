# Firmware view — allow downgrades behind an opt-in toggle

## Problem

The firmware UI currently blocks downgrades entirely: when `compareTags(controller.current, target) > 0`, the per-controller checkbox is disabled (`AstrosFirmwareControllerRow.vue:45` via `isBlocked()`) and the Flash button is disabled at the panel level (`canFlash` folds in `!anyDowngradeBlocked` — `stores/firmware.ts:160-165`). There is no escape hatch.

The block is purely client-side. `firmware_flash_controller.ts` does no version-order check, `flash_orchestrator.ts` simply looks up the release by tag/version, and AstrOs.ESP doesn't reject older binaries — so a downgrade is mechanically possible, just not reachable through the UI.

Use case: dev/debug workflows where the operator deliberately wants to roll a controller back to an earlier release to reproduce a bug or test a regression.

## Approach (option b from the scoping discussion)

Hidden behind an opt-in toggle, with the existing red "DOWNGRADE" pill plus a confirm-modal acknowledgement as defence-in-depth.

The principle is **deliberate intent**: routine flashing must not let an operator accidentally downgrade. Enabling the toggle is the audit-trail moment ("the operator chose to allow this"); the per-controller red pill remains the visual signal; the modal checkbox is the last-chance confirmation.

## Design decisions (flag these if any are wrong)

1. **Toggle lives in the controllers-panel header, with contextual reveal.** Render the "Allow downgrades" toggle only when `target` is set AND at least one controller in the fleet would be downgraded by it. When everything is an upgrade (or there's no target yet), no toggle — keeps the routine path uncluttered. The operator sees the toggle exactly when frustrated by the disabled checkbox, in the same panel as the disabled checkbox. _Alternative considered: live in the source strip alongside the github/upload toggle — rejected because it's always-visible noise even for pure upgrade flows._
2. **Per-session only, not persisted.** The toggle is a Pinia ref on the firmware store; it resets to `false` on every page load. Persistence (localStorage) would defeat the "deliberate intent" framing — the operator should re-confirm each session.
3. **Modal ack appears only when at least one selected controller is a downgrade.** Pure upgrade flows are unchanged. For downgrade flows: a "I understand this will install an older firmware version on {N} controller(s)" checkbox is rendered above the actions; Confirm stays disabled until ticked.
4. **`isBlocked` splits.** Today it folds `status === 'down'` and `isDowngrade`. After this change: `isHardBlocked` = just `'down'` (always blocking); `isDowngrade` stays advisory. The row's checkbox `:disabled` switches to `isHardBlocked || (isDowngrade(id) && !allowDowngrade)`.
5. **No backend changes.** The policy is client-side; making the server also enforce "no downgrade" would just create a second place to keep in sync when this toggle exists.
6. **Uploaded firmware (`local-build` target) bypasses the gate as it does today.** `compareTags(c.current, 'local-build')` returns NaN → `cmp > 0` is false → never classified as downgrade. The toggle is moot for uploads. Worth a one-line comment in the store so a future reader doesn't try to "fix" this asymmetry.

## Tasks

- [x] **Store + state machine.** Add `allowDowngrade` ref to `stores/firmware.ts`. Split `isBlocked` into `isHardBlocked` (`status === 'down'`) and keep `isDowngrade` as advisory. Update `anyDowngradeBlocked` to gate on `!allowDowngrade.value`. Add `anyFleetDowngrade` computed (drives the panel's contextual toggle reveal). `canFlash` now: `target !== null && selectedControllerIds.size > 0 && !anyHardBlockedSelected && !anyDowngradeBlocked`. Export `allowDowngrade`, `anyDowngradeBlocked`, `anyFleetDowngrade`. Mutation-verified tests for each new branch. *(Note: the original plan called for an `anyDowngradeSelected` export that the modal would consume; during implementation we kept the modal prop-driven instead and the export was dropped in commit `b3359f7` as dead surface. See that commit's body for rationale.)*

- [x] **Controllers panel + row gating.** Update `AstrosFirmwareControllerRow.vue`'s `:disabled` to use the new hard/downgrade split, gated on the store's `allowDowngrade`. Add the contextual-reveal "Allow downgrades" toggle to `AstrosFirmwareControllersPanel.vue`'s header — render only when `target !== null && anyFleetDowngrade` (new computed in the panel that checks if any *visible* controller would be downgraded). Add i18n strings: `firmware_view.controllers.allow_downgrade_toggle_label`, `firmware_view.controllers.allow_downgrade_toggle_help` (tooltip / aria-describedby). Toggle is a labeled checkbox or daisyUI toggle component — matches existing panel idiom.

- [x] **Confirm modal ack.** Add a "downgrade acknowledgement" region to `AstrosFirmwareConfirmModal.vue` between the power-warning `<p>` and the actions row. Region renders only when the modal is opened with at least one downgrading controller (compute locally via `selectedControllers.some(c => compareTags(c.current, target) > 0)` — keeps the modal self-contained). New i18n string `firmware_view.confirm_modal.downgrade_ack_label` with a count interpolation. The Confirm button's `:disabled` gates on the ack ref; reset to false each time the modal opens.

- [x] **Tests.** Store: `canFlash` allows downgrades when `allowDowngrade=true`, blocks when false. Row: `:disabled` follows the split correctly across `(status, isDowngrade, allowDowngrade)` combos. Panel header: toggle only renders when at least one controller would downgrade. Modal: ack appears only on downgrade flows; Confirm stays disabled until ticked; opening the modal twice resets ack to false. Mutation-test: revert the `!allowDowngrade.value` clause in `anyDowngradeBlocked` and verify the gating test fails — catches vacuous assertions per `feedback_mutation_test_defensive_features` memory.

- [x] **QA plan + pre-commit + pre-push review.** Add `.docs/qa/firmware-allow-downgrade.md` covering: pure-upgrade flow (no toggle visible, no modal ack), downgrade attempt without toggle (checkboxes disabled, tooltip explains), enabling toggle (checkboxes become selectable, red pills still visible), confirm-modal ack required, ack-reset on close+reopen, page reload resets toggle, uploaded firmware ignores toggle. Pre-commit per CLAUDE.md: prettier + eslint + build + vitest + code-reviewer subagent. Before push: `/pr-review-toolkit:review-pr` whole-branch sweep per `feedback_pr_review_toolkit_before_push` memory.

## Files touched

- `astros_vue/src/stores/firmware.ts` — `allowDowngrade` ref, `isHardBlocked` split, updated computeds
- `astros_vue/src/stores/__tests__/firmware.spec.ts` — gating tests
- `astros_vue/src/components/firmware/firmwareControllerRow/AstrosFirmwareControllerRow.vue` — disabled gating
- `astros_vue/src/components/firmware/firmwareControllersPanel/AstrosFirmwareControllersPanel.vue` — header toggle
- `astros_vue/src/components/firmware/firmwareControllersPanel/__tests__/AstrosFirmwareControllersPanel.spec.ts` — toggle visibility + interaction
- `astros_vue/src/components/firmware/firmwareConfirmModal/AstrosFirmwareConfirmModal.vue` — ack region + Confirm gate
- `astros_vue/src/components/firmware/firmwareConfirmModal/AstrosFirmwareConfirmModal.stories.ts` — add a Downgrade story variant
- `astros_vue/src/locales/enUS.json` — three new keys
- `.docs/qa/firmware-allow-downgrade.md` — manual QA plan

## Out of scope

- **Auth/role-gating the toggle.** No tiered-user model exists today; revisit if/when one is added.
- **Audit logging of downgrade flashes.** Worth doing once a logging surface exists, but the per-session toggle plus modal ack is already a deliberate-action audit trail in the operator's workflow.
- **Server-side downgrade rejection toggle (e.g., an env var to disable downgrades fleet-wide).** Same reasoning as the design-decision note above: one source of truth.
- **Persisting toggle state across sessions.** Deliberate omission per design decision (2).
- **Refactoring `compareTags` / `compareVersions` to share code.** They serve different purposes (pre-release-aware vs not); the two-function shape is correct.
