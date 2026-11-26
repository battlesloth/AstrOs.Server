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
  - every `new MaestroChannel(` call site, tests included (`message_generator.test.ts`, `script_repository.test.ts`, `uart_repository.test.ts`, `script_converter*.test.ts`)
- **Validator:** a pure `findInvalidReleaseMs(collection: LocationCollection): string[]` in `release_ms.ts`. `saveLocations` calls it first and answers 400 on any problem.
- **Vue:** the model field, the constants file, and the new-channel default. Fix the type errors the new field raises in stories, specs and fixtures.

## Acceptance criteria

- [ ] The migration test passes; the migration is named per T-012's scheme and runs last on a fresh database.
- [ ] Repository round-trip: a channel saved with 15000 loads as 15000; one saved with `releaseMs` absent loads as 5000.
- [ ] `findInvalidReleaseMs`:
  - flags 999, 120001, 1500.5, `NaN` and the string `"5000"`
  - accepts 1000, 5000 and 120000
  - ignores an absent value
- [ ] `PUT /api/locations/` with one bad channel answers the 400 above, and nothing is written (the location reads back unchanged).
  - Mutation check: move the validation after the first `updateLocation` and see the test fail.
- [ ] The Vue new-channel default is 5000, and the Vue build type-checks.

## Out of scope

- The 8th config field, the firmware version cache, the sync gate, the minimum-version bump (T-014).
- The UI field (T-015).
- Validating the other channel fields (positions keep their existing sanitize-to-default behavior).

## Verification

- `cd astros_api && npx vitest run`; `npm run prettier:write && npm run lint:fix`; `npm run build`.
- `cd astros_vue && npx vitest run`; `npm run format && npm run lint`; `npm run build`.
- On a copy of the dev database: start the API with `DATABASE_PATH` pointing at the copy.
  - The log shows the backup and the `m010_add_maestro_release_ms` run.
  - `GET /api/locations/load` shows `releaseMs: 5000` on every Maestro channel. (This step first named `GET /api/locations/`, which carries no modules; the Modules page loads from `/load`.)
  - Saving the Modules page unchanged keeps 5000.
  - A sync (still 7 fields) behaves as before.

## Implementation checklist

No failure-mode inventory: an additive column and a pure validator. On an upgrade, an interrupted `m010` run is T-016's restore path, and `up` then runs on the old table. A fresh install takes no backup, so `up` skips the `ALTER` when the column is already there (as `migration_9` does): without that, the next boot and every later one would fail on the duplicate column.

- [x] RED → GREEN: `m010_add_maestro_release_ms` (`m010_add_maestro_release_ms.test.ts`, after `migration_9.test.ts`): `INTEGER NOT NULL DEFAULT 5000` (a frozen literal, not `RELEASE_MS_DEFAULT`); a pre-existing row reads 5000; an insert without the column gets 5000; `up` is a no-op when the column exists but the migration is unrecorded (mutation: the guard dropped → "duplicate column"); `down` drops it. Registered in `PRODUCTION_MIGRATIONS` and `migrations/index.ts`; runs right after `9_` on a fresh database (Kysely's run order), with `database.test.ts`'s name guard green
- [x] RED → GREEN: `release_ms.ts` constants and `findInvalidReleaseMs` (`release_ms.test.ts`): flags 999, 120001, 1500.5, `NaN`, `"5000"`, `null`, `Infinity`, 0, `true`; accepts 1000, 5000, 120000; ignores an absent value; checks only Maestro UART modules; each problem names the location, the module, the board, the channel number and the value; a malformed body or a value whose `String()` throws doesn't throw. Mutations caught: the absent check, the sub-type filter, `String()` for the value, either bound exclusive, `typeof number` for the integer check, a coerced string
- [x] API model: `releaseMs` as the last `MaestroChannel` constructor parameter; every `new MaestroChannel(` call site, tests included; `release_ms` a plain `number` in `MaestroChannelTable`, so an insert without it fails `tsc`
- [x] RED → GREEN: repository round-trip (`uart_repository.test.ts`): 15000 → 15000; absent → 5000; `null` → 5000; a later save replaces it (`excluded.release_ms`), and one without it resets it to 5000; `readMaestroChannel` returns it. Mutations caught: the update clause, the `??` fallback (only by the `null` case: Kysely drops `undefined` keys, so the column default covers absent)
- [x] RED → GREEN: `PUT /api/locations/` (`locations_controller.test.ts`, `saveLocations` exported): a good dome change plus one bad body channel → 400 `{ message: 'invalid_release_ms', problems }` with a `warn`, and nothing written (every fingerprint, dome's modules and the body channels unchanged); a valid value saves; an absent `releaseMs` → 200 and 5000. Mutations caught: the validation moved after the first `updateLocation`, the `return` after the 400 dropped
- [x] Vue: `MaestroChannel.releaseMs`, `constants/maestro.ts`, the `useModuleManagement` new-channel default (new `useModuleManagement.spec.ts`), the `useEventConverter` spec fixture and the Maestro story's channels. The channel components rebuild channels with spreads, so an edit keeps the field
- [x] QA: new `.docs/qa/maestro-channel-release.md` with the API cases (upgrade, fresh install, saves, refusals, an older build); T-015's task file now adds its UI cases there
- [x] Pre-commit: api prettier + lint, build, vitest; vue format + lint, build, vitest; code review (Review notes)
- [x] Verification by hand on a copy of the dev database, at migration 8 (2026-11-26): the built `dist/` booted with serial skipped and driven over HTTP. The first boot backed up as `…backup-8_fix_script_duration_units`, then ran `9_` and `m010_`; `/locations/load` showed all 24 Maestro channels at 5000; an unchanged save kept them; one set to 15000 persisted; a save without the field reset it to 5000; a `"5000"` string plus a valid 20000 elsewhere answered the 400 and wrote nothing (fingerprints unchanged). The sync step ran the built generator on every location: 24 Maestro entries, all 7 fields. A second boot ran nothing and took no backup; the dev database's sha256 is unchanged
- [ ] Pre-push `/pr-review-toolkit:review-pr`; PLAN.md close-out at merge

## Review notes

**Pre-commit review (2026-11-26, fresh-context reviewer):** no Critical findings and no code bugs; each Contract line matches. Fixed:
- **Important:** the migration comment, its test and this file said T-016 makes the idempotency skip a spare. On a fresh install, where there is no backup, it is the only thing between a crash mid-migration and a failure on every later boot. Reworded in all three.
- **Important:** QA case 5 expected a success toast; the Modules page's Save shows none (the "Saving..." dialog just closes).
- **Minors:** "firmware before 1.3.0" for the 5 s floor (1.2.0 used a position counter; the floor is 1.2.1–1.2.2, ESP T-005); the QA plan's SQL-range warning, `$DB` setup, case 6's hidden settings and over-broad `UPDATE`, case 7's scope, a case 11 claim citing this one-time Verification, and a new case 12 (an older build refuses the database); "fails as before (500)" for a malformed body (an empty body answers 200); an unrestored `logger.warn` spy; the string case's test title; `describe` renamed `formatValue`; `RELEASE_MS_MIN`/`MAX` dropped from the `models/index.ts` barrel (nothing imports them); a stale "before any real m-migration exists" comment in `database.test.ts`.

**Declined (pinned or out of scope):** a stale tab resets a custom value to 5000, and the `problems` strings are English (both Contract); the Vue save path drops `problems` and shows the axios message (T-015); no `CHECK` constraint; the components' local `MaestroChannel` interfaces lack the field (type-only, T-015); no test ties the Vue constants to the API's (`constants/firmware.ts` has none either).
