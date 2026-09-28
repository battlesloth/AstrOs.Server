# T-004: Store script durations in deciseconds

<!-- File: .docs/tasks/T-004-script-duration-units.md. Branch: feature/T-004-script-duration-units.
     PR title: "T-004: Store script durations in deciseconds". -->

## Context

User report (2026-09-27, via Jeff): a `Sequential, Repeatable` playlist on Infinite repeat whose
one track is a script with a single event at 45 s "always keeps triggering the 45 s script; when
another script is sent it never interrupts and keeps playing the 45 s event over and over".
Found while planning T-003 (`.docs/tasks/T-003-playlist-interrupt-fixes.md`, on
`feature/T-003-playlist-interrupt-fixes`), whose six bugs do
not cover this case.

Root cause — a units mismatch in the stored script length:

| Where | Unit | Reporter's script |
|---|---|---|
| `ScriptEvent.time` (model; scripter rounds to 0.1 s, `pixiChannelEventRow.ts:64`) | seconds | 45 |
| `script_events.time` (DB; `Math.round(time * 10)` on write, `/ 10` on read, `script_repository.ts` ~468/509, since deb95a40 2026-01-07) | deciseconds | 450 |
| `calculateLengthDS()` = max model event time → `scripts.duration_ds` (`upsertScript`) | **seconds, labelled DS** | **45** |
| Consumers: converter `dsToMs(duration)`, `runScript` `durationDS * 100` | read as deciseconds | **4 500 ms** |

Local dev DB evidence: `Script A` has max `script_events.time = 44` (4.4 s) and
`scripts.duration_ds = 4.4`.

Effect on the reporter's playlist: the server re-sends `SCRIPT_RUN` every 4.5 s while each run
takes 45 s on the ESP. `AnimationController::queueScript` (AstrOs.ESP) queues a script that
arrives while one runs, capacity 30, and drops pushes when full (`Queue is full`). The ESP queue
gains ~9 per real run and fills in ~2.5 min. The server's interrupt itself fires within 4.5 s and
it stops sending S45, but the interrupting script is dropped (or lands behind up to 29 queued
S45s), and the ESP keeps playing its backlog — ~22 min of the 45 s event. Every playlist with a
script track is timed 10× short (cc2048ec's "Wait no longer overlaps the script" fix only covers
the first 10 % of the script), and so is a directly run script's queue item.

Related defect in the same path: `getScript` calls `updateScriptDuration(result)` *before*
`result.scriptChannels` is loaded, so a row still at the migration_2 default `duration_ds = -1`
(never re-saved since migration 2) is "recalculated" from zero channels → `0`.
`getScriptDurationsDS` returns the raw `-1`, which the converter turns into a −100 ms track
(`setTimeout` clamps to ~1 ms → ~1000 `SCRIPT_RUN`/s).

## Contract (pinned — do not change)

- **`scripts.duration_ds`** — column name/type unchanged; its unit is deciseconds, as the name
  and `getScriptDurationsDS` JSDoc already state. This task makes stored values match.
- **Event time units** — model `ScriptEvent.time` in seconds, DB `script_events.time` in integer
  deciseconds, and the read/write scaling in `script_repository.ts` — unchanged.
- **Consumers** — `playlist_converter.ts` `dsToMs`, `runScript`'s `durationDS * 100`, and
  `getScriptDurationsDS()` signature/return type — unchanged (they were right; the producer was
  wrong).
- **Signatures** — `calculateLengthDS(script: Script): number`,
  `updateScriptDuration(script: Script): void` — unchanged.
- **Serial protocol / ESP script payload** — `script_converter.ts` (seconds → ms `* 1000`) and
  `SCRIPT_RUN` untouched.
- **Migration registry** — existing names `0_initial` … `7_rename_remote_config_key` unchanged;
  the new migration is appended as `8_fix_script_duration_units`. Pre-migration backup/restore
  flow (`backup.ts`, `initializeDatabase`) unchanged.
