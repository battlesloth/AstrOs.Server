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
- **The refused save (T-013's Contract, amended by Jeff 2026-11-27).** The 400 from `PUT /api/locations/` is `{ message: 'invalid_release_ms', problems: ReleaseMsProblemEntry[] }`. Each entry is `{ code, location, moduleIndex, boardIndex, channelIndex }`:
  - `code` is `RELEASE_MS_NOT_INTEGER` or `RELEASE_MS_OUT_OF_RANGE`;
  - the indexes are the channel's positions in the collection the page sent.
  - This task changes nothing in the API. The Vue side mirrors the `ReleaseMsProblem` enum (keep it in sync with the API's, as `constants/maestro.ts` does), finds each channel by its positions in the collection it sent, and shows one i18n message per code. Nothing from the request comes back to parse. (This replaces an `invalid` list pinned here on 2026-11-26.)
- **i18n:** keys under the servo settings' existing key group, one each for the label, the help text and the range error. The label is "Release after (s)"; the help text says the servo stays powered at least this long after each move, and slower moves stay on for their travel time. Final wording is the builder's.

## Task

- **The field:** add it to `components/modules/shared/AstrosServoSettings.vue`, which is used only by the Maestro channel (`AstrosMaestroChannel.vue`). Bind it through the same emit path as min, max and home.
- **Accessibility:** a `<label for>` matched to the input's `id`; the help text linked with `aria-describedby`; the range error with `role="alert"`.
- **Storybook:** update `AstrosServoSettings.stories.ts` with a default (5.0) story and an actuator (15.0) story.
- **Spec file:** `components/modules/shared/__tests__/AstrosServoSettings.spec.ts`.
- **From the T-013 reviews (2026-11-26):**
  - **The refused save.** `stores/location.ts` `saveLocationsToApi` keeps only the axios message, so a 400 `invalid_release_ms` shows as "Request failed with status code 400". Show an i18n message for each problem in the 400 (its code, and the channel found by its positions), not the axios message. A stored value outside the range (set by SQL before this task) loads into the model, and the page sends it back, so every save of every location answers 400 until it is fixed. That includes a digital or disabled channel, where the field is hidden. Give the operator a way out.
  - **The components' local channel types.** `AstrosMaestroChannel.vue` (`MaestroChannel`) and `AstrosMaestroModule.vue` (`MaestroChannelType`, `MaestroBoard`, `MaestroModule`) declare their own interfaces without `releaseMs`. Replace them with `import type { … } from '@/models'`, not by adding the field to the copies. The server stores 5000 for a channel saved without the field, so a rebuild that drops it would reset a custom value with no error: today the type select spreads the channel and the other fields are edited in place.
  - **A component test that an edit keeps `releaseMs`:** e.g. switching a channel's type keeps `releaseMs: 15000`.
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
- [ ] The Vue mirror of `ReleaseMsProblem` matches the API's (a spec reading the API source, as `constants/__tests__/maestro.spec.ts` does).
- [ ] A refused save (`invalid_release_ms`) shows a message per code naming the channel found by its positions, and a stored out-of-range value on a channel whose field is hidden can still be fixed from the page.
- [ ] The Maestro components use the model types, and a spec shows that editing a channel keeps its `releaseMs`.
- [ ] Both stories render.
- [ ] The QA plan's UI cases are added.
- [ ] QA walk with Jeff.

## Out of scope

- API validation and the refusal's shape (T-013).
- The wire format and the gate (T-014).
- Release settings for PCA9685 channels (non-goal).

## Verification

- `cd astros_vue && npx vitest run`; `npm run format && npm run lint`; `npm run build`.
- `npm run storybook`: both stories render.
- Bench with Jeff on the Modules page: set Right Pan to 15.0 and save, then sync and run a script move. The master logs `Turning off servo 1` ~15 s after the move; a channel left at 5.0 still releases at ~5 s.

## Implementation checklist

<!-- Added when work starts. -->
