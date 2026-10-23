# System read-only mode QA

Tests for the Phase 3 Vue UI when the AstrOs.Server enters read-only mode (Phase 1's safety net). Run after merging Phase 3.

## Preconditions

- AstrOs.Server stopped between scenarios so each starts from a known state.
- Working `~/.config/astrosserver/database.sqlite3` file from a healthy run (so we have something to back up).
- Vue app running: `cd astros_vue && npm run dev`. Browser at `http://localhost:5173`.
- Devtools open with the Network tab visible.
- Login credentials handy.

## Forcing read-only mode

Three reliable ways to put the server into read-only mode for testing. Pick whichever matches the scenario:

1. **`STARTUP_OPEN_FAILED`** — point `DATABASE_PATH` at a directory:
   ```bash
   mkdir -p /tmp/astros-readonly-test/database.sqlite3
   DATABASE_PATH=/tmp/astros-readonly-test npm run start
   ```
   `better-sqlite3` rejects opening a directory as a database file; the server boots in read-only mode with the in-memory fallback.

2. **`BACKUP_FAILED`** — drop write permissions on the dbDir before starting:
   ```bash
   chmod 0500 ~/.config/astrosserver
   # add an unapplied migration to force a backup attempt (see git-stash a quick stub or temporarily edit migrations/index.ts)
   npm run start
   # restore perms after: chmod 0700 ~/.config/astrosserver
   ```

3. **`MIGRATION_FAILED_RESTORED`** — inject a migration that throws but leave the backup mechanism intact. The system rolls back to the prior version and enters read-only with this code so operators are forced to notice and investigate. Easiest from the integration tests (`database.integration.test.ts`).

4. **`MIGRATION_FAILED_RESTORE_FAILED`** — inject a migration that throws *and* mock `fs.copyFileSync` to throw too. Mostly observable via tests, not manual QA.

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

- Work on a **copy** of the active dev database, never the real one. That is the file `DATABASE_PATH` in `astros_api/.env` names (`.data/database.sqlite3` at the repo root on the dev machine). It must be at this build's latest migration: the last name `SELECT name FROM kysely_migration` prints should be the last one in `dal/database.ts`'s provider. An older copy stages the branch-switch case below instead.
  ```bash
  mkdir -p /tmp/astros-newer-db
  cp .data/database.sqlite3 /tmp/astros-newer-db/
  sqlite3 /tmp/astros-newer-db/database.sqlite3 \
    "INSERT INTO kysely_migration (name, timestamp) VALUES ('99_future', '2026-10-22T00:00:00.000Z')"
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
2. **Pass:** the log has `Entering read-only mode (DB_NEWER_THAN_SERVER): database has migrations this build does not know: 99_future`, and `Skipping serial port setup: database is from a newer server version` appears exactly once.
3. **Fail:** any `Created pre-migration backup`, `migration "…" was executed`, or `Starting up serial port services` line.

### 10. The notice page replaces the app

1. Open `http://localhost:5173`. Try it once logged in and once logged out.
2. **Pass:** one card over the R2 schematic, reading "Incompatible database", the message, and "Install the newer version of AstrOs Server, or restore a database backup made by this version." There is no login form, navigation, read-only banner or toast. Logged out, the login form may flash for a fraction of a second first: the notice appears once `GET /api/system/status` answers.
3. Hard refresh (`Ctrl+Shift+R`), then deep-link to `http://localhost:5173/scripts`.
4. **Pass:** both still show only the notice.
5. **Fail:** the login page or app layout stays on screen, the read-only banner shows, a "Your change was not saved" toast appears, or any raw i18n key path is visible.

### 11. Every API route except status answers 503

```bash
curl -s -i localhost:3000/api/scripts
curl -s -i -X POST localhost:3000/api/login
curl -s -i -X POST localhost:3000/api/panicStop
curl -s -i localhost:3000/api/system/status
```

**Pass:** the first three return `503` with `{"message":"Database is from a newer server version","reasonCode":"DB_NEWER_THAN_SERVER"}`. The status call returns `200` with `{"readOnly":true,"reasonCode":"DB_NEWER_THAN_SERVER","enteredAt":"…"}`.
**Fail:** any other status, or login / panic getting through (those are allowed only in plain read-only mode).

### 12. The database file is untouched

1. Stop the API (`Ctrl+C`).
2. Run `sha256sum -c /tmp/astros-newer-db.sha256` and `ls /tmp/astros-newer-db`.
3. **Pass:** the checksum is `OK`, and the directory holds only `database.sqlite3` (no `.backup-*`, `-journal` or `-wal` file).
4. **Fail:** checksum mismatch, or any extra file.

### 13. Recovery

1. With the notice page still open, stop the API and start it against a database without `99_future`. Use a fresh copy of the dev database, or the dev database itself: drop the `DATABASE_PATH=…` prefix so the value sourced from `.env` applies.
2. **Pass:** within about 3 s (the WebSocket retry interval) the notice is replaced by the login page. This happens even with a saved session: while the database was incompatible, the router turned every navigation into `/auth`, so you sign in again.
3. **Fail:** the notice persists after the reconnect.

### 14. Branch switch: unknown and pending migrations

`database.integration.test.ts` covers this case. To stage it by hand, repeat the preconditions with a copy of a database that is one or more migrations **behind** this build (for example, an old `~/.config/astrosserver/database.sqlite3`), plus `99_future`.

**Pass:** cases 9 and 12 hold exactly as above. Nothing is applied and no `.backup-*` file appears, even though this build has migrations the database lacks.
**Fail:** any `Created pre-migration backup` or `migration "…" was executed` line, or `MIGRATION_FAILED_RESTORED` instead of `DB_NEWER_THAN_SERVER`.

## Storybook spot-check

Run `cd astros_vue && npm run storybook`. Navigate to "Components / Common / AstrosSystemStatusBanner". Verify each story renders without console errors:

- `Hidden` — no banner visible, only the placeholder text.
- `StartupOpenFailed`, `BackupFailed`, `MigrationFailedNoBackup`, `MigrationFailedRestored`, `MigrationFailedRestoreFailed`, `DbNewerThanServer` — each shows the banner with the corresponding localized message.
- `UnknownReasonCode`, `NoReasonCode` — both show the UNKNOWN fallback.

Then open "Components / Common / AstrosIncompatibleDatabaseNotice" → `Default`: the notice card renders over the schematic, with the title, message and action line, and with nothing to click.
