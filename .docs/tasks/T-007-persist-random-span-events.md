# T-007: Persist random span events

<!-- File: .docs/tasks/T-007-persist-random-span-events.md. Branch: feature/T-007-persist-random-span-events. PR title: "T-007: Persist random span events". -->

## Context

This is Phase A of the random span events project. See `PLAN.md` § Random span events, and the spec `.docs/specs/20261022-0748-random-span-events-design.md` § "Server / Data model" and § "Duration".

A random span is a script event with an end time. The ESP improvises GPIO toggles or servo moves inside the span. This task gives the model, the DB and script duration the notion of a span. Nothing creates one yet: the scripter UI is Phase B, and the ESP conversion is T-008.

**Depends on T-006 being merged to develop first.** `migration_9` must never exist on a branch without the newer-DB guard.

## Contract (pinned — do not change)

- **`ScriptEvent.endTime: number | null`**, in API `astros_api/src/models/scripts/script_event.ts` and Vue `astros_vue/src/models/scripts/scriptEvent.ts`.
  - Unit: seconds, the same as `time` (0.1 s resolution).
  - `null` means a point event. A non-null value marks a random span.
- **Payload types**, which ride in the existing `script_events.data` JSON. Field names are identical in API and Vue.

  ```ts
  export interface RandomGpioEvent { minGapMs: number; maxGapMs: number; }
  export interface RandomMaestroEvent {
    channel: number; isServo: boolean;
    minGapMs: number; maxGapMs: number;
    minPos: number; maxPos: number; minMove: number; maxMove: number | null;
    speed: number; acceleration: number;
  }
  ```

  - API files: `models/scripts/events/random_gpio_event.ts`, `random_maestro_event.ts`.
  - Vue files: `models/scripts/events/randomGpioEvent.ts`, `randomMaestroEvent.ts`.
  - Both are added to `ScriptEventTypes` and exported from the model indexes.
- **Column:** `script_events.end_time INTEGER NULL`, in deciseconds (scaled like `time`). It is added by migration `'9_add_script_event_end_time'`.
- **`calculateLengthDS`** returns `Math.round(max over events of (endTime ?? time) × 10)`, and `0` with no events.
- **The existing point-event JSON and the existing column values are unchanged.**

## Task

### Migration

`astros_api/src/dal/migrations/migration_9.ts`:

- `up`: `db.schema.alterTable('script_events').addColumn('end_time', 'integer').execute()`
- `down`: `db.schema.alterTable('script_events').dropColumn('end_time').execute()`
- Register it as `'9_add_script_event_end_time'` in `dal/database.ts`'s provider. Export it from `migrations/index.ts`.
- Add `end_time: number | null` to `ScriptEventsTable` in `dal/types.ts`.
- Mirror it in `database.integration.test.ts` `buildProvider`.

### Parser

`moduleSubTypeToScriptEventTypes(moduleSubType: ModuleSubType, json: string, isSpan = false): ScriptEventTypes`:

- `isSpan` with `genericGpio` → `RandomGpioEvent`
- `isSpan` with `maestro` → `RandomMaestroEvent`
- `isSpan` with any other sub-type → `throw new Error(\`Random span not supported for moduleSubType: ${moduleSubType}\`)`
- `!isSpan` → unchanged

### Repository: `astros_api/src/dal/repositories/script_repository.ts`

- **`saveScriptEvent`** writes `end_time: evt.endTime == null ? null : Math.round(evt.endTime * 10)`. The `== null` also covers clients that omit the field.
- **`readScriptEvents`** sets `endTime: evt.end_time === null ? null : evt.end_time / 10` and passes `evt.end_time !== null` as `isSpan`.
- **The Maestro channel overwrite in `saveScriptChannel`** (~:364) types its cast as `MaestroEvent | RandomMaestroEvent`. Both have `channel`. Its behavior is unchanged.

### Duration

`astros_api/src/scripting/script_duration.ts`:

- `calculateLengthDS` follows the Contract.
- Its doc comment changes to say a span counts at its end time, and a point event at its start.

