# T-006: Refuse a database written by a newer server

<!-- File: .docs/tasks/T-006-refuse-newer-database.md. Branch: feature/T-006-refuse-newer-database. PR title: "T-006: Refuse a database written by a newer server". -->

## Context

This is the pre-task for the random span events project. See `PLAN.md` § Random span events, and the spec `.docs/specs/20261022-0748-random-span-events-design.md` § "Pre-task: refuse a database from a newer server".

**The problem.** `initializeDatabase` only asks which of *this build's* migrations are pending. An older build on a newer database therefore sees nothing to do and boots normally.

- Once T-007 adds `migration_9`, an older build would read random-span rows as plain events. It would then send `position = undefined` to a Maestro, and the firmware's unchecked `std::stoi` would abort and reboot the controller.
- An older build could also save over the new rows.

**Jeff's decision:** a build that finds migrations it doesn't know refuses to do anything and shows a single page.

- This only protects builds from this one forward. The two current deployments will be told not to downgrade.
- This task **must merge to develop before T-007**, so a dev DB switched between branches is covered from the start.

The task builds on the existing read-only machinery:

- `astros_api/src/system_status.ts`
- `astros_api/src/guard/write_guard.ts`
- `GET /api/system/status`
- the Vue `stores/systemStatus.ts`, which `App.vue` already fetches on mount
- the WS `systemStatus` push

## Contract (pinned — do not change)

- **Status payload shape is unchanged.** `GET /api/system/status` and the WS `systemStatus` push carry `{ readOnly, reasonCode?, enteredAt? }`. The only change is one new value, `'DB_NEWER_THAN_SERVER'`, **appended** to `ReadOnlyReasonCode` in both `astros_api/src/system_status.ts` and `astros_vue/src/types/systemStatus.ts`.
- **The five existing reason codes behave exactly as today:**
  - the write-guard allowlist (`/login`, `/reauth`, `/panicStop`, `/panicClear`)
  - GET reads pass
  - the banner
- **Migration names, the provider and the migration table are untouched.** Detection is read-only.

## Task

### Detection: `astros_api/src/dal/backup.ts`, `astros_api/src/dal/database.ts`

- Add `export async function findUnknownAppliedMigrations(db: Kysely<Database>, provider: MigrationProvider): Promise<string[]>`, beside `checkPendingMigrations`.
  - It returns the applied names (from `KYSELY_MIGRATION_TABLE`) that are not in the provider, sorted.
  - It returns `[]` when the migration table doesn't exist.
- In `initializeDatabase`'s file-backed path, call it inside the existing open/introspection `try`.
  - If it returns any names, call `systemStatus.enterReadOnly('DB_NEWER_THAN_SERVER', \`database has migrations this build does not know: ${names.join(', ')}\`)` and `return conn.db`.
  - Make that check **before** the pending check. There must be no backup, no migrate and no prune.
  - A DB with both unknown and pending migrations is incompatible.
  - The in-memory test path is unchanged.

### State: `astros_api/src/system_status.ts`

- Add `isDbIncompatible(): boolean`, true when `reasonCode === 'DB_NEWER_THAN_SERVER'`.

### HTTP: `astros_api/src/guard/write_guard.ts`

- When `systemStatus.isDbIncompatible()`, **every** `/api` request except `GET /system/status` gets 503 `{ message: 'Database is from a newer server version', reasonCode: 'DB_NEWER_THAN_SERVER' }`. That includes GETs, `/login`, `/reauth` and panic.
- The check runs before the existing write-class logic.

### Startup and WS: `astros_api/src/api_server.ts`

- When incompatible, do not call `setupSerialPort()`. Log `Skipping serial port setup: database is from a newer server version` once.
- `handleWebsocketMessage` drops every client message with a `logger.warn` when incompatible. It does not answer.
- **Audit every startup step after `initializeDatabase`.** Any step that writes to the DB, such as seeding or settings defaults, is skipped when incompatible. The byte-identical test below is the proof.

### Page

**Store, `astros_vue/src/stores/systemStatus.ts`:** add `const dbIncompatible = computed(() => reasonCode.value === 'DB_NEWER_THAN_SERVER')` and return it.

**Component, `astros_vue/src/components/common/incompatibleDatabase/AstrosIncompatibleDatabaseNotice.vue`**, plus `AstrosIncompatibleDatabaseNotice.stories.ts`:

- a `<main>` containing one `<h1>` (title)
- the message, in an element with `role="alert"`
- the action line
- no navigation or controls

**`astros_vue/src/App.vue`:** render `<AstrosIncompatibleDatabaseNotice v-if="systemStatusStore.dbIncompatible" />` and put the existing `<router-view>` block under `v-else`. The toast container stays.

**`astros_vue/src/locales/enUS.json`** (copy pinned):

- `systemStatus.incompatibleDatabase.title`: "Incompatible database"
- `systemStatus.incompatibleDatabase.message`: "This version of AstrOs Server can't use this database. It was last used by a newer version of the server, and running this version could damage it."
- `systemStatus.incompatibleDatabase.action`: "Install the newer version of AstrOs Server, or restore a database backup made by this version."
- `systemStatus.reasonCode.DB_NEWER_THAN_SERVER`: "The database was written by a newer version of AstrOs Server."

