# Random span events QA

Tests for random span events: a script event with an end time, inside which the ESP improvises GPIO toggles or servo moves. Spec: `.docs/specs/20261022-0748-random-span-events-design.md`.

The plan grows with the project. T-007 added the data model, so this file starts with the upgrade path. The scripter can't create a span yet (Phase B), so the span cases plant rows by hand SQL. T-008 converts a span to command 6 (Maestro) or 7 (GPIO). Without T-008, the converter has no span case. A Maestro span uploads as a point command with `position` `undefined`, which reboots the controller. A script with any GPIO event (span or point) built in the Vue scripter fails to convert at all, so every controller is sent an empty script. Do not upload a script with a hand-coded span on a build without T-008. T-009 refuses a bad span on save with a 400 and the reason (Save validation). The bench cases from the spec (GPIO flicker, servo twitch, panel flap, panic mid-span, padawan span, idle playlist loop, old firmware) arrive with those tasks.

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

Only GPIO and Maestro channels support spans. The API refuses to save a span tagged with any other sub-type, or with a sub-type other than its channel's (T-009), so this case plants one by hand. Steps 8–11 plant the second kind.

Case 5 ends with no API running. Start this build's API again against the same copy (Preconditions), then reload the tab.

1. Pick a script with an event on a serial, I2C, HCR or Kangaroo channel. Note one such event's id and the script id:
   `sqlite3 $DB "SELECT id, script_id, module_sub_type FROM script_events WHERE module_sub_type IN (101, 102, 103, 201, 202) LIMIT 1"`
2. Make it a span: `sqlite3 $DB "UPDATE script_events SET end_time = time + 30 WHERE id = '<event id>'"`.
3. Open the script in the scripter.
4. **Pass:** the script loads without that event; every other event is there. The API log has `ScriptRepository.readScriptEvents: dropping random span <event id> on channel <channel id> in script <script id> (time …, end_time …, data …): moduleSubType <n> has no span payload; the row is deleted when this script is next saved`.
5. Save the script.
6. **Pass:** `sqlite3 $DB "SELECT count(*) FROM script_events WHERE id = '<event id>'"` prints `0`, and the save succeeded.
7. **Fail:** the script fails to open, the event shows on the timeline, or the row survives the save.
8. Pick another event on a serial or HCR channel (`sqlite3 $DB "SELECT id, script_id, module_sub_type FROM script_events WHERE module_sub_type IN (101, 103) AND end_time IS NULL LIMIT 1"`) and make it a **GPIO-tagged** span, a supported sub-type that isn't its channel's:
   `sqlite3 $DB "UPDATE script_events SET module_type = 3, module_sub_type = 301, end_time = time + 30, data = '{\"minGapMs\":50,\"maxGapMs\":400}' WHERE id = '<event id>'"`
9. Open the script in the scripter.
10. **Pass:** the script loads without that event, and the API log has `ScriptRepository.readScriptEvents: dropping random span <event id> on channel <channel id> in script <script id> (time …, end_time …, data …): moduleSubType 301 does not match its channel's (<101 or 103>); the row is deleted when this script is next saved`.
11. Save the script. **Pass:** the row count for `<event id>` is `0`, and the save succeeded. **Fail:** the event shows on the timeline, the script fails to open, or the row survives.

### 7. Scripts still open in read-only mode before migration 9

When the pre-migration backup fails, the server skips the migration and serves reads in `BACKUP_FAILED` mode, so the table has no `end_time` column.

1. Make a fresh copy at migration 8 (the Preconditions copy step into a new directory, e.g. `/tmp/astros-span-readonly`), then `chmod 0500 /tmp/astros-span-readonly`.
2. Stop any API still running from case 6, then start this build's API with `DATABASE_PATH=/tmp/astros-span-readonly`.
3. **Pass:** the log has `Entering read-only mode (BACKUP_FAILED)`, and no migration line. The UI shows the read-only banner.
4. Open three scripts in the scripter, including one with serial or HCR events and one with GPIO or servo events.
5. **Pass:** each loads with all its events at their times.
6. **Fail:** a script fails to open, or an event is missing.
7. Clean up: `chmod 0700 /tmp/astros-span-readonly`.

## Server conversion

These cases continue on the migrated copy from case 1, with this build's API running (Preconditions). If case 7's API is still up on `/tmp/astros-span-readonly`, restart it against the Preconditions copy.

