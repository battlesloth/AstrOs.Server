# QA: Maestro channel release time

Each Maestro channel stores `release_ms`, the minimum time (ms) it stays
powered after a move; firmware 1.3.0 releases a servo channel at
max(release time, modeled travel + 10 %). The default, 5000, is the 5 s floor
firmware 1.2.1–1.2.2 uses for every channel (ESP T-005). T-013 stores and
round-trips the value; the config sync string stays at 7 fields until T-014,
and the Modules page has no field for it until T-015 (which adds its cases
here).

## Preconditions

- Run these from the repo root. Work on a **copy** of the active dev database,
  never the real one or the bench's: `database.sqlite3` in the directory
  `DATABASE_PATH` names in `astros_api/.env` (`.data/database.sqlite3` on the
  dev machine). It must hold at least one Maestro module with a board.
  ```bash
  mkdir -p /tmp/astros-release-qa
  cp .data/database.sqlite3 /tmp/astros-release-qa/
  DB=/tmp/astros-release-qa/database.sqlite3
  ```
- Start the API with `DATABASE_PATH=/tmp/astros-release-qa` and the Vue dev
  server; log in; open the Modules page with the browser console and the API
  log visible.
- **Values set by SQL must stay in range.** Until T-015 adds the field, a bench
  sets `release_ms` by SQL. A stored value outside 1000–120000 makes every
  Modules page save answer 400 ("Request failed with status code 400"), since
  the page sends it back. Check that this returns nothing:
  `sqlite3 $DB "SELECT id, release_ms FROM maestro_channels WHERE release_ms NOT BETWEEN 1000 AND 120000"`.

The console steps use this setup (paste it first). `channels(c)` is the first
board of the first Maestro module in the body location; change `bodyModule` if
yours is elsewhere:

```js
const h = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + localStorage.jwt_token };
const load = async () => (await fetch('/api/locations/load', { headers: h })).json();
const save = async (c) => {
  const r = await fetch('/api/locations/', { method: 'PUT', headers: h, body: JSON.stringify(c) });
  console.log(r.status, await r.json());
};
const channels = (c) => c.bodyModule.uartModules.find((m) => m.moduleSubType === 104).subModule.boards[0].channels;
```

## Upgrade

1. **Existing channels get 5000.** With the copy at migration 9 or older, start
   the API. Expected: the log has
   `Created pre-migration backup at …database.sqlite3.backup-<last applied>`,
   then `migration "m010_add_maestro_release_ms" was executed successfully`.
   `sqlite3 $DB "SELECT release_ms, count(*) FROM maestro_channels GROUP BY release_ms"`
   gives one row, `5000|<every channel>`.
2. **A second start does nothing.** Restart the API. Expected: no backup line
   and no migration line; no new `backup-` file beside the database.
3. **A fresh install runs it last.** Start the API with `DATABASE_PATH` at a new,
   empty folder, and point `$DB` at the `database.sqlite3` it creates there.
   Expected:
   `sqlite3 $DB "SELECT name FROM kysely_migration ORDER BY rowid DESC LIMIT 2"`
   gives `m010_add_maestro_release_ms`, then `9_add_script_event_end_time`.
   Point `$DB` back at the copy and restart the API on it for the cases below.
4. **The page loads it.** Reload the Modules page. Expected: in the devtools
   Network tab, every Maestro channel in the `locations/load` response has
   `"releaseMs": 5000`.

## Saving

5. **Save unchanged.** Click **Save**. Expected: the "Saving..." dialog closes
   with no error (the page shows no success toast); the SQL in case 1 still
   gives `5000|<every channel>`.
6. **Other edits keep a channel's release time.** In the console,
   `channels(await load())[0].id` gives the channel's id. Run
   `sqlite3 $DB "UPDATE maestro_channels SET release_ms = 15000 WHERE id = '<id>'"`
   and reload the page. On that module's Channel 0, set the type to Servo if it
   is disabled (its settings are hidden until then), change its name and home
   position, and click **Save**. Expected:
   `sqlite3 $DB "SELECT name, home_pos, release_ms FROM maestro_channels WHERE id = '<id>'"`
   shows the new name and home position with `15000`.
7. **A tab from before the field existed.** In the console:
   `const c = await load(); channels(c).forEach((ch) => delete ch.releaseMs); await save(c);`.
   Expected: `200 { message: 'success' }`; `channels(await load()).map((ch) => ch.releaseMs)`
   is all 5000, Channel 0 included (a save without the field stores the
   default).
8. **Valid bounds.** `const c = await load(); channels(c)[0].releaseMs = 1000; channels(c)[1].releaseMs = 120000; await save(c);`.
   Expected: `200`; channels 0 and 1 read 1000 and 120000.

## Negative / edge

9. **A bad value refuses the whole save.** Note the locations' fingerprints:
   `sqlite3 $DB "SELECT name, config_fingerprint FROM locations"`. Then
   `const c = await load(); channels(c)[0].releaseMs = 20000; channels(c)[1].releaseMs = 999; await save(c);`.
   Expected: `400 { message: 'invalid_release_ms', problems: ['body, module "<name>", board 0, channel 1: releaseMs 999 is not a whole number from 1000 to 120000'] }`;
   the API log has a `warn` line starting `saveLocations: refused:`; channel 0
   is not 20000, and the fingerprints are unchanged (no location was written).
10. **Each refused form.** Repeat case 9 with `120001`, `1500.5`, `'5000'`
    (a string) and `null` on channel 1. Expected: a `400` each time, naming the
    value (`"5000"` in quotes for the string).
11. **Sync is unchanged (until T-014).** With a controller connected, click
    **Sync**. Expected: the success toast, and the controller's Maestro servos
    still respond to the servo test. The config string keeps 7 fields per
    Maestro channel (pinned by `message_generator.test.ts`).
12. **An older build refuses the migrated database.** Stop the API. In a
    separate worktree, build develop from before T-013 merged (e.g.
    `git worktree add /tmp/astros-pre-t013 34e575ba`, then `npm ci && npm run build`
    in its `astros_api`), and start it with `DATABASE_PATH=/tmp/astros-release-qa`.
    Expected: the log has `database has migrations this build does not know: m010_add_maestro_release_ms`,
    the Vue app shows the "database version is newer than this server
    supports" notice, and `$DB` is unchanged (no backup, no migration). Stop
    it, remove the worktree, and restart the current build.
