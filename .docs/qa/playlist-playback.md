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
  queue re-sends it every tick (known flood — T-005). Do not
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

## Interrupts, gaps, nested tracks, and repeat display (T-003)

**Preconditions:** as above, plus two short scripts — **"Short A"** and **"Short B"** — each with
a single event at 3.0 s (so each track lasts 3 s), and a **Sequential** playlist **"Nested"** with
tracks Short A, Short B, plus a second Sequential, Repeatable playlist saved with **Repeat -
None** (for case 13). Cases 7–12 are verifiable from the API log alone (the
`dispatching script <id> from animation queue` lines and their timestamps); with the droid
attached, also watch that the actions match. Case 13 is a UI check.

7. **Interrupt, per type.** For each type — Sequential, Interruptible; Sequential, Repeatable
   (Count 2, then Infinite); Shuffle; Shuffle with Repeat (Count 2, then Infinite); Shuffle with
   Delay; Shuffle with Delay and Repeat (Count 2, then Infinite) — make a playlist of Short A,
   Short B (delay types: Random Delay off, Delay 5.0 s), Run it, and ~1 s into the first track
   run "Interrupt". Expected: "Interrupt" is dispatched when that first track ends (~3 s after
   Run); the playlist never dispatches again — not after "Interrupt", not via repeat.
8. **Sequential waits.** Same with a **Sequential** playlist. Expected: "Interrupt" is
   dispatched only after Short B ends (~6 s after Run).
9. **Nested-only infinite loop.** Sequential, Repeatable, **Repeat - Infinite**, one Playlist
   track "Nested"; Run and let it play ≥ 3 passes. Expected: Short A / Short B alternate every
   ~3 s pass after pass; the API stays up (no restart, and no `RangeError` in `docker logs` —
   crashes reach stderr/`docker logs`, never the log file).
   Then, during a pass's **Short A**, run "Interrupt". Expected: Short B still plays, then
   "Interrupt" (the nested playlist is one track); the loop stops.
10. **Gap at the repeat boundary.** Shuffle with Delay and Repeat, **Repeat - Infinite**, Random
    Delay off, Delay 5.0 s, one track Short A; Run. Expected: dispatches every ~8 s (3 s track +
    5 s gap) — never back-to-back. During a gap, run "Interrupt". Expected: it is dispatched when
    the gap ends; no further Short A.
11. **Interrupt in a gap within a pass.** Shuffle with Delay, Random Delay off, Delay 5.0 s,
    tracks Short A, Short B; Run. When the first track's dispatch appears, wait ~4 s (into the
    5 s gap after it), then run "Interrupt". Expected: "Interrupt" is dispatched when the gap
    ends; the *other* Short track never plays (before T-003 it played first — the track picked
    before the gap).
12. **Fixed vs random delay.** Shuffle with Delay, tracks Short A, Short B: turn Random Delay
    **on** with Min 2.0 / Max 15.0 and save; then turn it **off**, set Delay 2.0, save, Run.
    Expected: the second Short is dispatched **~5 s** after the first (3 s track + 2 s gap) —
    never later (before T-003 it could be anywhere from ~5 to ~18 s). Repeat a few runs. Then,
    on a new Shuffle with Delay playlist (Short A, Short B) with Random Delay **never** on:
    Delay 10.0, save, Delay 2.0, save, Run. Expected: again ~5 s between dispatches, not up to ~13 s.
13. **Repeat dropdown display.** Set a playlist to Sequential, Repeatable + **Repeat -
    Infinite**, save; switch its type to **Sequential**. Expected: the repeat dropdown reads
    "Repeat - None" (disabled) and the count box is empty. Switch back to Sequential,
    Repeatable. Expected: "Repeat - Infinite" again. Save, reload, and check both states again.
    Then, **without reloading**, open that playlist and then another repeat-type playlist whose
    repeat is None. Expected: the second shows "Repeat - None" (not the first playlist's
    "Infinite").

### Negative / edge (T-003)

- **Panic during a gap or nested track.** During case 10's gap or case 9's nested track, press
  **Panic Stop**. Expected: no further dispatches; after clearing the panic, running
  "Interrupt" dispatches it once and nothing from before the panic returns.
- **Interrupt during a Wait track** (Sequential, Interruptible: Short A, Wait 10.0 s, Short B;
  run "Interrupt" ~2 s into the Wait) switches when the Wait ends, not immediately — by design
  (PLAN.md Backlog: "Interrupt during a Wait track or shuffle gap waits for the silence to
  end…").
