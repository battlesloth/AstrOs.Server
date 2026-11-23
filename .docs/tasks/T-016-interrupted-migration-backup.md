# T-016: Keep the pre-migration backup when a migration is interrupted

<!-- File: .docs/tasks/T-016-interrupted-migration-backup.md. Branch: feature/T-016-interrupted-migration-backup. PR title: "T-016: Keep the pre-migration backup when a migration is interrupted". -->

## Context

- **Found by:** the T-012 pre-push review (2026-11-22, silent-failure hunter). It is pre-existing; PLAN.md Backlog § From the T-012 pre-push review, first item.
- **Decision (Jeff, 2026-11-22):** a new task before T-013, because T-013 ships the first migration to droids since this was found.
- **Project:** PLAN.md § Per-channel servo release time (prerequisite for T-013).

**The bug.** `initializeDatabase` (`dal/database.ts`) runs: backup → migrate → on failure, restore. `createBackup` (`dal/backup.ts`) names the backup after the last applied migration and unlinks any existing file of that name first. Kysely's SQLite adapter runs migrations without a transaction, so a failed or interrupted migration leaves partial writes; the backup restore is the rollback. Two paths leave a half-migrated database whose last applied migration hasn't changed:
- **A power cut mid-migration.** A droid's SBC losing power is realistic.
- **`MIGRATION_FAILED_RESTORE_FAILED`.**

On the next boot, `createBackup` unlinks the only pre-migration copy and backs up the half-migrated database in its place. The migration then fails again (e.g. `table … already exists`) and the server reports `MIGRATION_FAILED_RESTORED`, having "restored" the half-migrated file. The good copy is gone.

The reviewer reproduced it: a migration that creates a table and then throws, with the restore failing on boot 1. On boot 2 the backup holds the partial table.

## Contract (pinned — do not change)

- **The sentinel.** `<dbFile>.migration-in-progress`: a JSON file `{ "backupPath": string, "lastApplied": string, "startedAt": ISO string }`.
  - It is written **after** `createBackup` succeeds and **before** `migrateToLatest` runs: written to `<sentinel>.tmp`, fsynced, renamed into place, and the directory fsynced.
  - It is removed after a migration run succeeds (after `assertNoFkViolations`, before `pruneOldBackups`) and after a successful restore. It is **kept** when the restore fails.
- **Startup with a sentinel present** (checked after the newer-database check, before `checkPendingMigrations` and any backup):
  - **The recorded backup exists and opens as SQLite** (`PRAGMA quick_check` answers `ok`):
    - restore it over `dbFile` with the existing `restoreBackup`, log `warn` "Restored <backup> after an interrupted migration (started <startedAt>)", remove the sentinel
    - then continue the normal flow: pending → backup (of the restored, known-good file) → migrate
  - **The sentinel is unreadable or not valid JSON, or its backup is missing or fails the check:**
    - enter read-only with the new code `MIGRATION_INTERRUPTED`
    - touch no file: no backup, no migrate, no prune
    - the detail names the sentinel and the backup path
- **The new read-only code `MIGRATION_INTERRUPTED`:**
  - added to `ReadOnlyReasonCode` (`astros_api/src/system_status.ts`) and to its Vue mirror (`astros_vue/src/models/websocket/systemStatusMessage.ts` and the `systemStatus` store)
  - an `enUS.json` message for the banner (`AstrosSystemStatusBanner`), worded in the same style as the other codes
  - it is first-wins like every code
- **Unchanged:**
  - backup names, pruning (5 newest), `restoreBackup`, the `DB_NEWER_THAN_SERVER` precedence, the other read-only codes
  - the migrate path when no sentinel exists

## Task

- **`dal/backup.ts`** gains `writeMigrationSentinel(dbFile, { backupPath, lastApplied })`, `readMigrationSentinel(dbFile): MigrationSentinel | 'unreadable' | null` and `removeMigrationSentinel(dbFile)`, with an atomic write as pinned.
- **`initializeDatabase`** gets the sentinel steps above, at the pinned points.
- **The new code** goes in the API, Vue and i18n per the Contract.
- **QA plan `.docs/qa/system-readonly-mode.md`:**
  - interrupted migration, recovered: stage a sentinel plus its backup by hand → the startup log shows the restore, then a normal migrate
  - interrupted migration with a missing backup → the `MIGRATION_INTERRUPTED` banner
  - the reviewer's reproduction → the backup survives

## Acceptance criteria

- [ ] **The reviewer's reproduction:**
  - boot 1: migration fails and restore fails → `MIGRATION_FAILED_RESTORE_FAILED`, and the sentinel remains
  - boot 2 with a working restore → the good backup is restored first, the migration retries, and the backup on disk still has no partial table
  - Mutation: drop the sentinel check and see it fail.
