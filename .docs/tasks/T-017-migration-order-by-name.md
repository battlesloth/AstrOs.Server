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
- **Why `allowUnorderedMigrations` is safe here:** T-012 ruled it out as a *naming* fix, because on its own it lets a misnamed migration run out of order. The name-order check this task adds keeps that refusal.

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
- [ ] **Out-of-order names are still refused:** a database with an applied test-range migration above a pending lower one.
  - `initializeDatabase` enters `MIGRATION_FAILED_RESTORED`, with the check's message in the log, and the database is restored.
  - Mutation: drop the check and see the test fail (the lower migration would run).
- [ ] The QA case is added, and the Backlog item is struck.

## Out of scope

- The other T-012 Backlog items: a startup naming check, the guard message's `, ` join, and `getLastAppliedMigrationName`'s `null`.
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

<!-- Added when work starts. -->