**Reading the command strings.** The upload logs its `DEPLOY_SCRIPT` payload at debug level, but no debug line reaches the log (PLAN.md Backlog). These cases read the strings by running the upload's converter against the copy instead. Create the printer once:

```bash
cat > /tmp/astros-print-conversion.mts <<'EOF'
// Prints what the upload sends each controller. Run from astros_api/.
const src = `${process.cwd()}/src`;
const { createKyselyConnection } = await import(`${src}/dal/database.js`);
const { ScriptRepository } = await import(`${src}/dal/repositories/script_repository.js`);
const { ScriptConverter } = await import(`${src}/scripting/script_converter.js`);
const [dbFile, scriptId] = process.argv.slice(2);
const { db } = createKyselyConnection(dbFile);
const locations = await db.selectFrom('locations').select(['id', 'name']).execute();
const names = new Map(locations.map((l) => [l.id, l.name]));
const result = await new ScriptConverter(new ScriptRepository(db)).convertScript(scriptId);
if (result.size === 0) console.log('EMPTY MAP');
for (const [id, script] of result) console.log(`${names.get(id)}: ${script}`);
await db.destroy();
EOF
```

Run it as `cd astros_api && npx tsx /tmp/astros-print-conversion.mts $DB <script id>`. It prints one `<location>: <commands>` line per location, or `EMPTY MAP` when the conversion threw (the upload would then send every controller an empty script). A skipped span also prints the converter's JSON warn line, which pino writes asynchronously, so it can come after the location lines.

### 8. A GPIO point and two spans convert to commands 5, 7 and 6

