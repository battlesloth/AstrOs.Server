# Repository Unit Tests — Phase 1: Simple Repos

## Context

The astros_api has poor test coverage on its data access layer. 6 repositories have no tests at all. This phase covers the 5 simpler ones. LocationsRepository is deferred to its own phase due to its complex transaction logic and cross-repository dependencies.

## Repos to test (ordered by complexity)

### 1. UserRepository — 1 method
- `getByUsername(name)` — simple select from `users` table
- Tests: found, not found

### 2. SettingsRepository — 2 methods  
- `getSetting(type)` — select from `settings`
- `saveSetting(key, value)` — upsert via ON CONFLICT
- Tests: insert new, update existing, get existing, get missing

### 3. RemoteConfigRepository — 2 methods
- `getConfig(type)` — select from `remote_config`
- `saveConfig(type, json)` — upsert via ON CONFLICT
- Tests: insert new, update existing, get existing, get missing (returns undefined)

### 4. AudioFileRepository — 5 methods
- `getAudioFiles()`, `insertFile(id, fileName)`, `filesNeedingDuration()`, `updateFileDuration(id, duration)`, `deleteFile(id)`
- Tests: insert + get, duration filter, update duration, delete, empty list

### 5. ControllerRepository — 7 methods
- `insertControllers(controllers[])` — bulk insert with deduplication (reuses IDs, removes stale)
- `insertController(controller)` — single insert
- `updateController(controller)` — update name/address
- `getControllers()`, `getControllerById(id)`, `getControllerByAddress(address)`, `getControllerByLocationId(locationId)`
- Tests: CRUD, deduplication logic (matching address, matching name), ID preservation, getByLocationId join

## Tasks

- [x] UserRepository tests
- [x] SettingsRepository tests
- [x] RemoteConfigRepository tests
- [x] AudioFileRepository tests
- [x] ControllerRepository tests
- [x] Run full suite, verify all pass

## Pattern

Follow existing pattern from `playlist_repository.test.ts`:
- In-memory SQLite via `db` export (NODE_ENV=test)
- `migrateToLatest(db)` in `beforeAll`
- Use real Kysely DB, no mocks

## Files to create

- `astros_api/src/dal/repositories/user_repository.test.ts`
- `astros_api/src/dal/repositories/settings_repository.test.ts`
- `astros_api/src/dal/repositories/remote_config_repository.test.ts`
- `astros_api/src/dal/repositories/audio_file_repository.test.ts`
- `astros_api/src/dal/repositories/controller_repository.test.ts`

## Verification

```bash
cd astros_api && npx vitest run
```
