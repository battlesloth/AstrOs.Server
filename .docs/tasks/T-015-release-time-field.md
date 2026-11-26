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
- **The refused save names its channels as data (Jeff, 2026-11-26).** The 400 from `PUT /api/locations/` (T-013: `{ message: 'invalid_release_ms', problems: string[] }`) gains an additive `invalid` array:
  - one entry per problem, in the same order as `problems`;
  - each entry is `{ location, moduleId, boardId, channelId, channelNumber, value }`;
  - `location` is the location's name (`'body'`, `'core'` or `'dome'`, as the WebSocket messages use it);
  - the other fields come from the request:
    - `moduleId` ← the UART module's `id`
    - `boardId` ← the board's `boardId` (its number, as `problems` names it; not the board's `id`)
    - `channelId` ← the channel's `id`
    - `channelNumber` ← the channel's `channelNumber`
    - `value` ← the channel's `releaseMs`
  - each is copied only when it is a JSON primitive (string, number, boolean or `null`). Anything else is left out, as a field the request lacked is. A deeply nested value would make `res.json` throw, turning the refusal into a 500.
  - `problems` and `message` are unchanged.
  - The Vue side shows its message from `invalid` (finding the channel by `channelId`) and never parses `problems`.
- **i18n:** keys under the servo settings' existing key group, one each for the label, the help text and the range error. The label is "Release after (s)"; the help text says the servo stays powered at least this long after each move, and slower moves stay on for their travel time. Final wording is the builder's.

## Task

- **The field:** add it to `components/modules/shared/AstrosServoSettings.vue`, which is used only by the Maestro channel (`AstrosMaestroChannel.vue`). Bind it through the same emit path as min, max and home.
- **Accessibility:** a `<label for>` matched to the input's `id`; the help text linked with `aria-describedby`; the range error with `role="alert"`.
- **Storybook:** update `AstrosServoSettings.stories.ts` with a default (5.0) story and an actuator (15.0) story.
- **Spec file:** `components/modules/shared/__tests__/AstrosServoSettings.spec.ts`.
- **From the T-013 reviews (2026-11-26):**
  - **The refused save.** `stores/location.ts` `saveLocationsToApi` keeps only the axios message, so a 400 `invalid_release_ms` shows as "Request failed with status code 400". Add `invalid` to the API's 400 as the Contract pins it (built where `findInvalidReleaseMs` builds `problems`, and sent by `saveLocations`, with API tests), and show an i18n message from it that names the channel. A stored value outside the range (set by SQL before this task) loads into the model, and the page sends it back, so every save of every location answers 400 until it is fixed. That includes a digital or disabled channel, where the field is hidden. Give the operator a way out.
  - **The components' local channel types.** `AstrosMaestroChannel.vue` (`MaestroChannel`) and `AstrosMaestroModule.vue` (`MaestroChannelType`, `MaestroBoard`, `MaestroModule`) declare their own interfaces without `releaseMs`. Replace them with `import type { … } from '@/models'`, not by adding the field to the copies. The server stores 5000 for a channel saved without the field, so a rebuild that drops it would reset a custom value with no error: today the type select spreads the channel and the other fields are edited in place.
  - **A component test that an edit keeps `releaseMs`:** e.g. switching a channel's type keeps `releaseMs: 15000`.
- **QA plan:** add the UI cases to `.docs/qa/maestro-channel-release.md` (created by T-013 with the API-level cases), and update its API cases 9–10 to expect `invalid` (its fields and order):
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
- [ ] The API's 400 carries `invalid`, one entry per problem in the same order, with each field from its pinned source (API tests, including an entry whose channel lacks `channelNumber`, and a deeply nested `releaseMs` that still answers 400 with its entry's `value` left out).
- [ ] A refused save (`invalid_release_ms`) shows a message naming the channel, built from `invalid`, and a stored out-of-range value on a channel whose field is hidden can still be fixed from the page.
- [ ] The Maestro components use the model types, and a spec shows that editing a channel keeps its `releaseMs`.
- [ ] Both stories render.
- [ ] The QA plan's UI cases are added.
- [ ] QA walk with Jeff.

## Out of scope

- API validation rules (T-013); this task only adds `invalid` to the refusal.
- The wire format and the gate (T-014).
- Release settings for PCA9685 channels (non-goal).

## Verification

- `cd astros_api && npx vitest run`; `npm run prettier:write && npm run lint:fix`; `npm run build`.
- `cd astros_vue && npx vitest run`; `npm run format && npm run lint`; `npm run build`.
- `npm run storybook`: both stories render.
- Bench with Jeff on the Modules page: set Right Pan to 15.0 and save, then sync and run a script move. The master logs `Turning off servo 1` ~15 s after the move; a channel left at 5.0 still releases at ~5 s.

## Implementation checklist

<!-- Added when work starts. -->