- [ ] **A successful migration leaves no sentinel. A failed migration whose restore succeeds leaves none either.**
- [ ] **A sentinel whose backup is missing** → `MIGRATION_INTERRUPTED`; the database file's sha256 and the backup directory's listing are unchanged.
- [ ] **A corrupt sentinel** (`{`) → `MIGRATION_INTERRUPTED`, with nothing touched.
- [ ] **A sentinel left after a migration that succeeded but crashed before cleanup:**
  - next boot: restore, then re-migrate to the same end state
  - simulated by writing the sentinel by hand after a good migrate
- [ ] **`writeMigrationSentinel` leaves no `.tmp` behind on success.** A failed write throws before `migrateToLatest` runs, entering `BACKUP_FAILED`, since without a sentinel the backup isn't protected.
- [ ] **The Vue banner** shows the new code's message (store and banner specs).
- [ ] **The QA plan** is updated.

## Out of scope

- Kysely's wall-clock timestamp ordering (Backlog).
- A startup naming check (Backlog).
- Transactional migrations.
- Changing backup retention.
- An interrupted *fresh* install: no applied migrations means no backup to protect. It stays as today.

## Verification

- `cd astros_api && npx vitest run` (the new cases in `dal/database.integration.test.ts` and `dal/backup.test.ts`); `npm run prettier:write && npm run lint:fix`; `npm run build`.
- `cd astros_vue && npx vitest run`; `npm run format && npm run lint`; `npm run build`.
- **By hand, on a copy of the dev database:**
  1. Stage the reviewer's reproduction with an injected failing migration (a temporary `m950_test_*` entry in `PRODUCTION_MIGRATIONS`, reverted after).
  2. Kill the API (`kill -9`) mid-migration with a migration that sleeps.
  3. Restart: the restore log line appears, and the backup's contents match the pre-migration copy (sha256).

## Failure-mode inventory

### 1. External-call error coverage

| Call | Error / condition | Response |
|---|---|---|
| write `<sentinel>.tmp` | ENOSPC / EACCES | throw before migrate → `BACKUP_FAILED`; unlink a partial `.tmp` best-effort |
| fsync file / rename / fsync dir | EIO / EXDEV (the tmp file is in the same dir, so not expected) | throw → `BACKUP_FAILED` |
| read the sentinel | ENOENT | no sentinel → normal flow |
| read the sentinel | EACCES / EISDIR / JSON parse error / missing fields | `'unreadable'` → `MIGRATION_INTERRUPTED` |
| open the backup for `quick_check` | ENOENT / not a database / check ≠ `ok` | `MIGRATION_INTERRUPTED` |
| `restoreBackup` (copyFileSync) | any | `MIGRATION_INTERRUPTED` (the sentinel is kept, so the next boot retries) |
| unlink the sentinel | ENOENT | ignore (already gone) |
| unlink the sentinel | EACCES | log `error`, enter `MIGRATION_INTERRUPTED`, since a stale sentinel would restore over good data next boot |

### 2. Crash-recovery state matrix

| Crash after | db | backup | sentinel | Next boot | Status |
|---|---|---|---|---|---|
| `createBackup` | pre-migration | good | absent | backup rewritten from the still-good db, then migrate | consistent ✓ |
| sentinel written | pre-migration | good | present | restore (no-op content), migrate | consistent ✓ |
| mid-migration | partial | good | present | restore good, migrate | consistent ✓ (the bug) |
| migration done, before sentinel removal | migrated | good | present | restore good, re-migrate | consistent ✓ (repeats work) |
| failed migration, mid-restore copy | torn | good | present | restore good again | consistent ✓ |
| successful restore, before sentinel removal | good | good | present | restore again (idempotent), migrate | consistent ✓ |
| `prune` | migrated | good | absent | normal | consistent ✓ |

### 3. Concurrency state

- **One process touches the database files:** the API at startup, before the HTTP server and serial worker start.
- **Two servers on one data dir** are unsupported, as today: no lock is added.
- **A test changing `PRODUCTION_MIGRATIONS` at runtime** is prevented by `Object.freeze`.

### 4. Cross-platform / cross-environment differences

- **The production target** is Linux containers on Pi-class SBCs, often on SD cards.
- **fsync** of the directory is needed for the rename to be durable on ext4. Use `fs.openSync(dir, 'r')` and `fsyncSync`.
- **`fs.rename`** within one directory is atomic on POSIX.
- **Windows dev machines** may lack directory fsync: skip it when it isn't supported (EPERM/EISDIR), and log `debug`.

## Implementation checklist

<!-- Added when work starts. -->
