# QA: Playlist playback — script timing, repeat, and interrupts

**Preconditions:** server running against real hardware with the Body controller UP
on the Status page; the API log visible (`docker logs -f <container>` or the log
file); the Body ESP serial console open if available. Two scripts saved **and
uploaded** to their controllers:

- **"Forty-five"** — a single event at 45.0 s on a Body channel with a visible or
  audible action (e.g. a sound or a servo move).
- **"Interrupt"** — a single event at ~0.5 s on a Body channel with a distinct action.

The API logs `dispatching script <id> from animation queue` each time the queue
sends a script; the ESP logs `Queue is full` when it drops a `SCRIPT_RUN`.

## Test cases

1. **Upgrade migrates stored durations.** Create and save "Forty-five" on a
   pre-T-004 build (1.0.1); check `sqlite3 database.sqlite3 "SELECT name,
   duration_ds FROM scripts"` shows Forty-five at `45`. Boot the new build
   against that DB **without re-saving the script**. Expected: the log shows
   `migration "8_fix_script_duration_units" was executed successfully` and
   `migration_8: recomputed duration_ds (deciseconds) for N script(s)` (only
   logged when at least one script exists; N counts every row, including
   disabled scripts the UI hides); a backup
   `database.sqlite3.backup-7_rename_remote_config_key` exists beside the DB; the
   same query shows Forty-five at `450`. Run case 2 next, still without
   re-saving — existing users get the fix only through this migration.
2. **Infinite loop cadence.** Create a playlist `Sequential, Repeatable`,
   **Repeat - Infinite**, with one Script track "Forty-five"; Run it and let it
   play ≥ 5 minutes. Expected: `dispatching script` lines for Forty-five arrive
   every ~45 s (not every ~4.5 s); the 45 s action fires once per dispatch; the
   ESP console never shows `Queue is full`.
3. **Interrupt the loop.** While case 2 runs, ~10 s into a pass, run "Interrupt"
   (remote button or Scripts page). Expected: the current pass's 45 s action
   fires, then "Interrupt" plays right after it; the loop does not resume (no
   further Forty-five dispatches in the log); no `Queue is full`.
4. **Wait after a script.** Playlist `Sequential`: Script "Forty-five", Wait
   5.0 s, Script "Interrupt"; Run. Expected: Interrupt is dispatched ~50 s after
   the start (45 s script + 5 s wait), not ~9.5 s.
5. **Re-save changes the cadence.** Move Forty-five's event to 30.0 s, save,
   re-upload, and repeat case 2. Expected: dispatches every ~30 s.
6. **Direct run then queued script.** Run "Forty-five" from the Scripts page,
   then immediately run "Interrupt". Expected: Interrupt waits for Forty-five
   (scripts are uninterruptible) and is dispatched ~45 s after Forty-five.

## Negative / edge

- **Script with no events in an infinite loop** — its duration is 0 ms, so the
  queue re-sends it every tick (known flood, PLAN.md Backlog from T-004). Do not
  run on hardware; if seen, **Panic Stop** clears the ESP queue.
- **Recovering a droid stuck in a pre-fix backlog** (ESP still replaying queued
  copies of a looped script after an upgrade): **Panic Stop**, then clear the
  panic. Expected: the ESP queue empties and the droid goes idle.
- **Downgrade** (running a pre-T-004 build against a migrated DB): the old build
  boots normally and times *unedited* scripts correctly (it already read
  deciseconds). Any script **saved** on the old build goes back to seconds —
  10× short, the flood this plan tests for — and after upgrading again,
  migration 8 does not re-run, so that script stays wrong until it is re-saved
  on the new build. Expected: re-save such scripts after re-upgrading (known
  risk, T-004 / PLAN.md Backlog).
- **Last event's own run time** is not counted: in case 4 the Wait starts when
  Forty-five's action *starts*, so a long action overlaps the Wait (Backlog).
