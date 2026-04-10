# Code Review Phase 4b: Database Migrations

Full plan — schema fixes that require a pre-migration backup system.

## Context

`controller_locations.controller_id` is declared as `integer` in migration_0 but stores text UUIDs. Works due to SQLite's loose typing but will confuse future readers and would break on a stricter DB. Foreign key constraints are also missing on most tables, allowing orphaned records to accumulate.

Before writing these migrations, we need a backup system so a failed migration doesn't leave the DB in an unrecoverable state.

## Tasks

### Step 1: Pre-migration backup system

- [ ] In `astros_api/src/dal/database.ts`, before calling `migrator.migrateToLatest()`:
  1. Check for pending migrations via `migrator.getMigrations()` + comparing against executed
  2. If pending migrations exist AND not in test mode (in-memory DB), copy the SQLite file:
     - Source: `{appdataPath}/database.sqlite3`
     - Dest: `{appdataPath}/database.sqlite3.backup-{YYYYMMDD-HHmmss}`
  3. Log the backup path: `logger.info('Database backed up to: ...')`
  4. Use `fs.copyFileSync` — synchronous is fine here, runs once at startup before migrations

### Step 2: migration_5 — fix controller_locations.controller_id type

- [ ] Create `astros_api/src/dal/migrations/migration_5.ts`
  - Follow rename dance pattern from migration_1:
    1. Read all rows from `controller_locations`
    2. Create `controller_locations_new` with both columns as `text`
    3. Copy data via INSERT (only ~3 rows)
    4. Drop `controller_locations`
    5. Rename `controller_locations_new` → `controller_locations`
  - Include `down` migration that reverses (text → integer, same dance)

- [ ] Register in `astros_api/src/dal/migrations/index.ts` and `database.ts` migration provider

### Step 3: migration_6 — add foreign key constraints

- [ ] Create `astros_api/src/dal/migrations/migration_6.ts`
  - Add `PRAGMA foreign_keys = ON` to connection setup in `database.ts` (applies per-connection, not per-migration)
  - For each table needing FK constraints, use rename dance:
    - `controller_locations`: FK `location_id` → `locations.id`, FK `controller_id` → `controllers.id`
    - `script_channels`: FK `script_id` → `scripts.id`
    - `script_events`: FK `script_id` → `scripts.id`, FK `script_channel_id` → `script_channels.id`
    - `gpio_channels`: FK `location_id` → `locations.id`
    - `maestro_boards`: FK `parent_id` → `uart_modules.id`
    - `maestro_channels`: FK `board_id` → `maestro_boards.id`
    - `kangaroo_x2`: FK `parent_id` → `uart_modules.id`
    - `i2c_modules`: FK `location_id` → `locations.id`
    - `uart_modules`: FK `location_id` → `locations.id`
  - NOTE: `playlist_tracks` already has FK constraint from migration_3

  **Important considerations:**
  - Existing data must satisfy FK constraints before enabling them. If orphaned rows exist, the migration will fail. The migration should clean up orphans before recreating tables with FKs.
  - `CASCADE DELETE` is appropriate for child tables (channels, events, boards) but NOT for join tables like `controller_locations` — use `RESTRICT` or no action there.

- [ ] Register in index and migration provider

## Key files

- `astros_api/src/dal/database.ts` — backup logic + PRAGMA + migration registration
- `astros_api/src/dal/migrations/migration_5.ts` — new
- `astros_api/src/dal/migrations/migration_6.ts` — new
- `astros_api/src/dal/migrations/index.ts` — export new migrations
- `astros_api/src/dal/migrations/migration_1.ts` — reference for rename dance pattern

## Verification

- `cd astros_api && npx vitest run` — all existing migration tests must pass
- Verify backup file is created when pending migrations exist
- Verify backup file is NOT created when no pending migrations
- Verify `controller_locations.controller_id` stores text after migration_5
- Verify FK constraints are enforced after migration_6 (attempt orphan insert, expect failure)
