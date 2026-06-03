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

## Storybook spot-check

Run `cd astros_vue && npm run storybook`. Navigate to "Components / Common / SystemStatusBanner". Verify each story renders without console errors:

- `Hidden` — no banner visible, only the placeholder text.
- `StartupOpenFailed`, `BackupFailed`, `MigrationFailedNoBackup`, `MigrationFailedRestored`, `MigrationFailedRestoreFailed` — each shows the banner with the corresponding localized message.
- `UnknownReasonCode`, `NoReasonCode` — both show the UNKNOWN fallback.
