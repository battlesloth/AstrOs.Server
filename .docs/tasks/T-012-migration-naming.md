# T-012: Name migrations from 10 on so they sort after `9_`

<!-- File: .docs/tasks/T-012-migration-naming.md. Branch: feature/T-012-migration-naming. PR title: "T-012: Name migrations from 10 on so they sort after 9_". -->

## Context

- **The problem:** Kysely orders migrations by plain string sort, in both 0.27.6 (ours) and the latest 0.29.9. `Migrator#resolveMigrations` calls `.sort()` and ignores `nameComparator`. So a `10_…` name sorts before `1_…`:
  - a database at or past migration 1 refuses it as "corrupted migrations"
  - a fresh install runs it second
- **Status:** PLAN.md Backlog holds this as "Decide before migration 10".
- **Decision (Jeff, 2026-11-22):** a new prefix, no renames.
- **Spec:** `.docs/specs/20261122-0847-per-channel-servo-release-design.md` § Server / Data model.
- **Project:** PLAN.md § Per-channel servo release time. This is the prerequisite for T-013, which adds the first such migration.
- **Ruled out:**
  - upgrading Kysely (it sorts the same way)
  - `allowUnorderedMigrations`: on a fresh install the new migration would run before migration 6, which rebuilds `maestro_channels`
  - renaming the executed migrations (a data rewrite on every install)

## Contract (pinned — do not change)

- **Existing names are unchanged:** `0_initial` … `9_add_script_event_end_time`, and their `kysely_migration` rows.
- **New migrations are named `m<NNN>_<snake_name>`**: a three-digit, zero-padded number starting at `010`, matching `^m\d{3}_[a-z0-9_]+$`. Legacy names match `^\d_[a-z0-9_]+$`.
- **`compareMigrationNames(a: string, b: string): number`** (`dal/backup.ts`) keeps its signature. It orders legacy names by number, then `m` names by number, after every legacy name. For any set of valid names it must give the same order as plain `.sort()`, because Kysely runs migrations in that order.
- **The T-006 newer-database guard's behavior is unchanged.** It still names unknown applied migrations in `compareMigrationNames` order, and a database with an unknown migration still answers `DB_NEWER_THAN_SERVER`.

## Task

- **`compareMigrationNames`:** recognize both patterns per the Contract, falling back to `localeCompare` only for names matching neither. Update the comment above it, which explains plain `.sort()` putting `10_` before `2_`.
- **Pin the rule with a test, over the production registry:** every production migration name matches one of the two patterns, and `Object.keys(registry).sort()` equals `.sort(compareMigrationNames)`. Expose the registry for the test: e.g. export the record behind `defaultMigrationProvider` from `dal/database.ts`.
- **`database.integration.test.ts`:**
  - Rename the injected test migrations from `9_<name>` to `m9NN_test_<name>`, which sorts after every real migration up to `m899` (`9_safe_addition` → `m900_test_safe_addition`, and so on).
  - Keep `buildProvider`'s "must sort after the production latest" guard.
  - The `ORDER BY name DESC LIMIT 1` query stays correct under the plain-sort invariant. Leave it, with a comment saying why.
- **Prove the scheme with injected `m010_sample_addition`** (any additive `alterTable`):
  - (a) On a fresh database, migrate with production + the sample: it succeeds, and `getLastAppliedMigrationName` returns `m010_sample_addition`.
  - (b) Migrate with production only, then with production + the sample: the second run applies only the sample, with no "corrupted migrations".
  - (c) A backup taken before (b)'s second run is named after `9_add_script_event_end_time`.
- **Document the rule:** in a comment above the production registry in `dal/database.ts`, and in CLAUDE.md § Architecture / Database: "new migrations are named `m<NNN>_…` from `m010`; plain-string order must match `compareMigrationNames`".
- **Strike the PLAN.md Backlog item** "Decide before migration 10", pointing to T-012.

## Acceptance criteria

- [ ] `compareMigrationNames` orders `9_add_script_event_end_time` < `m010_x` < `m011_y`, and legacy names among themselves by number.
- [ ] The registry test fails if a production migration is named `10_x`.
  - Mutation check: add a `10_x` entry temporarily and see it fail.
- [ ] Integration cases (a)–(c) pass.
- [ ] The injected test migrations use `m9NN_test_` names, and `buildProvider` still refuses a name that sorts before the production latest.
- [ ] The CLAUDE.md and `database.ts` notes are added, and the Backlog item is struck.

## Out of scope

- The first real `m010_` migration (T-013).
- Kysely upgrades.
- Changing how backups are pruned or restored.

## Verification

- `cd astros_api && npx vitest run src/dal` green, then the full `npx vitest run`.
- `npm run prettier:write && npm run lint:fix`, then `npm run build`.
- On a copy of the dev database (`.data`, at migration 9): start the API with `DATABASE_PATH` pointing at the copy. Startup is clean, with no migration run and no backup created; the T-006 guard stays quiet.

## Implementation checklist

- [ ] RED: `compareMigrationNames` tests in `dal/backup.test.ts`: legacy by number, `m` names after every legacy name and by number, same-number suffixes in code-unit order (as Kysely sorts); a hand-written expected order for the production names + `m010_`/`m011_` samples
- [ ] GREEN: `compareMigrationNames` per the Contract
- [ ] Registry guard: export the production registry; test every name matches a pattern and plain `.sort()` equals the comparator order; mutation: a temporary `10_x` entry fails it
- [ ] `database.integration.test.ts`: injected test migrations renamed `m9NN_test_*`; `ORDER BY name DESC` comment; cases (a)–(c) with `m010_sample_addition`
- [ ] Notes: `database.ts` comment above the registry; CLAUDE.md § Architecture / Database; PLAN.md Backlog item struck
- [ ] Pre-commit: prettier + lint (api), build, full vitest; code review
- [ ] Verification: dev-DB copy startup clean (no migration, no backup, guard quiet)
- [ ] Pre-push: /pr-review-toolkit:review-pr; QA/PLAN close-out
