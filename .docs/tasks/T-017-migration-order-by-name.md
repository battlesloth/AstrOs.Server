# T-017: Check migration order by name, not by the clock

<!-- File: .docs/tasks/T-017-migration-order-by-name.md. Branch: feature/T-017-migration-order-by-name. PR title: "T-017: Check migration order by name, not by the clock". -->

## Context

- **Found by:** the T-012 pre-push review (PLAN.md Backlog § From the T-012 pre-push review, "Kysely orders executed migrations by wall-clock timestamp first").
- **Decision (Jeff, 2026-11-26):** stop using the clock, as its own task. It must ship in the same server release as T-013, or before it: `m010` is the first migration since this was found.
- **The bug:**
  - Kysely (0.27.6, ours, and 0.29.9, the latest) records each applied migration with `new Date().toISOString()`.
  - On every `migrateToLatest` it sorts the applied migrations by that timestamp (name only breaks exact ties), and requires the result to equal the name-sorted list (`#ensureMigrationsInOrder`).
  - A Pi has no battery-backed clock, and a droid at an event may never reach NTP. One that applies a migration while its clock is behind (or after a forward-wrong clock is corrected) records it as older than the one before it.
  - From then on every `migrateToLatest` throws `corrupted migrations: expected previously executed migration …`.
  - `initializeDatabase` only migrates when something is pending, so the droid boots normally until the next release that brings a migration. That boot backs up, throws, restores and enters `MIGRATION_FAILED_RESTORED`, and so does every boot after it, until someone edits `kysely_migration` by hand.
- **Reproduced (2026-11-26):** a scratch script against `astros_api`'s Kysely applied `9_add` and `m010_add`, then set `m010_add`'s timestamp earlier than `9_add`'s.
  - With nothing pending, `migrateToLatest` threw "corrupted migrations".
  - With `m011_add` pending, it threw the same error.
  - With `allowUnorderedMigrations: true`, it ran only `m011_add`.
- **Droids already affected:** one whose clock was behind when any of migrations 1–9 ran is already set up to fail, and T-013's `m010` would be the trigger. A build with this fix migrates such a database without rewriting anything.
- **Ruled out:**
  - **Upgrading Kysely:** 0.29.9 sorts the same way.
  - **Rewriting the stored timestamps** to agree with name order: a write to the history table at every affected boot, which would have to fit around T-016's backup and sentinel.
  - **Refusing to migrate while the clock is behind** the newest recorded timestamp: it doesn't help a droid that is already set up to fail, and it blocks upgrades on an offline droid, the one place the clock can't be fixed.
- **Why `allowUnorderedMigrations` is safe here:** T-012 ruled it out as a *naming* fix, because on its own it lets a misnamed migration run out of order. The check this task adds keeps that refusal through the amendment's run-order check, and extends it to a fresh install (corrected in review: the name-order check alone did not keep it).
  - Kysely runs pending migrations in plain text order, while the check compares by number, so a misnamed `10_x` (which sorts before `1_` as text) passed the check. On a database at 9 it would have run last, silently; on a droid at 1–8 that skipped a release, it would have run before the remaining legacy migrations, against the wrong schema. Before T-017, Kysely refused both.
  - The run-order check refuses any registry whose plain-text order differs from name order, before anything runs. That also covers a fresh install, which Kysely never refused.

## Contract (pinned — do not change)

- **`migrateToLatest(db)`** (`dal/database.ts`) keeps its signature.
  - It builds Kysely's `Migrator` with `allowUnorderedMigrations: true`, so Kysely never compares recorded timestamps.
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
- **Unchanged:**
  - migration names and T-012's naming rules and registry guard
  - every `kysely_migration` row, wrong timestamps included (nothing rewrites them, and nothing in production reads them)
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

- The other T-012 Backlog items: the rest of a startup naming check (the pattern, the frozen legacy names and unique numbers stay CI-only; the amendment checks only the run order), the guard message's `, ` join, and `getLastAppliedMigrationName`'s `null`.
- Rewriting stored timestamps, upgrading Kysely, and refusing on a behind clock (all ruled out above).
- `migrateDown`, which is used only by tests and still orders by Kysely's timestamps.

## Verification