### Tests

Write these first.

- **`astros_api/src/dal/backup.test.ts`:**
  - `findUnknownAppliedMigrations returns [] when there is no migration table`
  - `returns [] when every applied migration is known`
  - `returns ['99_future'] when the database has an extra applied migration`
  - `ignores pending (known, unapplied) migrations`
- **`astros_api/src/dal/database.integration.test.ts`:**
  - `a database with an unknown applied migration enters DB_NEWER_THAN_SERVER and is left untouched`
    - Setup: a file DB migrated to latest, then `INSERT INTO kysely_migration (name, timestamp) VALUES ('99_future', ...)`, then the DB is closed and the file's SHA-256 captured.
    - Assert: `getState().reasonCode === 'DB_NEWER_THAN_SERVER'`, the file's SHA-256 is unchanged, and no `*.bak` / backup file appeared in the directory.
  - **Review focus:**
    - `a fresh database is not flagged`
    - `a database at exactly this build's migrations is not flagged` (`readOnly === false`)
- **`astros_api/src/guard/write_guard.test.ts`:**
  - `DB_NEWER_THAN_SERVER blocks GET /scripts, POST /login and POST /panicStop with 503 and the reason code`
  - `DB_NEWER_THAN_SERVER lets GET /system/status through`
  - `MIGRATION_FAILED_RESTORED still lets GET /scripts and POST /login through` (regression)
- **`astros_vue/src/stores/__tests__/systemStatus.spec.ts`** (create if absent):
  - `dbIncompatible is true only for DB_NEWER_THAN_SERVER`
  - `dbIncompatible is false when readOnly is false`
- **`astros_vue/src/__tests__/App.spec.ts`:**
  - `renders the incompatible-database notice instead of the router view when dbIncompatible`
  - Assert: the h1 text matches the title key's copy, the `role="alert"` element has the message, and the stubbed RouterView is absent.
  - Also: `renders the router view otherwise`

## Acceptance criteria

- [ ] All tests above are green in `astros_api` and `astros_vue`.
- [ ] The incompatible DB file is byte-identical after boot, and no backup is written.
- [ ] Every `/api` route except `GET /system/status` returns 503 with `DB_NEWER_THAN_SERVER`. The five existing read-only codes behave as before.
- [ ] No serial worker is started when incompatible, and WS client messages are dropped.
- [ ] The page renders with no login or navigation, has one `<h1>`, and puts the message in `role="alert"`. All strings are i18n.
- [ ] `.docs/qa/system-readonly-mode.md` gains an "Incompatible (newer) database" section covering the bench cases in Verification.

## Out of scope

- Builds older than this one: they can't be protected.
- Any schema-version number or "last written by version X" record. Unknown migration names are the whole test.
- Showing the server or database version on the page. No version source exists in the Vue app today.
- Recovery tooling, such as downgrading a DB or restoring a backup from the UI.
- `migration_9` and everything span-related (T-007 onward).

## Verification

- `cd astros_api && npx vitest run src/dal src/guard` → green. Then `npm run build` and the full `npx vitest run` → green.
- `cd astros_vue && npx vitest run src/stores src/__tests__` → green. Then `npm run build` and the full `npm run test:unit -- --run` → green.
- Bench (dev machine):
  1. Copy the dev DB.
  2. On the copy, run `INSERT INTO kysely_migration (name, timestamp) VALUES ('99_future', '2026-10-22T00:00:00.000Z')`.
  3. Start the API against the copy with `npm run start:tsx`, and open the app.
  4. Expected:
     - The notice page shows, and a hard refresh still shows it.
     - `curl localhost:3000/api/scripts` → 503 with `DB_NEWER_THAN_SERVER`.
     - The log has the "Skipping serial port setup" line.
     - `sha256sum` of the copy is unchanged after shutdown.

## Failure-mode inventory

- **§1 External calls.** Reading the migration table can throw. It is inside the existing `try`, so it lands in `STARTUP_OPEN_FAILED`, with the in-memory fallback, as today. That path is unchanged.
- **§2 Crash recovery.** N/A. The incompatible path performs no writes. That is the property under test.
- **§3 Concurrency.** N/A. Detection runs once at boot, before routes are registered.
- **§4 Cross-platform.** N/A beyond the existing file DB path handling.
- **§5 Pre-existing on-disk state:**

  | Database | Result |
  |---|---|
  | none (fresh) | migrate normally |
  | older DB (pending only) | migrate normally |
  | equal DB | boot normally |
  | newer DB (unknown applied) | incompatible |
  | newer + pending (branch switch to a sibling branch) | incompatible, nothing applied |
  | migration table present but empty | treated as fresh, same as the existing `checkPendingMigrations` |

- **§6 Hostile input.** Migration names come from the DB file. They are only compared and logged, never executed or interpolated into SQL.
- **§7 Resource lifecycle.** The DB connection stays open in incompatible mode (as it is in read-only mode). No serial worker, port or animation dispatch starts. A container restart with the right build clears the state.
