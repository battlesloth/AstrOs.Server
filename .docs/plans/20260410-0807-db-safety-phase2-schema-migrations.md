# DB Safety — Phase 2: Schema Migrations

Part 2 of 3 of the DB Migration Safety Net feature. Companion phases:

- Phase 1 — `20260410-0807-db-safety-phase1-backup-readonly.md` (**must ship first**)
- Phase 3 — `20260410-0807-db-safety-phase3-vue-readonly-ui.md` (independent of this phase)

## Context

The original phase 4b code review item was "fix `controller_locations.controller_id` type and add FK constraints." That work became unsafe to ship without phase 1's backup/read-only infrastructure — a broken FK migration on a production DB with no rollback would be catastrophic. Phase 2 rides on top of phase 1's safety net.

There's also a hidden blocker in the repository layer: `insertControllers` uses a delete-then-insert pattern to update controllers while preserving the UUID so `controller_locations` stays pointing at it. Once `controller_locations.controller_id` has a FK with `RESTRICT` semantics, the DELETE fails. `insertControllers` must be refactored **first**, then the migrations can add FKs safely.

## Goal

Fix `controller_locations.controller_id`'s declared type, add foreign-key constraints across the schema with appropriate CASCADE/RESTRICT actions, and refactor `insertControllers` to no longer rely on delete-then-insert to preserve FK references.

## Prerequisite: FK pragma + transactional safety

SQLite's `PRAGMA foreign_keys` cannot be toggled inside a transaction, and Kysely wraps each migration in a transaction. To do the rename dance cleanly, FK enforcement must be **OFF during migrations** and **ON after**:

- `initializeDatabase()` (from phase 1) opens the connection with `PRAGMA foreign_keys = OFF` **before** running migrations.
- After `migrateToLatest()` returns, set `PRAGMA foreign_keys = ON` before handing the connection to the app.
- All runtime code thereafter benefits from FK enforcement.

This is a small edit to phase 1's `initializeDatabase()` flow — the pragma toggle belongs here because it's a phase 2 requirement.

## Tasks

### Part A — refactor `insertControllers` (blocks migration_6)

- [ ] Rewrite `insertControllers` in `astros_api/src/dal/repositories/controller_repository.ts:11-70` to UPDATE-in-place:
  - Find all rows matching by `address` OR `name`.
  - If 0 matches → `INSERT` with a fresh UUID.
  - If ≥1 matches → keep the first row (stable id), `UPDATE` its `name`/`address` fields, `DELETE` any additional duplicates.
  - The keeper row is **never** deleted-then-reinserted, so any `controller_locations` FK pointing at it stays valid throughout.

- [ ] Revisit `astros_api/src/dal/repositories/controller_repository.test.ts` — existing tests cover "new controller", "duplicate address", "duplicate name", and "update existing". Verify they pass against the new implementation; tweak only if the refactor legitimately changes behavior (e.g. duplicate-merge semantics).

- [ ] **Regression guard test:** insert a `controller_locations` row pointing at an existing controller, call `insertControllers` for that controller, assert the `controller_locations` row still exists afterward with the same `controller_id`. This is the specific behavior migration_6's FK will enforce.

### Part B — migration_5: fix `controller_locations.controller_id` type