1. Enable GPIO channel 0 on the core (on the bench, the padawan's relay LED), then reload the scripter:
   `sqlite3 $DB "UPDATE gpio_channels SET enabled = 1, name = 'QA gpio' WHERE location_id = (SELECT id FROM locations WHERE name = 'core') AND channel_number = 0"`
2. Create a script named `T-008 QA`. Add the `QA gpio` channel and one Maestro **servo** channel on the body. Add a GPIO event at 1.0 s set high, then save.
3. Note the ids: `sqlite3 $DB "SELECT s.id, sc.id, sc.module_channel_type, sc.module_channel_id FROM scripts s JOIN script_channels sc ON sc.script_id = s.id WHERE s.name = 'T-008 QA'"`. The second column is each **script channel's** id; the span rows below need it, not `module_channel_id`. The `sqlite3` shell doesn't enforce foreign keys, so a wrong id inserts without error and the span silently never loads. Then note the Maestro channel's number and its UART module's idx (`maestroIdx` on the wire): `sqlite3 $DB "SELECT mc.channel_number, u.idx FROM maestro_channels mc JOIN maestro_boards b ON b.id = mc.board_id JOIN uart_modules u ON u.id = b.parent_id WHERE mc.id = '<Maestro module_channel_id>'"`.
4. Insert a GPIO span from 2.0 to 16.0 s and a Maestro span from 0 to 14.0 s. Times are deciseconds. `duration_ds` is recomputed only on save, so set it too. Keep any hand-inserted span within `0 ≤ time < end_time ≤ 6000`: since T-009 a stored span outside that loads, but makes every save of its script answer 400 (`SELECT id FROM script_events WHERE end_time IS NOT NULL AND (end_time <= time OR time < 0 OR end_time > 6000)` should return nothing):
   ```bash
   sqlite3 $DB "INSERT INTO script_events (id, script_id, script_channel_id, module_type, module_sub_type, time, end_time, data) VALUES
     ('qa-t008-gpio-span', '<script id>', '<GPIO script channel id>', 3, 301, 20, 160, '{\"minGapMs\":50,\"maxGapMs\":400}'),
     ('qa-t008-maestro-span', '<script id>', '<Maestro script channel id>', 1, 104, 0, 140, '{\"channel\":<channel number>,\"isServo\":true,\"minGapMs\":400,\"maxGapMs\":2000,\"minPos\":20,\"maxPos\":100,\"minMove\":15,\"maxMove\":60,\"speed\":0,\"acceleration\":0}');
     UPDATE scripts SET duration_ds = 160 WHERE id = '<script id>'"
   ```
5. Run the printer for the script.
6. **Pass:**
   - `core: 0|1000|0;5|1000|0|1;7|14000|0|14000|50|400;0|0|0`. The `5|…` is the GPIO point; before T-008 a script with any GPIO point printed `EMPTY MAP`.
   - `body: 6|16000|<idx>|<channel number>|14000|400|2000|20|100|15|60|0|0;0|0|0`
   - `dome: 0|16000|0;0|0|0`. Every location's last command is at 16.0 s, the GPIO span's end.
7. Upload the script from the Scripts page.
8. **Pass:** the upload reports success, and the API log has no `skipping random span` or `Exception converting script` line.
9. **Fail:** `EMPTY MAP`, a `5|…` or `1|…` command in a span's place, `undefined` or a `.` anywhere, or a location that ends before 16.0 s.

### 9. An invalid span is skipped with a warning and keeps the timing

1. Add a GPIO span from 18.0 to 19.0 s with a 10 ms min gap (the floor is 20), and move `duration_ds` to its end:
   `sqlite3 $DB "INSERT INTO script_events (id, script_id, script_channel_id, module_type, module_sub_type, time, end_time, data) VALUES ('qa-t008-bad-span', '<script id>', '<GPIO script channel id>', 3, 301, 180, 190, '{\"minGapMs\":10,\"maxGapMs\":400}'); UPDATE scripts SET duration_ds = 190 WHERE id = '<script id>'"`
2. Upload the script from the Scripts page.
3. **Pass:** the upload reports success (a skipped span doesn't fail the upload yet; T-010). The API log has `ScriptConverter: skipping random span qa-t008-bad-span on channel <GPIO script channel id> in script <script id>: minGapMs 10 is below 20`.
4. Run the printer.
5. **Pass:**
   - `core: 0|1000|0;5|1000|0|1;7|16000|0|14000|50|400;0|1000|0;0|0|0`. The bad span's slot is `0|1000|0`, a no-op that keeps the delay.
   - `body: 6|19000|…` and `dome: 0|19000|0;0|0|0`. The skipped span still sets the script's end.
6. **Fail:** `EMPTY MAP`, a `7|…|10|…` command, or a location that ends before 19.0 s.

### 10. A Maestro span follows its channel's current servo/digital setting

1. Switch the case 8 Maestro channel to digital on the copy: `sqlite3 $DB "UPDATE maestro_channels SET is_servo = 0 WHERE id = '<Maestro module_channel_id>'"`.
2. Run the printer.
3. **Pass:** `body: 6|19000|<idx>|<channel number>|14000|400|2000|0|0|0|0|0|0;0|0|0`. The span's payload still says servo, but the channel is digital, so the six fields after `maxGapMs` are `0`.
4. Restore it: `sqlite3 $DB "UPDATE maestro_channels SET is_servo = 1 WHERE id = '<Maestro module_channel_id>'"`.
5. **Fail:** the servo fields are sent for the digital channel.

## Save validation

T-009: `PUT /api/scripts/` refuses a bad span with `400 {"message": <reason>}` and writes nothing. The scripter can't create a span until Phase B, so these cases send the request with `curl`. They continue on case 8's `T-008 QA` script, with this build's API running, and need `jq`. Run them in one shell, set up with:

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"<op>","password":"<pw>"}' | jq -r .token)
ID=<T-008 QA script id>
get() { curl -s -H "Authorization: Bearer $TOKEN" "localhost:3000/api/scripts/?id=$ID" | jq -S .; }
put() { curl -s -i -X PUT -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' --data @"$1" localhost:3000/api/scripts/; }
get > /tmp/astros-t009-before.json
```

### 11. A backwards span is refused and nothing changes

1. Turn the GPIO point at 1.0 s into a span ending at 0 s, and send it:
   ```bash
   jq '(.scriptChannels[].events[] | select(.endTime == null and .moduleSubType == 301)) |= (.endTime = .time - 1)' /tmp/astros-t009-before.json > /tmp/astros-t009-bad.json
   put /tmp/astros-t009-bad.json
   ```
2. **Pass:** `HTTP/1.1 400` and `{"message":"Random span endTime must be after its time (1 s), got 0 s"}`. The API log has `saveScript: refused script: Random span endTime must be after …` (warn, with `scriptId` <ID>) and `ScriptRepository.validateScriptSpans: refusing event <event id> on channel <GPIO script channel id> in script <ID>: …` (error).
3. `get | diff /tmp/astros-t009-before.json -` **Pass:** empty.
4. **Fail:** `200` or `500`, a different message, or a GET that differs.

### 12. A span past 600 s is refused

1. `jq '(.scriptChannels[].events[] | select(.endTime == null and .moduleSubType == 301)) |= (.endTime = 601)' /tmp/astros-t009-before.json > /tmp/astros-t009-late.json`, then `put /tmp/astros-t009-late.json`.
2. **Pass:** `400` and `{"message":"Random span must lie between 0 and 600 s, got 1 to 601 s"}`, and `get | diff /tmp/astros-t009-before.json -` is empty.
3. **Fail:** `200`, or the span is stored.

### 13. A GPIO-tagged span on a serial or HCR channel is refused

1. Pick a script with a serial or HCR event: `sqlite3 $DB "SELECT DISTINCT script_id FROM script_events WHERE module_sub_type IN (101, 103) LIMIT 1"`. Set `ID` to it, then `get > /tmp/astros-t009-before-uart.json`.
2. Tag the first event on its first serial/HCR channel as a GPIO span, and send it:
   ```bash
   jq '(.scriptChannels | map(.moduleChannelType == "UartChannel" and (.events | length) > 0) | index(true)) as $i
     | .scriptChannels[$i].events |= (to_entries | .[0].value |= (.moduleType = 3 | .moduleSubType = 301 | .endTime = .time + 3 | .event = {minGapMs: 50, maxGapMs: 400}) | from_entries)' \
     /tmp/astros-t009-before-uart.json > /tmp/astros-t009-mismatch.json
   put /tmp/astros-t009-mismatch.json
   ```
3. **Pass:** `400` and `{"message":"Random span moduleSubType 301 does not match its channel's (101)"}` (`(103)` for an HCR channel), and `get | diff /tmp/astros-t009-before-uart.json -` is empty.
4. **Fail:** `200`, or the GPIO-tagged span is stored.

### 14. A Maestro span takes the stored channel's `isServo` on save, not the request's

1. Set `ID` back to `T-008 QA` and load it while its Maestro channel is a servo: `get > /tmp/astros-t009-maestro.json`. The file's `moduleChannel` says `"isServo": true`, like an editor tab opened now.
2. Switch the channel to digital behind that tab's back: `sqlite3 $DB "UPDATE maestro_channels SET is_servo = 0 WHERE id = '<Maestro module_channel_id>'"`.
3. Save the stale copy: `put /tmp/astros-t009-maestro.json`. **Pass:** `200`, and `sqlite3 $DB "SELECT data FROM script_events WHERE id = 'qa-t008-maestro-span'"` shows `"isServo":false`: the stored channel decides.
4. Restore the channel (`is_servo = 1`) and save the same file again. **Pass:** `"isServo":true`.
5. **Fail:** `isServo` follows the request's `moduleChannel` instead of the stored channel, or a save answers anything but `200`.

## Edge cases covered by tests

- Every validation range in `.docs/protocol.md` § C has a boundary pair (`random_span_validation.test.ts`).
- Gaps and span lengths are rounded to whole ms before validation and sending: a 2.01 s gap is sent as `2010`, and a 16.1 → 16.2 s span with a 100 ms min gap is valid (`script_converter.test.ts`).
- A span is skipped with a warning, and other locations still convert, when (`script_converter.test.ts`):
  - its payload is `null` or not an object;
  - its GPIO channel, UART module or Maestro channel setting is missing;
  - its GPIO channel number or UART index is not an integer ≥ 0;
  - its Maestro channel is still `-1`, or missing from the payload;
  - its sub-type has no span payload.
- A span whose end is before its start, `NaN` or `Infinity` counts as ending at its start, and an event with a `NaN` start is left out of the script's end, so one bad row can't extend or poison the other locations' end buffers; the bad row's own controller still gets a `NaN` delta (PLAN.md Backlog: non-finite event times) (`script_converter.test.ts`).
- A span on a disabled GPIO channel is skipped with `GPIO channel <n> (<id>) is disabled` (`script_converter.test.ts`, `script_converter.integration.test.ts`).
- A span whose payload throws on conversion (JSON such as `{"toString": 1, "valueOf": 1}` in a field) is skipped with `unexpected error: …` instead of emptying the upload (`script_converter.test.ts`).
- Spans and points sharing a start time: only the last command of the group in wire order carries the delta, a skipped span in the group carries `0`, and a span followed by a point sends the delta to the point, not its span length (`script_converter.test.ts`).
- Save → load → convert through a real in-memory database gives the expected strings: the GPIO channel lookup, a disabled GPIO channel, the save's `-1` → channel-number overwrite, and a Maestro channel stored as servo or as digital all match what the repository actually returns (`script_converter.integration.test.ts`).
- A digital payload on a servo channel is validated as servo and skipped when its servo fields are missing (`script_converter.test.ts`).
- A Maestro point without a numeric `position` is skipped with a warning instead of reaching the controller as `undefined` (`script_converter.test.ts`).
- A client that omits `endTime` (for example a browser tab loaded before the upgrade) saves point events: `end_time` is stored NULL and reads back `null` (`script_repository.test.ts`).
- Saving a span on a sub-type with no span payload fails the whole save and leaves the stored script as it was (`script_repository.test.ts`).
- Save validation (T-009, `script_repository.test.ts`): each rule refuses with its exact message and writes nothing (stored rows and name unchanged):
  - a sub-type without span support;
  - a sub-type other than the stored channel's (the request body's `moduleChannel` is ignored), or a channel missing from the database;
  - an `endTime` of `'5'`, `''`, `true`, `NaN` or `Infinity`, or one at or before `time`;
  - a span outside 0–600 s: a start of −1, `-Infinity` or a string, or an end of 600.1. A span from 0 to exactly 600 s is saved.
  - The order and range checks judge the times as stored (whole deciseconds): a span from 0.05 to 0.14 s, which would store as 0.1 → 0.1 and then block every later save of the script, is refused with `(0.1 s), got 0.1 s`; an end of 600.04 stores as 600, and a start of −0.04 or −0.05 as 0, and they are saved; a start of −0.06 is refused as `-0.1`.
  - a span without a `time` (rule 4, `(NaN s)`), and a bad span between two valid ones (every span is checked, not just the first).
  - a value `Number()` and `String()` throw on (JSON with a `"toString"` key, or an array holding one) still gets a 400, not a 500: as a start, rule 4's `(NaN s)`; as a sub-type, rule 1; as a channel type, not found, with any id (a type that matches no case is not looked up); as the event, script channel or script id, the span's own refusal. The sub-type and channel messages, and the log line's ids, show the value as JSON. On a known channel type, an id SQLite can't bind still fails the lookup (a 500, below).
  - Rule order is pinned: sub-type before channel, sub-type before `endTime`, not-found and mismatch before `endTime`, order before range.
  - Each refusal logs `ScriptRepository.validateScriptSpans: refusing event <id> on channel <id> in script <id>: <reason>` at error; accepted saves log no error.
- A channel read that fails for any reason but a missing row propagates (a 500), rather than coming back as a 400 "channel not found"; a span on a channel type the server doesn't load (`PwmChannel`) is refused as not found, while a points-only channel of that type saves and reads back; a span rule 1 refuses doesn't look up its channel, so even a channel id SQLite can't bind gets rule 1's 400 (`script_repository.test.ts`).
- Kangaroo and I2C script channels load their stored channels (`script_repository.test.ts`).
- A write that fails inside the save's transaction rolls the whole save back (`script_repository.test.ts`).
- Point events are never refused: `endTime` null or omitted, `time` 0 or 700, a sub-type other than its channel's, or a channel missing from the database, which a points-only channel is not even looked up for (`script_repository.test.ts`).
- A hand-coded span whose sub-type is not its channel's is dropped on load and deleted by the next save; with unreadable `data` it fails the read instead (`script_repository.test.ts`).
- A Maestro span's `isServo` is overwritten on save from the stored channel, in both directions and even when the request's `moduleChannel` says otherwise; a Maestro point's is not (`script_repository.test.ts`).
- `PUT /api/scripts/` answers exactly one response: 400 with the reason for a refusal (a warning with the script id; no controller error log carries the refusal), or `500 Internal server error` for anything else (an error log with the script id) (`scripts_controller.test.ts`).
- A span row with an unknown sub-type or unreadable `data` fails the script read, as a point row does, rather than being dropped (`script_repository.test.ts` covers the sub-type).
- A crash between migration 9's `ALTER TABLE` and Kysely's migration record: the next boot re-runs `up`, which finds the column and does nothing (`migration_9.test.ts`).
- Rolling `migration_9` back drops the column and keeps the rest of each row (`migration_9.test.ts`).
