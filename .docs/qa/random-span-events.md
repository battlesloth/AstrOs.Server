# Random span events QA

Tests for random span events: a script event with an end time, inside which the ESP improvises GPIO toggles or servo moves. Spec: `.docs/specs/20261022-0748-random-span-events-design.md`.

The plan grows with the project. T-007 added the data model, so this file starts with the upgrade path. The scripter can't create a span yet (Phase B). Until T-008 the converter has no span case: a GPIO or Maestro span (only possible by hand SQL or a raw API call) uploads as a point command. A GPIO one sets the pin low; a Maestro one sends `position` `undefined`, which reboots the controller. Do not upload a script with a hand-coded span on a build without T-008. The bench cases from the spec (GPIO flicker, servo twitch, panel flap, panic mid-span, padawan span, idle playlist loop, old firmware) arrive with those tasks.

## Preconditions

- Run these from the repo root. Work on a **copy** of the active dev database, never the real one. That is `database.sqlite3` in the directory `DATABASE_PATH` names in `astros_api/.env` (`.data/database.sqlite3` at the repo root on the dev machine). It must be at migration `8_fix_script_duration_units` and hold scripts with events:
  ```bash
  mkdir -p /tmp/astros-span-upgrade
  cp .data/database.sqlite3 /tmp/astros-span-upgrade/
  DB=/tmp/astros-span-upgrade/database.sqlite3
  sqlite3 $DB "SELECT name FROM kysely_migration ORDER BY name DESC LIMIT 1"   # 8_fix_script_duration_units
  sqlite3 $DB "SELECT id, name, duration_ds FROM scripts ORDER BY id" > /tmp/astros-span-durations-before.txt
  sqlite3 $DB "SELECT id, time, data FROM script_events ORDER BY id" > /tmp/astros-span-events-before.txt
  ```
- Start the API from this build against the copy (`DATABASE_PATH` is the directory, not the file):
  ```bash
  cd astros_api
  set -a && . ./.env && set +a   # start:tsx does not read astros_api/.env on its own
  DATABASE_PATH=/tmp/astros-span-upgrade npm run start:tsx
  ```
- Vue app running: `cd astros_vue && npm run dev`. Browser at `http://localhost:5173`, signed in.
- The cases run `sqlite3 $DB …` from a third shell. Set `DB=/tmp/astros-span-upgrade/database.sqlite3` there; the variable from the copy step does not carry over to other terminals.

## Data / upgrade

### 1. The upgrade applies migration 9 after a backup

1. Start the API as above and watch its log.
2. **Pass:** `Created pre-migration backup at /tmp/astros-span-upgrade/database.sqlite3.backup-8_fix_script_duration_units`, then `migration "9_add_script_event_end_time" was executed successfully`. There is no read-only banner in the UI.
3. **Pass:** `sqlite3 $DB "SELECT count(*) FROM script_events WHERE end_time IS NOT NULL"` prints `0`.
4. **Fail:** `Migration failed`, any read-only reason code, or a non-zero count.

### 2. Existing scripts keep their events and durations

1. `sqlite3 $DB "SELECT id, name, duration_ds FROM scripts ORDER BY id" | diff /tmp/astros-span-durations-before.txt -`
2. `sqlite3 $DB "SELECT id, time, data FROM script_events ORDER BY id" | diff /tmp/astros-span-events-before.txt -`
3. **Pass:** both diffs are empty.
4. Open the Scripts page, then open three scripts in the scripter, including the longest one.
5. **Pass:** each loads with all its channels and events, at the times recorded in `/tmp/astros-span-events-before.txt` (stored in deciseconds), and the script list shows the durations in `/tmp/astros-span-durations-before.txt`.
6. **Fail:** a script fails to load, an event is missing or moved, or a duration changes.

### 3. Saving an existing script writes point events

1. In the scripter, open an existing script, move one event and move it back (or change nothing), then save.
2. **Pass:** the save succeeds. `sqlite3 $DB "SELECT count(*) FROM script_events WHERE end_time IS NOT NULL"` still prints `0`, and the script's `duration_ds` matches `/tmp/astros-span-durations-before.txt`.
3. Add a new event to a GPIO or servo channel, save, and reload the page.
4. **Pass:** the new event reads back at its time, and its row has `end_time` NULL: `sqlite3 $DB "SELECT time, end_time FROM script_events WHERE script_id = '<script id>' AND time = <new time × 10>"` (a save rewrites every row of the script, so the last rowid is not necessarily the new event).
5. Swap between a generic GPIO channel and a Maestro channel set to digital. A swap stays within a channel type: a Maestro digital channel is a GPIO channel, and a servo channel only swaps with servo channels, so this is the only swap that converts events. The copy needs one of each enabled; if no generic GPIO channel is enabled, enable one with `sqlite3 $DB "UPDATE gpio_channels SET enabled = 1, name = 'QA gpio' WHERE rowid = (SELECT min(rowid) FROM gpio_channels)"` and reload; the controller page also works, but its controller sync fails under `start:tsx`. Add the Maestro digital channel to a script, give it events, use its swap action, pick the GPIO channel, and save.
6. **Pass:** the events convert to GPIO events at the same times, and their rows have `end_time` NULL (point events only; converting a span is refused, but none can be created through the UI yet).
7. **Fail:** a save error, a non-NULL `end_time`, or a changed duration.

