# Light Plan: Inject DB into Controllers

## Context

Controllers hard-import `db` from `dal/database.ts`, making them untestable without module mocking. Refactor to inject `db` via the registration function so tests can pass an in-memory DB.

## Tasks

- [x] Add `db` parameter to all 7 controller registration functions that use it
- [x] Update `ApiKeyValidator` to accept `db` parameter
- [x] Remove `import { db }` from all controllers and api_key_validator
- [x] Update `api_server.ts` to pass `db` to all registration calls and `ApiKeyValidator(db)`
- [x] Run full test suite, verify nothing broke

## Files to modify

- `controllers/locations_controller.ts`
- `controllers/scripts_controller.ts`
- `controllers/playlist_controller.ts`
- `controllers/audio_controller.ts`
- `controllers/file_controller.ts`
- `controllers/remote_config_controller.ts`
- `controllers/settings_controller.ts`
- `api_key_validator.ts`
- `api_server.ts`

## Verification

```bash
cd astros_api && npx vitest run
```
