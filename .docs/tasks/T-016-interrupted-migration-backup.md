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

### Contract amendments (Jeff, 2026-11-22, from the pre-commit review)

- **`restoreBackup` is atomic** (supersedes "`restoreBackup` unchanged"). It copies the backup to `<dbFile>.restore-tmp`, fsyncs it, renames it over `dbFile` and fsyncs the directory. On failure it unlinks the temp file and throws. Its signature is unchanged, and both callers get it (the failed-migration restore and the sentinel restore).
  - Why: `fs.copyFileSync` truncates the target first. A power cut mid-copy left a torn database, which fails the first read (`STARTUP_OPEN_FAILED`) before the sentinel check is reached, so recovery was manual.
- **The backup check also requires the sentinel's `lastApplied`:** the backup's `kysely_migration` must have a row with that name. Otherwise the startup enters `MIGRATION_INTERRUPTED` and touches nothing.
  - Why: `PRAGMA quick_check` answers `ok` for a 0-byte file, and restoring one would look like a fresh install. The server would migrate from scratch and come up empty, with no banner. This also gives `lastApplied` its read site.
- **Accepted risk: a rollback to a pre-T-016 build.**
  - The scenario: a migration run (e.g. T-013's `m010`) is interrupted, or its restore fails, and the operator rolls back to a server build without T-016. That build ignores the sentinel. The sentinel's migration isn't recorded, so nothing is pending and it runs normally on the half-migrated file. A later upgrade finds the sentinel and restores the old backup over everything written since.
  - Jeff accepted it: it needs a failed migration, a rollback and a re-upgrade. No release sequencing or code is added for it.
- **Note:** the Vue mirror of `ReadOnlyReasonCode` is `astros_vue/src/types/systemStatus.ts`, which `models/websocket/systemStatusMessage.ts` imports. The Contract named the importer.

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
| `restoreBackup` (atomic copy to `<db>.restore-tmp`, fsync, rename, fsync dir) | any | `dbFile` is untouched (or already the backup, if only the dir fsync after the rename failed); `MIGRATION_INTERRUPTED` from the sentinel step (`MIGRATION_FAILED_RESTORE_FAILED` from the failed-migration step), and the sentinel is kept, so the next boot retries |
| unlink the sentinel | ENOENT | ignore (already gone) |
| unlink the sentinel | EACCES | after a sentinel restore or a successful migration: enter `MIGRATION_INTERRUPTED`, since a stale sentinel would restore over good data next boot. After a failed-migration restore: log `error` and keep `MIGRATION_FAILED_RESTORED`, because the next boot restores the same backup again, which is harmless while read-only blocks writes |
| fsync the dir after the unlink | EIO | throw, handled as the unlink's EACCES |
| the backup lacks a `kysely_migration` row for `lastApplied` (or is empty) | — | `MIGRATION_INTERRUPTED` (amendment) |
| the backup holds migrations this build doesn't know | — | `MIGRATION_INTERRUPTED`, touching nothing: the Contract's "fails the check" branch (re-review ruling) |
| `restoreBackup` with a `<db>-journal` or `-wal` beside the DB | — | throws before copying (a rename would let SQLite replay the old file's hot journal onto the restored one); the restore-failed handling applies |

### 2. Crash-recovery state matrix

| Crash after | db | backup | sentinel | Next boot | Status |
|---|---|---|---|---|---|
| `createBackup` | pre-migration | good | absent | backup rewritten from the still-good db, then migrate | consistent ✓ |
| sentinel written | pre-migration | good | present | restore (no-op content), migrate | consistent ✓ |
| mid-migration | partial (+ hot `-journal` if mid-statement) | good | present | the newer-database read rolls the journal back, then restore good, migrate | consistent ✓ (the bug) |
| migration done, before sentinel removal | migrated | good | present | restore good, re-migrate | consistent ✓ (repeats work) |
| failed migration, mid-restore copy | partial (the copy went to `.restore-tmp`; amendment) | good | present | restore good again | consistent ✓ |
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
- **Windows dev machines** may lack directory fsync: skip it when it isn't supported (EPERM/EISDIR/EINVAL), and log `debug`.
- **The atomic restore's rename** over `dbFile` happens with the connection closed (both callers close it first), so Windows' rename-over-an-open-file failure doesn't apply.
- **The rename replaces the inode,** where the old in-place copy wrote through it. The restored file takes the process's owner and the backup's mode, and a symlinked `dbFile` becomes a regular file. That isn't a concern for the Docker target, where the data dir is a plain volume.
- **The temp copy is fsynced through a read-only handle off Windows,** so a backup without owner-write still restores. Windows needs `r+`.

## Implementation checklist

- [x] RED → GREEN: `writeMigrationSentinel` / `readMigrationSentinel` / `removeMigrationSentinel` in `dal/backup.ts` (`backup.test.ts`): round-trip, atomic write leaves no `.tmp`, absent → `null`, corrupt or missing fields → `'unreadable'`
- [x] RED → GREEN: `initializeDatabase` sentinel steps (`database.integration.test.ts`): the reviewer's reproduction, success and restored-failure leave no sentinel, missing backup and corrupt sentinel → `MIGRATION_INTERRUPTED` with nothing touched, leftover-after-success restores and re-migrates, a failed sentinel write → `BACKUP_FAILED`; mutation-check the sentinel check
- [x] `MIGRATION_INTERRUPTED` in `ReadOnlyReasonCode` (API), the Vue mirror and store, the `enUS.json` banner message, store/banner specs
- [x] Pre-commit review fix pass (Review notes): atomic `restoreBackup`, `sentinelBackupProblem` with the `lastApplied` row, removal fsync, per-site details, post-restore newer check, coverage tests; mutations caught for each guard
- [x] QA `system-readonly-mode.md` cases 15–18 and the trigger / Storybook lists
- [ ] PLAN.md
- [ ] Pre-commit: api prettier + lint, build, vitest; vue format + lint, build, vitest; code review
- [ ] Manual verification (Verification section); pre-push `/pr-review-toolkit:review-pr`

## Review notes

### Pre-commit review (2026-11-22, fresh-context reviewer)

No Critical findings. The Important ones were fixed in one pass, except #6:

1. **A torn restore never reached the sentinel check.** `copyFileSync` truncates its target first, so a database torn mid-copy fails the first read (`STARTUP_OPEN_FAILED`).
   - Fixed by the atomic `restoreBackup` (amendment).
   - Tests: a part-way copy failure leaves the database whole, in both the unit and integration tests.
2. **The `MIGRATION_INTERRUPTED` banner was only right for one of its four entry points.**
   - The copy is now general: the run didn't finish cleanly, recovery stopped, no backup was deleted, and the marker was kept. The first rewrite still said "the backup was kept", which isn't true when it is missing; the re-review caught that.
   - Each site's detail now says what happened: restore failed, restored but not removed, or migrated but not removed.
3. **Durability on the removal side.**
   - `removeMigrationSentinel` fsyncs the directory after the unlink.
   - The restored file is fsynced before its rename (atomic `restoreBackup`).
4. **A 0-byte backup passed `quick_check`.** Fixed by the `lastApplied` row check (amendment).
   - `sentinelBackupProblem` moved to `backup.ts` and is unit-tested: missing, garbage, empty, a damaged page (which only `quick_check` catches), and a missing row.
5. **Test gaps, closed:**
   - a damaged backup
   - restore failure at the sentinel step
   - removal failure after a sentinel restore, after a successful migration, and after a failed-migration restore
   - a newer database with a sentinel
   - the restore warn line
   - the re-migrate test now counts `up()` runs
   - the corrupt-sentinel test now has a pending migration
   - `MIGRATION_INTERRUPTED` added to the four "every plain read-only code" lists (API status and write guard, Vue store and interceptor)
6. **Rollback to a pre-T-016 build:** Jeff accepted the risk (amendment).

Minors fixed:
- after a failed restore, read-only is entered before the reopen (`openConnectionOrMemory`)
- `fsyncDirectory` logs `debug` when it skips
- the write comment is accurate about a directory-fsync failure after the rename
- `writeFileSync(fd)` replaces an unchecked `writeSync`
- a `MigrationInterrupted` story
- the QA intro and Storybook list
- the QA case 17 claim
- a narrowing comment

Mutations caught:
- no row check
- no `quick_check`
- a non-atomic restore
- no removal fsync
- no newer-backup check (see the re-review)
- no newer check before the sentinel
- skipping the sentinel restore

### Re-review of the fix pass (2026-11-22, fresh-context reviewer)

No Critical findings. Fixed:

1. **The atomic restore depended, unstated, on a read rolling back a hot journal first.** A probe confirmed the hazard: renaming over a DB with a hot `-journal` makes SQLite replay it onto the restored file, giving a silent mix that passes `quick_check`. It is safe today only because the newer-database `SELECT` runs first.
   - `restoreBackup` now throws while a `-journal` or `-wal` sits beside the DB.
   - A comment at the sentinel step and an inventory row record it.
   - Tests: a unit `it.each`, mutation-caught.
2. **The banner said "the pre-migration backup … were kept"**, which is false when it is missing. It now reads "No backup was deleted, and the in-progress marker was kept."
3. **A backup a newer build wrote is now refused before the restore,** as `MIGRATION_INTERRUPTED` touching nothing. Before, it was restored and only then refused as `DB_NEWER_THAN_SERVER`, a state no doc described.
   - Ruling: this is the Contract's "its backup … fails the check" branch, so it is not a new amendment.
   - `sentinelBackupProblem` takes this build's migration names. The post-restore re-check is gone.
   - Tests: unit and integration, mutation-caught.
4. **Smaller fixes:**
   - The restore-failed comment and detail say the DB is "unchanged, or already the backup".
   - Tests the mutations survived are tightened: no `partial` table after a removal failure (mutation-caught), the restore-failed detail pinned, and the sentinel still present after a failed removal.
   - New tests: a leftover `.restore-tmp` file is overwritten, and a failed sentinel write removes its `.tmp`.
   - Comment drift fixed: what a sentinel means, and the outer catch.
   - The temp copy is fsynced through a read-only handle off Windows.
   - The shadowed `err` is renamed to `removeErr`.
   - The warn-line regex escapes its path.
   - QA cases 17 and 18 are corrected.

Deferred (minor): an `'unreadable'` sentinel doesn't say why it is unreadable (EACCES vs bad JSON).

Pre-existing issues, not from this diff, went to the PLAN.md Backlog:
- the `STARTUP_OPEN_FAILED` catch doesn't close an open file connection
- a throw from `pruneOldBackups` inside the migrate `try` restores over a successful migration