### Construction sites

- **API:** every place that builds a `ScriptEvent` sets `endTime: null`, including the converter's `addBufferEvent` and test fixtures. Let `npm run build` find them.
- **Vue:** every place that builds a `ScriptEvent` sets `endTime: null`, including `ScripterView.vue` `addEvent` and `stores/scripter.ts`. Let `npm run build` find them.
- **Vue `composables/useEventConverter.ts`:** if the source event's `endTime !== null`, throw `Error('Converting random spans between channel types is not supported yet')`. Phase B replaces this with real conversion. Spans can't be created before then.

### Tests

Write these first.

- **`astros_api/src/dal/migrations/migration_9.test.ts`** (modeled on `migration_8.test.ts`):
  - `adds a nullable end_time column`
  - `existing rows read end_time NULL`
  - `down drops end_time`
- **`astros_api/src/dal/repositories/script_repository.test.ts`:**
  - `round-trips a random maestro span`: `time` 2.0, `endTime` 18.5, `RandomMaestroEvent { channel: -1, isServo: true, minGapMs: 400, maxGapMs: 2000, minPos: 20, maxPos: 100, minMove: 15, maxMove: 60, speed: 0, acceleration: 0 }`.
    - Assert: the row has `end_time` 185. The read-back has `endTime` 18.5. The payload deep-equals the input, except `channel` = the Maestro channel's `channelNumber`.
  - `round-trips a random gpio span with maxMove-free payload`: `RandomGpioEvent { minGapMs: 50, maxGapMs: 400 }`.
  - `point events read back endTime null`
  - **Review focus:** `an event object without an endTime property is stored as NULL and reads back null`. Build the event, `delete` the key, then upsert.
    - Assert: the row has `end_time === null`, and the read-back has `endTime === null`, not `undefined` or `NaN`.
- **`astros_api/src/models/scripts/script_event.test.ts`** (create if absent):
  - `isSpan routes genericGpio to RandomGpioEvent and maestro to RandomMaestroEvent`
  - `isSpan with kangaroo throws`
  - `isSpan false is unchanged for every sub-type`
- **`astros_api/src/scripting/script_duration.test.ts`:**
  - `a span counts at its end time`: span 2.0→18.5 plus a point at 10.0 → 185
  - `a point after a span's end wins`: span 0→5, point at 7.5 → 75
  - `null endTime events are unchanged` (existing expectations)

## Acceptance criteria

- [ ] All tests above are green. The existing repository, converter and duration tests are unchanged and green.
- [ ] `astros_api` and `astros_vue` both build (`npm run build`).
- [ ] The integration test's `buildProvider` lists `9_add_script_event_end_time`.
- [ ] Converting a span between channel types throws the pinned error.
- [ ] `.docs/qa/random-span-events.md` exists with Preconditions, plus a "Data / upgrade" section. It covers: upgrade a DB with existing scripts → they load, play and report the same durations. Downgrade attempt → T-006 page.

## Out of scope

- Converting spans to ESP commands (T-008). Until T-008 lands, the converter has no case for a span.
- Any span validation (T-008 server-side; Phase B in the UI).
- Scripter UI: creating, drawing or dragging spans (Phase B).
- Recomputing stored durations. No spans exist before this ships.

## Verification

- `cd astros_api && npx vitest run src/dal src/models src/scripting` → green. Then `npm run build` and the full `npx vitest run` → green.
- `cd astros_vue && npm run build` → green. Then `npm run test:unit -- --run` → green.
- Manual check:
  1. Start the API on a copy of the dev DB, and check the log shows `9_add_script_event_end_time` applied.
  2. Open and save an existing script.
  3. `sqlite3 <copy> "select count(*) from script_events where end_time is not null"` → `0`.
  4. The script's duration matches the value from before the upgrade.

## Failure-mode inventory

N/A. This is an additive nullable column. The existing pre-migration backup/restore path in `initializeDatabase` covers a failed `migration_9`. T-006 covers an older build reading the newer DB.
