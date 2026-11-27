# T-020: Prune backups by the migration they hold, not by file time

<!-- File: .docs/tasks/T-020-prune-backups-by-migration.md. Branch: feature/T-020-prune-backups-by-migration. PR title: "T-020: Prune backups by the migration they hold, not by file time". -->

## Context

- **Found by:** the T-017 pre-push review (silent-failure hunter, 2026-11-27).
- **Decision (Jeff, 2026-11-27):** a task, implemented after the next server release.
- **Today:** `pruneOldBackups(dbPath, keep = 5)` (`dal/backup.ts`) runs after a successful migration (`dal/database.ts`, inside the migrate `try`).
  - It keeps the 5 newest `<db>.backup-*` files by modified time (mtime) and deletes the rest.
  - It logs only a failed delete.
- **Problem 1, the clock.** A droid without a battery-backed clock that upgrades before reaching the network can have a clock that is behind. The backup it just took then has the oldest mtime, and the prune deletes it at once, so that upgrade has no rollback copy. A clock that ran ahead (a backup stamped 2099) instead pins one slot forever.
  - This predates T-017. T-017 lets clock-skewed droids reach the prune, where before they stopped read-only.
- **Problem 2, sidecars** (PLAN.md Backlog, T-016 PR review). The prefix also matches a backup's `-wal`, `-shm` and `-journal`.
  - Sidecars count as backups and push out real ones sooner.
  - Pruning a backup leaves its sidecars behind.
- **Problem 3, a throw** (PLAN.md Backlog, T-016 reviews). A throw from the prune (`readdir`, `stat`) lands in the migrate `catch`. It restores the backup over a migration that worked, and enters `MIGRATION_FAILED_RESTORED`.
- **Problem 4:** deletions are silent.
- **The clock-free order already exists.** `createBackup` names each file `<db>.backup-<last applied migration>`, so the name says which migration state the file holds. Backups taken by later upgrades hold later migrations.

## Contract (pinned — do not change)

- **`pruneOldBackups(dbPath: string, keep = 5): void`** keeps its signature and its one call site.
- **What counts as a backup:** a file `<basename>.backup-<name>` beside the database, where `<name>` is a migration name in either scheme: legacy `^\d+_[a-z0-9_]+$`, or `^m\d{3}_[a-z0-9_]+$`.
  - Two kinds of file are never counted and never pruned on their own: a `-wal`, `-shm` or `-journal` sidecar, and a file whose name is not a migration name (e.g. a QA staging copy, `…backup-manual`).
- **The order:** backups are ranked by `<name>` with `compareMigrationNames`, and the `keep` highest are kept. Modified times are not read.
- **Pruning a backup** removes its sidecars first (`<backup>-wal`, `-shm`, `-journal`, whichever exist), then the backup itself. If a sidecar can't be deleted, its backup is kept (and warned about): a backup without its sidecar could be inconsistent.
- **It never throws.** A failure to list the directory, or to delete a file, is logged at `warn` with the path and the error, and the prune carries on with the rest (or stops, for the listing). A successful migration is never restored over because of the prune.
- **Logging:** each deleted file is logged at `info` with its path.
- **Unchanged:** backup names and `createBackup`, `restoreBackup`, the T-016 sentinel flow, when the prune runs, and `keep = 5`.

## Task

- **`dal/backup.ts` `pruneOldBackups`:** per the Contract. Reuse `compareMigrationNames` and its patterns; don't add a second copy of the naming rules.
- **Tests** (`backup.test.ts` § pruneOldBackups). Set mtimes with `fs.utimesSync`, against the name order, so a test can tell the two orders apart.
- **PLAN.md Backlog:** strike the sidecar item and the prune half of the "throw from `pruneOldBackups`" item, pointing to T-020. That item's second half (the reopen after a working restore reporting `MIGRATION_FAILED_RESTORE_FAILED`) stays.
- **QA plan `.docs/qa/system-readonly-mode.md`:** a case that stages backups with reversed mtimes, a sidecar and a `backup-manual`, then upgrades.

## Acceptance criteria

- [ ] With 7 backups whose mtimes run opposite to their names, the 5 highest names are kept.
  - Mutation: sort by mtime and see the test fail.
- [ ] Multi-digit legacy and `m` names rank by `compareMigrationNames` (`2_` < `10_` < `m010_`).
- [ ] Sidecars:
  - not counted (six backups plus sidecars → one pruned);
  - removed with their pruned backup;
  - left beside a kept backup.
- [ ] `…backup-manual` and other non-migration names are never pruned and not counted.
- [ ] Each deleted file gets an `info` line, and a failed delete gets a `warn`, with the prune carrying on (Linux: a 0555 directory, or an injected `unlinkSync` failure).
- [ ] A listing failure is logged and doesn't throw. Through `initializeDatabase`, a successful migration whose prune fails still comes up writable, with no restore.
  - Mutation: rethrow and see it enter `MIGRATION_FAILED_RESTORED`.
- [ ] The QA case is added, and the Backlog items are struck.

## Out of scope

- How many backups to keep (`keep = 5`), and backups from before this task's naming (all already use `createBackup`'s names).
- The T-017 Backlog items about refusals (a refusal still backs up and restores; the banner text).
- The reopen half of the "throw from `pruneOldBackups`" Backlog item.

## Verification

- **API:** `cd astros_api && npx vitest run`; `npm run prettier:write && npm run lint:fix`; `npm run build`.
- **Smoke test:** run `npm run typecheck` (it imports API models).
- **By hand, on a copy of the dev database with a migration pending** (a temporary no-op test-range migration, as QA case 19 does):
  1. Beside it, stage six copies named for migrations 3–8 with mtimes reversed (`touch -d`): the oldest name gets the newest time.
  2. Also stage a `-wal` beside the `…backup-3_…` copy, and a `…backup-manual`.
  3. Boot.
  4. Expected: the boot's new backup and the four highest staged ones remain; `…backup-3_…` and its `-wal` are deleted, each with an `info` line; `…backup-manual` remains.

## Failure-mode inventory

**1. External calls**

| Call | Error / condition | Response |
|---|---|---|
| `readdirSync(dir)` | ENOENT (no dir), EACCES | `warn`; nothing pruned; no throw |
| `unlinkSync(sidecar)` | ENOENT (already gone) | skip silently |
| `unlinkSync(sidecar)` | EACCES / EBUSY | `warn`, and keep the backup too (a backup without its sidecar could be inconsistent) |
| `unlinkSync(backup)` | ENOENT | skip silently |
| `unlinkSync(backup)` | EACCES / EBUSY | `warn`; continue with the next |

**2. Crash recovery:**
- A crash after a sidecar is deleted but before its backup leaves an old backup without its sidecar. The next prune deletes it, since it still ranks below the `keep` highest.
- A crash after a backup is deleted leaves nothing. Sidecars always go first.

**3. Concurrency:** one process at boot; the prune runs after the migration and the sentinel removal.

**4. Environment:**
- File times no longer matter, which is the point.
- **Docker:** the data dir is a volume, and unlink semantics are the same.
- **A backup named for a migration this build doesn't know** (a newer build's leftover) still ranks by `compareMigrationNames`, after the known ones.
  - With five or more of them, the boot's own backup could be pruned.
  - That takes five newer builds' backups at once; accepted.

## Implementation checklist

<!-- Added when work starts. -->
