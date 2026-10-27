# T-009: Validate random spans on save

<!-- File: .docs/tasks/T-009-validate-spans-on-save.md. Branch: feature/T-009-validate-spans-on-save. PR title: "T-009: Validate random spans on save". -->

## Context

This is Phase A of the random span events project. See `PLAN.md` § Random span events and the spec `.docs/specs/20261022-0748-random-span-events-design.md` § "Data model". Server task numbers are separate from AstrOs.ESP's; this is not ESP T-009.

T-007 lets `PUT /api/scripts/` save a span (`endTime` non-null) on GPIO and Maestro channels, and refuses one on any other sub-type. Its reviews found three save-side gaps, and Jeff decided them on 2026-10-27:

- **The refusal answers 500.** `saveScriptEvent` throws a plain `Error`, so the scripts controller answers `500 { message: 'Internal server error' }` and the reason reaches only the log. Decision: **a refused save answers 400 with the reason.**
- **`endTime` itself is never checked.** The controller passes `req.body` through untyped. A non-numeric `endTime` makes `calculateLengthDS` return `NaN`, so the save fails with `NOT NULL constraint failed: scripts.duration_ds` (the wrong field). `""` stores `0`, `true` stores `10`, `1e400` arrives as `Infinity`, and a span that ends before it starts is stored and makes the script's length undercount. Decision: **refuse a span whose `endTime` is not a finite number after its `time`.**
- **`RandomMaestroEvent.isServo` goes stale.** A Maestro span stores a copy of its channel's servo/digital setting. The save already overwrites the payload's `channel` from the channel (`saveScriptChannel`), but not `isServo`. Decision: **overwrite it on save too** (T-008 also reads the channel's setting at conversion).

Nothing in the scripter creates a span until Phase B, so this is the server's backstop. Showing the reason in the editor is Phase B's.

## Contract (pinned — do not change)

- **Refused save:** `PUT /api/scripts/` answers **`400 { message: <reason> }`** when the script fails span validation. Nothing is written: validation runs before `upsertScript`'s transaction. Every other failure keeps today's `500 { message: 'Internal server error' }`.
- **`ScriptValidationError extends Error`**, in `astros_api/src/models/scripts/script_validation_error.ts` and exported from `models/index.ts`. The repository throws it for every refusal below; the controller maps exactly this type to 400.
- **Rules**, for every event with `endTime != null`, checked in this order, first failure wins. The messages are exact:
  1. `supportsRandomSpan(moduleSubType)` (T-007) → `Random span not supported for moduleSubType: ${moduleSubType}` (T-007's text, unchanged).
  2. `typeof endTime === 'number' && Number.isFinite(endTime)` → `Random span endTime must be a finite number, got ${JSON.stringify(endTime)}`.
  3. `endTime > time` → `Random span endTime must be after its time (${time} s), got ${endTime} s`.
- **Maestro save overwrite:** for an event on a Maestro channel with `endTime != null`, `saveScriptChannel` sets the payload's `isServo` to the channel's `MaestroChannel.isServo`, next to the existing `channel` overwrite. A point `MaestroEvent`'s `isServo` is unchanged.
- **Unchanged:** a point event (`endTime == null`, including an omitted key) is never refused by these rules; the column, payload shapes, read path and load-time drop (T-007) are unchanged.

## Task

### Validation

- New `validateScriptSpans(script: Script): void` in `astros_api/src/dal/repositories/script_repository.ts` (module-level, exported for tests). It walks every channel's events and throws `ScriptValidationError` on the first rule a span breaks (Contract order).
- `upsertScript` calls it first, before `calculateLengthDS` and the transaction, so a bad `endTime` can no longer surface as the `duration_ds` constraint.
- T-007's refusal in `saveScriptEvent` moves into this pass (rule 1). `saveScriptEvent` no longer checks spans.
- `copyScript` saves through `upsertScript`, so a copy of a script with a hand-coded bad span is refused too; its route keeps its current status handling (Out of scope).

### Maestro overwrite

- In `saveScriptChannel`'s Maestro branch, when `evt.endTime != null`, also set `(evt.event as RandomMaestroEvent).isServo = c.isServo`.

### Controller

- `scripts_controller.ts` `saveScript`: `catch (error)` answers `400 { message: error.message }` when `error instanceof ScriptValidationError` (logged at `warn`, with the script id), otherwise today's 500 path.
- Export `saveScript` the way `deleteScript` is exported, for the controller test.

### Tests

Write these first.

- **`script_repository.test.ts`** (the `random span events` describe):
  - `refuses a span whose endTime is not a finite number`: `it.each` over `'5'`, `''`, `true`, `NaN`, `Infinity` (each assigned to `endTime` with a cast). Asserts `ScriptValidationError` with rule 2's message, and the stored script (rows and name) is unchanged.
  - `refuses a span that ends at or before its time`: `endTime === time` and `endTime < time`. Rule 3's message.
  - `the sub-type refusal is a ScriptValidationError`: T-007's serial case, now also `instanceof`.
  - `rule order: a span on an unsupported sub-type with a bad endTime reports the sub-type`.
  - `a Maestro span takes the channel's isServo on save`: payload `isServo: true` on a channel configured digital reads back `false`; a point `MaestroEvent` on the same channel keeps its `isServo`.
  - `a point event is never refused`: points with `endTime: null` and with the key omitted, including `time: 0`.
- **`scripts_controller.test.ts`:**
  - `a refused save answers 400 with the reason`.
  - `any other save failure still answers 500 Internal server error` (for example, the repository throws a plain `Error`).
- T-007's existing refused-save and drop tests stay green unchanged.

## Acceptance criteria

- [ ] All tests above are green; every T-007 repository test is unchanged and green.
- [ ] A refused save writes nothing and answers 400 with the exact Contract message.
- [ ] `npm run build` and the full API suite are green.
- [ ] `.docs/qa/random-span-events.md` gains a "Save validation" section: a `curl` PUT with a backwards span → 400 and the message; GET shows the script unchanged; a Maestro span saved with a stale `isServo` reads back with the channel's.

## Out of scope

- Showing the reason in the scripter (Phase B). Today's save error modal shows axios's generic message (`Failed to save script: …`, hard-coded English); Phase B reads `response.data.message` and adds i18n keys.
- Converter behavior: reading the channel's servo/digital setting and skipping a Maestro point without a numeric `position` are T-008's (amended 2026-10-27).
- `time` validation for point events, and other routes that save scripts (`copyScript`'s route keeps its status codes).
- The 89 `logger.error(string, err)` calls (PLAN.md Backlog).

## Verification

- `cd astros_api && npx vitest run src/dal src/controllers src/models` → green. Then `npm run build` and the full `npx vitest run` → green.
- Manual check, on a copy of the dev DB with the API from this branch:
  1. Fetch a GPIO script (`GET /api/scripts/?id=…`), give one GPIO event `"endTime": <time − 1>`, and `PUT` it back.
  2. The response is `400 {"message":"Random span endTime must be after its time (…"}`, the API log has the warn line, and a fresh GET matches step 1's.
  3. Repeat with a valid span (`endTime` = time + 5) on a Maestro channel with `"isServo"` opposite to the channel's: `200`, and the read-back payload's `isServo` matches the channel.

## Failure-mode inventory

N/A. Synchronous validation before an existing transaction, no new I/O.
