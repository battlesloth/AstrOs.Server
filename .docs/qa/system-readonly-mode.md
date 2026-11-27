# System read-only mode QA

Tests for the Phase 3 Vue UI when the AstrOs.Server enters read-only mode (Phase 1's safety net). Run after merging Phase 3.

## Preconditions

- AstrOs.Server stopped between scenarios so each starts from a known state.
- Working `~/.config/astrosserver/database.sqlite3` file from a healthy run (so we have something to back up).
- Vue app running: `cd astros_vue && npm run dev`. Browser at `http://localhost:5173`.
- Devtools open with the Network tab visible.
- Login credentials handy.

## Forcing read-only mode

Five ways to put the server into read-only mode for testing. Pick whichever matches the scenario. (`DB_NEWER_THAN_SERVER` is not a substitute for cases 1–8: it replaces the UI and blocks login and panic. See § Incompatible (newer) database.)

1. **`STARTUP_OPEN_FAILED`** — point `DATABASE_PATH` at a directory:
   ```bash
   mkdir -p /tmp/astros-readonly-test/database.sqlite3
   DATABASE_PATH=/tmp/astros-readonly-test npm run start
   ```
   `better-sqlite3` rejects opening a directory as a database file; the server boots in read-only mode with the in-memory fallback.

2. **`BACKUP_FAILED`** — drop write permissions on the dbDir before starting:
   ```bash
   chmod 0500 ~/.config/astrosserver
   # add an unapplied migration to force a backup attempt (temporarily add a stub such as `m950_test_force_backup` to `PRODUCTION_MIGRATIONS` in `dal/database.ts`, then revert it)
   npm run start
   # restore perms after: chmod 0700 ~/.config/astrosserver
   ```

3. **`MIGRATION_FAILED_RESTORED`** — inject a migration that throws but leave the backup mechanism intact. The system rolls back to the prior version and enters read-only with this code so operators are forced to notice and investigate. Easiest from the integration tests (`database.integration.test.ts`).

4. **`MIGRATION_FAILED_RESTORE_FAILED`** — inject a migration that throws, and make the restore fail by creating a directory where its temp copy goes: `mkdir <dbDir>/database.sqlite3.restore-tmp` (remove it afterwards). The sentinel it leaves makes the next boot restore first. See case 18.

5. **`MIGRATION_INTERRUPTED`** — stage a migration sentinel whose backup is missing (case 16).

For most cases, scenario 1 is fastest.

## Test cases

### 1. Banner appears via WebSocket push (≤1s)

1. Start the server in read-only mode (scenario 1 above).
2. With the Vue app already loaded and a fresh login, observe the page.
3. **Pass:** within ≤1s of the WebSocket reconnect, the yellow banner appears at the top of the page reading "Read-only mode" + the localized reason for `STARTUP_OPEN_FAILED`.
4. **Fail:** banner doesn't appear, or shows the raw i18n key path (`systemStatus.reasonCode.STARTUP_OPEN_FAILED`).

### 2. Banner persists across page refresh

1. With the server still in read-only mode, hit `Ctrl+R` to refresh the browser.
2. **Pass:** the banner reappears immediately on first paint (from `fetchStatus` on mount, before WebSocket reconnect).
3. **Fail:** banner disappears for >100ms after refresh.

### 3. Write-intent buttons disabled across views

For each view below, navigate to it and confirm:

- The disabled buttons are visually disabled (grayed out) and cannot be clicked.
- Hovering the disabled button shows the tooltip "This action is disabled while the system is in read-only mode."

| View | Disabled buttons |
|---|---|
| Modules | Save, Sync |
| Scripts | New (top), Delete (in delete-confirmation modal) |
| Scripter | Save, Test |
| Playlists | New (top), Delete (in delete-confirmation modal) |
| Playlist Editor (open one) | Save |
| Utility | Generate (API key), Format (SD), Format-confirm (modal) |

**Must remain enabled:**

- Login button on AuthView (user must still be able to log in).
- Logout button in the sidebar.
- Download Logs button in Utility (read action).
- Any panicStop / panicClear button (server allowlists these for read-only mode).
- Filter inputs, navigation, accordion toggles, modal close/cancel buttons.

### 4. Direct-API write returns 503 + toast

1. Open browser devtools → Console.
2. Paste:
   ```js
   fetch('/api/scripts/12345', { method: 'DELETE', headers: { 'Authorization': 'Bearer ' + localStorage.jwt_token } }).then(r => r.json().then(b => console.log(r.status, b)))
   ```
3. **Pass:** logs `503 { message: "Server is in read-only mode", reasonCode: "..." }`. A yellow toast appears reading "The server is in read-only mode. Your change was not saved."
4. **Fail:** any 5xx that isn't 503, or no toast appears, or the response is missing the `reasonCode` field.

### 5. Login still works

1. Click "Logout".
2. Verify the auth page loads with the banner still visible.
3. Log back in.
4. **Pass:** login succeeds, banner reappears immediately on the post-login route.
5. **Fail:** login button is disabled, or login fails with a 503.

### 6. Panic stop still works

1. Navigate to Utility.
2. Click `Panic Stop`.
3. **Pass:** request succeeds (200), audible/visual confirmation that the panic was processed.
4. **Fail:** 503 response — meaning the API allowlist is broken.

### 7. Recovery (banner clears after fix)

1. Stop the server.
2. Remove the forced-failure (e.g. `rmdir /tmp/astros-readonly-test/database.sqlite3` and unset `DATABASE_PATH`).
3. Restart the server.
4. **Pass:** within ≤1s of the WebSocket reconnect, the banner disappears. All previously-disabled buttons are re-enabled.
5. **Fail:** banner persists, or buttons stay disabled.

### 8. Unknown reasonCode fallback

The Vue app's allowlist of known reasonCodes is hardcoded. If a future server adds a new code before the client catches up, the banner should fall back to "The database is currently unavailable for writes." rather than rendering the raw key.

To force this scenario: temporarily edit `src/composables/useWebsocket.ts`'s `handleSystemStatusMessage` to set `reasonCode: 'NOT_A_REAL_CODE' as ReadOnlyReasonCode` instead of using the wire payload. Refresh.

**Pass:** banner reads "The database is currently unavailable for writes." (the UNKNOWN fallback).
**Fail:** banner reads "systemStatus.reasonCode.NOT_A_REAL_CODE" (raw key leaked).

## Incompatible (newer) database

`DB_NEWER_THAN_SERVER` is stricter than read-only. The server finds migrations in the database that this build does not know (the database was last used by a newer server, or by a sibling branch). It then:

- answers every `/api` route except `GET /api/system/status` with 503
- starts no serial services and drops WebSocket client messages
- writes nothing to the database: no backup, no migration, no prune

The UI shows a single notice page in place of the app.

### Preconditions

- Work on a **copy** of the active dev database, never the real one. That is `database.sqlite3` in the directory `DATABASE_PATH` names in `astros_api/.env` (`../.data`, i.e. `.data/database.sqlite3` at the repo root on the dev machine). It must be at this build's latest migration: the last name `SELECT name FROM kysely_migration ORDER BY name` prints should be the last one in `PRODUCTION_MIGRATIONS` (`dal/database.ts`). Names sort as plain text: legacy `0_…`–`9_…`, then `m010_…` onward (T-012). An older copy stages the branch-switch case below instead.
  ```bash
  mkdir -p /tmp/astros-newer-db
  cp .data/database.sqlite3 /tmp/astros-newer-db/
  sqlite3 /tmp/astros-newer-db/database.sqlite3 \
    "INSERT INTO kysely_migration (name, timestamp) VALUES ('m099_future', '2026-10-22T00:00:00.000Z')"
  sha256sum /tmp/astros-newer-db/database.sqlite3 > /tmp/astros-newer-db.sha256
  ls /tmp/astros-newer-db   # only database.sqlite3
  ```
- Start the API against the copy (`DATABASE_PATH` is the directory, not the file):
  ```bash
  cd astros_api
  set -a && . ./.env && set +a   # start:tsx does not read astros_api/.env on its own
  DATABASE_PATH=/tmp/astros-newer-db npm run start:tsx
  ```
- Vue app running: `cd astros_vue && npm run dev`.

### 9. Startup refuses the database

1. Start the API as above and watch its log.
2. **Pass:** the log has `Entering read-only mode (DB_NEWER_THAN_SERVER): database has migrations this build does not know: m099_future`, and `Skipping serial port setup: database version is newer than this server supports` appears exactly once.
3. **Fail:** any `Created pre-migration backup`, `migration "…" was executed`, or `Starting up serial port services` line.

### 10. The notice page replaces the app

1. Before starting the API on the copy, sign in against a healthy server and leave a tab open on the app (login itself 503s once the database is incompatible). Then restart the API on the copy.
2. **Pass:** the open tab switches to the notice by itself within about 3 s: the WebSocket reconnects and the server pushes the reason code on connect.
3. **Pass:** one card over the R2 schematic, reading "Incompatible database", the message ("…The database version is newer than this server supports…"), and "Update AstrOs Server, or restore a database backup made by this version." There is no login form, navigation, read-only banner or toast. Keyboard focus is on the heading (`document.activeElement` is the `h1`; a screen reader announces the message), and Tab reaches nothing on the page.
4. Hard refresh (`Ctrl+Shift+R`), then deep-link to `http://localhost:5173/scripts`.
5. **Pass:** both still show only the notice.
6. Open a private window on `http://localhost:5173` (no saved session).
7. **Pass:** the notice. The login form may flash for a fraction of a second first: the notice appears once `GET /api/system/status` answers.
8. **Fail:** the login page or app layout stays on screen, the read-only banner shows, a "Your change was not saved" toast appears, or any raw i18n key path is visible.

### 11. Every API route except status answers 503

```bash
curl -s -i localhost:3000/api/scripts
curl -s -i -X POST localhost:3000/api/login
curl -s -i -X POST localhost:3000/api/panicStop
curl -s -i localhost:3000/api/system/status
```

**Pass:** the first three return `503` with `{"message":"Database version is newer than this server supports","reasonCode":"DB_NEWER_THAN_SERVER"}`. The status call returns `200` with `{"readOnly":true,"reasonCode":"DB_NEWER_THAN_SERVER","enteredAt":"…"}`.
**Fail:** any other status, or login / panic getting through (those are allowed only in plain read-only mode).

### 12. The database file is untouched

1. Stop the API (`Ctrl+C`).
2. Run `sha256sum -c /tmp/astros-newer-db.sha256` and `ls /tmp/astros-newer-db`.
3. **Pass:** the checksum is `OK`, and the directory holds only `database.sqlite3` (no `.backup-*`, `-journal` or `-wal` file).
4. **Fail:** checksum mismatch, or any extra file.

### 13. Recovery

1. With the notice page still open, stop the API and start it against a database without `m099_future`. Use a fresh copy of the dev database, or the dev database itself: drop the `DATABASE_PATH=…` prefix so the value sourced from `.env` applies.
2. **Pass:** within about 3 s (the WebSocket retry interval) the notice is replaced by the login page. This happens even with a saved session: while the database was incompatible, the router turned every navigation into `/auth`. The token is kept, so you can sign in or go straight to `/`.
3. **Fail:** the notice persists after the reconnect.

### 14. Branch switch: unknown and pending migrations

`database.integration.test.ts` covers this case. To stage it by hand, repeat the preconditions with a copy of a database that is one or more migrations **behind** this build (for example, an old `~/.config/astrosserver/database.sqlite3`), plus `m099_future`.

**Pass:** cases 9 and 12 hold exactly as above. Nothing is applied and no `.backup-*` file appears, even though this build has migrations the database lacks.
**Fail:** any `Created pre-migration backup` or `migration "…" was executed` line, or `MIGRATION_FAILED_RESTORED` instead of `DB_NEWER_THAN_SERVER`.

## Interrupted migration (T-016)

A migration run writes `<db>.migration-in-progress` (JSON: `backupPath`, `lastApplied`, `startedAt`) after its backup, and removes it once the run succeeds or its backup is restored. A boot that finds one restores the named backup, if the backup checks out, before taking a new backup or migrating. A power cut mid-migration therefore can't cost the only good copy.

### Preconditions

- Work on a **copy** of the dev database at this build's latest migration, without the `m099_future` row the incompatible-database cases insert (that would give `DB_NEWER_THAN_SERVER` in every case below): `mkdir -p /tmp/astros-interrupted && cp .data/database.sqlite3 /tmp/astros-interrupted/`. Boot it once to migrate it to latest.
- Start the API against it with `DATABASE_PATH=/tmp/astros-interrupted` (the same command as above).

### 15. A leftover sentinel with a good backup is restored

1. With the API stopped, stage an interrupted run by hand:
   ```bash
   cd /tmp/astros-interrupted
   cp database.sqlite3 database.sqlite3.backup-manual
   # lastApplied must name a migration the backup records, or the backup is refused
   LAST=$(sqlite3 database.sqlite3 "SELECT name FROM kysely_migration ORDER BY name DESC LIMIT 1")
   echo "{\"backupPath\":\"/tmp/astros-interrupted/database.sqlite3.backup-manual\",\"lastApplied\":\"$LAST\",\"startedAt\":\"2026-11-22T00:00:00.000Z\"}" > database.sqlite3.migration-in-progress
   ```
2. Start the API.
3. **Pass:**
   - the log shows `Restored /tmp/astros-interrupted/database.sqlite3.backup-manual after an interrupted migration (started 2026-11-22T00:00:00.000Z)`
   - the server comes up normally (no banner)
   - `database.sqlite3.migration-in-progress` is gone

### 16. A sentinel whose backup is missing or damaged stops everything

1. Stage a sentinel as in case 15 but pointing at a backup that doesn't exist, and record `sha256sum database.sqlite3` and `ls`.
2. Start the API.
3. **Pass:**
   - the banner shows "A schema migration run did not finish cleanly…" (`MIGRATION_INTERRUPTED`)
   - the log names the sentinel and the missing backup, says nothing was restored, backed up or migrated, and says to put a good copy of the backup (never the database) at its path and to delete nothing
   - the database's sha256 and the directory listing are unchanged: nothing was restored. (With nothing pending, no backup or migrate would run anyway; the automated tests cover that with a pending migration.)
4. Repeat with the sentinel's content replaced by `{`. **Pass:** the same, except the log says "that file is unreadable" and names no backup.
5. With the API stopped, run the case 15 staging again, keep a good copy of the backup (`cp database.sqlite3.backup-manual /tmp/astros-good-backup.sqlite3`), change the database so it differs (`sqlite3 database.sqlite3 'CREATE TABLE half (id INTEGER)'`), then empty the backup (`: > database.sqlite3.backup-manual`) and start the API. **Pass:** the same, with "has no record of migration …": an empty file must not be restored as a fresh install. (A backup with a non-empty `-wal` or a hot `-journal` beside it is refused the same way; that is automated.)
6. **Recovery**, as the log says: move the empty file away (`mkdir bad-backup && mv database.sqlite3.backup-manual bad-backup/`), put the good copy back (`cp /tmp/astros-good-backup.sqlite3 database.sqlite3.backup-manual`) and restart. **Pass:**
   - the log shows the `Restored …` line, there is no banner, and the sentinel is gone
   - with the API stopped again, `sqlite3 database.sqlite3 .dump | sha256sum` equals the same for `/tmp/astros-good-backup.sqlite3` (so `half` is gone)

### 16a. A damaged database is moved away, and the server restores its backup

1. With the API stopped, run the case 15 staging, keep a good copy of the backup as in case 16, and tear the database's header: `head -c 100 /dev/zero | tr '\0' '\377' | dd of=database.sqlite3 conv=notrunc`.
2. Start the API. **Pass:**
   - the `STARTUP_OPEN_FAILED` banner, on a page that was already open and logged in (the in-memory database has no users, so a new login fails)
   - the log says `A migration run did not finish cleanly (…)`: fix the startup error and restart; if the database itself is damaged, move it into a new folder first; delete nothing
3. Do that: stop the API, `mkdir damaged && mv database.sqlite3 damaged/` (and any `-journal` or `-wal` beside it), start it again. **Pass:** the `Restored …` line, no banner, and the same `.dump` hash as the good copy.
4. Repeat steps 1–3, emptying the backup after step 1 and moving into a new folder (`damaged-2`). **Pass:** step 3's start shows the `MIGRATION_INTERRUPTED` banner ("has no record of migration …"), never an empty writable server. Then recover as in case 16, step 6, with another folder name (`bad-backup-2`).

### 17. A migration interrupted mid-run (optional, needs a code stub)

1. Temporarily add a test-range migration (e.g. `m950_test_slow`) to `PRODUCTION_MIGRATIONS` that creates a table and then waits 30 s.
2. With the API stopped, keep a copy of the pre-migration database: `cp database.sqlite3 /tmp/astros-pre-migration.sqlite3`.
3. Start the API, and `kill -9` it during the wait. Revert the stub.
4. Restart with the stub reverted.
5. **Pass:** the restore log line appears, the half-made table is gone, and the database's tables match `/tmp/astros-pre-migration.sqlite3` (`sqlite3 … ".tables"` on both). The restore after a leftover sentinel, and after a hot journal from a mid-statement crash, are automated (`database.integration.test.ts` § an interrupted migration); the kill itself is manual.

### 18. A failed migration whose restore also failed keeps the backup safe

1. Temporarily add a test-range migration (e.g. `m950_test_partial`) to `PRODUCTION_MIGRATIONS` that creates a table `partial` and then throws.
2. With the API stopped, `mkdir /tmp/astros-interrupted/database.sqlite3.restore-tmp` so the restore fails.
3. Start the API. **Pass:** the banner shows the restore-failed message ("A schema migration failed and the automatic restore also failed…", `MIGRATION_FAILED_RESTORE_FAILED`), `database.sqlite3.migration-in-progress` is present, and the log says it was kept, that the next boot retries the restore of the named backup, and to delete nothing.
4. Stop the API, `rmdir` the `.restore-tmp` directory, and change the stub so it no longer throws. (Forgetting the `rmdir` makes the next boot's sentinel restore fail too: the `MIGRATION_INTERRUPTED` banner, with the sentinel kept.)
5. Start the API. **Pass:**
   - the log shows `Restored …backup-<last> after an interrupted migration …`, then the migration runs
   - no banner, and the sentinel is gone
   - the backup still has no `partial` table: `sqlite3 database.sqlite3.backup-<last> ".tables"`
6. Revert the stub.

## Migration order with a wrong clock (T-017)

Kysely records each applied migration with the clock time and, by default, refuses an upgrade when those times disagree with name order. A droid without a battery-backed clock can record one as older than the migration before it. Since T-017 the order is checked by name only.

### 19. Out-of-order recorded times don't block an upgrade

1. Temporarily add a no-op test-range migration to `PRODUCTION_MIGRATIONS` (e.g. `m950_test_noop` whose `up` does nothing), so this build always has one pending, and build.
2. Stage a copy of the dev database whose recorded times are out of order (a clock that was ahead and then corrected):
   ```bash
   mkdir -p /tmp/astros-clock && cp .data/database.sqlite3 /tmp/astros-clock/
   DB=/tmp/astros-clock/database.sqlite3
   sqlite3 $DB "UPDATE kysely_migration SET timestamp = '2099-01-01T00:00:00.000Z' WHERE name = '1_add_script_evt_id'"
   ```
3. Start the API with `DATABASE_PATH=/tmp/astros-clock`. **Pass:** `Created pre-migration backup …`, then `migration "…" was executed successfully` for each pending migration (`m950_test_noop` last); no banner; `sqlite3 $DB "SELECT timestamp FROM kysely_migration WHERE name = '1_add_script_evt_id'"` still prints the 2099 value (nothing rewrites it). **Fail:** `corrupted migrations`, `MIGRATION_FAILED_RESTORED`, or `sorts before applied migration`.
4. Restart. **Pass:** no backup line and no migration line.
5. (Optional, the bug itself.) Stage a **fresh** copy as in step 2 (the one above is migrated now) and start a build from before T-017 with the same stub. **Pass:** `MIGRATION_FAILED_RESTORED`, with `corrupted migrations: expected previously executed migration 2_add_script_duration to be at index 1 but 1_add_script_evt_id was found …` in the log.
6. Revert the stub.

### 20. A misnamed migration is refused before anything runs

1. Work on a fresh copy as in case 19, step 2 (the timestamps can stay as they are), and record its contents: `sqlite3 $DB .dump | sha256sum > /tmp/astros-clock-dump.sha256`.
2. Temporarily add a misnamed migration to `PRODUCTION_MIGRATIONS`, e.g. `'10_x_misnamed'` whose `up` creates a table `t017_misnamed`, and build. (`database.test.ts`'s naming guard fails on it, which is the CI gate this case gets past by hand.)
3. Start the API with `DATABASE_PATH=/tmp/astros-clock`. **Pass:** the `MIGRATION_FAILED_RESTORED` banner; the log has `failed to migrate: Kysely would run migration 10_x_misnamed before 1_add_script_evt_id: migration names must sort the same as plain text and by number (T-012)` and no `was executed successfully` line; `sqlite3 $DB ".tables"` has no `t017_misnamed`; after stopping the API, `sqlite3 $DB .dump | sha256sum` matches the line in `/tmp/astros-clock-dump.sha256` (the raw file differs after a restore; its contents don't).
4. Revert the stub.

## Storybook spot-check

Run `cd astros_vue && npm run storybook`. Navigate to "Components / Common / AstrosSystemStatusBanner". Verify each story renders without console errors:

- `Hidden` — no banner visible, only the placeholder text.
- `StartupOpenFailed`, `BackupFailed`, `MigrationFailedNoBackup`, `MigrationFailedRestored`, `MigrationFailedRestoreFailed`, `MigrationInterrupted`, `DbNewerThanServer` — each shows the banner with the corresponding localized message.
- `UnknownReasonCode`, `NoReasonCode` — both show the UNKNOWN fallback.

Then open "Components / Common / AstrosIncompatibleDatabaseNotice" → `Default`: the notice card renders over the schematic, with the title, message and action line, and with nothing to click.