### 4. Existing scripts and playlists play the same

1. Use a script not edited in case 3 (its saved duration may have changed). Run it from the Scripts page, then a playlist that contains it.
   - **Log-level (no droid):** the `start:tsx` API is enough. Watch for `running script <id>` and `dispatching script <id> from animation queue`; the serial worker cannot load under `start:tsx`, so nothing reaches an ESP.
   - **On the bench:** start the API with `npm run build && npm run start` and the same `DATABASE_PATH` override instead, so the serial worker runs.
2. **Pass:** the script dispatches and the playlist advances to its next track after the same duration as before the upgrade (the duration comes from `duration_ds`, which case 2 shows is unchanged).
3. **Fail:** a dispatch error, or a track that ends early or late.

### 5. Downgrade attempt shows the incompatible-database page

A server built before T-007 does not know migration 9. Builds from T-006 on refuse the database; builds older than T-006 (release 1.0.2 and earlier) cannot detect it, so do not run one against an upgraded database.

1. Stop the API. Record the checksum: `sha256sum $DB > /tmp/astros-span-upgrade.sha256`.
2. Check out a T-006 build without migration 9 in a separate worktree and start its API against the same copy:
   ```bash
   git worktree add /tmp/astros-pre-t007 232cdc31   # develop after T-006, before T-007
   cd /tmp/astros-pre-t007/astros_api && npm ci
   set -a && . /path/to/AstrOs.Server/astros_api/.env && set +a
   DATABASE_PATH=/tmp/astros-span-upgrade npm run start:tsx
   ```
   Keep the Vue dev server from this build running.
3. **Pass:** the log has `Entering read-only mode (DB_NEWER_THAN_SERVER): database has migrations this build does not know: 9_add_script_event_end_time`. The open tab switches to the "Incompatible database" notice (as in `system-readonly-mode.md` case 10), and `curl -s -i localhost:3000/api/scripts` returns 503.
4. Stop the old API, then run `sha256sum -c /tmp/astros-span-upgrade.sha256` and `ls /tmp/astros-span-upgrade`.
5. **Pass:** the checksum is `OK`, and the directory holds only `database.sqlite3` and the case 1 `.backup-8_fix_script_duration_units`.
6. **Fail:** the old build boots normally, migrates or backs up, or the checksum changes.
7. Clean up: `git worktree remove /tmp/astros-pre-t007`.

### 6. A hand-coded span on a channel without span support is dropped

Only GPIO and Maestro channels support spans. The API refuses to save a span anywhere else, so this case plants one by hand.

Case 5 ends with no API running. Start this build's API again against the same copy (Preconditions), then reload the tab.

1. Pick a script with an event on a serial, I2C, HCR or Kangaroo channel. Note one such event's id and the script id:
   `sqlite3 $DB "SELECT id, script_id, module_sub_type FROM script_events WHERE module_sub_type IN (101, 102, 103, 201, 202) LIMIT 1"`
2. Make it a span: `sqlite3 $DB "UPDATE script_events SET end_time = time + 30 WHERE id = '<event id>'"`.
3. Open the script in the scripter.
4. **Pass:** the script loads without that event; every other event is there. The API log has `ScriptRepository.readScriptEvents: dropping random span <event id> on channel <channel id> in script <script id> (time …, end_time …, data …): moduleSubType <n> has no span payload; the row is deleted when this script is next saved`.
5. Save the script.
6. **Pass:** `sqlite3 $DB "SELECT count(*) FROM script_events WHERE id = '<event id>'"` prints `0`, and the save succeeded.
7. **Fail:** the script fails to open, the event shows on the timeline, or the row survives the save.

### 7. Scripts still open in read-only mode before migration 9

When the pre-migration backup fails, the server skips the migration and serves reads in `BACKUP_FAILED` mode, so the table has no `end_time` column.

1. Make a fresh copy at migration 8 (the Preconditions copy step into a new directory, e.g. `/tmp/astros-span-readonly`), then `chmod 0500 /tmp/astros-span-readonly`.
2. Stop any API still running from case 6, then start this build's API with `DATABASE_PATH=/tmp/astros-span-readonly`.
3. **Pass:** the log has `Entering read-only mode (BACKUP_FAILED)`, and no migration line. The UI shows the read-only banner.
4. Open three scripts in the scripter, including one with serial or HCR events and one with GPIO or servo events.
5. **Pass:** each loads with all its events at their times.
6. **Fail:** a script fails to open, or an event is missing.
7. Clean up: `chmod 0700 /tmp/astros-span-readonly`.

### Edge cases covered by tests

- A client that omits `endTime` (for example a browser tab loaded before the upgrade) saves point events: `end_time` is stored NULL and reads back `null` (`script_repository.test.ts`).
- Saving a span on a sub-type with no span payload fails the whole save and leaves the stored script as it was (`script_repository.test.ts`).
- A span row with an unknown sub-type or unreadable `data` fails the script read, as a point row does, rather than being dropped (`script_repository.test.ts` covers the sub-type).
- A crash between migration 9's `ALTER TABLE` and Kysely's migration record: the next boot re-runs `up`, which finds the column and does nothing (`migration_9.test.ts`).
- Rolling `migration_9` back drops the column and keeps the rest of each row (`migration_9.test.ts`).