- No frontend change: the Vue app never displays `durationDS` (the scripter sends `0`; the API
  recalculates on every save).

## Task

1. `astros_api/src/scripting/script_duration.ts`: `calculateLengthDS` returns
   `Math.round(max(event.time) * 10)` (0 when there are no events). Update its JSDoc to state the
   units (event times in seconds, result in deciseconds).
2. New `astros_api/src/dal/migrations/migration_8.ts`, exported from `migrations/index.ts` and
   registered in `database.ts` as `'8_fix_script_duration_units'`:
   - `up`: `UPDATE scripts SET duration_ds = COALESCE((SELECT MAX(time) FROM script_events WHERE script_events.script_id = scripts.id), 0)`
     — recomputes every row from the DB event times (already deciseconds), including legacy
     `-1` rows. Log the affected-row count (migration_7 style).
   - `down`: no-op (no data change). *Changed 2026-09-28 after the pre-push review, Jeff's
     call:* the originally planned `duration_ds / 10.0` would restore the seconds values that
     time scripts 10× short — pre-T-004 builds already read the column as deciseconds, so the
     corrected values are right for them too.
   - Header comment explains the units bug and why the recompute reads `script_events` rather
     than model code (migrations must not depend on evolving model code).
   - `dal/database.integration.test.ts` mirrors the production migration list: add
     migration 8 to its `buildProvider` baseline — otherwise kysely reports "corrupted
     migrations" and the failure-path tests pass for the wrong reason. Its injected test
     migrations are renumbered `8_*` → `9_*` (same bump migration 7 made) for clarity; the
     `8_*` names already sorted after `8_fix…`, so the renumber is not what fixes it.
3. `astros_api/src/dal/repositories/script_repository.ts` `getScript`: call
   `updateScriptDuration(result)` after `result.scriptChannels = await this.readScriptChannels(id)`,
   not before.

Tests — each RED-first; after green, revert the fix and confirm the test fails (record in the PR):

4. `script_duration.test.ts`: the existing test builds events in deciseconds
   (`generateCoreScriptSerialEventByDecSec(362)`) although the model stores seconds — rewrite it
   to seconds (`36.2`) expecting `362`; rename the helper to reflect seconds. Add: an
   arithmetic-derived time rounds to whole deciseconds (`45.2 + 0.1` = `45.300000000000004` →
   `453`); no events → `0`.
5. `migration_8.test.ts` (pattern of `migration_7.test.ts`, v7 → v8 providers): seeded rows with
   (a) an old seconds value (`4.4`) and events max `44` → `44`; (b) `-1` with events → max event
   time; (c) no events → `0`; (d) `down` leaves deciseconds; (e) re-running `up` on corrected data is a
   no-op (idempotent).
6. `script_repository.test.ts`: a row inserted directly with `duration_ds = -1` plus events →
   `getScript(id).durationDS` equals the max event time in deciseconds (not `0`).
7. New `astros_api/src/scripting/script_duration.integration.test.ts` — the end-to-end unit
   chain the bug slipped through: on an in-memory DB, save a script via `ScriptRepository` with
   one event at `45.0` s; assert the direct-run queue item (see Task 9) and that
   `convertPlaylistToQueueItem` fed `getScriptDurationsDS()` yields a script track with
   `duration === 45000`; and that the stored `script_events.time` (450) agrees with
   migration 8's recompute.

Docs:

8. Create `.docs/qa/playlist-playback.md` (T-003 extends it later) with the reporter scenario:
   infinite-repeat loop of a long single-event script — dispatch cadence equals the script length,
   a mid-loop script plays after the current run, the loop stops, no `Queue is full` on the ESP;
   plus a Wait-after-script case (the Wait starts only after the script's last event).

Added after the pre-push review (2026-09-28; Jeff approved the builder extraction):

9. `playlist_converter.ts`: new `convertScriptToQueueItem(script, locations)` builds the
   direct-run queue item (Sequential, no repeat, one track of `dsToMs(durationDS)`); `runScript`
   calls it instead of building the item inline. Behavior-preserving — the `× 100` it replaces
   is `dsToMs` — and it lets Task 7 exercise the real direct-run conversion.
10. `getScript` logs a warning when it replaces an invalid stored duration (the playlist path,
    `getScriptDurationsDS`, still returns the raw column).
11. Comment corrections: Kysely runs SQLite migrations without a transaction
    (`supportsTransactionalDdl = false`) — fix `database.ts` and the rationale in
    `migration_6.ts`; unit/ordering notes on `updateScriptDuration`, `calculateLengthDS`, and
    `getScriptDurationsDS`.

## Acceptance criteria

- [ ] A script whose last event is at 45.0 s saves `duration_ds = 450` and is timed as 45 000 ms
      both as a playlist track and as a directly run script.
- [ ] Migration 8 converts existing seconds values and legacy `-1` rows to deciseconds from
      `script_events`; scripts with no events get `0`; `down` leaves the values in deciseconds.
- [ ] `getScript` computes a missing/invalid duration from the script's loaded channels, and
      logs a warning when it does.
- [ ] Existing converter, queue, and repository tests pass unchanged (except the rewritten
      `calculateLengthDS` test in Task 4).
- [ ] Each fix has a test that fails with the fix reverted (mutation checks recorded).
- [ ] `.docs/qa/playlist-playback.md` exists with the cases in Task 8.

## Out of scope

- **T-003's six queue/UI bugs** (nested-track consumption, shuffle gaps, `randomDelay`, repeat
  dropdown, nested interrupt boundary) and its interrupt test matrix.
- **Zero-event scripts** — `duration_ds = 0` → 0 ms track → `SCRIPT_RUN` flood under infinite
  repeat → PLAN.md Backlog.
- **Last event's own run time** (servo travel, audio length) is not included in the duration; the
  next dispatch lands when the last event *starts* → Backlog.
- **Vue-scripter event rows saved before deb95a40** (2026-01-07) are stored unscaled (deb95a40
  changed the scaling without a data migration). Such scripts already play 10× compressed on the
  ESP; migration 8's `MAX(time)` stays consistent with how they play → Backlog. Rows from the
  older Angular scripter were already deciseconds (the API converter then did `time * 100`,
  ds → ms) and play correctly.
- **ESP queue-full drops are silent to the server** (the `RUN_SCRIPT` NAK path has no handling —
  see the existing Backlog item on `SCRIPT_RUN` envelopes).
- **Preemptive interrupt** of a running script (protocol change with AstrOs.ESP).
- A server-side floor/throttle on dispatch rate (defense-in-depth for the flood class) → Backlog
  with the zero-event item.

## Verification

API (`astros_api/`):

- `npx vitest run src/scripting/ src/dal/ src/serial/animation_queue/` — green, including every
  new case in Tasks 4–7.
- `npx vitest run` — full suite green.
- `npm run prettier:write && npm run lint:fix`, then `npm run prettier:check` — clean.
- `npm run build` — green.
- Mutation checks: revert Task 1 → Task 4 and Task 7 tests fail; unregister migration 8 → Task 5
  fails; revert Task 3 → Task 6 fails.
- Local DB dry run: copy `~/.config/astrosserver/database.sqlite3` to the scratchpad, boot the
  API against the copy (or run the migrator on it) → `Script A` reads `duration_ds = 44`.

Bench (human-gated, from `.docs/qa/playlist-playback.md`):

- `Sequential, Repeatable` + Infinite + one script with a single event at ~45 s: the API log
  shows `dispatching script <id> from animation queue` every ~45 s (not ~4.5 s); a script sent
  mid-loop runs right after the current 45 s event; the loop stops; the ESP console shows no
  `Queue is full`.

## Failure-mode inventory