- **API:** `cd astros_api && npx vitest run`; `npm run prettier:write && npm run lint:fix`; `npm run build`.
- **Smoke test:** run `npm run typecheck` (it imports API models).
- **By hand, on a copy of the dev database:**
  1. Set one migration's recorded timestamp out of order: `UPDATE kysely_migration SET timestamp = '2099-01-01T00:00:00.000Z' WHERE name = '7_rename_remote_config_key'`.
  2. Start a build of `develop` from before this task (a worktree, as `maestro-channel-release.md` case 12 does) with a migration pending. Expected: `MIGRATION_FAILED_RESTORED`, with "corrupted migrations" in the log.
  3. Start this branch's build on a fresh copy staged the same way. Expected: the pending migration runs, the server is not read-only, and a second start does nothing.

## Failure-mode inventory

**1. External calls**

| Call | Error / condition | Response |
|---|---|---|
| reading `kysely_migration` before the check | table missing (a fresh install) | `applied` is empty: no problem, everything runs (the existing reader's behaviour) |
| the same read | SQLite error | it throws inside `migrateToLatest`, and the restore path runs, as for any migrate failure today |
| the provider's `getMigrations` | throws | the same |

**2. Crash recovery:** the check writes nothing, so a crash during it leaves nothing behind. A crash mid-migration is unchanged (T-016).

**3. Concurrency:** one process at boot; none.

**4. Environment:**
- A wrong clock is the bug this fixes. Docker containers use the host's clock, so they behave the same.
- Timestamps are ISO UTC, so time zones play no part.

## Implementation checklist

- [x] RED → GREEN: `migrationOrderProblem` in `dal/backup.ts` (`backup.test.ts`): accepts nothing applied, an exact prefix (also out of order) and everything applied; names an unknown applied migration; names a legacy gap and a gap below a later `m` name, with the last applied taken in name order; accepts an exact prefix when `known` arrives unsorted (replaced the plain-order case; see the amendment item)
- [x] RED → GREEN: `database.integration.test.ts` § migration order with a wrong clock: clock ran behind (the last production migration recorded before the one ahead of it) and clock was ahead (the one ahead at 2099), each with a pending `m930_test_after_clock` → migrated, not read-only, backup named for the last production migration, sentinel removed (RED: `MIGRATION_FAILED_RESTORED`); an applied `m932_test_b` above a pending `m931_test_a` → `MIGRATION_FAILED_RESTORED`, `m931` never ran, the check's message in the read-only log line (RED: Kysely's message)
- [x] `migrateToLatest`: reads the applied names (`getAppliedMigrationNames`, now exported), runs the check and throws on a problem, then `allowUnorderedMigrations: true`. Mutations caught (6/6): `allowUnorderedMigrations` dropped (2 tests), the check dropped (11), the gap scan off by one, the unknown check dropped, the defensive sort dropped, the last applied taken from the first match
- [x] Comments: above `PRODUCTION_MIGRATIONS`, above `compareMigrationNames`, `database.test.ts`'s guard (the `localeCompare` rule is kept), and T-012's shared-timestamp test
- [x] Amendment (Jeff, 2026-11-27), RED → GREEN: the run-order check in `migrationOrderProblem` (a misnamed `10_x` with nothing applied, with a prefix applied, and ahead of a gap), and through `initializeDatabase` (a database at 7, the production registry plus `10_x_misnamed`: `MIGRATION_FAILED_RESTORED`, nothing after 7 runs). The existing "orders by compareMigrationNames" case could no longer reach the gap check (its plain-order `known` now fails the run-order check), so it became "accepts an exact prefix when `known` arrives unsorted", which still kills the dropped-sort mutation. Mutation: the run-order check dropped → 4 tests fail
- [x] QA `system-readonly-mode.md` case 19; PLAN.md Backlog item struck
- [x] Pre-commit: api prettier + lint, build, vitest 1349/1349; smoke typecheck; code review, two rounds (Review notes). The first run, before the reviews, hit the known flaky `chunk_streamer.test.ts` `end_timeout` (5029 ms): that file is unchanged from `develop`, passes alone, and its rerun was green
- [x] Verification by hand (2026-11-26), on copies of the dev database (at 8) with `7_rename_remote_config_key` recorded at 2099:
  - **`develop`'s build** (a worktree at `85e879c0`): backup named for 8, then "corrupted migrations: expected previously executed migration 8_fix_script_duration_units to be at index 7 …", restored, `MIGRATION_FAILED_RESTORED`.
  - **This branch's build:** backup named for 8, `migration "9_add_script_event_end_time" was executed successfully`, not read-only. A second boot did nothing.
  - The 2099 row was left as it was, and the dev database's sha256 is unchanged.
- [ ] Pre-push `/pr-review-toolkit:review-pr`; PLAN.md close-out at merge

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
