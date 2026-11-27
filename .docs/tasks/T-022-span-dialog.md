# T-022: Random mode in the servo and GPIO event dialogs

<!-- File: .docs/tasks/T-022-span-dialog.md. Branch: feature/T-022-span-dialog. PR title: "T-022: Random mode in the servo and GPIO event dialogs". -->

## Context

- **Spec:** `.docs/specs/20261022-0748-random-span-events-design.md` § Scripter / Dialog, plus § Behavior / Validation.
- **Project:** PLAN.md § Random span events, Phase B. Needs T-021 (span rules).
- **What exists today:**
  - The data model: `ScriptEvent.endTime`, and the `RandomGpioEvent` and `RandomMaestroEvent` payloads (T-007).
  - The API converts spans (T-008) and validates them (T-009).
  - Nothing in the scripter creates a span yet, so spans exist only as SQL inserts.

## Contract (pinned — do not change)

- **The switch.** `AstrosServoEventModal.vue` (Maestro servo channels) and `AstrosGpioEventModal.vue` (ESP GPIO and Maestro digital channels) gain a **Single / Random** switch at the top.
  - Single is today's form, unchanged.
  - The dialog opens as it does today: a click on an empty spot of the lane.
  - An existing span opens in Random mode.
- **Random defaults** (confirmed by Jeff, 2026-11-27):
  - start is the clicked time, and end is `defaultSpanEnd(…)` (T-021);
  - the gaps are the kind's floor to 1.0 s;
  - for servos: position 0–100, min move 10, max move blank, and speed and acceleration 0.
  - If `defaultSpanEnd` returns `null`, the switch shows an inline error and Random can't be chosen.
- **Switching an existing event's mode** keeps its start. Random → Single drops `endTime` and the random parameters.
- **Fields:**
  - Start and End, in seconds on the 0.1 s grid;
  - Min and Max time between changes, in seconds with 0.01 s steps;
  - servo only: Min and Max position (%), Min move (%), Max move (%, labelled optional), Speed and Acceleration (0–255).
- **What Save emits** is an event with `endTime` set and this payload:
  - GPIO: `RandomGpioEvent { minGapMs, maxGapMs }`;
  - servo: `RandomMaestroEvent { channel, isServo: true, minGapMs, maxGapMs, minPos, maxPos, minMove, maxMove: number | null, speed, acceleration }`;
  - Maestro digital: `RandomMaestroEvent` with `isServo: false`, the gaps, and the other fields at 0 / `null`.
  - Gaps are converted with `Math.round(s × 1000)`. A blank max move is `null`, never 0.
- **Validation:** `validateSpan` (T-021) runs on every input. Each `SpanFieldError` shows inline under its field, and Save stays disabled while there are any.
- **The hint line:** "About N–M moves over T s" for servos and "About N–M changes over T s" for GPIO, from `spanHintRange`. A servo whose speed or acceleration is non-zero adds "fewer if the servo is slow".
- **i18n:** every string comes from `enUS.json`, under `modals.servo_event.*` and `modals.gpio_event.*`, with one key per `SpanFieldError`. No new copy repeats the hardcoded "Event time cannot be larger than…" text.
- **a11y:**
  - every input has a `<label for>`;
  - the switch is a labelled radio group or toggle;
  - errors use `role="alert"`;
  - focus moves to the first Random field when the mode changes.

## Task

- **Both dialogs:** the switch, the fields, validation, the hint, and emitting the payload as pinned. A shared child component, e.g. `AstrosRandomSpanFields`, is the builder's call. Follow the Vue naming memory: a camelCase folder, and an `Astros<Domain><Type>` name.
- **`ScripterView.vue` and `stores/scripter.ts`:** creating, editing and saving a span the same way as a point event. Clicking an existing span opens its dialog in Random mode. Until T-023 lands, a span renders as the existing point box at its start.
- **Specs:** both dialogs' component specs cover:
  - switching modes;
  - the defaults and the `null`-default error;
  - each field's inline error;
  - the emitted payload: integer ms gaps, `maxMove: null`, and `endTime`.
- **Storybook:** a Random story for each dialog (servo, ESP GPIO, Maestro digital).
- **QA:** `.docs/qa/random-span-events.md` gains the dialog cases: create, edit, switch modes, each error, and the hint.

## Acceptance criteria

- [ ] A span is created and edited through the dialogs (GPIO, Maestro digital, servo), and it saves and reloads with the same values. The API accepts it, with no 400.
- [ ] The specs cover the cases above. Mutation: emit gaps in seconds rather than ms, and the payload test fails.
- [ ] The stories render, and every string is from `enUS.json`.
- [ ] The QA cases are added.

## Out of scope

- The bar (T-023), drag and resize (T-024), and channel swap (T-025).
- Firmware behaviour.

## Verification

- `cd astros_vue && npx vitest run`; `npm run format && npm run lint`; `npm run build`; `npm run storybook` (the new stories).
- **By hand on the dev DB copy:**
  1. Create one span of each kind.
  2. Save, reload and edit each one.
  3. Upload. The API log has no span-skip warning, and `GET /api/scripts?id=…` shows `endTime` and the payload.

## Implementation checklist

<!-- Added when work starts. -->
