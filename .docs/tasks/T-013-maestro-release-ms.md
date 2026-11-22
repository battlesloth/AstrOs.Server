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
  - `GET /api/locations/` shows `releaseMs: 5000` on every Maestro channel.
  - Saving the Modules page unchanged keeps 5000.
  - A sync (still 7 fields) behaves as before.

## Implementation checklist

<!-- Added when work starts. -->
