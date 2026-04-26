# Plan: Honor `DATABASE_PATH` env for SQLite location

## Context

`astros_api/src/dal/database.ts:28` hardcodes the SQLite file to `appdata('astrosserver')/database.sqlite3`. The env files already declare `DATABASE_PATH=%AppData%` (`astros_api/.env.example:2`, `astros_api/.env.test:2`, `Dockerfile:32`), but nothing reads the variable — it's a dangling config.

Users deploying to systems where the OS-default app-data directory is awkward (custom Docker volumes, shared mount points, tmpfs test rigs) need to override the DB location. This change wires `DATABASE_PATH` up and treats `%AppData%` (case-insensitive) as a sentinel meaning "use the default appdata directory" so existing configs and the Dockerfile keep working unchanged.

Scope is deliberately limited to the database path. Other code that calls `appdata('astrosserver')` (`logger.ts`, `file_controller.ts`, `audio_controller.ts`, `settings_controller.ts`) is out of scope for this change.

## Design decisions (confirmed with user)

- `DATABASE_PATH` is a **directory**, not a full file path. `database.sqlite3` is always appended. This mirrors the current semantic where `appdata('astrosserver')` is just a directory.
- Fallback to default applies when the env var is **unset, empty, or equal to `%AppData%` (case-insensitive)**.
- If the resolved directory does not exist, **create it** with `fs.mkdirSync(dir, { recursive: true })` to avoid opaque `SQLITE_CANTOPEN` errors. `appdata-path` already handles this for the default case; we need parity for custom paths.

## Files to modify

### `astros_api/src/dal/database.ts` (primary change)

1. Add `import fs from 'fs';` alongside the existing `path` import.
2. Add a small, exported, pure helper:
   ```ts
   export function resolveDatabaseDir(envValue: string | undefined): string {
     if (!envValue || envValue.toLowerCase() === '%appdata%') {
       return appdata('astrosserver');
     }
     return envValue;
   }
   ```
3. Replace lines 28–29:
   ```ts
   const appdataPath = appdata('astrosserver');
   const databaseFile = '/database.sqlite3';
   ```
   with:
   ```ts
   const databaseDir = resolveDatabaseDir(process.env.DATABASE_PATH);
   const databaseFile = path.join(databaseDir, 'database.sqlite3');
   ```
4. In the non-test branch (currently lines 40–45), `fs.mkdirSync(databaseDir, { recursive: true })` before instantiating `SQLite`, and update the log + `SQLite(...)` call to use `databaseFile`.
5. Leave the `NODE_ENV === 'test'` `:memory:` branch untouched — tests must continue to ignore `DATABASE_PATH`.

### `astros_api/src/dal/database.test.ts` (new)

Unit-test `resolveDatabaseDir` against:
- `undefined` → default appdata dir
- `''` → default appdata dir
- `'%AppData%'` → default appdata dir
- `'%appdata%'` → default appdata dir (case-insensitive)
- `'%APPDATA%'` → default appdata dir
- `'/var/lib/astros'` → `'/var/lib/astros'` (pass-through)

Using vitest (already the project's test runner — see `astros_api/package.json` `npm run test`).

## Files intentionally NOT changed

- `astros_api/.env.example`, `astros_api/.env.test`, `Dockerfile` — already contain `DATABASE_PATH=%AppData%`, which is exactly the sentinel the new code honors. No change needed.
- `logger.ts`, `file_controller.ts`, `audio_controller.ts`, `settings_controller.ts` — out of scope; user asked for DB path only.

## Task checklist

- [x] Add `resolveDatabaseDir` helper + `fs.mkdirSync` call in `astros_api/src/dal/database.ts`
- [x] Add unit tests in `astros_api/src/dal/database.test.ts`
- [x] Run lint + prettier + build + test (per CLAUDE.md pre-commit rule)
- [x] Commit

## Verification

1. Type-check + lint: `cd astros_api && npm run build`
2. Unit tests: `cd astros_api && npm run test -- database` (expect `resolveDatabaseDir` cases to pass)
3. Full suite: `cd astros_api && npm run test` — all tests still pass (they use `:memory:`, so DB-path resolution is bypassed).
4. Manual smoke (not automated — serial/DB boot code is on the TDD-exempt list):
   - `DATABASE_PATH=%AppData% npm run start:tsx` → log prints the default appdata path.
   - `DATABASE_PATH=/tmp/astros-smoke npm run start:tsx` → log prints `/tmp/astros-smoke/database.sqlite3`; directory is auto-created; file appears.
   - `unset DATABASE_PATH && npm run start:tsx` → log prints the default appdata path.

## Classification

Light plan per `CLAUDE.md`: one file of production code + one test file, single layer, ≤5 tasks, no new abstractions beyond a pure helper function.