Scope: a one-statement data migration on the SQLite file plus a pure-compute fix. No network,
IPC, or concurrency beyond boot ordering.

**1. External-call error coverage**

| Call | Error / condition | Response |
|---|---|---|
| migration_8 `UPDATE … SELECT MAX` | SQLite error (locked/corrupt) | No Kysely transaction for SQLite (`supportsTransactionalDdl = false`); the single `UPDATE` is atomic under autocommit, so nothing is half-applied; `initializeDatabase` restores the pre-migration backup and boots read-only (`MIGRATION_FAILED_RESTORED`) — existing flow |
| migration_8 `UPDATE` | script with no events | `COALESCE(…, 0)` → `0` (not NULL; column is NOT NULL) |
| migration_8 `UPDATE` | orphan `script_events` rows (script deleted) | FK cascade (migration_6) removed them; correlated subquery only reads rows for existing scripts |
| `calculateLengthDS` | arithmetic-derived float time (`(45.2 + 0.1) * 10 = 453.00000000000006`; scripter/DB values `i / 10` scale exactly) | `Math.round` → `453` |
| `calculateLengthDS` | no channels / no events | `0` (unchanged behavior) |

**2. Crash-recovery state matrix**

| After step | `duration_ds` values | Migration recorded? | Next boot | Status |
|---|---|---|---|---|
| Backup created, before `up` | old (seconds / `-1`) | no | migration 8 runs | consistent ✓ |
| Crash mid-`UPDATE` | old (single statement is atomic) | no | migration 8 re-runs | consistent ✓ |
| `UPDATE` committed, crash before Kysely records the migration | deciseconds | no | migration 8 re-runs; `up` is a recompute, so it lands on the same values | consistent ✓ (why `up` must never become a scale) |
| `up` committed | deciseconds | yes | nothing to run | consistent ✓ |
| Old backup restored by hand onto a new build | old | no (backup predates it) | migration 8 runs | consistent ✓ |
| New DB run by an older build (downgrade) | deciseconds | yes (unknown to the old build; nothing pending, so it boots without checking) | old consumers read deciseconds → unedited scripts timed **correctly**; scripts saved on the old build go back to seconds (10× short, flood); after re-upgrading, migration 8 does not re-run, so those rows stay short until re-saved | known risk → Backlog (boot-time duration consistency check); `down` is a no-op because the corrected values are right for old builds |

**Boot ordering:** `initializeDatabase` (migrations) is awaited before routes are configured and
before `listen` (`api_server.ts` ~327 vs ~752), so no request can write a script mid-migration.

## Implementation checklist

- [x] Task 4 RED/GREEN — `calculateLengthDS` test in seconds, rounding + no-events cases; Task 1 fix
- [x] Task 5 RED/GREEN — `migration_8.test.ts`; Task 2 migration + registry
- [x] Task 6 RED/GREEN — `getScript` legacy `-1` test; Task 3 reorder
- [x] Task 7 — end-to-end units test (`script_duration.integration.test.ts`)
- [x] Mutation checks recorded (Task 1, Task 2, Task 3 reverts)
- [x] Local DB dry run on a scratch copy (`Script A` → 44)
- [x] Task 8 — `.docs/qa/playlist-playback.md`
- [x] Pre-commit: prettier + lint, build, full suite, code review
- [x] Pre-push: `/pr-review-toolkit:review-pr` (5 agents); findings addressed (Tasks 9–11, `down` no-op, doc corrections, Backlog additions)
- [x] Post-review mutation checks: `down` ÷10 → down test fails; builder without `dsToMs` / interruptible wrapper / dropped `locations` → direct-run test fails; getScript warn always-on → no-warn test fails, never → legacy test fails; 3-channel max layout catches first-event and first-channel-only; symmetric ×100 event storage → only the save-vs-migration test fails (24 round-trip tests pass it)
- [ ] Close-out: task file → `completed/`, PLAN.md checkbox + Log entry
