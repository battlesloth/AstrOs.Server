# T-013: Store a release time for each Maestro channel

<!-- File: .docs/tasks/T-013-maestro-release-ms.md. Branch: feature/T-013-maestro-release-ms. PR title: "T-013: Store a release time for each Maestro channel". -->

## Context

- **Spec:** `.docs/specs/20261122-0847-per-channel-servo-release-design.md` (approved by Jeff, 2026-11-22), § Server / Data model.
- **Project:** PLAN.md § Per-channel servo release time.
- **What it does:** each Maestro channel gets a minimum time, in ms, that the channel stays powered after a move. The firmware releases at max(release time, modeled travel + 10 %); the default is 5000.
- **What it leaves alone:** this task stores and round-trips the value only. The config sync string stays at 7 fields until T-014, which adds the 8th field together with the firmware gate.
- **Needs T-012** (the `m<NNN>_` migration naming).

## Contract (pinned — do not change)

- **Database:** migration `m010_add_maestro_release_ms` adds `maestro_channels.release_ms integer not null default 5000`. Existing rows read 5000.
- **API constants:** in a new `src/models/control_module/uart/sub_modules/maestro/release_ms.ts`:
  - `RELEASE_MS_DEFAULT = 5000`
  - `RELEASE_MS_MIN = 1000`
  - `RELEASE_MS_MAX = 120000`
- **API model:** `MaestroChannel` (`models/control_module/uart/sub_modules/maestro/maestro_channel.ts`) gains `releaseMs: number` as the **last** constructor parameter, after `inverted`.
- **Vue model and constants:**
  - The Vue `MaestroChannel` (`astros_vue/src/models/controllers/modules/uart/subModules/maestro/maestroChannel.ts`) gains `releaseMs: number`.
  - New `astros_vue/src/constants/maestro.ts` mirrors the three constants, with a "keep in sync" note, as `constants/firmware.ts` does.
  - New channels (`composables/useModuleManagement.ts`) get `RELEASE_MS_DEFAULT`.
- **`PUT /api/locations/` (`saveLocations`):**
  - A Maestro channel whose `releaseMs` is **present** but not an integer in [1000, 120000] is refused **before any write**: `400 { message: 'invalid_release_ms', problems: string[] }`. Each problem names the location, the channel number and the bad value.
  - An **absent** (`undefined`) `releaseMs` is stored as 5000, so a stale browser tab can still save.
  - Every other response is unchanged.
- **Unchanged here:** the config sync string, `MINIMUM_FIRMWARE_VERSION`, the Vue UI (T-014 and T-015).

## Task

- **Migration** `src/dal/migrations/m010_add_maestro_release_ms.ts`:
  - Register it in `dal/database.ts` and `dal/migrations/index.ts`.
  - Its test follows `migration_9.test.ts`: a pre-existing row reads 5000 afterwards, and an insert without the column gets 5000.
- **Thread `release_ms` / `releaseMs` through the API:**
  - `dal/types.ts` (`MaestroChannelTable`)
  - `uart_repository.ts` `upsertMaestroModule`: the insert, `doUpdateSet` with `excluded.release_ms`, and absent → `RELEASE_MS_DEFAULT`
  - `loadMaestroModule` and `readMaestroChannel`
  - the API model
  - every `new MaestroChannel(` call site, tests included (`message_generator.test.ts`, `script_repository.test.ts`, `uart_repository.test.ts`, `script_converter*.test.ts`), and the smoke test's bench fixture `astros_smoke_test/src/core/fixtures/demo-location.ts`, which imports the API model (added by the pre-push review)
- **Validator:** a pure `findInvalidReleaseMs(collection: LocationCollection): string[]` in `release_ms.ts`. `saveLocations` calls it first and answers 400 on any problem.
- **Vue:** the model field, the constants file, and the new-channel default. Fix the type errors the new field raises in stories, specs and fixtures.

## Acceptance criteria

