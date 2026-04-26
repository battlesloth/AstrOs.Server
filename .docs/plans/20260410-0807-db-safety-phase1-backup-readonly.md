# DB Safety — Phase 1: Backup + Read-Only Mode Infrastructure

Part 1 of 3 of the DB Migration Safety Net feature. Companion phases:

- Phase 2 — `20260410-0807-db-safety-phase2-schema-migrations.md` (depends on phase 1)
- Phase 3 — `20260410-0807-db-safety-phase3-vue-readonly-ui.md` (depends on phase 1)

## Context

Phase 4b of the code review set out to fix `controller_locations.controller_id`'s wrong type and add foreign-key constraints to ~9 tables. During review it became clear the migrations can't ship safely without infrastructure that doesn't exist yet: a pre-migration backup, a restore-on-failure path, and a read-only safety mode when both fail. This phase lays that foundation. Phases 2 and 3 build on it.

**Deployment assumption:** AstrOs runs in Docker. Recovery from a failed migration is a container rollback or redeploy — so the read-only state is **in-memory only**. The container restart IS the recovery action. The backup naming scheme (below) ensures crash loops don't spam the disk.

## Goal

Wire up a safe startup flow: detect pending migrations → take a hot backup → run migrations → on failure, restore from backup → on unrecoverable failure, enter read-only mode. Expose the mode via an HTTP endpoint and a WebSocket push. Block writes with a middleware when the mode is active.

## Key design decisions (locked)

- **Backup mechanism:** `better-sqlite3`'s `db.backup(destPath)` (true SQLite hot backup). Requires holding a reference to the raw `SQLite.Database`, not just the Kysely wrapper.
- **Backup filename:** `database.sqlite3.backup-{lastAppliedMigrationName}`, e.g. `database.sqlite3.backup-4_add_random_wait`. One file per DB version — same-version backup **overwrites** the previous file.
- **Retention:** keep the last 5 **distinct version** backup files, pruned by mtime.
- **Skip backup:** when no pending migrations, or when running in test mode (`NODE_ENV=test`, `:memory:`).
- **Read-only state:** in-memory singleton (`SystemStatus` class). No persistence.
- **Write guard:** Express middleware installed before the `/api` router chokepoint in `api_server.ts`.
- **Guard rule:** in read-only mode, block any `POST/PUT/PATCH/DELETE` AND the five serial-write GETs (`/locations/syncconfig`, `/locations/synccontrollers`, `/scripts/upload`, `/scripts/run`, `/playlists/run`), **except** the allowlist: `POST /login`, `POST /reauth`, `POST /panicStop`, `POST /panicClear`.
- **Status exposure:** new `GET /api/system/status` endpoint (no auth). WebSocket pushes a `SYSTEM_STATUS` message on connect and whenever the state changes.
- **Backup failure = enter read-only**, migrations skipped.
- **Migration failure → restore backup.** Restore success = server continues at pre-migration version. Restore failure = enter read-only.
- **Do not add a "clear read-only mode" endpoint.** Recovery path is a container restart.

## Required `database.ts` refactor

The current module eagerly constructs the Kysely instance at import time (bare `const` export). Restore-on-failure requires closing and re-opening the connection, which is incompatible with that pattern. Refactor:

```typescript
// database.ts — new shape
let _db: Kysely<Database> | null = null;
let _rawSqlite: SQLite.Database | null = null;

export async function initializeDatabase(systemStatus: SystemStatus): Promise<Kysely<Database>> {
  // Bootstrap flow: backup → migrate → restore-on-failure → read-only-on-failure
  // Sets _db and _rawSqlite as side effects.
  return _db;
}

export function getDb(): Kysely<Database> {
  if (!_db) throw new Error('Database not initialized — call initializeDatabase() first');
  return _db;
}
```

**Ripple-effect minimization:** every repository currently accepts `db` as a constructor argument, so the refactor can stop at `api_server.ts`. `Init()` calls `await initializeDatabase(systemStatus)` once, stores the connection on `this.db`, and passes it to `register*Routes(router, authHandler, db)` as before. No per-repo churn. Audit for any stray direct `import { db }` usages and route them through `getDb()` if eliminating the import is awkward.

## Tasks

- [x] Create `astros_api/src/system_status.ts` with a `SystemStatus` class:
  - `isReadOnly(): boolean`
  - `enterReadOnly(reason: string): void` — logs at error level, notifies subscribers, sets `enteredAt` timestamp
  - `getState(): { readOnly: boolean; reason?: string; enteredAt?: string }`
  - `subscribe(cb): () => void` — returns unsubscribe fn, used by WebSocket
  - No disk persistence.

- [x] Create `astros_api/src/dal/backup.ts`:
  - `checkPendingMigrations(db, provider): Promise<string[]>` — queries `kysely_migration`, treats "table missing" as "all pending".
  - `getLastAppliedMigrationName(db): Promise<string | null>` — returns the latest row in `kysely_migration` by `timestamp`, or null.
  - `createBackup(rawSqlite, dbPath, lastMigrationName): Promise<string>` — builds `${dbPath}.backup-${lastMigrationName}`, calls `rawSqlite.backup(destPath)` (overwrites same-name), returns path.
  - `pruneOldBackups(appdataPath, keep = 5): void` — globs `database.sqlite3.backup-*`, sorts by mtime desc, unlinks index 5+.
  - `restoreBackup(backupPath, dbPath): void` — `fs.copyFileSync`.

