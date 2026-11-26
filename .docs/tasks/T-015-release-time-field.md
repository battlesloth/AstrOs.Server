# T-015: Edit a Maestro servo channel's release time

<!-- File: .docs/tasks/T-015-release-time-field.md. Branch: feature/T-015-release-time-field. PR title: "T-015: Edit a Maestro servo channel's release time". -->

## Context

- **Spec:** `.docs/specs/20261122-0847-per-channel-servo-release-design.md` § The setting, § UI.
- **Project:** PLAN.md § Per-channel servo release time.
- **What exists before this task:** T-013 stores `releaseMs` per channel and round-trips it through the Vue model. T-014 sends it to the controllers. Until this task, it can only be changed by SQL.
- **Why the setting exists:** a linear actuator needs to stay powered longer than the 5 s default to finish its stroke.
- **Needs:** T-013. It can merge before or after T-014.

## Contract (pinned — do not change)

- **Storage:** `releaseMs` stays whole ms on the model. The UI shows and edits seconds with one decimal.
- **Conversion:** save `releaseMs = Math.round(seconds × 1000)`; display `releaseMs / 1000` with one decimal.
- **Range:** 1.0–120.0 s, step 0.1, from `astros_vue/src/constants/maestro.ts` (`RELEASE_MS_MIN` / `RELEASE_MS_MAX`, T-013). Default 5.0.
- **Servo channels only:** the field shows only when the channel is a servo (`isServo`). Switching a channel to digital hides it and **keeps** the stored value.
- **Out-of-range values:** a value outside the range is never written to the model. The form shows its existing error style; the API's 400 (T-013) is only the backstop.
- **i18n:** keys under the servo settings' existing key group, one each for the label, the help text and the range error. The label is "Release after (s)"; the help text says the servo stays powered at least this long after each move, and slower moves stay on for their travel time. Final wording is the builder's.

## Task

- **The field:** add it to `components/modules/shared/AstrosServoSettings.vue`, which is used only by the Maestro channel (`AstrosMaestroChannel.vue`). Bind it through the same emit path as min, max and home.
- **Accessibility:** a `<label for>` matched to the input's `id`; the help text linked with `aria-describedby`; the range error with `role="alert"`.
- **Storybook:** update `AstrosServoSettings.stories.ts` with a default (5.0) story and an actuator (15.0) story.
- **Spec file:** `components/modules/shared/__tests__/AstrosServoSettings.spec.ts`.
- **QA plan:** add the UI cases to `.docs/qa/maestro-channel-release.md` (created by T-013 with the API-level cases):
  - preconditions: T-013 + T-014, firmware with ESP T-010
  - cases:
    - the field shows on a servo channel and hides on a digital one
    - 15.0 saves, and after a sync the board releases ~15 s after a move (`Turning off servo` on the master console)
    - 0.9 and 120.1 are refused in the form
    - a digital → servo switch shows the kept value
    - a page reload shows the saved value

## Acceptance criteria

- [ ] The spec covers:
  - hidden for `isServo: false`, shown for `true`
  - typing 7.5 emits `releaseMs: 7500`
  - typing 1.25 emits 1250
  - 0.9 and 120.1 emit nothing and show the error
  - loading `releaseMs: 15000` shows 15.0
- [ ] Mutation check: drop the range guard and see the 0.9 test fail.
- [ ] Both stories render.
- [ ] The QA plan's UI cases are added.
- [ ] QA walk with Jeff.

## Out of scope

- API validation (T-013).
- The wire format and the gate (T-014).
- Release settings for PCA9685 channels (non-goal).

## Verification

- `cd astros_vue && npx vitest run`; `npm run format && npm run lint`; `npm run build`.
- `npm run storybook`: both stories render.
- Bench with Jeff on the Modules page: set Right Pan to 15.0 and save, then sync and run a script move. The master logs `Turning off servo 1` ~15 s after the move; a channel left at 5.0 still releases at ~5 s.

## Implementation checklist

<!-- Added when work starts. -->