- [x] The migration test passes; the migration is named per T-012's scheme and runs last on a fresh database.
- [x] Repository round-trip: a channel saved with 15000 loads as 15000; one saved with `releaseMs` absent loads as 5000.
- [x] `findInvalidReleaseMs`:
  - flags 999, 120001, 1500.5, `NaN` and the string `"5000"`
  - accepts 1000, 5000 and 120000
  - ignores an absent value
- [x] `PUT /api/locations/` with one bad channel answers the 400 above, and nothing is written (the location reads back unchanged).
  - Mutation check: move the validation after the first `updateLocation` and see the test fail.
- [x] The Vue new-channel default is 5000, and the Vue build type-checks.

## Out of scope

- The 8th config field, the firmware version cache, the sync gate, the minimum-version bump (T-014).
- The UI field (T-015).
- Validating the other channel fields (positions keep their existing sanitize-to-default behavior).

## Verification

- `cd astros_api && npx vitest run`; `npm run prettier:write && npm run lint:fix`; `npm run build`.
- `cd astros_vue && npx vitest run`; `npm run format && npm run lint`; `npm run build`.
- On a copy of the dev database: start the API with `DATABASE_PATH` pointing at the copy.
  - The log shows the backup and the `m010_add_maestro_release_ms` run.
  - `GET /api/locations/load` shows `releaseMs: 5000` on every Maestro channel.
  - Saving the Modules page unchanged keeps 5000.
  - A sync (still 7 fields) behaves as before.

## Implementation checklist

No failure-mode inventory: an additive column and a pure validator. On an upgrade, an interrupted `m010` run is T-016's restore path, and `up` then runs on the old table. A fresh install's first boot takes no backup, so the next boot backs up the half-migrated file and runs `up` on a table that already has the column; `up` skips the `ALTER` then (as `migration_9` does). Without that, that boot and every later one would fail on the duplicate column.

