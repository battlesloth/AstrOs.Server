# AstrOs Server — Plan

Workflow rules: `CLAUDE.md` (Workflow section). Rationale and templates: `.docs/agentic-workflow.md`.

## Status

Active:  Random span events — Phase A (database guard, span data + conversion); firmware side in AstrOs.ESP (its T-007–T-009)
Now:     T-008 in progress on `feature/T-008-convert-random-spans` (amended 2026-10-29: GPIO points and spans look up the channel by `moduleChannelId`; GPIO point events in Vue-built scripts have never converted)
Next:    agreed order (2026-10-22): ESP T-007 + T-008 ✓ → server T-006 ✓ → T-007 ✓ → T-008 → server T-009 (save validation; any time before Phase B) → ESP T-009 bench (spans inserted by SQL: also set `scripts.duration_ds` to `MAX(COALESCE(end_time, time))`, or open and save the script once, since `duration_ds` is only recomputed on save) → ESP v1.3.0 release → Phase B scripter (decomposed at phase start) → Phase C
Blocked: none (Phase C waits on the AstrOs.ESP v1.3.0 release carrying its T-009)
Last:    2026-10-28 — T-007 merged (PR #135); develop at `1.0.3-dev.0`

## Random span events

Spec: `.docs/specs/20261022-0748-random-span-events-design.md` · wire format: `.docs/protocol.md` § C (both repos) · firmware: AstrOs.ESP `PLAN.md` § Random span events (its T-007 parsers, T-008 math + span table, T-009 runtime)

Phase A — database guard + span data and conversion

- [x] T-006 — Refuse a database written by a newer server (`.docs/tasks/completed/T-006-refuse-newer-database.md`, branch `feature/T-006-refuse-newer-database`; merged 2026-10-26, PR #134; bench-verified 2026-10-23 and QA-walked 2026-10-25, cases 9–14)
- [x] T-007 — Persist random span events (`.docs/tasks/completed/T-007-persist-random-span-events.md`, branch `feature/T-007-persist-random-span-events`; merged 2026-10-28, PR #135; manual check and bench of QA cases 6–7 through the API, 2026-10-27) — ships with T-008
- [ ] T-008 — Convert random spans to ESP commands 6 and 7 (`.docs/tasks/T-008-convert-random-spans.md`; amended 2026-10-27: Maestro spans follow the channel's servo/digital setting, a Maestro point without a numeric `position` is skipped)
- [ ] T-009 — Validate random spans on save (`.docs/tasks/T-009-validate-spans-on-save.md`; server numbering, not ESP T-009) — 400 with the reason, finite `endTime` after `time`, `isServo` overwritten on save, a span's sub-type must match its channel's (PR #135 review, 2026-10-28); any time before Phase B

Phase B — scripter (decompose at phase start; contracts already pinned by T-007):
- shared overlap/clamp, validation and hint-line helpers (TDD)
- the Single / Random switch in the servo and GPIO dialogs. Gaps are entered in seconds and stored as integer ms (`Math.round(s × 1000)`); a blank max move is stored as `null`, never `0`
- the span bar on the Pixi timeline (mockup option A), with click-to-edit
- body drag and edge resize, both stopping at the boundary
- GPIO ↔ Maestro-digital channel swap for spans (replaces T-007's throw)

Phase C — release:
- raise `MINIMUM_FIRMWARE_VERSION` to the AstrOs.ESP release carrying its T-009 (planned v1.3.0)
- end-to-end bench QA (`.docs/qa/random-span-events.md`)

## Standalone tasks

- [x] T-001 — Handle POLL_NAK as the offline-padawan signal (`.docs/tasks/completed/T-001-poll-nak-handling.md`, branch `feature/T-001-poll-nak-handling`; shipped in 1.0.1, bench-verified 2026-09-07)
- [x] T-002 — Fix ScriptTestModal setup crash and stale-status Run enable (`.docs/tasks/completed/T-002-script-test-modal-fix.md`, branch `feature/T-002-script-test-modal-fix`; merged 2026-09-05; shipped in 1.0.1, bench-verified 2026-09-07)
- [x] T-003 — Fix playlist repeat/interrupt bugs and cover every interrupt path (`.docs/tasks/completed/T-003-playlist-interrupt-fixes.md`, branch `feature/T-003-playlist-interrupt-fixes`; merged 2026-09-28, PR #129; shipped in 1.0.2; bench log-verified 2026-09-28, cases 7–13)
- [x] T-004 — Store script durations in deciseconds (`.docs/tasks/completed/T-004-script-duration-units.md`, branch `feature/T-004-script-duration-units`; merged 2026-09-28, PR #128; shipped in 1.0.2; bench verified 2026-09-28 — log-level cases 1–6 plus the ESP-side check, passed per Jeff)
- [x] T-005 — Pad repeat passes shorter than 1 s so zero-duration loops cannot flood (`.docs/tasks/completed/T-005-zero-duration-repeat-passes.md`, branch `feature/T-005-zero-duration-repeat-passes`; merged 2026-09-28, PR #130; shipped in 1.0.2; bench log-verified 2026-09-28, cases 14, 16–19 — 15 covered by case 9 and unit tests)

## Backlog (unscheduled candidates)

From the 2026-08-06 bench log review (`.tmp/astros.2026-08-06.1.log` analysis):

- ~~POLL_NAK fall-through~~ → promoted to T-001 (2026-08-16)
- `GET /api/settings?key=apikey` returns 500 via Kysely `NoResultError` when the setting was never saved — missing settings should be a handled state
- Dual pino writers (main thread + serial worker both instantiate `logger.ts`) corrupt the shared log file: NUL holes, interleaved records, lost crash reasons; worker exit also logged as a bare number (`api_server.ts:620`)
- `GET /api/firmware/releases` hard-depends on GitHub DNS; consider caching last-known releases for offline bench use
- AstrOs.ESP: stale comment in `AstrOsSerialMsgHandler.cpp` (~line 187) claims "the server's poll-nak parser is name-only" — T-001 built it MAC-keyed (name is diagnostic only); fix in the firmware repo so nobody drops the MAC from the payload

From the T-001 pre-push review (2026-08-16):

- `SCRIPT_RUN` worker envelopes have no `handleSerialWorkerMessage` case — run-script ack/nak responses are produced and routed by the worker but silently vanish on the main thread; audit whether clients should see them, then consider an error-logging `default:` for that switch (safe only once SCRIPT_RUN has a case)
- `RUN_COMMAND_ACK/NAK` and `DEPLOY_CONFIG_NAK`/`FORMAT_SD_NAK` have no business handling: acks still let the 5s tracker time out (misleading "Timeout for message" error), and `/settings/formatSD` replies success before the controller answers. T-001 raised the NAK default to warn-with-payload; real handling is its own task
- Repo lookup NoResultError sweep: `get*ByAddress`/`get*ByController` repo methods `executeTakeFirstOrThrow`, so the `=== null` guards in `handlePollResponse`/`handleConfigSync` are dead code (misses throw into the catch instead). T-001 added nullable `find*` variants for its own path; sweep the remaining callers (same pattern as the settings-500 item above)
- 16:32 crash-restart loop (5 boots in 7 s) had no logged cause — crash paths only reach stderr/`docker logs`, never the log file (no `uncaughtException` handler; T-003's queue stack overflow inside a timer is another instance)

From the T-002 diagnosis (2026-09-04, scripter Test button):

- `AstrosScriptTestModal` completion check is sum-based (`>= SUCCESS * 3`); `TransmissionStatus.FAILED = 3` outranks `SUCCESS = 2`, so a failed upload ack also enables Run
- WS `ScriptStatus.status` carries the API `TransmissionStatus` number but is stored into `DeploymentStatus.value` typed `UploadStatus`; works only because both enums put success at 2, `UploadStatus` has no FAILED member (so `failed = 3` only works through `default:` branches), and `date` is an ISO string on the wire (epoch sentinel on a never-deployed FAILED path) — give the WS payload its own wire type mapped on receipt; interim guard: a wire-numeric test asserting `TransmissionStatus.SUCCESS === UploadStatus.UPLOADED`
- `ScripterView.vue` passes literal strings (`'Saving script...'`, `'Loading...'`, `'Initializing...'`) as the interrupt modal's `message`, which it renders via `$t(message)` — intlify warns on every open; move to `scripter_view.*` keys
- `App.vue` `<Suspense>` logs "slots expect a single root node" on every route load (dynamic component is undefined before the router resolves) — cosmetic
- `AstrosScriptTestModal`: `scriptsStore.uploadScript` never throws (returns `{ success: false }`), so the modal's `catch` is dead and an HTTP failure leaves "Uploading" forever with Run disabled — check `result.success` and drive the FAILED branch
- `astros_vue/eslint.config.ts` globally ignores `**/*.spec.*`, so "lint clean" never covers spec files and the vitest-plugin block in the same config is dead — either lint specs or drop the dead block
- `AstrosScriptTestModal.runClicked` closes the modal regardless of `runScript`'s result — check `result.success` and toast on failure (pairs with T-001's Backlog note that `SCRIPT_RUN` worker envelopes have no `handleSerialWorkerMessage` case, so run ack/nak never reaches clients)
- `handleScriptDeployResponse`: both location lookups `executeTakeFirstOrThrow`, so an ack/timeout for a MAC that is no longer mapped is caught, logged, and sends no WS message (modal stays "Uploading") — emit a best-effort `failed` ScriptResponse; also `getLastScriptUploadedDate` yields 1970-01-01 for a first-ever failed upload (harmless today — `AstrosScriptRow` shows a date only for UPLOADED — but any future reader of `date` on a failed entry sees the epoch)
- Script upload acks carry no run id; a late ack from a cancelled Test run can flip a location early in the next run — needs an upload id threaded through `SCRIPT_UPLOAD` / `ScriptResponse` (protocol-shaped; its own task)
- `DeploymentStatus.date?: Date | undefined` permits two representations (key absent vs explicit undefined); make it `date: Date | undefined`
- Add `DeployableLocation = Exclude<Location, Location.UNKNOWN>` and key `Script.deploymentStatus`, `ScriptStatus.locationId`, `markUploading`, `ScriptsView.locations`, and `AstrosScriptRow.locations` by it (`createNewScript` seeds an UNKNOWN entry today)
- `AstrosScriptTestModal` with zero assigned locations never reaches a terminal state (completion lives only in the watcher and `markUploading([])` is a no-op) — extract `checkComplete()` and call it from `setInitialUploadStatus`, or decide "nothing to upload" in the modal before requesting
- `AstrosScriptTestModal` state model: nine parallel refs kept consistent by three writers — replace with a per-location discriminated union (`unassigned | sending | success | failed`) and derive `canRun`/captions; makes the T-002 invariants impossible to violate and retires the sum-based completion bug and the `Caption` wrapper
- `useWebsocket.handleScriptMessage`'s `scriptId` gate (an ack for another script must not touch the scripter store) has no dispatch test

From the 2026-09-06 release prep (PR #124):

- `deployment/docker-compose.yml` `devices` entry reads `'dev/ttyAMA0:/dev/ttyS0'` — leading slash dropped in 5919d972 ("update deploy"); Docker expects an absolute host device path, so a Pi deployed from this file likely fails to start. Verify on the bench and fix (quick-tier, but needs its own branch — not doc-only)

From the T-003 planning (2026-09-27, playlist interrupt investigation):

- Interrupt during a Wait track, shuffle gap, or repeat-pass padding (T-005) waits for the silence to end before switching — consider starting the replacement immediately (behavior change; T-003 keeps switch-at-end)
- `settings.repeat`/`repeatCount` survive a type change to a non-repeat type (settings JSON never reset); T-003 only fixes the display — decide whether the editor should clear them
- `convertPlaylistToQueueItem` does not clamp `delayMax < delayMin` (editor prevents it; hand-edited/imported data would compute a negative delay range) — since T-003 fix 5 this only matters with Random Delay on; also validate finite/non-negative values (settings stored as `'{}'` — the migration_3 column default — give NaN bounds → `setTimeout(NaN)`), warning with the playlist id — T-005 made delays finite/non-negative/≤ timer max (with a warning for delay types); what remains is a repository-level `parsePlaylistSettings(raw)` replacing both `JSON.parse(...) as PlaylistSettings` sites (defaults for missing keys, `repeatCount` normalized, delays ordered), optionally validated on save — the queue guards stay as defense in depth
- Preemptive interrupt of a running script (server cancels the track timer + ESP aborts the current script; protocol change with AstrOs.ESP) — only if track-boundary switching still feels too slow once T-004's durations are correct
- Uninterruptible repeat (`Sequential` + repeat) — dropped from T-003; the reporter uses `Sequential, Repeatable`, so no demand for it yet
- "Repeat - Count" with no number plays forever: new playlists default `repeatCount: 0` (`stores/playlists.ts`), choosing Count keeps 0 (only negatives are bumped to 1, `AstrosPlaylistSettings.vue` `onRepeatModeChange`), the count box shows empty, and the converter maps 0 → -1 (infinite; mapping pinned by T-003's Contract) — so the UI reads Count while the backend loops forever. Own task (T-003 review, 2026-09-28)
- Delay controls show stale values greyed out after switching from a delay type to a non-delay type (same class as T-003 fix 6, which covered only the repeat dropdown)

From the T-003 pre-push review (2026-09-28):

- ~~T-005 scope~~ → done in T-005 (repeat passes padded to 1 s, empty nested arrays dropped, only `-1` means infinite, queue's unpinned members made private). Left over: a private `playing` field (source of the in-flight track; replaces `currentLocations` + `playlistReplaced`) — fold into the queue phase-union item below
- **pino drops error objects codebase-wide** (high): pino ignores arguments after a message string without placeholders, so `logger.error('msg', error)` logs no error/stack/ids (~89 calls, incl. the queue's `addToQueue` catch, `api_server.ts` `runPlaylist`). Sweep to `logger.error({ err, …ids }, 'msg')`
- Queue failure handling: `addToQueue`'s catch leaves the queue wedged (active playlist, no timer — later items never play; route still returns 200) — reset to idle and rethrow; the `dispatchTrack`/gap timer callbacks are unguarded (a throw is an uncaught exception → process exit, only stderr) — guard, log, reset to idle
- Queue silent drops: a pending replacement superseded by a later arrival, and queued interruptibles dropped by `addToBackOfQueue`, are not logged; no queue state transitions are logged (so post-fix "dispatching <old sub-track>" lines after an interrupt look unexplained)
- `dispatchScriptFromQueue` logs `${error}` only (no stack/script/locations); the serial worker `exit` handler never marks it unavailable, so after the worker dies every dispatch posts to a dead worker while the log still says "dispatching script"
- Help text vs behavior (docs T-003 pinned): the three repeat types are documented as always repeating but "Repeat - None" plays once and Count N plays N+1 passes; an interrupt during a shuffle gap waits for the gap end (undocumented); `help_sequential` says queued items wait, but a queued interruptible is dropped when anything is queued after it; nested sub-tracks play back-to-back with no shuffle/delay (undocumented); repeat passes shorter than 1 s are padded to 1 s (T-005) — undocumented
- Settings display: a rejected entry stays on screen — 0 or a negative number in the repeat Count, a negative delay, or a Max below Min (clamped; e.g. Max shows 1.0 while 2.0 is stored)
- The playlists store never clears `selectedPlaylist`, so the editor briefly renders the previously opened playlist while the next loads; its type watcher can read that A→B type change as a user edit (for a Sequential B with nested tracks it pops the remove-nested confirm, and Cancel writes A's type into B) — clear `selectedPlaylist` on load/unmount
- `PlaylistType` traits table: `Record<PlaylistType, { shuffle; repeat; delay; interruptible }>` beside each enum (API + Vue) replacing `isRepeatableType`/`hasShuffleDelay`/`isShufflePlaylistType` and ~7 inline `Sequential` checks, so a new member is a compile error until its traits are decided (prerequisite if uninterruptible repeat returns); readonly nested track arrays with an `isNested` type guard so a bug-1 regression is a compile error
- Queue phase union (`idle | playing | gap | panicked` with a pending replacement slot) — trigger: the "interrupt during a Wait/gap waits for the silence" item; split `AnimationQueuePlaylist` into a readonly spec + queue-private playback position (changes the pinned shape)

From the T-005 pre-push review (2026-09-28):

- A single repeat pass of many zero-length tracks still bursts: padding caps passes, not dispatches, so a pass of N instant tracks sends N `SCRIPT_RUN`s per second under repeat; at ≥ ~1000 tracks the pass itself takes ~1 s (≥ 1 ms per timer), so it is neither padded nor warned (~925 dispatches/s sustained). Reachable via repeated nested playlists (3 levels × 10 tracks flatten to 1000). Warn at conversion above ~30 dispatching zero-length tracks and/or add a minimum spacing between dispatches
- Playlist editor: warn when a repeating playlist's pass is shorter than 1 s (T-005 pads it silently apart from one log warning); also the delay inputs have no maximum (a 2,147,484 s typo is clamped to ~24.8 days since T-005), and neither do the Wait duration inputs — a Wait beyond the timer maximum (2^31−1 ms) is still truncated by Node to ~1 ms, silently skipping it within a pass (clamping it changes single-pass timing, so it is its own decision)
- Readonly non-empty nested tracks (`readonly [QueueTrack, ...QueueTrack[]]`) so an empty nested array is a compile error in the converter — extends the traits-table item's readonly-arrays note; `buildPass`'s filter stays for cast values

From the T-004 planning (2026-09-27, script duration units):

- ~~Zero-duration tracks~~ → promoted to T-005 (2026-09-28; scope notes in the T-003 pre-push block above). Original note: zero-duration tracks under infinite repeat (zero-event scripts → `duration_ds = 0`, or any 0 ms track) re-dispatch `SCRIPT_RUN` back-to-back every tick (~1000/s) — floor the track duration or refuse to repeat an all-zero pass; consider a server-side dispatch-rate floor as defense-in-depth. Same class: `scripts.duration_ds` keeps migration_2's `-1` default and `getScriptDurationsDS` has no negative guard (only `getScript` recomputes and warns), so a raw-SQL insert that omits the column reintroduces a −100 ms track (typed Kysely inserts already require it — `duration_ds` is not `Generated<>`); likewise an unknown script id in a playlist silently becomes a 0 ms track (`playlist_converter.ts` `?? 0`) — warn with playlist/track ids
- Negative `duration_ds` still reaches the queue: `scripts.duration_ds` keeps migration_2's `-1` default and `getScriptDurationsDS` has no negative guard (only `getScript` recomputes) — a raw-SQL insert that omits the column gives a −100 ms track; T-005's padding stops the flood but the wrong timing stays unlogged (split out of the struck item above)
- Script duration ends at the last point event's *start* (a random span counts at its end, T-007); the event's own run time (servo travel, audio length) is not counted, so the next dispatch can overlap it
- Event rows the **Vue** scripter saved before deb95a40 (2026-01-07) are stored unscaled (seconds in the deciseconds column) and no data migration converted them — those scripts play 10× compressed. Angular-scripter rows were already deciseconds (the API converter then did `time * 100`, ds → ms) and play correctly, so do **not** scale pre-2026-01-07 rows wholesale
- ESP drops `SCRIPT_RUN` silently when its 30-slot queue is full (`Queue is full`); the server never learns (pairs with the `SCRIPT_RUN` envelope item above)
- Kysely 0.27.6 orders migrations with a plain `Object.keys(...).sort()` (`dist/esm/migration/migrator.js:457`, `#resolveMigrations` — it ignores `nameComparator`), so a future `10_*` sorts before `2_*` and fails the ordered-migrations check. A custom comparator will not help; options are a Kysely version whose resolver honors `nameComparator` (verify first) or a naming scheme that sorts as plain strings (renaming executed migrations also means rewriting `kysely_migration` rows). `allowUnorderedMigrations` is a third option. `database.integration.test.ts`'s `ORDER BY name DESC LIMIT 1` breaks the same way, and its injected test migrations (`9_safe_addition`, `9_will_fail`, `9_pending`, `9_introduces_orphan`) share the `9_` prefix with production — `buildProvider` now refuses one that sorts before the production latest (T-007). Under plain `.sort()`, `'10_'` sorts before `'1_'`: a database at or past migration 1 refuses `10_…` as "corrupted migrations", and a fresh install runs it second, before `1_…`. T-006's `compareMigrationNames` orders pending migrations and names the backup, so it would need the same scheme. Decide before migration 10
- Units misnomers that seeded the T-004 bug: `script_converter.test.ts` helper `generateCoreScriptSerialEventByDecSec(tenthOfSeconds)` is fed seconds (and its line-188 comment says 34.2 s for a 33.8 s gap); Vue `PixiChannelEvent.deciseconds` (`pixiChannelEvent.ts`, `useEventBoxes.ts`) holds seconds — rename both
- `copyScript` calls `updateScriptDuration` right before `upsertScript`, which recalculates unconditionally — dead call
- Branded time units for the script-length chain (T-004 type review): a `units.ts` with `secondsToDs`/`dsToMs` as the only constructors replacing the inline scale sites (`saveScriptEvent` ×10, `readScriptEvents` ÷10, `calculateLengthDS`, `dsToMs`, `script_converter.ts` in-place `evt.time * 1000`), then brand `ScriptEvent.time: Seconds`, `duration_ds`/`durationDS: Deciseconds`, `QueueTrack.duration`/`shuffleWait*: Milliseconds`, plus a lint rule banning `as Seconds|Deciseconds|Milliseconds` outside `units.ts`. A strict-`tsc` sketch showed the original `calculateLengthDS` bug becomes a compile error. Meanwhile, one-line unit JSDoc on those fields
- Boot-time duration consistency check: `duration_ds` is a cached copy of `MAX(COALESCE(script_events.end_time, script_events.time))` (deciseconds; NULL `end_time` is a point event, T-007), and nothing re-derives it after migration 8 — a downgrade + re-save + re-upgrade (or any out-of-band write, such as a span inserted by SQL) leaves it stale. Recompute or warn at boot on `duration_ds != COALESCE(MAX(COALESCE(end_time, time)), 0)`, or have `getScriptDurationsDS` derive it from `script_events`
- ~~`initializeDatabase` doesn't detect a DB that is *ahead* of the code~~ → resolved by T-006 (`DB_NEWER_THAN_SERVER`) for builds from T-006 on; older builds stay unprotected
- `write_guard.ts` `BLOCKED_GET_PATHS` blocks `/scripts/run` and `/playlists/run` but not `GET /remotecontrol`, which calls the same `runScript`/`runPlaylist` — in read-only mode the remote can still dispatch
- `database.integration.test.ts` failure-path tests assert only the `reasonCode`, not *why* the migration failed — a production migration missing from `buildProvider` makes them pass on "corrupted migrations" (T-004 hit exactly this); assert the logged cause or add a guard that `buildProvider` matches the production list
- `upsertScript` insert path stores the client's `lastSaved` (`new Date(script.lastSaved).getTime()`) while the update path uses `Date.now()`; the scripter seeds new scripts with `1970-01-01`, so a script saved once shows `last_modified = 0` (seen on the T-004 bench) — use `Date.now()` on insert too
- Dev DB script `T-004 QA` stored `duration_ds = 30` while all its events sit at 0 s (migration 8 made it 0) — some path wrote the script row without its events; find it (its 0 ms length no longer floods under repeat — T-005 pads it to 1 s)

From the random span events design (2026-10-22):

- **Converter throw → empty upload**:
  - What happens: any throw inside `ScriptConverter.convertScript` (missing GPIO channel, missing UART/I2C module, Maestro channel < 0) returns an empty map. `uploadScript` only logs it, and `createScriptUpload` sends `''` to every controller, overwriting their stored scripts. The route returns 200, so the UI shows success.
  - Fix: fail the upload visibly, or skip only the bad event (T-008 does the latter for random spans only).
- **`.docs/protocol.md` copies have drifted between repos.** The OTA sections differ: master self-flash `FW_PROGRESS` rows on the Server side, `OTA_FLASH_RESULT` on the ESP side. § C was added identically to both on 2026-10-22, but the rest needs reconciling to one text.

From the T-006 implementation (2026-10-23):

- **`npm run start:tsx` never reads `astros_api/.env`.** Under `tsx`, both dotenv calls (`api_server.ts` constructor and `dal/database.ts`) resolve to `src/.env`, which doesn't exist. Only `postbuild` copies `.env` to `dist/`. `DATABASE_PATH` falls back to `~/.config/astrosserver`, and `Init()` runs `initializeDatabase` *before* `configApi()` throws on the missing `JWT_KEY` — so a failed dev boot can back up and migrate that database. Workaround: `set -a && . ./.env && set +a` first (now in `.docs/qa/system-readonly-mode.md`).
- **Router guard turns any failed `check-session` into `/auth`** (network error, 5xx). `DB_NEWER_THAN_SERVER` is the only mode in which it 503s (GETs pass in the five plain read-only modes), so while the database is incompatible every fresh navigation becomes `/auth`, and after recovery a user with a valid token lands on the login page. The cost is small, since recovery means reinstalling. Possible fix: the guard skips the redirect on a 503 that carries `reasonCode`.

From the T-006 pre-push review (2026-10-23):

- **Serial-originated writes bypass the HTTP write guard in the five plain read-only modes.** Registration sync (`handleResgistraionResponse` → `insertControllers`) and similar worker callbacks write the DB without passing `writeGuard`, so a `MIGRATION_FAILED_NO_BACKUP` database can still be written. `DB_NEWER_THAN_SERVER` avoids it only because serial is skipped and the connection is `query_only`. Consider `query_only` (or a write gate in the serial handlers) for every read-only code.
- **pino-http logs every guard 503 at error level, with no reason.** In any read-only mode each page load writes several `… 503 - failed with status code 503` error lines; after pino-roll's 10 daily files the one `Entering read-only mode (…)` line that explains them is gone. Set `res.locals.reasonCode` in the guard, surface it via `customProps`, and log guard 503s at `warn`.
- **`STARTUP_OPEN_FAILED` catch leaks the file handle.** When the open succeeds but inspection throws (now covered by a test), the catch swaps in `:memory:` without closing the file connection, and logs "Could not open database" although it opened. Close `conn.raw` first; say "open or inspect".
- **Uploads stream to `tmpdir()` before the guard rejects them.** The path-scoped `fileUpload` mounts for `/api/firmware/upload` and `/api/audio/savefile` run before `writeGuard`, so a blocked upload (any read-only mode, 423, or 401) can leave up to 50 MB in the temp directory. Mount `writeGuard` on `/api` before them.

From T-007 (2026-10-27):

- **A retried migration overwrites the clean backup.** `createBackup` names the backup after the last applied migration and unlinks an existing one, so after a crash that leaves a migration half applied, the next boot replaces the good backup with the half-migrated file before retrying. `migration_9` is now idempotent; any later non-idempotent migration has no clean backup to fall back on. Keep the first backup per name (or add a timestamp).
- **The serial worker can't start under `npm run start:tsx`.** The worker thread doesn't inherit tsx's loader, so `src/background_tasks/serial_worker.js` fails with `Cannot find module '…/src/logger.js'`. Dev-only (the built `dist/` works); bench serial work needs `npm run build && npm run start`.
- **Phase B: a refused channel swap is left half done.** `stores/scripter.ts` `updateChannelValues` repoints the channel (`parentModuleId`, `moduleChannelId`, `channelType`, `moduleChannelType`, `moduleChannel`) before `convertEventsForChannelType`, which throws for spans (and, already, for unsupported pairs); `swapChannels` has already run `setChannelAvailability`, and on the two-channel path channel A is fully swapped and converted before channel B's conversion throws. `ScripterView.vue` `doSwapChannel` has no catch and there is no `app.config.errorHandler`, so the error reaches only the console, two script channels can end up on one hardware channel, and the interrupt modal stays open. Fix in `swapChannels`: check both channels for spans before mutating either, and return `{ success: false }`. The converter's message and `Failed to swap channel: …` are hard-coded English and need i18n keys before Phase B shows them.
- **89 log calls drop their error.** pino treats arguments after a string message as printf interpolation; with no `%s` they are discarded (checked with pino 8.21). 79 non-test sites use `logger.error('literal', err)` (mostly repository `.catch` blocks), 7 use a template message plus `err` (`playlist_repository.ts` ×6, `api_server.ts`), and 3 pass an object second (`animation_queue.ts` ×2, `api_key_validator.ts`). Use `logger.error({ err }, 'msg')` or put `err.message` in the string.
- ~~**Span validation errors answer 500.**~~ → T-009 (Jeff, 2026-10-27: a refused save answers 400 with the reason; `endTime` validated). `saveScriptEvent` refusing a span on a sub-type without span support throws a plain `Error`, so `PUT /api/scripts/` answers 500 `Internal server error` and the UI shows a generic save failure. It is a client error (no UI path can produce it yet). T-008's server-side span validation and Phase B face the same status question: decide once, e.g. a typed validation error the controller maps to 400 with the reason. The same validation should check `endTime` itself: `scripts_controller` passes `req.body` through untyped, so a non-numeric `endTime` fails with `NOT NULL constraint failed: scripts.duration_ds` (the wrong field), `""` stores 0, `true` stores 10, `1e400` stores `Infinity`, and `endTime < time` is stored (and makes `calculateLengthDS` undercount). `Number.isFinite(endTime) && endTime > time` covers these.
- **Point events trust their own sub-type.** `saveScriptEvent` stores each event's client-supplied `moduleType` / `moduleSubType`, and the converter dispatches on them (`convertScriptEvents`, `convertUartEvent`), using the script channel only to look up hardware. A raw PUT can put a GPIO-tagged point on a serial channel; converting it throws `No GPIO channel found for script channel …`, which is the "Converter throw → empty upload" case above. The UI never sends a mismatch. T-009 closes this for spans only (Jeff, 2026-10-28, from Copilot on PR #135). Before refusing points, check real databases for rows whose sub-type is NULL or differs from their channel's (`readScriptEvents` maps NULL to `none`): refusing those would block saving existing scripts.
- **Ship T-007 and T-008 together.** Until T-008, the converter sends a span as a point event: a GPIO span becomes `gpio|t|ch|0` (pin set low), and a Maestro span becomes `position = undefined`, which aborts the firmware's `std::stoi` and reboots the controller. The scripter can't create a span before Phase B, but `PUT /api/scripts/` saves a GPIO or Maestro span from any authenticated client (the refusal covers only other sub-types), as can hand SQL. No release should carry T-007 without T-008.
- **Phase B notes (T-007 type review).**
  - Port `supportsRandomSpan` to Vue (same name, plus an agreement test; the Vue enum spells the members `GENERIC_GPIO` / `MAESTRO`) to decide which channels accept a span.
  - `npm run build` won't find the sites that mishandle a span, because `ScriptEventTypes` is a plain union and their casts still compile: the modals' `event =` writes (`AstrosGpioEventModal.vue`, `AstrosServoEventModal.vue`; they keep `endTime`), the modal and drag `time =` writes (`useEventBoxes.ts` moves `time` but not `endTime`), and the Pixi casts (`pixiChannelEvent.ts`). List them in the Phase B task by grep.
  - Use `endTime != null` (or a shared `isRandomSpan(evt)`) rather than `!== null` in T-008's converter: API test fixtures are not type-checked, so one that omits `endTime` would take the span path.
- ~~**Open questions for T-008 / Phase B (T-007 type review)**~~ → decided by Jeff, 2026-10-27:
  - a point event carrying a Random* payload (no `position`): T-008 skips a Maestro point without a numeric `position`, with a warning (amended into T-008);
  - the stale `RandomMaestroEvent.isServo`: T-008 converts by the channel's current setting, and T-009 overwrites the payload's copy on save;
  - an inverted or junk `endTime`: T-009 refuses a span whose `endTime` is not a finite number after its `time`.

Open local branches (pre-workflow threads, unmerged into `develop`):

- `debug/serial-rx-frame-diag` — temp serial-RX + deploy-route diagnostics
- `fix/protocol-crc-doc-correction` — protocol doc CRC reference fix
- `feature/ota-phase2-protocol-sync` — frame CRC scope doc clarification
- `ota_testing` — flash-orchestrator windowSize experiment

## Completed projects

- **Remote Control Redesign + Mobile Remote** (2026-05-19 → 2026-06) — all phases shipped (final merges: Phase 2d PR #97, Phase 5 PR #106, Phase 4 mobile view PR #108). Archive: `.docs/completed_plans/2026/08/14/current_project.md`

## Log

- 2026-10-27 T-007 — persist random span events
  - `ScriptEvent.endTime` (seconds, `null` for a point) in API and Vue, `RandomGpioEvent` / `RandomMaestroEvent` payloads in the existing `data` JSON, and `migration_9` (`script_events.end_time`, deciseconds); `calculateLengthDS` counts a span at its end, and the Vue converter refuses to convert spans between channel types
  - Jeff's rule (2026-10-27): spans only on GPIO and Maestro. A save with a span on any other sub-type (the event's own; T-009 adds the channel check) fails and rolls back; a hand-coded one is left out on load with a warning, and the editor's next save deletes it. An unknown sub-type or unreadable `data` still fails the read, as for a point row. T-008's skip bullet and the spec record it
  - reviews mattered: reads against a database still at migration 8 (`BACKUP_FAILED`, a restored failure) treated every row as a span (a serial row threw, a GPIO row read `NaN`) until the read normalized `undefined`; `migration_9.up` was not idempotent, and with Kysely's untransacted SQLite migrations a crash between the `ALTER` and the record would have wedged every later boot; the refused-save test could not tell a rollback from a partial write
  - manual check on a copy of `.data` (13 scripts / 173 events): migration 9 applied after the backup, durations and event dumps identical before/after, saves (with and without `endTime` keys) leave every `end_time` NULL; QA cases 6 (hand-coded HCR span dropped, then deleted on save; an API span on HCR refused) and 7 (scripts load in `BACKUP_FAILED` at migration 8) pass through the API
  - Backlog gained the T-007 group: backup overwrite on a retried migration, the `start:tsx` serial worker, the Phase B half-done swap, 89 log calls that drop their error, the 500 for a refused span (with `endTime` validation), shipping T-007 with T-008, Phase B notes and three open questions for T-008

- 2026-10-23 T-006 — refuse a database written by a newer server
  - a build that finds applied migrations its provider doesn't know enters `DB_NEWER_THAN_SERVER` before the pending check: no backup, migrate or prune, and the connection is `query_only`. Every `/api` route but `GET /system/status` answers 503, serial setup is skipped, WS client messages are dropped (one warning per connection), and the Vue app replaces the router view with a notice page (focus on its heading, no toasts)
  - the branch-switch RED showed the old behavior: a newer-and-pending DB was backed up, failed Kysely's corrupted-migrations check and was restored over (`MIGRATION_FAILED_RESTORED`); the `query_only` RED showed an INSERT going straight through the incompatible connection
  - reviews mattered: the App test set the flag before mount on a plain object, so a lost-reactivity regression passed (fixing it exposed earlier tests' Apps still mounted — `enableAutoUnmount`); the boot byte-identical test couldn't fail until it sent an authenticated write; the banner allowlist and locale keys are now checked by `vue-tsc`
  - QA walk with Jeff (2026-10-25): cases 9–14 pass, an open tab flips to the notice by itself; copy reworded so it no longer presumes a newer server ("the database version is newer than this server supports", "Update AstrOs Server…"), with the 503 message and log lines aligned
  - bench (dev machine): cases 9–14 on copies of `.data` (newer-only) and the stale `~/.config` DB at `7_` (branch switch); `start:tsx` needs `.env` exported first (Backlog). Backlog also gained four pre-existing gaps the review found, notably serial-originated writes bypassing the HTTP guard in the plain read-only modes

- 2026-09-28 release 1.0.2
  - develop → main via PR #131 (T-003, T-004, T-005); `dev-build.yml` bumped main to `1.0.2-dev.1`; main → release via prep-branch PR #132 (the five version-line conflicts kept to main's side, tree identical to main); `release-build.yml` stripped `1.0.2-dev.1` → `1.0.2` and pushed `astros-server:1.0.2` / `:latest`
  - first boot of 1.0.2 runs migration 8 (script duration units) after the pre-migration backup
  - the 1.0.1 recipe held with no surprises now that the post-release bump (#127) happened on time; develop bumped to `1.0.3-dev.0` on `chore/bump-1.0.3-dev` (main fast-forwarded in first — #131's merge commit made develop an ancestor of main)

- 2026-09-28 bench — T-003 + T-005, log-level (no droid), on the T-005 branch; runs driven through `/api/remotecontrol` for exact timing
  - T-005: a 0 s-event script on infinite repeat dispatched every +1.000 s with one padding warning (`passMs: 2`) — no flood; a 0.3 s pass padded to 1 s (`passMs: 301`); a 0 s Wait-only loop idle at 0.2 % API CPU (0.7 % idle baseline); a 9,999,999 s delay clamped to 2^31−1 ms with one warning — 1 dispatch in 27 s (it flooded at ~449/s before the fix); interrupts land at the end of the current track or padding
  - T-003: a nested-only infinite loop ran 10 passes with the API up (it crashed on pass 2 before) and an interrupt waited for the nested playlist to finish; Sequential waits for the whole playlist; an interrupt during a shuffle gap took over at the gap end without the pre-picked track; the 8 s cadence held across a repeat boundary; Random Delay off gave a fixed 2 s gap (+5.000 s) despite a stale 15 s max; the repeat dropdown shows None for Sequential and follows the loaded playlist (UI)
  - dev DB bench items (Point three + 4 playlists) created through the repositories; backup `.data/database.sqlite3.pre-T005-bench`

- 2026-09-28 T-005 — repeat passes shorter than 1 s are padded
  - a repeating playlist whose pass takes ~0 ms (zero-event scripts, events at 0 s, 0 s Waits, nested 0 ms sub-tracks) re-sent `SCRIPT_RUN` every tick — one 0 ms script on infinite repeat dispatched 2502 times in 2.5 s. The next pass now starts ≥ 1 s (less 5 ms slack) after the previous one started: measured with `performance.now()` (NTP jumps `Date`), `max(gap, padding)`, through T-003's `scheduleGap` (panic cancels it, a replacement takes over at its end), one warning per run
  - `buildPass` drops empty nested arrays (they recursed synchronously and wedged the queue); only `-1` means infinite repeat (undefined/NaN/-2/1.5 looped forever); delays are made finite, non-negative and ≤ Node's timer max (a huge delay was truncated to 1 ms and flooded); unknown scripts warned once per run; the queue's unpinned members are private
  - reviews mattered again: every padding test started at t = 0 (= `passStartedAt`'s initial value), so an unrecorded first pass passed; the warning was keyed on object identity but tested with different ids; the old reshuffle test never pinned the reshuffle; a NaN delay and a beyond-timer-max delay each switched the padding off. Nine older tests with sub-1 s repeat passes were updated (design change, amendment recorded)
  - Backlog: a single pass of many instant tracks still bursts (padding caps passes, not dispatches — ~925/s unwarned at ≥ ~1000 tracks), editor warnings (sub-1 s loops, delay/Wait maxima), repository-level settings parsing, negative `duration_ds`

- 2026-09-28 T-003 — playlist repeat/interrupt bugs + interrupt coverage
  - queue: nested tracks were consumed in place (repeat passes skipped them; a nested-only playlist on infinite repeat recursed into a stack overflow in a timer → API crash) — `beginTrack` copies; a nested playlist is one track for interrupts (sub-tracks finish first, with their own playlist's locations); every shuffle gap goes through `scheduleGap`, so a replacement during a gap takes over at its end instead of a track pre-picked from the replaced playlist; delay types wait their gap at the repeat boundary (a one-track loop replayed back-to-back)
  - converter: Random Delay off → fixed `delayMin` (a stale `delayMax` kept it random); Vue: the repeat dropdown shows "None" for non-repeat types and follows the loaded playlist (it showed the previously opened playlist's mode)
  - interrupt matrix over all seven types plus timing, interrupter-kind, panic, repeat and stale-settings tests; every fix mutation-checked. The reviews mattered: the first suite used only script/Sequential interrupters, so a takeover that never cleared the replacement flag (an infinite loop after an interrupt stopping after one pass) passed; panic tests recovered after the stale deadlines; a Vue assertion dropped on one reviewer's advice was the only thing seeing writes through the model
  - Backlog seeded: pino drops error objects in ~89 log calls (high), queue failure handling and silent drops, help text vs behavior, `PlaylistType` traits table, T-005 scope (nested zero-duration tracks now loop at ~1000/s instead of crashing; empty nested arrays still recurse)

- 2026-09-28 T-004 — script durations stored in deciseconds
  - root cause of the 2026-09-27 report ("45 s script repeats forever, interrupts never land"): `calculateLengthDS` returned the last event time in seconds into `scripts.duration_ds`, which every consumer reads as deciseconds → queue timed scripts 10× short → an infinite loop re-sent `SCRIPT_RUN` every 4.5 s against a 45 s run, filling the ESP's 30-slot queue so the interrupting script was dropped (`Queue is full`)
  - fix at the producer (`Math.round(max seconds × 10)`); migration 8 recomputes stored values from `MAX(script_events.time)` (also fixes legacy `-1` rows); `down` is a no-op (Jeff's call — pre-T-004 builds already read deciseconds); `getScript` recomputes after channels load and warns; `convertScriptToQueueItem` extracted so the direct-run conversion is tested
  - end-to-end units test (45.0 s event → 45 000 ms for direct run and playlist) plus a save-path-vs-migration cross-check — the only test that catches a symmetric ×100 storage change; every fix mutation-checked
  - `database.integration.test.ts` mirrors the production migration list — adding a migration without bumping it made failure-path tests pass on "corrupted migrations"
  - review lesson: Kysely's SQLite adapter runs migrations **without** a transaction (`supportsTransactionalDdl = false`); the codebase's comments had claimed otherwise since the db-safety work, and a first "fix" repeated a reviewer's claim after reading only the matching line
  - merged as PR #128. Log-level bench (no droid; dev DB created under develop): develop sent the 45 s script every 4.501 s (21 dispatches in 90 s → ~18 queued ahead of an interrupt on a real ESP); on T-004, migration 8 converted 45 → 450 with no re-save, the loop ran every 45.002 s, the interrupt replaced it at the next boundary, script + Wait 5 s → T+50.007 s, a 30 s re-save stored 300 (30.00 s cadence), a queued direct run waited 45.001 s. ESP-side (`Queue is full` absent, interrupt plays right after the event) passed per Jeff (2026-09-28)
  - T-003 (queue/interrupt bugs found while investigating) stays planned on its branch; Backlog gained branded time units, a boot-time duration consistency check, a DB-ahead-of-code check, the `/remotecontrol` read-only gap, and the Kysely `10_*` sort hazard

- 2026-09-07 release 1.0.1
  - develop → main via PR #124 (T-001, T-002, #123, deployment compose defaults); main → release via prep-branch PR #126; `release-build.yml` stripped `1.0.1-dev.1` → `1.0.1`
  - version-flow fix: develop was still `1.0.0-dev.10` after 1.0.0 shipped, so post-release dev images sorted before the release. PR #125 rebased the dev line to `1.0.1-dev.0`. New post-release rule: bump develop to `<next patch>-dev.0` on a chore branch (merge main in first; use the bot's compose regex `(astros-server[^:]*:)[0-9][^ ]*` — a looser one clobbers the `:latest` build tag). First applied as `chore/bump-1.0.2-dev`
  - a plain main → release PR cannot merge: 5-file version-line conflict, and `release`'s strict status checks require the head to already contain `release`. Resolving in the GitHub web UI would commit to `main` and fire `dev-build.yml`. Use `release-prep-<ver>` = main + release merged in, conflicts kept to main's side (tree identical to main)
  - `gh pr edit` fails on this repo (Projects-classic GraphQL error); `gh api --method PATCH .../pulls/<n> -F body=@file` works
  - shipped unchanged: `deployment/docker-compose.yml` device path `dev/ttyAMA0` (Backlog)
- 2026-09-05 T-002 — ScriptTestModal setup crash + stale-status Run gate
  - root cause: the modal's `immediate: true` watcher called `setCaption` before its `const` declaration (TDZ); the throw escaped setup and left AstrosLayout's vnode tree half-mounted, so every later update cascaded into renderer errors. Latent since ddf65eee (2026-02-07); exposed when PR #113 (2026-06-01) keyed `deploymentStatus` by location name and the watcher's early return stopped masking it — last good upload was 2026-05-31
  - fixes: helpers hoisted above the watcher; `scripterStore.markUploading` resets assigned locations to UPLOADING before the upload request (stale entries could complete the run on the first ack); every run starts gated and the watcher tracks only assigned locations (pre-commit review found the immediate watcher flipping the gate refs at setup)
  - 10 component + 6 store tests, all RED-first with recorded mutation checks; new QA plan `.docs/qa/scripter-script-test.md`
  - pre-push review (5 agents; 4 re-run after a rate-limit cutoff): all "push"; Backlog seeded with the adjacent defects (sum-based Run gate on FAILED, WS status enum coincidence, dead upload catch, no run id on acks, zero-assigned non-terminal state, per-location state refactor, `DeployableLocation` alias, spec files excluded from lint, WS scriptId gate untested)
- 2026-08-23 PR #121 review round (T-001 branch)
  - CI lint fix: `no-empty-function` on the poll_nak test's spy stub (`() => {}` → `() => undefined`); root cause was mechanical checks not re-run after the last review-fix edit
  - Copilot finding: `pollNakNoticed` grew unbounded (parser accepts any opaque address string) — now capped at 256 with FIFO eviction, pinned by a fail-without-fix unit test
  - declined Copilot's parser-level MAC validation: contract is pinned strict-2-field, and parser rejection error-logs per frame (reintroduces the T-001 flood)
  - doc sync: checked off the T-001 close-out item; refreshed the Status block
- 2026-08-16 T-001 — POLL_NAK offline-padawan handling
  - worker now parses POLL_NAK (`mac{US}name`, pinned to ESP `getPollNak`); main thread broadcasts DOWN once per outage via edge-triggered `ControllerWatchdog.recordNak`; UI shows an offline padawan in ~2–6s vs the 10s sweep (which stays as backstop)
  - suppressed while a flash job is current (mirrors the sweep; guard re-checked after async lookups), pinned by a PTY-level flash integration test
  - valid-but-unhandled serial types now return NO_OP instead of round-tripping UNKNOWN; `*_NAK` types warn with payload
  - review fallout: new nullable `findControllerByAddress`/`findLocationByController` (the OrThrow originals error-flooded on unknown-MAC NAKs — caught by new spy-based unit tests); enum values pinned by test; firmware-verified timing corrections (4s poll cycle, master suspends polling during OTA)
  - Backlog seeded: SCRIPT_RUN envelope gap, RUN_COMMAND/FORMAT_SD/DEPLOY_CONFIG NAK handling, repo NoResultError sweep, ESP stale poll-nak comment
- 2026-08-14 workflow bootstrap
  - adopted the task-file workflow (`.docs/agentic-workflow.md`); `PLAN.md` is now the authoritative status view — agent memory is a cache
  - closed out the Remote Redesign tracker: Phases 4 (PR #108) and 5 (PR #106) had shipped unrecorded; Phase 2d shipped via PR #97
  - seeded Backlog from the 2026-08-06 log analysis
