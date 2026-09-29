# AstrOs Server — Plan

Workflow rules: `CLAUDE.md` (Workflow section). Rationale and templates: `.docs/agentic-workflow.md`.

## Status

Active:  T-005 — pad repeat passes shorter than 1 s (`feature/T-005-zero-duration-repeat-passes`); implemented, pre-push reviewed, closed out on the branch — awaiting push + PR into develop
Now:     Jeff pushes develop (`5a3f6cd5`) and the T-005 branch; PR into develop; bench cases 14–19 in `.docs/qa/playlist-playback.md` (log-verifiable)
Next:    Backlog candidates (pino logging sweep — high; "Repeat - Count with no number plays forever"; sum-based Run gate on FAILED; dead upload catch; compose device-path typo); bench checks still open: T-004 ESP-side, T-003 cases 7–13
Blocked: none (the firmware-side OTA master-flash fix shipped in AstrOs.ESP rel_1.2 — stack overflow fixed in its PR #47)
Last:    2026-09-28 — T-005 implemented + pre-push reviewed (on its branch); T-003 merged (PR #129); T-004 merged (PR #128)

## Standalone tasks

- [x] T-001 — Handle POLL_NAK as the offline-padawan signal (`.docs/tasks/completed/T-001-poll-nak-handling.md`, branch `feature/T-001-poll-nak-handling`; shipped in 1.0.1, bench-verified 2026-09-07)
- [x] T-002 — Fix ScriptTestModal setup crash and stale-status Run enable (`.docs/tasks/completed/T-002-script-test-modal-fix.md`, branch `feature/T-002-script-test-modal-fix`; merged 2026-09-05; shipped in 1.0.1, bench-verified 2026-09-07)
- [x] T-003 — Fix playlist repeat/interrupt bugs and cover every interrupt path (`.docs/tasks/completed/T-003-playlist-interrupt-fixes.md`, branch `feature/T-003-playlist-interrupt-fixes`; merged 2026-09-28, PR #129; bench cases 7–13 pending)
- [x] T-004 — Store script durations in deciseconds (`.docs/tasks/completed/T-004-script-duration-units.md`, branch `feature/T-004-script-duration-units`; merged 2026-09-28, PR #128; bench log-verified 2026-09-28 — ESP-side check pending hardware)
- [x] T-005 — Pad repeat passes shorter than 1 s so zero-duration loops cannot flood (`.docs/tasks/completed/T-005-zero-duration-repeat-passes.md`, branch `feature/T-005-zero-duration-repeat-passes`; bench verification pending)

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
- Script duration ends at the last event's *start*; the event's own run time (servo travel, audio length) is not counted, so the next dispatch can overlap it
- Event rows the **Vue** scripter saved before deb95a40 (2026-01-07) are stored unscaled (seconds in the deciseconds column) and no data migration converted them — those scripts play 10× compressed. Angular-scripter rows were already deciseconds (the API converter then did `time * 100`, ds → ms) and play correctly, so do **not** scale pre-2026-01-07 rows wholesale
- ESP drops `SCRIPT_RUN` silently when its 30-slot queue is full (`Queue is full`); the server never learns (pairs with the `SCRIPT_RUN` envelope item above)
- Kysely 0.27.6 orders migrations with a plain `Object.keys(...).sort()` (`migrator.js:457`, `#resolveMigrations` — it ignores `nameComparator`), so a future `10_*` sorts before `2_*` and fails the ordered-migrations check. A custom comparator will not help; options are a Kysely version whose resolver honors `nameComparator` (verify first) or a naming scheme that sorts as plain strings (renaming executed migrations also means rewriting `kysely_migration` rows). `database.integration.test.ts`'s `ORDER BY name DESC LIMIT 1` breaks the same way. Decide before migration 10
- Units misnomers that seeded the T-004 bug: `script_converter.test.ts` helper `generateCoreScriptSerialEventByDecSec(tenthOfSeconds)` is fed seconds (and its line-188 comment says 34.2 s for a 33.8 s gap); Vue `PixiChannelEvent.deciseconds` (`pixiChannelEvent.ts`, `useEventBoxes.ts`) holds seconds — rename both
- `copyScript` calls `updateScriptDuration` right before `upsertScript`, which recalculates unconditionally — dead call
- Branded time units for the script-length chain (T-004 type review): a `units.ts` with `secondsToDs`/`dsToMs` as the only constructors replacing the inline scale sites (`saveScriptEvent` ×10, `readScriptEvents` ÷10, `calculateLengthDS`, `dsToMs`, `script_converter.ts` in-place `evt.time * 1000`), then brand `ScriptEvent.time: Seconds`, `duration_ds`/`durationDS: Deciseconds`, `QueueTrack.duration`/`shuffleWait*: Milliseconds`, plus a lint rule banning `as Seconds|Deciseconds|Milliseconds` outside `units.ts`. A strict-`tsc` sketch showed the original `calculateLengthDS` bug becomes a compile error. Meanwhile, one-line unit JSDoc on those fields
- Boot-time duration consistency check: `duration_ds` is a cached copy of `MAX(script_events.time)`, and nothing re-derives it after migration 8 — a downgrade + re-save + re-upgrade (or any out-of-band write) leaves rows in seconds forever. Recompute or warn at boot on `duration_ds != COALESCE(MAX(time), 0)`, or have `getScriptDurationsDS` derive it from `script_events`
- `initializeDatabase` doesn't detect a DB that is *ahead* of the code (applied migrations the build doesn't know): with nothing pending it returns early and Kysely's missing-migration check never runs, so a downgraded build boots silently — log an error or go read-only
- `write_guard.ts` `BLOCKED_GET_PATHS` blocks `/scripts/run` and `/playlists/run` but not `GET /remotecontrol`, which calls the same `runScript`/`runPlaylist` — in read-only mode the remote can still dispatch
- `database.integration.test.ts` failure-path tests assert only the `reasonCode`, not *why* the migration failed — a production migration missing from `buildProvider` makes them pass on "corrupted migrations" (T-004 hit exactly this); assert the logged cause or add a guard that `buildProvider` matches the production list
- `upsertScript` insert path stores the client's `lastSaved` (`new Date(script.lastSaved).getTime()`) while the update path uses `Date.now()`; the scripter seeds new scripts with `1970-01-01`, so a script saved once shows `last_modified = 0` (seen on the T-004 bench) — use `Date.now()` on insert too
- Dev DB script `T-004 QA` stored `duration_ds = 30` while all its events sit at 0 s (migration 8 made it 0) — some path wrote the script row without its events; find it (its 0 ms length no longer floods under repeat — T-005 pads it to 1 s)

Open local branches (pre-workflow threads, unmerged into `develop`):

- `debug/serial-rx-frame-diag` — temp serial-RX + deploy-route diagnostics
- `fix/protocol-crc-doc-correction` — protocol doc CRC reference fix
- `feature/ota-phase2-protocol-sync` — frame CRC scope doc clarification
- `ota_testing` — flash-orchestrator windowSize experiment

## Completed projects

- **Remote Control Redesign + Mobile Remote** (2026-05-19 → 2026-06) — all phases shipped (final merges: Phase 2d PR #97, Phase 5 PR #106, Phase 4 mobile view PR #108). Archive: `.docs/completed_plans/2026/08/14/current_project.md`

## Log

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
  - merged as PR #128. Log-level bench (no droid; dev DB created under develop): develop sent the 45 s script every 4.501 s (21 dispatches in 90 s → ~18 queued ahead of an interrupt on a real ESP); on T-004, migration 8 converted 45 → 450 with no re-save, the loop ran every 45.002 s, the interrupt replaced it at the next boundary, script + Wait 5 s → T+50.007 s, a 30 s re-save stored 300 (30.00 s cadence), a queued direct run waited 45.001 s. ESP-side (`Queue is full` absent, interrupt plays right after the event) pending the droid
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
