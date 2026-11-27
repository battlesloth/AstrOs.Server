# T-017: Check migration order by name, not by the clock

<!-- File: .docs/tasks/T-017-migration-order-by-name.md. Branch: feature/T-017-migration-order-by-name. PR title: "T-017: Check migration order by name, not by the clock". -->

## Context

- **Found by:** the T-012 pre-push review (PLAN.md Backlog § From the T-012 pre-push review, "Kysely orders executed migrations by wall-clock timestamp first").
- **Decision (Jeff, 2026-11-26):** stop using the clock, as its own task. It must ship in the next server release cut from `develop`. That release brings `9_add_script_event_end_time` (T-007, merged 2026-10-28 and in no release yet; release 1.0.2 has migrations 0–8), and `m010` too if T-013 is in it. (Corrected in the pre-push review: this first said "with T-013", as if `m010` were the first migration to ship since the bug was found. Jeff confirmed the corrected rule, 2026-11-27.)
- **The bug:**
  - Kysely 0.27.6 (ours) records each applied migration with `new Date().toISOString()`. 0.29.9, the latest, records `max(now, latest recorded + 1 ms)` instead, but sorts and checks the same way.
  - On every run it sorts the applied migrations by that timestamp (name only breaks exact ties), and requires the result to equal the first N of all the provider's names in plain `.sort()` order (`#ensureMigrationsInOrder`).
  - A Pi has no battery-backed clock, and a droid at an event may never reach NTP. One that applies a migration while its clock is behind (or after a forward-wrong clock is corrected) records it as older than the one before it.
  - From then on every run fails with `corrupted migrations: expected previously executed migration …` (Kysely's `migrateToLatest` returns it as `error`; ours throws it).
  - `initializeDatabase` only migrates when something is pending, so the droid boots normally until the next release that brings a migration. That boot backs up, throws, restores and enters `MIGRATION_FAILED_RESTORED`, and so does every boot after it, until someone edits `kysely_migration` by hand.
- **Reproduced (2026-11-26):** a scratch script against `astros_api`'s Kysely applied `9_add` and `m010_add`, then set `m010_add`'s timestamp earlier than `9_add`'s.
  - With nothing pending, `migrateToLatest` returned "corrupted migrations".
  - With `m011_add` pending, it returned the same error.
  - With `allowUnorderedMigrations: true`, it ran only `m011_add`.
- **Droids already affected:** one whose clock was behind when any of migrations 1–8 ran is already set up to fail, and the next release's first pending migration (`9_…`) would be the trigger. A build with this fix migrates such a database without rewriting anything.
- **Ruled out:**
  - **Upgrading Kysely:** 0.29.9 stops new out-of-order rows, but still sorts applied migrations by timestamp and checks that order, so a database already out of order still fails. It also throws on an unreadable timestamp inside the sort, which `allowUnorderedMigrations` doesn't skip (relevant to any future upgrade).
  - **Rewriting the stored timestamps** to agree with name order: a write to the history table at every affected boot, which would have to fit around T-016's backup and sentinel.
  - **Refusing to migrate while the clock is behind** the newest recorded timestamp: it doesn't help a droid that is already set up to fail, and it blocks upgrades on an offline droid, the one place the clock can't be fixed.
- **Why `allowUnorderedMigrations` is safe here:** T-012 ruled it out as a *naming* fix, because on its own it lets a misnamed migration run out of order. The check this task adds keeps that refusal through the amendment's run-order check, and extends it to a fresh install (corrected in review: the name-order check alone did not keep it).
  - Kysely runs pending migrations in plain text order, while the check compares by number, so a misnamed `10_x` (which sorts before `1_` as text) passed the check. On a database at 9 it would have run last, silently; on a droid at 1–8 that skipped a release, it would have run before the remaining legacy migrations, against the wrong schema. Before T-017, Kysely refused both.
  - The run-order check refuses any registry whose plain-text order differs from name order, before anything runs. That also covers a fresh install, which Kysely never refused.

## Contract (pinned — do not change)

- **`migrateToLatest(db)`** (`dal/database.ts`) keeps its signature.
  - It builds Kysely's `Migrator` with `allowUnorderedMigrations: true`, so Kysely no longer checks its timestamp order (it still sorts by timestamp, but nothing uses that order).
  - (The bullet above: wording corrected in the pre-push review, 2026-11-27; behavior unchanged.)
  - Before the `Migrator` runs, it checks order by name over `activeMigrationProvider`.
- **The check:** a pure `migrationOrderProblem(known: readonly string[], applied: readonly string[]): string | null`, in `dal/backup.ts` next to `compareMigrationNames`.
  - `known` is the provider's names in `compareMigrationNames` order (`getProviderMigrationNames`). `applied` is the names in `kysely_migration`, in any order.
  - It returns `null` when the applied names, as a set, are exactly `known.slice(0, applied.length)`.
  - Otherwise it returns a message naming the cause:
    - an applied name `known` lacks: `applied migration <name> is not in this build`
    - a gap: `pending migration <first pending> sorts before applied migration <last applied in name order>; applied migrations must come first in name order`
  - `migrateToLatest` throws `new Error(problem)` before Kysely runs anything.
- **Contract amendment (Jeff, 2026-11-27, from the pre-commit review): the run order.** `migrationOrderProblem` also returns a problem when `known` in plain `.sort()` order (the order Kysely runs pending migrations in) differs from `known` in `compareMigrationNames` order, whatever has been applied:
  - `Kysely would run migration <name> before <name>: migration names must sort the same as plain text and by number (T-012)`, naming the first position where the two orders differ (the one Kysely would run there, then the one name order puts there)
  - checked after the unknown-name check and before the gap check
- **The failure path is today's:** `initializeDatabase`'s migrate `catch` restores the backup and enters `MIGRATION_FAILED_RESTORED`, as Kysely's "corrupted migrations" did. There is no new read-only code.
  - (Note from the pre-push review: on a fresh install there is no backup, so a refusal there, which only the run-order check can produce, takes today's no-backup path, `MIGRATION_FAILED_NO_BACKUP`. Nothing has run, and a fixed build then installs normally.)
- **Unchanged:**
  - migration names and T-012's naming rules and registry guard
  - every `kysely_migration` row, wrong timestamps included (nothing rewrites them, and nothing in production depends on them)
  - the order pending migrations run in: Kysely's plain `.sort()`, which T-012's guard pins equal to `compareMigrationNames`
  - backups, the T-016 sentinel flow and the T-006 newer-database guard

## Task

- **`dal/backup.ts`:** `migrationOrderProblem` per the Contract, with unit tests in `backup.test.ts`.
- **`dal/database.ts` `migrateToLatest`:** read the applied names (the existing reader `checkPendingMigrations` uses), run the check, throw on a problem, then build the `Migrator` with `allowUnorderedMigrations: true`.
- **Comments:**
  - The comments above `PRODUCTION_MIGRATIONS` and `compareMigrationNames` say Kysely orders executed migrations by timestamp and breaks ties with `localeCompare`. Update them: that order no longer decides anything in production, and the check is by name.
  - Keep T-012's guard as it is, including its `localeCompare` rule. It costs nothing and still holds.
- **QA plan `.docs/qa/system-readonly-mode.md`:** a case that stages out-of-order timestamps by SQL on a copy, then upgrades cleanly.
- **PLAN.md:** strike the Backlog item, pointing to T-017.

## Acceptance criteria

- [ ] `migrationOrderProblem`:
  - `null` for an exact prefix, in any `applied` order, and for an empty `applied`
  - names the unknown migration
  - names the pending and applied pair for a gap: applied 0–7 and 9 without 8, and applied with a test-range name above a pending lower one
- [ ] **Clock ran behind:** a file database migrated to 9, with `9_…`'s timestamp set earlier than `8_…`'s, plus a pending test-range migration.
  - `initializeDatabase` migrates it: not read-only, the backup taken, the sentinel removed.
  - Mutation: drop `allowUnorderedMigrations` and see the test fail (`MIGRATION_FAILED_RESTORED`).
- [ ] **Clock was ahead and then corrected:** the same, with `8_…`'s timestamp set to 2099.
- [ ] **A misnamed migration Kysely would run out of turn is refused** (amendment): `migrationOrderProblem` names it with nothing applied and with a prefix applied, and before a gap. Through `initializeDatabase`, a database at 7 with the production registry plus `10_x_misnamed` enters `MIGRATION_FAILED_RESTORED` with the message, and neither 8, 9 nor `10_x_misnamed` runs. Mutation: drop the run-order check and see both fail.
- [ ] **Out-of-order names are still refused:** a database with an applied test-range migration above a pending lower one.
  - `initializeDatabase` enters `MIGRATION_FAILED_RESTORED`, with the check's message in the log, and the database is restored.
  - Mutation: drop the check and see the test fail (the lower migration would run).
- [ ] The QA case is added, and the Backlog item is struck.

## Out of scope

- The other T-012 Backlog items: the rest of a startup naming check (the pattern, the `m010`–`m899` range, the frozen legacy names and unique numbers stay CI-only; the amendment checks only the run order), the guard message's `, ` join, and `getLastAppliedMigrationName`'s `null`.
- Rewriting stored timestamps, upgrading Kysely, and refusing on a behind clock (all ruled out above).
- Kysely's `Migrator#migrateDown`, called only by `migrations/migration_{5,6,7,8,9}.test.ts` on Migrators those tests build themselves; they still order by timestamp and still run Kysely's order check.

## Verification

- **API:** `cd astros_api && npx vitest run`; `npm run prettier:write && npm run lint:fix`; `npm run build`.
- **Smoke test:** run `npm run typecheck` (it imports API models).
- **By hand, on a copy of the dev database:**
  1. Set one migration's recorded timestamp out of order: `UPDATE kysely_migration SET timestamp = '2099-01-01T00:00:00.000Z' WHERE name = '7_rename_remote_config_key'`.
  2. Start a build of `develop` from before this task with a migration pending. Build it in a worktree: `git worktree add --detach <dir> 34e575ba` (`origin/develop` before T-017; `85e879c0`, used for the run recorded below, only adds docs on top), then in its `astros_api`, copy `.env` in (it's gitignored) and run `npm ci && npm run build`. Expected: `MIGRATION_FAILED_RESTORED`, with "corrupted migrations" in the log.
  3. Start this branch's build on a fresh copy staged the same way. Expected: the pending migration runs, the server is not read-only, and a second start does nothing.

## Failure-mode inventory

**1. External calls**

| Call | Error / condition | Response |
|---|---|---|
| reading `kysely_migration` before the check | table missing (a fresh install) | `applied` is empty: no problem, everything runs (the existing reader's behaviour), unless the run order differs (amendment) |
| the same read | SQLite error | `initializeDatabase` reads the same table first (the newer-database guard, the pending check, the last-applied lookup), and a failure there is `STARTUP_OPEN_FAILED`. A failure on the read inside `migrateToLatest` takes the restore path, or `MIGRATION_FAILED_NO_BACKUP` on a fresh install |
| the provider's `getMigrations` | throws | the same split; the restore path inside `migrateToLatest` is tested ("takes the restore path when reading the migrations fails during the check") |

**2. Crash recovery:** the check writes nothing, so a crash during it leaves nothing behind. A crash mid-migration is unchanged (T-016).

**3. Concurrency:** one process at boot; none.

**4. Environment:**
- A wrong clock is the bug this fixes. Docker containers use the host's clock, so they behave the same.
- Timestamps are ISO UTC, so time zones play no part.

## Implementation checklist

- [x] RED → GREEN: `migrationOrderProblem` in `dal/backup.ts` (`backup.test.ts`): accepts nothing applied, an exact prefix (also out of order) and everything applied; names an unknown applied migration; names a legacy gap and a gap below a later `m` name, with the last applied taken in name order; accepts an exact prefix when `known` arrives unsorted (replaced the plain-order case; see the amendment item)
- [x] RED → GREEN: `database.integration.test.ts` § migration order is checked by name (T-017): clock ran behind (the last production migration recorded before the one ahead of it) and clock was ahead (the one ahead at 2099), each with a pending `m930_test_after_clock` → migrated, not read-only, backup named for the last production migration, sentinel removed (RED: `MIGRATION_FAILED_RESTORED`); an applied `m932_test_b` above a pending `m931_test_a` → `MIGRATION_FAILED_RESTORED`, `m931` never ran, the check's message in the read-only log line (RED: Kysely's message)
- [x] `migrateToLatest`: reads the applied names (`getAppliedMigrationNames`, now exported), runs the check and throws on a problem, then `allowUnorderedMigrations: true`. Mutations caught (6/6): `allowUnorderedMigrations` dropped (2 tests), the check dropped (11), the gap scan off by one, the unknown check dropped, the defensive sort dropped, the last applied taken from the first match
- [x] Comments: above `PRODUCTION_MIGRATIONS`, above `compareMigrationNames`, `database.test.ts`'s guard (the `localeCompare` rule is kept), and T-012's shared-timestamp test
- [x] Amendment (Jeff, 2026-11-27), RED → GREEN: the run-order check in `migrationOrderProblem` (a misnamed `10_x` with nothing applied, with a prefix applied, and ahead of a gap), and through `initializeDatabase` (a database at 7, the production registry plus `10_x_misnamed`: `MIGRATION_FAILED_RESTORED`, nothing after 7 runs). The existing "orders by compareMigrationNames" case could no longer reach the gap check (its plain-order `known` now fails the run-order check), so it became "accepts an exact prefix when `known` arrives unsorted", which still kills the dropped-sort mutation. Mutation: the run-order check dropped → 4 tests fail
- [x] QA `system-readonly-mode.md` case 19; PLAN.md Backlog item struck
- [x] Pre-commit: api prettier + lint, build, vitest 1349/1349; smoke typecheck; code review, two rounds (Review notes). The first run, before the reviews, hit the known flaky `chunk_streamer.test.ts` `end_timeout` (5029 ms): that file is unchanged from `develop`, passes alone, and its rerun was green
- [x] Verification by hand (2026-11-26), on copies of the dev database (at 8) with `7_rename_remote_config_key` recorded at 2099:
  - **`develop`'s build** (a worktree at `85e879c0`): backup named for 8, then "corrupted migrations: expected previously executed migration 8_fix_script_duration_units to be at index 7 …", restored, `MIGRATION_FAILED_RESTORED`.
  - **This branch's build:** backup named for 8, `migration "9_add_script_event_end_time" was executed successfully`, not read-only. A second boot did nothing.
  - The 2099 row was left as it was, and the dev database's sha256 is unchanged.
- [x] Pre-push `/pr-review-toolkit:review-pr` (5 agents) and its fix pass (Review notes)
- [ ] PLAN.md close-out at merge

## Review notes

**Pre-commit review (2026-11-26, fresh-context reviewer):** no Critical findings. It confirmed:
- `allowUnorderedMigrations` skips only `#ensureMigrationsInOrder`.
- Every `migrateToLatest` caller reads a missing table as empty.
- A check failure takes today's restore path.
- The tests derive their names from the registry, so T-013's `m010` doesn't break them.

**Important, decided by Jeff (2026-11-27): the safety claim in Context was false.** Kysely runs pending migrations in plain text order, and the check compared by number. So a misnamed `10_x` would have run silently: last on a database at 9, and before the remaining legacy migrations on a droid at 1–8. Before T-017, Kysely refused both. Jeff chose (b), a run-order check at startup (the Contract amendment), over (a), accepting CI as the only gate.

**Minors fixed:**
- The "ran behind" test no longer pins two early timestamps that the old code would have failed even without the swap. It records every migration one second apart and moves the last one half a second before the one ahead of it.
- Every staging `UPDATE` must change exactly one row.
- New unit cases: a gap at index 0, and the first unknown name in name order.
- The refusal test pins the whole failure path: the `failed to migrate:` line, the restore line, and the sentinel removed.
- Stale "corrupted migrations" comments in the integration file.
- "Before `2_`" corrected to "before `1_`".
- QA case 19 adds a temporary no-op stub, so a migration is always pending. Its optional old-build step uses a fresh copy, and it checks that the 2099 row is unchanged.
- Comments now say Kysely's check is off only for `migrateToLatest`'s `Migrator`.

**Mutations:** 4 more caught (the gap scan from index 1, the last unknown named, the `failed to migrate:` line dropped, and `allowUnorderedMigrations` dropped against the one-pair staging), plus the amendment's run-order check.

**Review of the amendment (2026-11-27, fresh-context reviewer):** no Critical findings. It confirmed that the run-order check can't refuse a legitimately named registry (legacy, `m010`–`m899`, the `m9NN` test range, and same-number ties), and that it runs on every call path. Fixed:
- **Important: "nothing ran" couldn't fail.** Both refusal tests read the database after the restore had replaced it, so a `migrateToLatest` that ran Kysely first and threw afterwards passed them. Now:
  - each injected migration records its run outside the database (`ran`);
  - the misnamed case also requires the backup line and no `was executed successfully` line;
  - a direct in-memory call must reject with nothing run and no `kysely_migration` table. Kysely's first act is to create that table, and this also covers the memory path.
  - Mutation: the throw moved after `migrator.migrateToLatest()` fails 3 tests.
- **Minors:**
  - A unit case pins the unknown check ahead of the run-order check (mutation caught).
  - An unwrapped comment line in `database.test.ts`.
  - The checklist's stale case.
  - The garbled Context sentence.
  - QA case 20, the negative case for the new refusal.

**Pre-push review (2026-11-27, `/pr-review-toolkit:review-pr`, 5 agents):** no Critical findings. A trial merge with T-013's `m010` passed the full API suite (1407/1407). Fixed:
- **Important, comments: two false claims in this file's Context.**
  - Kysely 0.29.9 records `max(now, latest + 1 ms)`, not `new Date()`. It still sorts and checks the same way, so the upgrade is ruled out for that reason.
  - Migration 9 is unreleased (release 1.0.2 has 0–8), so T-017 has to ship in the next release from `develop`, not "with T-013".
  - The same release claim was swept from PLAN.md here, and from the T-013 branch's `PLAN.md` (its Status and T-016 lines) in a commit on that branch.
- **Important, tests:**
  - A swallowed read failure would have booted writable with migrations skipped, and nothing pinned that. Now a provider that throws once the sentinel exists must take the restore path (mutation caught).
  - Nothing pinned "nothing rewrites `kysely_migration` rows". The clock tests now read every staged timestamp back (mutation caught).
- **Important, code review:** a missed "Kysely refuses" comment in the newer-backup test.
- **Minors, type design:**
  - The provider is read once and shared with the `Migrator`, closing a check-then-use gap. Its RED: a provider that changed between the two reads slipped in an unchecked migration; mutation caught.
  - `getAppliedMigrationNames` says its order is undefined.
- **Minors, tests:**
  - A fresh-install refusal through `initializeDatabase` (`MIGRATION_FAILED_NO_BACKUP`, nothing run, no history table, no backup or sentinel), then a fixed build installs.
  - A thrown string would have passed; the tests now require an `Error` and the `Migration failed:` line.
  - The run order checked at index 0 and with everything applied.
  - The describe is renamed "migration order is checked by name (T-017)".
- **Minors, comments:**
  - "Kysely's check used to catch" overstated it.
  - `getLastAppliedMigrationName`'s reason now includes the clock.
  - QA 19 checks the backup's name and gives a worktree recipe; QA 20 adds the fresh-install step.
  - The inventory's read-failure split; `migrateDown` named as Kysely's; the dangling QA reference.
- **Mutations:** 7 more run, all caught by a test: a swallowed read error, the snapshot dropped, timestamps rewritten, a string thrown, the index-0 boundary, a check skipped when everything is applied, and the run-order check dropped.

**For Jeff (not changed; Contract-pinned or new decisions; in PLAN.md Backlog):**
- the refusal messages name the cause but not the remedy, and end in an internal "(T-012)" tag
- a refusal that writes nothing still backs up and restores, and that restore can fail on a nearly full disk; the check could run before the backup
- the `MIGRATION_FAILED_RESTORED` and `MIGRATION_FAILED_NO_BACKUP` banners say a migration failed or partly ran, but a refusal ran nothing
- backups are pruned by file time, so with a clock behind, the backup just taken can be deleted
- a compile-time type for registry names (`satisfies Record<MigrationName, Migration>`) would reject `10_x` in `PRODUCTION_MIGRATIONS` at build
- the run-order message names the first difference in the whole registry, which for a skipped-release droid can be an applied migration (`10_x before 1_b`), not the one it would actually overtake
- a CLAUDE.md § Database line describing T-017's runtime check: added at Jeff's request (2026-11-27), with three other learnings from this session

**Review of the pre-push fix pass (2026-11-27, fresh-context reviewer):** no Critical findings. It confirmed:
- the snapshot (Kysely reads the provider once and never mutates it);
- the determinism of the new tests (the sentinel trigger, the exact directory listing);
- the corrected Kysely 0.29.9 and migration-9 claims.

Fixed:
- **Important: a Contract clause marked "behavior unchanged" was a behavior change.** The read-once provider is internal (no pinned interface changes), so it moved out of the Contract; it stays recorded in the pre-push notes above. "Behavior unchanged" now covers only the timestamp wording.
- **Important:** these notes claimed the T-013 branch was already swept. It is now done in its own commit.
- **Important: CLAUDE.md's new vitest line was wrong.** `dal/backup.ts` uses the relative `logger.js`. Checked with grep and corrected.
- **Minors:**
  - the struck Backlog item (one clean line, credited to T-012, which made `buildProvider` layer on the registry; not T-007)
  - `migrateDown`'s callers (`migration_{5,6,7,8,9}`)
  - the checklist's describe name
  - `34e575ba` in place of the unpushed `85e879c0` for the old build
  - the inventory's read-failure row
