# T-016: Keep the pre-migration backup when a migration is interrupted

<!-- File: .docs/tasks/completed/T-016-interrupted-migration-backup.md. Branch: feature/T-016-interrupted-migration-backup. PR title: "T-016: Keep the pre-migration backup when a migration is interrupted". -->

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
- **Journals beside the database (Jeff, 2026-11-23).** Added by Claude in the review fix passes and confirmed by Jeff afterwards, separately from the atomic-restore amendment:
  - `restoreBackup` throws before copying while a hot `<dbFile>-journal` (non-empty, non-zero first byte) or any `-wal` exists. A rename over a hot journal lets SQLite replay it onto the restored file.
  - It removes an inert journal (empty or zero first byte, SQLite's own "not hot" test) with a `warn` and continues, because no read ever clears one.
- **An unreadable sentinel's detail names only the sentinel (Jeff, 2026-11-23;** amends "the detail names the sentinel and the backup path"). The backup's path is inside the file it can't read, and guessing one from the database could name the wrong backup. Every other `MIGRATION_INTERRUPTED` detail names both.
- **Every commit is flushed (Jeff, 2026-11-23, PR #140 review).** `createKyselyConnection` sets `PRAGMA synchronous = FULL`. It is already the default in the rollback-journal mode this app uses, but not in WAL mode, which a restored or hand-edited database can be in. There a power cut could undo part of a migration run whose sentinel was already removed.
- **Note:** the Vue mirror of `ReadOnlyReasonCode` is `astros_vue/src/types/systemStatus.ts`, which `models/websocket/systemStatusMessage.ts` imports. The Contract named the importer. The `systemStatus` store itself needed no change; only its spec's plain-code list did.

## Task

- **`dal/backup.ts`** gains `writeMigrationSentinel(dbFile, { backupPath, lastApplied })`, `readMigrationSentinel(dbFile): MigrationSentinel | 'unreadable' | null` and `removeMigrationSentinel(dbFile)`, with an atomic write as pinned.
- **`initializeDatabase`** gets the sentinel steps above, at the pinned points.
- **The new code** goes in the API, Vue and i18n per the Contract.
- **QA plan `.docs/qa/system-readonly-mode.md`:**
  - interrupted migration, recovered: stage a sentinel plus its backup by hand → the startup log shows the restore (case 15; case 18 also shows the migrate that follows)
  - interrupted migration with a missing backup → the `MIGRATION_INTERRUPTED` banner
  - the reviewer's reproduction → the backup survives

## Acceptance criteria

- [x] **The reviewer's reproduction:**
  - boot 1: migration fails and restore fails → `MIGRATION_FAILED_RESTORE_FAILED`, and the sentinel remains
  - boot 2 with a working restore → the good backup is restored first, the migration retries, and the backup on disk still has no partial table
  - Mutation: drop the sentinel check and see it fail.
- [x] **A successful migration leaves no sentinel. A failed migration whose restore succeeds leaves none either.**
- [x] **A sentinel whose backup is missing** → `MIGRATION_INTERRUPTED`; the database file's sha256 and the backup directory's listing are unchanged.
- [x] **A corrupt sentinel** (`{`) → `MIGRATION_INTERRUPTED`, with nothing touched.
- [x] **A sentinel left after a migration that succeeded but crashed before cleanup:**
  - next boot: restore, then re-migrate to the same end state
  - simulated by writing the sentinel by hand after a good migrate
- [x] **`writeMigrationSentinel` leaves no `.tmp` behind on success.** A failed write throws before `migrateToLatest` runs, entering `BACKUP_FAILED`, since without a sentinel the backup isn't protected.
- [x] **The Vue banner** shows the new code's message (store and banner specs).
- [x] **The QA plan** is updated.

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
  3. Restart: the restore log line appears, and the database and the backup match the pre-migration copy (sha256 of `sqlite3 … .dump`: SQLite's backup API doesn't write a byte-identical file, so the raw files' hashes differ).

## Failure-mode inventory

### 1. External-call error coverage

| Call | Error / condition | Response |
|---|---|---|
| write `<sentinel>.tmp` | ENOSPC / EACCES | throw before migrate → `BACKUP_FAILED`, the error naming the sentinel; unlink a partial `.tmp` best-effort |
| fsync file / rename / fsync dir | EIO / EXDEV (the tmp file is in the same dir, so not expected) | throw → `BACKUP_FAILED` |
| read the sentinel | ENOENT | no sentinel → normal flow |
| read the sentinel | EACCES / EISDIR / JSON parse error / missing fields | `'unreadable'` → `MIGRATION_INTERRUPTED` |
| open the backup for `quick_check` | ENOENT / not a database / check ≠ `ok` | `MIGRATION_INTERRUPTED` |
| `restoreBackup` (atomic copy to `<db>.restore-tmp`, fsync, rename, fsync dir) | any | `dbFile` is untouched (or already the backup, if only the dir fsync after the rename failed); `MIGRATION_INTERRUPTED` from the sentinel step (`MIGRATION_FAILED_RESTORE_FAILED` from the failed-migration step), and the sentinel is kept, so the next boot retries |
| unlink the sentinel | ENOENT | ignore (already gone) |
| stat the backup | EACCES / ENOTDIR / … | `MIGRATION_INTERRUPTED`: "its backup … can't be accessed (CODE)", not "missing" (pre-push) |
| `-journal` beside the DB at restore | empty or zero first byte (inert) | removed with a `warn`, restore continues (pre-push) |
| reopen after a sentinel restore | any | `STARTUP_OPEN_FAILED`; the sentinel is kept (removal comes after the reopen), so the next boot restores again |
| any startup read, with a sentinel present | `SQLITE_CORRUPT` / not a database (a torn half-migrated file), or a passing error (locked, permissions) | `STARTUP_OPEN_FAILED`, plus an `error` line: fix the error and restart, or move a damaged database into a new folder and restart; either way the next boot runs the checked restore (follow-up) |
| restore after a failed migration | any | `MIGRATION_FAILED_RESTORE_FAILED`, plus, if the sentinel exists, an `error` line saying it was kept, the next boot retries, and to delete nothing (follow-up) |
| unlink a temp file after a failure | anything but ENOENT | logged `warn`; the next write or copy overwrites it (a directory in its place keeps failing until it is removed) |
| unlink the sentinel | EACCES | after a sentinel restore or a successful migration: enter `MIGRATION_INTERRUPTED`, since a stale sentinel would restore over good data next boot. After a failed-migration restore: log `error` and keep `MIGRATION_FAILED_RESTORED`, because the next boot restores the same backup again, which is harmless while read-only blocks writes |
| fsync the dir after the unlink | EIO | throw, handled as the unlink's EACCES |
| the backup lacks a `kysely_migration` row for `lastApplied` (or is empty) | — | `MIGRATION_INTERRUPTED` (amendment) |
| a non-empty `-wal` or a hot `-journal` beside the backup (for a symlink, beside its target) | — | `MIGRATION_INTERRUPTED`, touching nothing: SQLite would apply those to the backup, and `restoreBackup` copies only the main file (PR #140 review) |
| the backup holds migrations this build doesn't know | — | `MIGRATION_INTERRUPTED`, touching nothing: the Contract's "fails the check" branch (re-review ruling) |
| `restoreBackup` with a hot `<db>-journal` (non-zero first byte) or any `-wal` beside the DB | — | throws before copying (a rename would let SQLite replay the old file's hot journal onto the restored one); the restore-failed handling applies |

### 2. Crash-recovery state matrix

| Crash after | db | backup | sentinel | Next boot | Status |
|---|---|---|---|---|---|
| `createBackup` | pre-migration | good | absent | backup rewritten from the still-good db, then migrate | consistent ✓ |
| mid-sentinel-write | pre-migration | good | absent (a stale `.tmp`) | as the row above; the next write truncates the `.tmp` | consistent ✓ |
| sentinel written | pre-migration | good | present | restore (no-op content), migrate | consistent ✓ |
| mid-migration | partial (+ hot `-journal` if mid-statement) | good | present | the newer-database read rolls the journal back, then restore good, migrate | consistent ✓ (the bug) |
| mid-migration, before the journal's first fsync | partial (+ inert `-journal`) | good | present | the restore removes the inert journal, then restore good, migrate | consistent ✓ (pre-push) |
| mid-migration, torn page | unreadable | good | present | `STARTUP_OPEN_FAILED`; the operator moves the file away and restarts, and the server restores | manual ✓ |
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
- **Directory fsync may be unsupported:** skip it on EPERM/EISDIR/EINVAL. Log `debug` on Windows dev machines, where that is expected; log `warn` elsewhere (a FUSE or 9p mount, say), where it means no durability (pre-push).
- **The atomic restore's rename** over `dbFile` happens with the connection closed (both callers close it first), so Windows' rename-over-an-open-file failure doesn't apply.
- **The rename replaces the inode,** where the old in-place copy wrote through it. The restored file takes the process's owner and the backup's mode, and a symlinked `dbFile` becomes a regular file. That isn't a concern for the Docker target, where the data dir is a plain volume.
- **The temp copy is fsynced through a read-only handle off Windows,** so a backup without owner-write still restores. Windows needs `r+`.

## Implementation checklist

- [x] RED → GREEN: `writeMigrationSentinel` / `readMigrationSentinel` / `removeMigrationSentinel` in `dal/backup.ts` (`backup.test.ts`): round-trip, atomic write leaves no `.tmp`, absent → `null`, corrupt or missing fields → `'unreadable'`
- [x] RED → GREEN: `initializeDatabase` sentinel steps (`database.integration.test.ts`): the reviewer's reproduction, success and restored-failure leave no sentinel, missing backup and corrupt sentinel → `MIGRATION_INTERRUPTED` with nothing touched, leftover-after-success restores and re-migrates, a failed sentinel write → `BACKUP_FAILED`; mutation-check the sentinel check
- [x] `MIGRATION_INTERRUPTED` in `ReadOnlyReasonCode` (API), the Vue mirror and store, the `enUS.json` banner message, store/banner specs
- [x] Pre-commit review fix pass (Review notes): atomic `restoreBackup`, `sentinelBackupProblem` with the `lastApplied` row, removal fsync, per-site details, the newer-backup refusal (the first pass's post-restore check, replaced in the re-review), coverage tests; the mutations caught are the ones listed in Review notes
- [x] QA `system-readonly-mode.md` cases 15–18 and the trigger / Storybook lists
- [x] PLAN.md (close-out 2026-11-26)
- [x] Pre-commit: api prettier + lint, build, vitest; vue format + lint, build, vitest; code review (two rounds)
- [x] Manual verification (Verification section and QA cases 15–18, 2026-11-23, at `12ac0e35`: a worktree booting the real `ApiServer`, serial skipped, on a copy of the dev database `.data/database.sqlite3`, which was at 8; all green, `.dump` sha256 equal). The first run (2026-11-22) was at `6e910cd1`, before the pre-push fixes, and on a copy of `~/.config/astrosserver/database.sqlite3` (at 7), not the dev database.
- [x] Manual verification of the follow-up (2026-11-23): QA cases 15, 16, 16a, 17 and 18 walked as rewritten, the same way, on the follow-up's `database.ts` and `backup.ts`. All pass; every recovery ends with a `.dump` sha256 equal to the good copy, and the dev database is unchanged. Not run: the Vue banner in a browser, Docker, a Pi.
- [x] Manual verification of the PR #140 review fix (2026-11-23): the same cases, plus case 16 with a `-wal` left beside the backup by a killed program (refused untouched; moving both away and putting a good copy back recovers), on that fix's `database.ts` and `backup.ts`. All pass; the dev database is unchanged. Not run: the same three.
- [x] Pre-push `/pr-review-toolkit:review-pr` (5 agents) and its fix pass (Pre-push review notes). Not rerun for the follow-up (Jeff, 2026-11-23).

## Review notes

### Pre-commit review (2026-11-22, fresh-context reviewer)

No Critical findings. The Important ones were fixed in one pass, except #6:

1. **A torn restore never reached the sentinel check.** `copyFileSync` truncates its target first, so a database torn mid-copy fails the first read (`STARTUP_OPEN_FAILED`).
   - Fixed by the atomic `restoreBackup` (amendment).
   - Tests: a part-way copy failure leaves the database whole, in both the unit and integration tests.
2. **The `MIGRATION_INTERRUPTED` banner was only right for one of its four entry points.**
   - The copy is now general: the run didn't finish cleanly, recovery stopped, no backup was deleted, and the marker was kept (reworded again in the follow-up). The first rewrite still said "the backup was kept", which isn't true when it is missing; the re-review caught that.
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
- no newer check before the sentinel
- skipping the sentinel restore

### Re-review of the fix pass (2026-11-22, fresh-context reviewer)

No Critical findings. Fixed:

1. **The atomic restore depended, unstated, on a read rolling back a hot journal first.** A probe confirmed the hazard: renaming over a DB with a hot `-journal` makes SQLite replay it onto the restored file, giving a silent mix that passes `quick_check`. It is safe today only because the newer-database `SELECT` runs first.
   - `restoreBackup` now throws while a `-journal` or `-wal` sits beside the DB.
   - A comment at the sentinel step and an inventory row record it.
   - Tests: a unit `it.each`, mutation-caught.
2. **The banner said "the pre-migration backup … were kept"**, which is false when it is missing. It then read "No backup was deleted, and the in-progress marker was kept." (Reworded in the follow-up: neither half holds in every state.)
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

### Pre-push review (2026-11-22, `/pr-review-toolkit:review-pr`, 5 agents)

No Critical findings. Fixed in one pass:

1. **The Verification section asked for a sha256 match that can't hold.** SQLite's backup API doesn't write a byte-identical file. Step 3 now compares `.dump` hashes, which the by-hand run did.
2. **An inert `-journal` blocked the restore on every boot.** A power cut before the journal's first fsync leaves one, and no read clears it. `restoreBackup` now refuses only a hot journal and removes an inert one. Tests: an `it.each` for the empty and zero-header cases.
3. **A torn half-migrated file reached `STARTUP_OPEN_FAILED` without a word about the sentinel.** The catch now logs the sentinel and the backup to copy back by hand. Tested with a header torn under a staged sentinel. (It named that backup without checking it: see the follow-up.)
4. **The "touches nothing" detail gave no recovery steps,** and the obvious move (delete the marker) would recreate the T-016 bug. Each untouched detail now ends with an order to follow: copy a known-good backup (the candidates are listed) over the DB, then delete the sentinel. (That order was not safe beside a hot journal: see the follow-up.)
5. **Test gaps closed:**
   - the removal after `assertNoFkViolations` (an FK-violating migration whose restore fails keeps the sentinel)
   - a real hot journal staged at boot (rolled back, restored, migrated)
   - every fsync and its order (a recorder test for restore, sentinel write and removal)
   - directory-fsync errors: EIO propagates and names the dir; EPERM/EISDIR/EINVAL skip with a log line
   - a directory-fsync failure after each rename
   - the read-only fsync handle (a 0444 backup restores)
   - missing `lastApplied` / `startedAt`
   - the pinned detail texts
   - a prune detector (six older backups) in every "touches nothing" test
   - the reopen after a failed restore is the file, not `:memory:`
6. **Smaller fixes:**
   - errors name their file (sentinel write, fsyncs)
   - the directory-fsync skip warns off Windows
   - `sentinelBackupProblem` reports EACCES as "can't be accessed", not "missing"
   - the restore warn line comes before the reopen
   - the restore-failed detail says "unchanged, or already the backup"
   - temp-file cleanup failures are logged
   - the success-path removal only runs when a backup was taken
   - a `closeAndRestore` helper for the closed-connection precondition
   - the sentinel step uses early returns, with no narrowing-only clause
   - one shared `unknownMigrations` filter
   - `Omit<MigrationSentinel, 'startedAt'>` for the writer
   - the stale `BACKUP_FAILED` and `MIGRATION_FAILED_RESTORE_FAILED` banner copy (the sentinel write, and the automatic retry)
   - comment and doc drift across the code, tests, QA plan and this file
   - history references dropped from comments and test names

Mutations caught:
- the removal moved above the FK check
- every journal treated as hot
- no fsync of the temp copy
- no directory fsync after the sentinel write
- a directory opened but never fsynced
- every directory-fsync error swallowed
- `existsSync` for the access check
- no `lastApplied` check
- a write handle for the fsync
- a prune on either "touches nothing" path
- reopening in memory

To the Backlog (decisions, not sweep fixes):
- `query_only` while a sentinel is kept; plain read-only still runs the serial and WS handlers, which need an audit first
- one runtime list of reason codes
- the absolute `backupPath`

### Follow-up (2026-11-23, after the push of `12ac0e35`)

Sources: the mutations the pushed commit hadn't run, a fresh-context review of its late edits, and three rounds with a second fresh-context reviewer over this follow-up's own drafts (never committed). The third found no Critical or Important issues; most of its Minors were then fixed and re-tested, not re-reviewed.

**Corrections to the record.**
- The `12ac0e35` message says "each guard mutation-checked". That was false for the last fix pass: of 14 mutations not run before the push, 10 survived. The `6e910cd1` message's "Mutations caught for every guard" was false too: closing the connection before the sentinel restore had no test. The "Mutations caught" lists above hold only for what they name.
- The `6e910cd1` message credits Jeff with the journal rule. He confirmed it afterwards (amendment).

**Unsafe operator guidance.** `12ac0e35` told the operator how to restore by hand. Followed literally (each reproduced):
- beside a hot journal, SQLite replayed it onto the restored file: writable, `integrity_check` ok, data mixed
- with a torn database and an empty backup, the named backup was one nobody had checked: a blank, writable server with no banner
- after a failed restore nothing said to keep the sentinel, and deleting it let the next boot overwrite the good backup, which is the T-016 bug

The first attempt rewrote those steps, and the second review found it still unsafe. It listed the rejected backup as a candidate to copy, offered old backups as known-good, told the operator to move the only copy when there was no backup, and prescribed by-hand work where a restart was enough.

**The fix: none of T-016's messages asks for a restore by hand.** That is left to the server's own checked restore, on the next boot:
- a bad backup: close a program that has it open, fix its permissions, run the newer build that wrote it, or move it away with any `-journal` or `-wal` and put a good copy at its path, never the database
- a damaged database: move it into a new folder
- a failed restore or a startup error: fix the cause
- an unreadable sentinel: fix its permissions; with damaged contents there is no automatic way out, so copy the data folder before changing anything
- each of these ends with `KEEP_FILES`: delete nothing, and where the paths are under Docker
- the three "could not be removed" messages say to keep the backup the next boot will restore

The second round found the first version of that text still let an operator put the half-migrated database at the backup's path, over a damaged backup that could still be read: the check can't tell it from a good copy. Hence "move any file at that path" (reworded in the PR #140 review) and "never the database, even one you moved away". A recorded hash would close it in code (Backlog).

The backup lister, the recovery hint and its by-hand steps are gone. The two banners say to read the log and delete nothing, and `STARTUP_OPEN_FAILED`'s points at the log.

**Tests.**
- Each message is pinned whole. "doing what the message says" (`database.integration.test.ts`) does by hand what one says and boots: the data is back, or the server stops. It also covers a damaged database whose backup is bad too (never blank, also when the move is repeated) and a backup from before the recorded migration. It doesn't read the text, and doesn't stage the startup line's `-journal`/`-wal` clause or the copy of the data folder.
- The "could not be removed", newer-build and restore-failed tests boot again and require a table the backup lacks to be gone (`expectNextBootRestores`). Two earlier versions passed with no restore at all.
- Other gaps closed:
  - the outer catch's `existsSync` guard (an unreadable data dir claims no interrupted migration)
  - the success path's `backupPath !== null` guard (a fresh install)
  - closing the connection before the rename, on both restore paths (Linux, via `/proc/self/fd`)
  - `-wal` checked before an inert journal is removed
  - a temp-file cleanup failure is logged
  - the failed-migration restore's `warn` line
  - the kept-sentinel line after a failed restore, and its absence with no sentinel
- **Closed by deletion:** `withPath`'s `code` and `cause`, which nothing read.

**Mutations caught: 37 of 37** at `e3b37607`, none by a timeout; an unchanged control passes.
- Behaviour:
  - the sentinel step restores nothing (17 tests, including the five that boot again)
  - the sentinel ignored; the backup check skipped; the `lastApplied` row not checked; a newer build's backup accepted
  - the sentinel deleted on an untouched path, by the startup catch, or after a failed sentinel restore; kept after a successful one
  - the newer-database check after the sentinel step; the connection left open before a restore; the success path's `backupPath` guard
  - `-wal` checked after the journal removal; an inert journal left in place; no `startedAt` check; temp cleanup skipped, or its failure not logged
- Messages (each pinned whole; these were run): `KEEP_FILES` dropped at each of its four sites; the whole fix, and its newer-build, lock, "move any file", "never the database" and "even one you moved away" clauses; the startup line's restart; the three "could not be removed" endings; the startup and kept-sentinel lines not logged, or logged with no sentinel; the failed-migration restore's `warn`; `withPath` naming no file

**Left for a person** (Backlog): a migration-in-progress file with damaged contents, and a bad backup with no good copy. The log says to keep every file.

### PR #140 review (2026-11-23, Copilot, on `e3b37607`)

1. **High, real: a backup with changes in its `-wal` passed the check, and the restore lost them.** Reproduced: with a row only in the `-wal`, the boot restored the older main file, removed the sentinel and came up writable. With the `lastApplied` row only in the `-wal`, the check passed a backup whose main file lacks it. The server's own backups of a rollback-mode database have no `-wal`. One appears when a program opens the backup in WAL mode, or with an operator's copy.
   - `sentinelBackupProblem` refuses a non-empty `-wal` or a hot `-journal` before it opens the backup (`pendingSidecar`). Ruling: this is the Contract's "its backup … fails the check" branch, like the newer-build refusal.
   - An empty `-wal` passes, because the check's own read-only open leaves one beside a WAL-mode backup. A new backup is never refused for a stale one: `createBackup` clears it (probed).
   - The fix text says to close a program that has the backup open (probed: closing it merges the `-wal`, and the next boot restores), and to move a bad backup together with any `-journal` or `-wal`, never only one of them.
   - For a good copy that has its own `-journal` or `-wal`, it says to run any query on it with sqlite3 first (probed with the CLI: a query folds either in; opening and closing alone does not).
2. **Medium, not taken: mock the directory descriptors in two test helpers, because Windows can reject opening a directory.** Node opens directories on Windows: libuv 1.51's `fs__open` sets `FILE_FLAG_BACKUP_SEMANTICS` for that. Only the flush is expected to fail there, with the `EPERM` that `fsyncDirectory` skips, after the helper has recorded it. Read from libuv's source (by two readers), not run on Windows; CI and production are Linux.

**Review of the fix (fresh-context reviewer, before the commit).** No Critical findings. Important, all fixed:
- **A symlinked backup still had the bug:** SQLite resolves a symlink before it appends `-wal`, and the first version looked beside the link. It now looks beside the target.
- **The text sent the operator to the `-wal`:** "move any file at that path" read as the `-wal`'s path. Moving only the `-wal` and restarting loses its changes, and can leave a mix. It now says to move both, "never only one of them".
- **A WAL-mode backup leaves the database in WAL mode,** where SQLite's default doesn't flush each commit (measured: 2 flushes for 5 commits, against 7 with `FULL` and 20 in rollback mode either way). A simulated power cut after a migration brought back T-016's bug. Jeff chose `synchronous = FULL` (amendment). A trace of a real migration on a WAL-mode database shows the `-wal` flushed 5 times before the sentinel's unlink, against once without the setting.

The second pass found no Critical or Important issues. Most of its Minors were then fixed and re-tested, not re-reviewed: a handle leaked when setting `synchronous` throws, the journal half of the symlink test, the wording for a copy with its own `-wal`, and loose claims here.

Not changed: a program that commits to the backup between the check and the copy (milliseconds; reproduced only by injecting the write), a `-wal` refused although it holds nothing the restore would lose, and a symlinked backup whose message names the target's `-wal` without naming the target. Setting `synchronous` also reads the file at every open, so a file locked by another program just after a failed-migration restore now reports `MIGRATION_FAILED_RESTORE_FAILED` (the next boot restores again); that widens the Backlog item on that reopen.

**Verified on this fix:** API 1330/1330 with prettier, lint and build clean (the Vue suites not rerun: nothing there changed); the by-hand cases above; and 13 of 13 mutations caught, none by a timeout, with an unchanged control passing:
- the sidecar check dropped, or made after the open; the `-wal` or the hot `-journal` not checked; an empty `-wal` or an inert `-journal` refused; either one looked for beside a symlink
- `synchronous` not set; the handle leaked when that throws
- the message's "close it", "never only one of them" and copy's-own-`-wal` clauses dropped
