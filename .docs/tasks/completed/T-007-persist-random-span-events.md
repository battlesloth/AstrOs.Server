# T-007: Persist random span events

<!-- File: .docs/tasks/completed/T-007-persist-random-span-events.md. Branch: feature/T-007-persist-random-span-events. PR title: "T-007: Persist random span events". -->

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

Corrected 2026-10-27 (T-007 code review): the backup/restore path does not cover a `migration_9` that is half applied. Kysely runs SQLite migrations without a transaction, so a crash between the `ALTER TABLE` and the `kysely_migration` insert would leave the column in place with no record. On the next boot `createBackup` would overwrite the clean `backup-8_…` with that half-migrated file, `up` would fail on the duplicate column, and the restore would put the half-migrated file back: `MIGRATION_FAILED_RESTORED` on every boot. `up` now skips the `ALTER` when the column exists. The backup being overwritten on a retry affects any partly applied migration; it is in the PLAN.md Backlog. A database left at migration 8 by `BACKUP_FAILED` or a restored failure still serves reads, so the read path treats a missing `end_time` as a point event.

## Implementation checklist

- [x] RED/GREEN — `migration_9` adds nullable `end_time`, existing rows NULL, down drops it (`migration_9.test.ts`); registered in `dal/database.ts`, exported from `migrations/index.ts`, `ScriptEventsTable.end_time`, mirrored in `database.integration.test.ts` `buildProvider`. The two integration literals naming the latest production migration moved to `9_add_script_event_end_time` (as T-004 did for 8). The RED needed a no-op stub first, and the down test a precondition (column present) so it could not pass against the stub
- [x] RED/GREEN — `moduleSubTypeToScriptEventTypes(…, isSpan)` routes GPIO / Maestro spans, throws for other sub-types, unchanged when `!isSpan` (`script_event.test.ts`); `RandomGpioEvent` / `RandomMaestroEvent` added to `ScriptEventTypes` and the model index (API + Vue)
- [x] RED/GREEN — repository writes `end_time` (deciseconds, `== null` → NULL) and reads `endTime` back; Maestro channel overwrite covers `RandomMaestroEvent` (`script_repository.test.ts`, the 4 pinned cases)
- [x] RED/GREEN — `calculateLengthDS` counts a span at its end time (`script_duration.test.ts`, the 2 pinned cases; existing cases unchanged); doc comment updated
- [x] `endTime: null` at every API and Vue `ScriptEvent` construction site: the converter's `addBufferEvent`, `ScripterView.vue` (`addEvent` and the channel-test event), the six scripter modal stories, and API test fixtures (repository, converter, duration unit and integration). The API `tsconfig.json` excludes `*.test.ts`, so the fixtures were found with a scratch config that type-checks them. `stores/scripter.ts` builds no `ScriptEvent` (it passes events through; its channel swap calls `convertEventsForChannelType`), so it is unchanged
- [x] RED/GREEN — Vue `useEventConverter` throws the pinned error when converting a span between channel types (new `useEventConverter.spec.ts`: both directions, a span that is not the first event, same-sub-type pass-through, point conversions with `endTime: null`, an event without `endTime`)
- [x] RED/GREEN — code-review fixes and Jeff's bad-span decision (see Additions)
- [x] Mutation checks recorded (below)
- [x] QA plan: `.docs/qa/random-span-events.md` (Preconditions + Data / upgrade: cases 1–7)
- [x] Pre-commit: prettier + lint (both sub-projects), both builds, full suites (API 78 files / 1093 tests, Vue 54 / 780 + 1 todo), code review (two rounds). Round 1, Important: reads before migration 9 misread every row; `migration_9.up` not idempotent (a crash between the `ALTER` and the record made `MIGRATION_FAILED_RESTORED` permanent); the pinned read throw conflicted with T-008 and could empty an upload, which became Jeff's bad-span decision. Round 2: no Critical or Important; Minors fixed (the Backlog's `nameComparator` advice was wrong for Kysely 0.27.6, the refusal's log line dropped its reason, the spec now records the decision, task-file wording). To the Backlog: the 500 for a refused span (decide with T-008's validation), 79 `logger.error(string, err)` calls that drop their error, Kysely ordering past 9, the backup overwrite on retry, the `start:tsx` serial worker, the Phase B half-done swap, shipping T-007 with T-008
- [x] Manual check (Verification, 2026-10-27, scratchpad copy of `.data/database.sqlite3` at `8_`, 13 scripts / 173 events): the boot log shows `Created pre-migration backup at …backup-8_fix_script_duration_units` then `migration "9_add_script_event_end_time" was executed successfully`, status `readOnly: false`. `T-003 QA` (89 events, 1230 ds) fetched and PUT back unchanged, and `T-005 QA` PUT back with every `endTime` key removed: both `success`. All 173 rows have `end_time` NULL, and the before/after dumps of `scripts.duration_ds` and `script_events (id, time, data)` are identical. The serial port errors in that log (no `/dev/ttyUSB0`; the serial worker cannot resolve `src/logger.js` under `start:tsx`) are unrelated to this task (PLAN.md Backlog)
- [x] Bench (automated through the API, 2026-10-27), QA cases 6 and 7: on the upgraded copy, an HCR row of `Servo Test` given `end_time` by hand is missing from the loaded script (16 of 17 events) with the `dropping random span <id> in script <id>: moduleSubType 103 has no span payload` warning (its format before the pre-push fixes), and PUTting the loaded script back deletes the row; PUTting a span on that HCR channel answers 500 and leaves the 16 rows. On a fresh `8_` copy in a `0500` directory the boot enters `BACKUP_FAILED` with no migration, and `Servo Test` (HCR + Maestro, 17), `serial test` (2) and `T-003 QA` (89) load with every event and `endTime: null`; the directory still holds only `database.sqlite3`
- [x] Pre-push: `/pr-review-toolkit:review-pr` (5 agents, 2026-10-27, full diff vs `origin/develop`); findings addressed. No Critical. Important:
  - the refused-save test could not tell a rollback from a partial commit (it re-inserted the same row); it now moves the point and renames the script before the refused span and asserts both are unchanged;
  - `Math.floor` on `end_time` survived; an `it.each` adds a below-integer case (`0.7 + 0.1` → 8);
  - the duration rule's sweep missed the `getScriptDurationsDS` JSDoc and two Backlog items (one prescribed a boot check that would fire for every span script);
  - the QA plan said spans are not sent before T-008 (they upload as broken point commands).
  - Minors fixed:
    - a span row with an unknown sub-type was dropped (then deleted by the next save) instead of failing the read like a point row; the drop now parses the row as a point first, so an unknown sub-type or unreadable `data` fails the read, as for a point row (this narrows "removed entirely" to rows the server can read);
    - the refusal log names the channel and script, and the drop warning records the row and that the next save deletes it;
    - `supportsRandomSpan` is a type predicate over a `RANDOM_SPAN_SUB_TYPES` list, and the parser's span switch is exhaustive over it, so drift fails `tsc` both ways (TS2322 / TS2678, checked);
    - `migration_9.down` says it does not make the database safe for an older build;
    - tests: `buildProvider` refuses an injected migration that sorts before the production latest, a copied script keeps its spans, a span script's stored duration through `getScriptDurationsDS` and `getScript`, an omitted `endTime` counts at its start, the refusal and drop log lines;
    - comment and doc drift across the code, QA plan (cases 3, 4, 6, 7), spec, T-008 and PLAN.md (the Kysely ordering item merged into the existing one, 89 log sites, the swap and exposure items, Phase B notes and three open questions).
  - Declined: narrowing `migration_9`'s guard to `pragma_table_info` (a broken view fails every migration anyway, because Kysely's Migrator introspects all tables before running one); a discriminated `ScriptEvent` union (most Phase B sites write through union-typed refs the compiler doesn't check soundly); naming the union's halves; a cross-project payload-type test (no pattern in the repo yet); an `initializeDatabase`-level crash re-run test (the guard mutants are killed at the Migrator level).
  - Mutation checks (pre-push): no transaction in `upsertScript` → strengthened refused-save test; `Math.floor` → below-integer case; duration `!== null` → omitted-`endTime` test; refusal not logged / drop reason removed → log assertions; drop without the point parse → unknown-sub-type test; an injected `9_aa_…` migration that doesn't fail → `buildProvider` guard; the earlier list re-run against the type-predicate refactor, all killed except the known equivalent
- [x] Close-out: task file → `completed/`, PLAN.md checkbox + Log entry (2026-10-27, before the PR, as T-006 did)

### Mutation checks

Each mutant was applied by exact single-match replacement, the named tests run, and the file restored.

- Killed: migration not in the production provider → production-list test + repository tests; `down` a no-op → down test; `up` without the existing-column guard / guard on the wrong table → half-applied test; guard always skips → 4 migration tests; save without `Math.round` → GPIO round-trip (`45.2 + 0.1`); save always NULL / read not ÷10 → both round-trips; read leaves `undefined` (no `?? null`) → v8-table read test; Maestro overwrite removed → Maestro round-trip + existing test; duration ignores `endTime` → span-end test; duration `endTime ?? 0` → 4 duration tests; parser ignores `isSpan` → 7 refusal tests; parser refuses GPIO or Maestro spans → routing test; parser default `isSpan = true` → 5 unchanged tests; write refusal removed → refused-save test; write refusal `!== null` → serial point without `endTime`; read drop removed / without its warning / drops every span → drop tests / round-trips; `supportsRandomSpan` without Maestro or with Kangaroo → agreement tests; Vue span check removed, before the same-sub-type return, `!== null`, first event only, or `endTime` copied instead of `null` → converter spec.
- Equivalent (survive by construction): save `== null` → `=== null`. An omitted `endTime` gives `Math.round(undefined * 10) = NaN`, and SQLite binds a NaN double as NULL (checked with better-sqlite3); the explicit `== null` stays. Read "never pass `isSpan`": since the drop, only GPIO and Maestro spans reach the parser, and their span and point parses are the same `JSON.parse`; the argument stays because the Task pins it, with no runtime or type effect on the production path (both branches return `ScriptEventTypes`).

### Additions beyond the task text

The Contract is unchanged. These widen the diff:

- **Bad span rows (Jeff, 2026-10-27).** The task pinned a parser throw for a span on any sub-type other than GPIO / Maestro; T-008 says such a span takes the converter's skip path (and that the converter never throws), which a throw in `getScript` makes unreachable (and a read throw during an upload makes `convertScript` return an empty map, sending `''` to every controller). Decision: the system never saves such a span, and one that was hand coded is removed on load, so the editor and the converter never see it and the editor's next save removes the row. `supportsRandomSpan(moduleSubType)` (GPIO, Maestro) is shared by `saveScriptEvent` (throws, rolling back the whole save) and `readScriptEvents` (drops the row with a `logger.warn`); the parser keeps its pinned throw, which no production path reaches now (the drop runs first; only its tests call it), and a test pins that the helper and the parser's routing agree for every sub-type. T-008's bullet is amended to match.
- **Reads before migration 9 (code review).** `BACKUP_FAILED` and the restored-failure modes serve reads against a table without `end_time`; `selectAll` then gives `undefined`, which the pinned `=== null` / `!== null` read as a span (a serial row threw, a GPIO row read `NaN`). The read now normalizes `evt.end_time ?? null`, the same rule as the write side's `== null`.
- **`migration_9.up` is idempotent (code review).** See the corrected Failure-mode inventory.
- **Vue converter uses `!= null`**, not the task's `!== null`, so an event that omits `endTime` is a point there too; the check runs after the same-sub-type early return, so a swap to another channel of the same sub-type keeps its spans.
- **Tests beyond the list:** migration "runs as part of the production migration list" and the half-applied case; parser refusal for every other sub-type, "isSpan false still rejects unknown", and "supportsRandomSpan is true only for genericGpio and maestro"; repository v8-table read, refused save, hand-coded drop, save-removes-drop, serial point without `endTime`; the Vue converter spec.
- **`database.integration.test.ts`:** a 15 s-timeout comment that T-006 left above `sha256` moved back above the `describe` it explains.
