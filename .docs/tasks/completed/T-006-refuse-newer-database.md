# T-006: Refuse a database written by a newer server

<!-- File: .docs/tasks/completed/T-006-refuse-newer-database.md. Branch: feature/T-006-refuse-newer-database. PR title: "T-006: Refuse a database written by a newer server". -->

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

## Implementation checklist

- [x] RED/GREEN — `findUnknownAppliedMigrations` (`backup.test.ts`, the 4 pinned cases + numeric-prefix sort order)
- [x] RED/GREEN — `initializeDatabase` enters `DB_NEWER_THAN_SERVER` before the pending check; file byte-identical, no backup (`database.integration.test.ts`, the 3 pinned cases + newer-and-pending, the §5 branch-switch row). The newer-and-pending RED showed today's behavior: backup taken, Kysely's "corrupted migrations" throw, restore, `MIGRATION_FAILED_RESTORED`
- [x] RED/GREEN — `isDbIncompatible()` (`system_status.test.ts`) + write guard 503 for every `/api` route but `GET /system/status` (`write_guard.test.ts`, the 3 pinned cases + `POST /system/status` blocked)
- [x] `api_server.ts` — skip `setupSerialPort()` with the one-time log line; drop WS client messages. Pinned by the new boot-level `api_server.incompatible_db.integration.test.ts` (real `ApiServer` on a newer DB file with `skipSerialSetup: false`: skip line once, 503s, WS push, WS drop, file byte-identical through boot and shutdown)
  - Startup DB-write audit (all steps after `initializeDatabase`): `setAuthStrategy` registers a closure; `ApiKeyValidator` is a lazy closure; `FirmwareCache` / `FirmwareUploadStore` constructors do no DB I/O; `AnimationQueue` has no timers and nothing can enqueue; every `register*Routes` only registers handlers; the WS on-connect snapshots are status, lock and panic only; middleware mounted before the guard never touches the DB; `shutdown()` only destroys the connection. No seeding or settings defaults exist at startup. The boot-level byte-identical test was green even before the serial skip landed.