- [ ] Create `astros_api/src/dal/migrations/migration_5.ts`:
  - `up`: read all rows, drop the table, recreate with both columns as `text`, re-insert rows. **No FKs yet** — that's migration_6.
  - `down`: reverse — drop, recreate with `controller_id integer`, re-insert. (SQLite's loose typing means the data survives round-trip even though the declared type differs.)
- [ ] Register in `astros_api/src/dal/migrations/index.ts` and add to the migration provider in `database.ts`.

### Part C — migration_6: foreign-key constraints + orphan cleanup

Target tables and FK actions:

| Table | Column | References | On delete |
|---|---|---|---|
| `controller_locations` | `location_id` | `locations.id` | RESTRICT |
| `controller_locations` | `controller_id` | `controllers.id` | RESTRICT |
| `script_channels` | `script_id` | `scripts.id` | CASCADE |
| `script_events` | `script_id` | `scripts.id` | CASCADE |
| `script_events` | `script_channel_id` | `script_channels.id` | CASCADE |
| `script_deployments` | `script_id` | `scripts.id` | CASCADE |
| `script_deployments` | `location_id` | `locations.id` | CASCADE |
| `gpio_channels` | `location_id` | `locations.id` | CASCADE |
| `i2c_modules` | `location_id` | `locations.id` | CASCADE |
| `uart_modules` | `location_id` | `locations.id` | CASCADE |
| `maestro_boards` | `parent_id` | `uart_modules.id` | CASCADE |
| `maestro_channels` | `board_id` | `maestro_boards.id` | CASCADE |
| `kangaroo_x2` | `parent_id` | `uart_modules.id` | CASCADE |

`playlist_tracks.playlist_id → playlists.id` already has an FK from migration_3 — leave it alone.

**Per-table procedure inside migration_6:**

1. Delete orphaned rows (`WHERE referenced_id NOT IN (SELECT id FROM ref_table)`) before the rename dance. Log the count.
2. Create `{table}_new` with identical columns **plus** `addForeignKeyConstraint(...)` calls.
3. `INSERT INTO {table}_new SELECT * FROM {table}`.
4. `DROP TABLE {table}`.
5. `ALTER TABLE {table}_new RENAME TO {table}`.

Reference: `migration_1.ts` for the rename-dance pattern, Kysely's `addForeignKeyConstraint(name, columns, targetTable, targetColumns)` builder. Kysely also supports `.onDelete('cascade'|'restrict')`.

- [ ] Create `astros_api/src/dal/migrations/migration_6.ts`:
  - `up`: iterate through the table list above, performing orphan cleanup + rename dance per table.
  - `down`: **full symmetric down** — for each table, rename dance in reverse, recreating the table without FK constraints. Verbose (~13 tables × reverse dance) but keeps the down path honest.
- [ ] Register in `astros_api/src/dal/migrations/index.ts` and `database.ts`.

### Part D — FK pragma toggle in phase 1's `initializeDatabase`

- [ ] In `astros_api/src/dal/database.ts` `initializeDatabase()`, bracket the migrator call with `PRAGMA foreign_keys = OFF` before and `PRAGMA foreign_keys = ON` after. The default at open is already ON (from phase 1), so this only adds the off/on wrapping during the migrate step.

## Tests

- [ ] `astros_api/src/dal/migrations/migration_5.test.ts`:
  - Apply migrations 0–4, insert a `controller_locations` row, apply migration_5, verify the row is still there with the same values.
  - Verify declared column type via `PRAGMA table_info(controller_locations)` → `controller_id` is `TEXT`.
  - Round-trip: apply migration_5 then its `down`, verify structure returns.

- [ ] `astros_api/src/dal/migrations/migration_6.test.ts`:
  - Apply all migrations through migration_6 on a fresh DB.
  - Verify each FK is enforced: attempt to insert an orphan row for each constrained table, expect `FOREIGN KEY constraint failed`.
  - Verify CASCADE works: delete a `scripts` row, assert `script_channels` and `script_events` for that script are gone.
  - Verify RESTRICT works: for `controllers` with an existing `controller_locations` link, attempt to delete the controller, expect the delete to be rejected.
  - Orphan cleanup: seed a pre-migration DB with known orphans (e.g. a `script_channels` row whose `script_id` doesn't exist), apply migration_6, assert the orphan is gone and no other rows are affected.
  - Round-trip: apply, then down, then apply again — tables round-trip.

- [ ] `astros_api/src/dal/repositories/controller_repository.test.ts` — add the regression test from Part A.

## Critical files

- `astros_api/src/dal/repositories/controller_repository.ts` — refactor `insertControllers`
- `astros_api/src/dal/repositories/controller_repository.test.ts` — regression test
- `astros_api/src/dal/migrations/migration_5.ts` — new
- `astros_api/src/dal/migrations/migration_6.ts` — new
- `astros_api/src/dal/migrations/index.ts` — export new migrations
- `astros_api/src/dal/database.ts` — register new migrations + FK pragma bracketing

## Verification

- `cd astros_api && npx vitest run` — all existing + new tests pass.
- `cd astros_api && npx tsc --noEmit` — clean.
- **Integration (manual, against a real DB):**
  - On a production-like DB snapshot, run the migrations. Verify `PRAGMA foreign_keys;` returns `1` and `PRAGMA table_info(controller_locations);` shows `controller_id` as `TEXT`.
  - Attempt an orphan insert via the sqlite3 CLI; expect rejection.
  - Simulate a controller re-registration via the existing serial test harness and verify `insertControllers` does not throw under FK enforcement.
- **Safety net test (relies on phase 1):** deliberately break migration_6 with a `throw`, restart, verify the backup is taken, the migration fails, the restore succeeds, and the system returns to usable state at v4.

## Notes

- The orphan-cleanup step is critical — any existing deployment with stale `script_channels` or `gpio_channels` will fail the migration without it.
- Test fixtures for migration_6 should seed a DB with intentional orphans to catch regressions in the cleanup logic.
- The full design doc lives at `~/.claude/plans/atomic-fluttering-token.md`.