- [x] RED → GREEN: `m010_add_maestro_release_ms` (`m010_add_maestro_release_ms.test.ts`, after `migration_9.test.ts`): `INTEGER NOT NULL DEFAULT 5000` (a frozen literal, not `RELEASE_MS_DEFAULT`); a pre-existing row reads 5000; an insert without the column gets 5000; `up` is a no-op when the column exists but the migration is unrecorded (mutation: the guard dropped → "duplicate column"); `down` drops it. Registered in `PRODUCTION_MIGRATIONS` and `migrations/index.ts`; runs right after `9_` on a fresh database (Kysely's run order), with `database.test.ts`'s name guard green
- [x] RED → GREEN: `release_ms.ts` constants and `findInvalidReleaseMs` (`release_ms.test.ts`): flags 999, 120001, 1500.5, `NaN`, `"5000"`, `null`, `Infinity`, 0, `true`; accepts 1000, 5000, 120000; ignores an absent value; checks only Maestro UART modules; each problem names the location, the module, the board, the channel number and the value; a malformed body or a value whose `String()` throws doesn't throw. Mutations caught: the absent check, the sub-type filter, `String()` for the value, either bound exclusive, `typeof number` for the integer check, a coerced string
- [x] API model: `releaseMs` as the last `MaestroChannel` constructor parameter; every `new MaestroChannel(` call site, tests included, and the smoke test's fixture (missed until the pre-push review); `release_ms` a plain `number` in `MaestroChannelTable`, so an insert without it fails `tsc`
- [x] RED → GREEN: repository round-trip (`uart_repository.test.ts`): 15000 → 15000; absent → 5000; `null` → 5000; a later save replaces it (`excluded.release_ms`), and one without it resets it to 5000; `readMaestroChannel` returns it. Mutations caught: the update clause, the `??` fallback (at first only by the `null` case, since Kysely drops `undefined` keys and the column default covers absent; since the pre-push fix pass's throw, by the absent cases too)
- [x] RED → GREEN: `PUT /api/locations/` (`locations_controller.test.ts`, `saveLocations` exported): a good dome change plus one bad body channel → 400 `{ message: 'invalid_release_ms', problems }` with a `warn`, and nothing written (every fingerprint, dome's modules and the body channels unchanged); a valid value saves; an absent `releaseMs` → 200 and 5000. Mutations caught: the validation moved after the first `updateLocation`, the `return` after the 400 dropped
- [x] Vue: `MaestroChannel.releaseMs`, `constants/maestro.ts`, the `useModuleManagement` new-channel default (new `useModuleManagement.spec.ts`), the `useEventConverter` spec fixture and the Maestro story's channels. The channel components spread the channel (the type select) or edit it in place (`v-model`), so an edit keeps the field
- [x] QA: new `.docs/qa/maestro-channel-release.md` with the API cases (upgrade, fresh install, saves, refusals, an older build); T-015's task file now adds its UI cases there
- [x] Pre-commit: api prettier + lint, build, vitest; vue format + lint, build, vitest; code review (Review notes)
- [x] Verification by hand on a copy of the dev database, at migration 8 (2026-11-26): the built `dist/` booted with serial skipped and driven over HTTP. The first boot backed up as `…backup-8_fix_script_duration_units`, then ran `9_` and `m010_`; `/locations/load` showed all 24 Maestro channels at 5000; an unchanged save kept them; one set to 15000 persisted; a save without the field reset it to 5000; a `"5000"` string plus a valid 20000 on another channel of the same module answered the 400 and stored neither. (The fingerprints were already `outofdate` from the earlier saves, so they showed nothing; the cross-location no-partial-write case is the unit test's.) The sync step ran the built generator on every location: 24 Maestro entries, all 7 fields. A second boot ran nothing and took no backup; the dev database's sha256 is unchanged
- [x] Pre-push `/pr-review-toolkit:review-pr` (5 agents) and its fix pass (Review notes)
- [ ] PLAN.md close-out at merge

## Review notes

**Pre-commit review (2026-11-26, fresh-context reviewer):** no Critical findings and no code bugs; each Contract line matches. Fixed:
- **Important:** the migration comment, its test and this file said T-016 makes the idempotency skip a spare. On a fresh install, where there is no backup, it is the only thing between a crash mid-migration and a failure on every later boot. Reworded in all three.
- **Important:** QA case 5 expected a success toast; the Modules page's Save shows none (the "Saving..." dialog just closes).
- **Minors:** "firmware before 1.3.0" for the 5 s floor (1.2.0 used a position counter; the floor is 1.2.1–1.2.2, ESP T-005); the QA plan's SQL-range warning, `$DB` setup, case 6's hidden settings and over-broad `UPDATE`, case 7's scope, a case 11 claim citing this one-time Verification, and a new case 12 (an older build refuses the database); "fails as before (500)" for a malformed body (an empty body answers 200); an unrestored `logger.warn` spy; the string case's test title; `describe` renamed `formatValue`; `RELEASE_MS_MIN`/`MAX` dropped from the `models/index.ts` barrel (nothing imports them); a stale "before any real m-migration exists" comment in `database.test.ts`.

**Declined (pinned or out of scope):** a stale tab resets a custom value to 5000, and the `problems` strings are English (both Contract); the Vue save path drops `problems` and shows the axios message, and the components' local `MaestroChannel` interfaces lack the field (both now in T-015's Task); no `CHECK` constraint. A test tying the Vue constants to the API's, declined here, was added in the pre-push fix pass.

**Verification step corrected:** it first named `GET /api/locations/`, which carries no modules; the Modules page loads from `/api/locations/load`.

**Pre-push review (2026-11-26, `/pr-review-toolkit:review-pr`, 5 agents):** no Critical findings; the code reviewer found nothing. Fixed:
- **Important (type design): CI.** `astros_smoke_test/src/core/fixtures/demo-location.ts` built `MaestroChannel`s with 10 arguments, so the smoke project's typecheck failed. It now passes `RELEASE_MS_DEFAULT`. The smoke project's CI steps (prettier, eslint, typecheck, web build, tests) pass.
- **Important (tests): the validator's walk.** Every fixture had one module, one board and every location present, so a `continue` turned into `break` (an earlier missing location, a Kangaroo before the Maestro, a board without channels before a bad one), a check of only the first module or board, and a problem built from array positions all survived. New cases: dome and core null or missing, a Kangaroo before the Maestro, two Maestro modules, two boards, a channel-less board first; fixtures number boards from 2 and channels from 4.
- **Important (silent failures, comments): two deferrals recorded nowhere.** The opaque 400 (including a stored out-of-range value on a channel whose field is hidden) and the components' local channel types are now in T-015's Task and Acceptance criteria.
- **Important (silent failures):** a save without `releaseMs` reset a custom value with no trace. `upsertMaestroModule` now logs one `warn` per board with the count (the responses are unchanged).
- **Important (comments): QA cases 9 and 12.** Case 9's fingerprints were already `outofdate` from earlier saves, so it now sets a marker first. Case 12 failed as written: a new worktree has no `.env`. It now copies it in, and checks `$DB` with a checksum.
- **Minors fixed:**
  - `upsertMaestroModule` throws on a present value that isn't valid, naming the value, so a caller that skips `saveLocations` can't store one (`isValidReleaseMs` is exported). Removing the `??` fallback now fails the absent-value tests too.
  - Reads default a missing `release_ms` column to 5000: the read-only modes serve a database m010 never reached.
  - The migration's skip logs a `warn`.
  - `saveLocations` checks `req.body` before the cast, and the validator walks it as `unknown`.
  - `formatValue` (now the exported `formatJsonValue`) prints `(unprintable <type>)` for a value `JSON.stringify` throws on, and `undefined` for a missing field.
  - The multi-problem reply and its `'; '`-joined log line are tested.
  - A test checks that the default is in range, and a Vue spec checks the three constants against the API's source.
  - Comment and QA wording: present-tense firmware claims, "absent or null", the `down` comment, the fresh install's second boot, the start command, a type-aware pre-flight query, pino's JSON lines, and the `random-span-events.md` lines that now also name `m010`.
  - A PLAN.md Backlog entry: one transaction for the whole save.
- **Mutations:** 18 run, and all fail on a test assertion: each survivor above, plus the warn, the null count, the repository throw, the write fallback, both read defaults and the skip log.

**Declined:**
- **A shape check in the migration's skip:** only a hand-run `ALTER` reaches it.
- **A `releaseMsOrDefault` helper:** the throw already makes the fallback load-bearing.
- **Contract notes for Jeff, not changed:** `findInvalidReleaseMs(body: unknown)` as the signature; structured problems (left to T-015); the 11-parameter constructor (an options object would be its own task).

**Review of the pre-push fix pass (2026-11-26, fresh-context reviewer):** no Critical or Important findings and no production bug. The throw can't fire on today's only write path, the warn doesn't fire for a current client, and the read default's read-only claim holds. Fixed:
- **Wrong comment:** "SQLite would keep '5000' as TEXT". INTEGER affinity converts it to 5000 (checked with the CLI); only non-numeric text such as `'abc'` stays TEXT. The refusal test now covers `'abc'`.
- **Survivors:** the boards guard's `continue` → `break` still survived. It is caught now by a Maestro module without boards placed before a bad one. The validator-walk item above claimed more than it covered. The `?? 'undefined'` in `formatJsonValue` changes no output; its test is marked as characterization.
- **The type guard:** `value is number` narrowed a `number` argument to `never` in the false branch, so `isValidReleaseMs` returns `boolean` again. The repository's error message now names the value.
- **Smaller fixes:**
  - The warn names the board's `boardId` and id and reads "storing", since it is logged inside the transaction.
  - A two-board test pins one warn per board.
  - The `catch` is covered by a cycle; deep nesting now only has to not throw, since a future Node may stringify it.
  - QA case 7 expects the warn, and case 12 compares directory listings.
  - Read-default comments name `MIGRATION_INTERRUPTED`.
  - The docstring no longer mentions a cast.
  - The drift spec's regex is anchored.
  - The refusal test checks all three tables and drops a dead spy.
  - This file's drift is fixed.
- **Mutations:** 4 more run (the boards `break`, a warn for only the first board, the value dropped from the throw, the old `catch` text), all caught by a test.