- [x] Refactor `astros_api/src/dal/database.ts`:
  - Replace `export const db` with `_db` module-local + `initializeDatabase()` and `getDb()`.
  - `initializeDatabase(systemStatus)` flow:
    1. In `NODE_ENV=test`: open `:memory:`, run migrations directly, return (no backup dance).
    2. Open raw `better-sqlite3` instance. Set `PRAGMA foreign_keys = ON`.
    3. Wrap in Kysely, store both references.
    4. Compute pending migrations + last-applied name.
    5. If pending: try `createBackup()`. On failure → `systemStatus.enterReadOnly('backup failed: ...')`, **skip migration**, return connection.
    6. Run `migrateToLatest()`. On success → `pruneOldBackups(5)`, return.
    7. On migration failure: log, close connection, `restoreBackup()`, re-open connection, log "restored from backup after failed migration". If the restore throws → `systemStatus.enterReadOnly('migration failed and restore failed: ...')`.
  - Export `getDb()` for places that can't receive the connection via constructor.

- [x] Create `astros_api/src/write_guard.ts`:
  - Export `writeGuard(systemStatus): RequestHandler`.
  - `BLOCKED_WRITE_METHODS = new Set(['POST','PUT','PATCH','DELETE'])`.
  - `ALLOWED_IN_READONLY: Array<{ method, path }>` = `/login`, `/reauth`, `/panicStop`, `/panicClear` (all POST).
  - `BLOCKED_GET_PATHS = ['/locations/syncconfig','/locations/synccontrollers','/scripts/upload','/scripts/run','/playlists/run']`.
  - Logic: if not read-only, `next()`. Else: if allowlisted, `next()`. Else if method blocked OR (GET ∧ path in BLOCKED_GET_PATHS), send 503 `{ message, reason }`. Else `next()`.
  - `req.path` is relative to the router mount, so comparisons are `/login`, `/scripts/upload`, etc.

- [x] Create `astros_api/src/controllers/system_status_controller.ts`:
  - `registerSystemStatusRoutes(router, systemStatus)` — **no authHandler**, public.
  - `GET /system/status` → returns `systemStatus.getState()`.

- [x] Wire it all up in `astros_api/src/api_server.ts`:
  - Construct a `SystemStatus` on the `ApiServer` instance.
  - In `Init()`, call `await initializeDatabase(this.systemStatus)` and hold the connection on `this.db`. Pass it to all `register*Routes` calls.
  - In `configApi()`, install the `writeGuard(this.systemStatus)` middleware **before** `this.app.use('/api', this.router)`.
  - Register the new system status route.
  - In `runWebServices()`, on each WebSocket connection, immediately send `{ type: TransmissionType.systemStatus, data: systemStatus.getState() }`. Subscribe to `systemStatus` changes and broadcast to all connected clients when state changes.

- [x] Update `astros_api/src/models/index.ts` — add `TransmissionType.systemStatus` constant for the WebSocket message discrimination.

## Tests

- [x] `astros_api/src/system_status.test.ts` — state transitions, reason/timestamp capture, subscribe/unsubscribe, notifications.
- [x] `astros_api/src/dal/backup.test.ts` (use `os.tmpdir()` + `fs.mkdtempSync()`):
  - `checkPendingMigrations` returns all migrations on a fresh DB with no `kysely_migration` table.
  - Returns `[]` on a fully-migrated DB.
  - `createBackup` writes a file with the expected name and byte-for-byte content.
  - Same-version backup overwrites (not duplicated).
  - `pruneOldBackups(5)` keeps the 5 newest by mtime, deletes older.
- [x] `astros_api/src/dal/database.integration.test.ts`:
  - Happy path: no pending migrations → no backup taken.
  - Happy path + pending migrations → backup + migrate succeed → backup retained.
  - Failing migration: inject a bad migration, verify backup taken, restore succeeds, system usable at pre-migration state.
  - Failing migration + failing restore (simulated via permission drop or mock): verify `SystemStatus` is read-only with clear reason.
  - Backup failure (simulated via read-only dir): verify `SystemStatus` is read-only and migration is skipped.
- [x] `astros_api/src/write_guard.test.ts`:
  - Pass-through when not read-only (all methods + paths).
  - Blocks POST/PUT/PATCH/DELETE in read-only.
  - Allows all GETs in read-only EXCEPT the five serial-write paths.
  - Allows allowlisted POSTs (`/login`, `/reauth`, `/panicStop`, `/panicClear`).
  - Response body includes `reason`.

## Critical files

- `astros_api/src/system_status.ts` — new
- `astros_api/src/write_guard.ts` — new
- `astros_api/src/dal/backup.ts` — new
- `astros_api/src/controllers/system_status_controller.ts` — new
- `astros_api/src/dal/database.ts` — refactor (async init, connection lifecycle)
- `astros_api/src/api_server.ts` — wire everything together
- `astros_api/src/models/index.ts` — add `TransmissionType.systemStatus`

## Verification

- `cd astros_api && npx vitest run` — all existing + new tests pass.
- `cd astros_api && npx tsc --noEmit` — clean.
- Manual: run the server with no pending migrations → no backup file. Add a pending migration stub → restart → backup file appears. Delete it, corrupt the stub to throw → restart → read-only state entered, reason logged.

## Notes

- Reuse `appdata-path` for backup paths; don't hardcode.
- Test mode (`NODE_ENV=test`, `:memory:`) skips backup entirely and installs a no-op write guard so existing tests need no harness changes.
- Phase 1 sets `PRAGMA foreign_keys = ON` at connection open. Phase 2 will add an off-during-migrate toggle when migrations 5/6 need it.
- Design doc (full context and Phase 2/3 details): `~/.claude/plans/atomic-fluttering-token.md`.