- [x] RED/GREEN — Vue `dbIncompatible` computed (`systemStatus.spec.ts`, 2 cases)
- [x] RED/GREEN — `App.vue` renders `AstrosIncompatibleDatabaseNotice` instead of the router view (`App.spec.ts`, the 2 pinned cases, flipping the reactive store after mount as production does, + recovery back to the router view); component + story; pinned `enUS.json` copy
- [x] Mutation checks recorded: unknown names sorted with plain `.sort()` → the sort-order test; detection after the no-pending early return → the unknown-applied test; detection only when nothing is pending → newer-and-pending (the only test that kills it); `isDbIncompatible` returns `readOnly` → its unit test + 5 guard tests; `/system/status` passthrough for any method → the POST test; passthrough removed → guard + boot test; incompatible guard branch removed → 2 guard tests + the boot HTTP test; serial skip removed → boot skip-line test; WS drop removed → boot WS test; store `dbIncompatible = readOnly` → store test; `v-else` removed → App test; `role="alert"` removed → App test; toast suppressed for every code / never → interceptor tests; `App.vue` snapshots the store (`{ ...useSystemStatusStore() }`, loses reactivity) → App flip test; banner allowlist entry removed → banner test
- [x] QA plan: `.docs/qa/system-readonly-mode.md` § Incompatible (newer) database (cases 9–14)
- [x] Pre-commit: prettier + lint (both sub-projects), build, full suites (API 76 files / 1033 tests, Vue 52 / 759 + 1 todo), code review (findings addressed). No Critical. Important: the App test set `dbIncompatible` before mount on a plain object, so a lost-reactivity regression passed; it now flips a reactive mock after mount, with `enableAutoUnmount` (earlier tests' Apps stayed mounted and re-rendered on the shared state). Minors fixed: banner spec case, boot-test DB backstop, `skipSerialSetup` / interceptor-header comments, first-wins ordering note, shared applied-names query, QA DB source / login flash / recovery-lands-on-login / story title / branch-switch case 14. Router 503 → `/auth` noted in the PLAN.md Backlog
- [x] Bench verification (dev machine, 2026-10-23, copy of `.data/database.sqlite3` + `99_future`; UI driven by headless Chromium): cases 9–14 pass. Boot log has the reason line and the skip line once; the notice shows logged out, after hard reload, on a `/scripts` deep link and logged in, with one `h1`, the message in `role="alert"`, no nav, no focusable controls, no toasts, also at 375 px; the 3 curls 503 with the pinned body, status 200; checksum `OK` and only `database.sqlite3` after a graceful shutdown; recovery swapped to the login page 1.3 s after the healthy server's WS came up; branch switch (stale `~/.config` DB at `7_` + `99_future`) refused with no backup and checksum `OK`. `npm run start:tsx` needed `.env` exported first (pre-existing; see PLAN.md Backlog)
- [x] Pre-push: `/pr-review-toolkit:review-pr` (5 agents, 2026-10-23); findings addressed. No Critical. Important (type design): `isDbIncompatible()` / `dbIncompatible` now require `readOnly` too, so the guard's hot path can't skip the incompatible check even if the two fields ever diverge; the banner's `KNOWN_CODES` is a `Record<ReadOnlyReasonCode, true>` (`satisfies`), so a missing code fails `vue-tsc`. Minors fixed: `PRAGMA query_only = ON` on the incompatible connection (the RED showed an INSERT succeeding through it); WS drop warns once per connection; the notice moves focus to its heading (CLAUDE.md dynamic-content rule); the interceptor still toasts if the store update failed; typed `DB_NEWER_THAN_SERVER` literal in the 503 body; mirror comments on both unions; tests for all five old codes (API predicate, guard, store, interceptor), all four allowlisted POSTs + a serial-write GET, HEAD and trailing slash, a same-numbered sibling migration, an empty migration table, a file that opens but fails inspection (§1), the WS `SYSTEM_STATUS` dispatch into the store, a typed locale-coverage check, direct notice assertions, the toast container staying, `panicState` mocked in `App.spec`, a boot test that bites (authenticated `changePassword` 503 + byte-identical file) and a WS "no answer" check that can fail (job lock held). Comment/doc drift fixed across code, QA (cases 10, 13, the "four ways" intro, the d-7 sibling doc), the spec (as-built note) and PLAN.md. Pre-existing gaps the agents found went to the PLAN.md Backlog. Declined: strictest-code-wins in `enterReadOnly` and an in-memory connection (`query_only` covers both without changing the task's `return conn.db`); a shared Vue predicate helper (each comparison is typo-safe); the comparator's mixed-prefix cycle (log order only)
  - Mutation checks (pre-push): `query_only` removed → refuses-writes test; WS warn on every message → once-per-connection test; toast skipped although the store update failed → interceptor test; focus not moved → notice spec; `dbIncompatible` / `isDbIncompatible` widened to `STARTUP_OPEN_FAILED` → store / API `it.each`; `/panicClear` let through → guard test; detection removed entirely → all 5 boot tests, including byte-identical; toast container dropped → App test; `KNOWN_CODES` entry or locale key removed → `vue-tsc` errors (TS1360 / TS2741)
- [x] Close-out: task file → `completed/`, PLAN.md checkbox + Log entry (2026-10-23, before the PR, as T-005 did)

### Additions beyond the task text

The Contract is unchanged. These widen the diff and were decided during implementation:

- `astros_vue/src/api/readOnlyInterceptor.ts` skips its "Your change was not saved" toast for `DB_NEWER_THAN_SERVER`, while still mirroring the code into the store. Approved by Jeff (2026-10-23): App.vue's lock-state and panic-state fetches, plus the router's `check-session` when a token exists, all 503 in this mode, which would toast 2–3 times on every load of the notice page. The five existing codes toast as before. New `readOnlyInterceptor.spec.ts`.
- `AstrosSystemStatusBanner.vue` `KNOWN_CODES` gained `DB_NEWER_THAN_SERVER` (+ a story and a spec case). Without it the pinned `systemStatus.reasonCode.DB_NEWER_THAN_SERVER` key has no reader, and the banner would show the UNKNOWN fallback.
- `backup.ts`: the three `kysely_migration` readers share one private `getAppliedMigrationNames` (pre-commit review; behavior unchanged).
- Pre-push review hardening (see the checklist): `PRAGMA query_only = ON` on the incompatible connection; `KNOWN_CODES` as an exhaustive record; the WS drop warns once per connection rather than per message; the notice moves focus to its heading; the interceptor still toasts when its store update fails.
- Extra tests beyond the pinned list, noted in the checklist above.
