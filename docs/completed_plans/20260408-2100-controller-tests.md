# Light Plan: Controller + ApiKeyValidator Tests

## Context

Controllers now accept injected `db`, making them testable with in-memory SQLite. Focus on controllers with meaningful logic beyond simple CRUD delegation.

## Tasks

- [x] ApiKeyValidator tests — valid token, missing token, wrong token, no apikey in DB
- [x] Authentication controller tests — reauth JWT renewal window logic
- [x] Locations controller tests — getLocations classification into LocationCollection, saveLocations multi-save
- [x] Scripts controller tests — cascade delete (script + playlist tracks)
- [x] Playlist controller tests — CRUD + 404 handling
- [x] Run full suite, verify

## Test approach

Use real in-memory DB with migrations. Mock Express `req`/`res` objects with `vi.fn()` for `status`, `json`, `sendStatus`. Call exported handler functions directly with injected `db`.

## Files to create

- `astros_api/src/api_key_validator.test.ts`
- `astros_api/src/controllers/authentication_controller.test.ts`
- `astros_api/src/controllers/locations_controller.test.ts`
- `astros_api/src/controllers/scripts_controller.test.ts`
- `astros_api/src/controllers/playlist_controller.test.ts`

## Verification

```bash
cd astros_api && npx vitest run
```
