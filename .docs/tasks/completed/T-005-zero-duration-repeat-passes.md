# T-005: Pad repeat passes shorter than 1 s so zero-duration loops cannot flood

<!-- File: .docs/tasks/completed/T-005-zero-duration-repeat-passes.md. Branch: feature/T-005-zero-duration-repeat-passes
     (off develop AFTER T-003 merges — same queue loop). PR title: "T-005: Pad repeat passes shorter than 1 s". -->

## Context

Promoted by Jeff on 2026-09-28 ("fix the 0 second playlist issues immediately after this task"),
from the T-004 Backlog and the T-003 pre-push review.

A script track is timed by its script's recorded length: the start of its last event
(`calculateLengthDS`, fixed in T-004). A script with no events, or whose events all sit at 0 s,
is a 0 ms track. So is a 0.0 s Wait, and a script track whose script id is unknown (converter
`scriptDurations.get(id) ?? 0` — rare, since deleting a script also removes its playlist
tracks). When a playlist made only of such tracks repeats, the queue's track timers fire every
~1 ms, so the server sends `SCRIPT_RUN` ~1000 times per second. That floods the serial link and
the ESP's 30-slot script queue (which drops pushes when full), and writes an info log line per
dispatch.

- **Nested tracks.** Before T-003, a nested-only playlist on infinite repeat crashed on its second
  pass (bug 1). T-003 fixed the crash, so a nested playlist of 0 ms sub-tracks now **loops at
  ~1000 dispatches/s** instead (T-003 pre-push review, probe: `[[n1(0), n2(0)]]`, infinite repeat
  → 1002 dispatches in 1 s).
- **Empty nested arrays (`[[]]`).** `beginTrack([])` still calls `playNextTrack()` synchronously;
  with infinite repeat that recurses (`beginTrack → playNextTrack → handleRepeat →
  startPlayingActivePlaylist → beginTrack`) into a `RangeError`. Through `addToQueue` the error is
  swallowed by its catch and the queue is left wedged (active playlist, no timer); from a timer it
  crashes the process. Only the converter's `subTracks.length > 0` guard keeps it unreachable
  today.
- **Malformed `repeatsLeft`.** `handleRepeat` treats any value that is neither `0` nor positive —
  `undefined`, `NaN`, `-2` — as infinite (a fraction counts down 1.5 → 0.5 → −0.5 and then loops
  forever too) (settings reach the converter via
  `JSON.parse(...) as PlaylistSettings` without validation; `repeatCount: undefined` →
  `repeatsLeft: undefined` → loops forever).

Design (approved by Jeff 2026-09-28): **pad each repeat pass** to a minimum length rather than
flooring every track or refusing the playlist. A single play-through keeps today's timing; only
loops are slowed. A single pass of instant scripts is a short burst the ESP queue absorbs.

## Contract (pinned — do not change)

- **`AnimationQueue` public surface**: `constructor(dispatchCallback)`, the `dispatchCallback(id,
  locations)` signature, `addToQueue`, `panicStop`, `clearPanicStop`, `getPanicState`,
  `subscribe`, and the public `activePlaylist` / `playlistQueue` / `inPanicStop` fields.
- **`AnimationQueuePlaylist` / `QueueTrack` shapes** (`queue_item/animation_queue_item.ts`);
  `convertPlaylistToQueueItem` / `convertScriptToQueueItem` signatures and the converter's repeat
  mapping (`repeat: false` → 0; `repeatCount` 0 or -1 → -1; N → N).
- **`addToQueue` routing rules** (T-003): Sequential active → back of the queue; interruptible
  active → replaced, switching at the end of the current track (a nested track counts as one) or
  gap; at most one queued interruptible; FIFO.
- **Timing that must not change**: a single pass (no repeat) and any repeat pass that already
  takes ≥ 1 s play exactly as today; directly run scripts (never repeat) are unaffected; a delay
  type's configured gap is never shortened.
- **T-003 gap semantics**: an interrupt that arrives during a gap — now including padding —
  switches when it ends; `panicStop` cancels it.
- No frontend, serial-protocol, DB, or `PlaylistType` doc/help-text change.

## Task

API — `astros_api/src/serial/animation_queue/animation_queue.ts`:

1. **Minimum repeat pass.** `const MIN_REPEAT_PASS_MS = 1000`. Record when each pass starts
   (a private field set in `startPlayingActivePlaylist`, which starts every pass of every
   playlist) using a **monotonic clock** (`performance.now()` — never `Date.now()`, which jumps
   when an SBC syncs its clock after boot). At the repeat boundary (Step E), after `handleRepeat()`
   succeeds: `elapsed = now - passStart`; `wait = max(delayTypeGap, MIN_REPEAT_PASS_MS - elapsed)`
   where `delayTypeGap` is the shuffle delay for delay types and 0 otherwise. If `wait > 0`, start
   the next pass through the gap helper; otherwise start it immediately (today's path).
   *(Amended by Tasks 10–13: 5 ms slack, NaN-safe gap — now via delay normalization — delay types
   keep the gap timer.)*
2. **Gap helper takes an explicit delay.** `scheduleGap(delayMs, then)` — callers pass
   `this.getShuffleDelay()` for shuffle gaps, `wait` for the repeat boundary. The timer stays in
   `currentTimeout` and a pending replacement still takes over when it ends
   (`takeOverIfReplaced`).
3. **One warning per playlist run** when padding is applied: `logger.warn({ playlistId,
   passMs, paddedToMs }, 'Repeat pass shorter than the minimum; padding')` — object first (pino
   ignores arguments after a message string). Not once per pass.
4. **Pass building.** One private helper builds a pass from `item.tracks` — copy, **drop empty
   nested arrays**, shuffle for shuffle types — used by both `addToQueue` and `handleRepeat`
   (replacing their duplicated copy-and-shuffle code). A playlist left with no tracks goes idle
   as empty playlists already do. `item.tracks` is never mutated.
5. **`repeatsLeft` validation.** In `handleRepeat`: `-1` → infinite; a positive integer →
   decrement and repeat; `0` → no repeat; anything else (`undefined`, `NaN`, negative other than
   `-1`, fractions) → no repeat, with one `logger.warn({ playlistId, repeatsLeft }, …)`.

API — `astros_api/src/serial/animation_queue/playlist_converter.ts`:

6. A script track whose `trackId` is not in `scriptDurations` keeps the 0 ms fallback but logs
   `logger.warn({ playlistId: track.playlistId, trackId, trackName }, 'Script track references an
   unknown script; timing it as 0 ms')`.
   *(Superseded by Task 14: one warning per conversion, naming the run playlist and the unknown
   scripts.)*

Tests — each RED-first; after green, revert the fix and confirm the test fails (record in the
task file and PR body). Confirm first that the queue tests' fake timers fake `performance.now()`
(if not, pass `toFake` explicitly in this suite):

7. `animation_queue.test.ts` (new describe blocks):
   - a 0 ms script on infinite repeat dispatches once per 1000 ms (e.g. exactly 3 dispatches at
     0, 1000, 2000 over 2500 ms — not ~2500);
   - a nested playlist of 0 ms sub-tracks on infinite repeat: each pass's sub-tracks dispatch
     back-to-back, passes start 1000 ms apart;
   - a 0.0 s Wait-only playlist on infinite repeat: no dispatches, timer cadence 1000 ms (use
     `vi.getTimerCount()` / time advance), no busy loop;
   - a pass of 300 ms (e.g. three 100 ms scripts) waits 700 ms before the next pass;
   - a pass ≥ 1000 ms keeps today's timing exactly (no added wait);
   - a system clock jump mid-pass (`vi.setSystemTime` an hour back, then forward) does not change
     the cadence — pins the monotonic clock (`setSystemTime` moves `Date`, not
     `performance.now()`);
   - a delay type with gap G waits `max(G, 1000 - elapsed)` at the boundary — one case where
     G wins, one where the padding wins;
   - finite repeats (e.g. `repeatsLeft: 2`) are padded the same way, then go idle;
   - a replacement queued during padding takes over when the padding ends; the next pass never
     starts;
   - `panicStop` during padding leaves no pending timer (`vi.getTimerCount() === 0`) and nothing
     fires; recovery plays normally;
   - the padding warning is logged once per playlist run (spy `logger.warn` from
     `'src/logger.js'`), not per pass, and again for a new run;
   - `[[]]` and `[[], makeTrack(...)]`: no recursion, no `logger.error`, the empty nested array
     is skipped; a playlist of only empty nested arrays goes idle;
   - `repeatsLeft` `undefined` / `NaN` / `-2` / `1.5` → exactly one pass, one warning;
     `-1` still infinite; `2` still three passes;
   - `item.tracks` unchanged after playback (including the dropped empty nested array).
8. `playlist_converter.test.ts`: an unknown script id → 0 ms track and one warning naming the
   playlist and track. *(Superseded by Task 14.)*

Docs:

9. `.docs/qa/playlist-playback.md`: cases for a 0-event script / 0.0 s event script on
   infinite repeat (log shows ~1 dispatch per second, one padding warning), a 0.0 s Wait-only
   loop, a nested 0-length loop, a 300 ms pass (next pass ~1 s after the previous one started),
   and an interrupt during padding (switches within ~1 s). Update the existing "Script with no
   events in an infinite loop — known flood" edge case.

Added after the pre-commit review (2026-09-28):

10. `TIMER_SLACK_MS = 5`: real timers fire up to ~1 ms early against `performance.now()`, so a
    pass meant to last exactly 1 s can measure 999.x ms — within the slack it is neither padded
    nor warned (the Contract's "passes ≥ 1 s play exactly as today").
11. A NaN shuffle delay (stored settings with repeat on but no `delayMin` — e.g. a legacy `'{}'`
    row later saved with repeat; a bare `'{}'` never repeats) is treated as 0 at the repeat boundary —
    `Math.max(NaN, padding)` switched the padding off, so such a loop flooded with no warning. *(Superseded by Task 13: the guard moved into delay normalization.)*
12. The padding warning fires only when padding is positive and longer than the gap; delay
    types keep going through the gap timer even with a 0 ms wait (as before T-005);
    malformed `repeatsLeft` is logged as a string (pino drops `undefined`, writes `NaN` as
    `null`).

Added after the pre-push review (2026-09-28):

13. Delays: the converter makes each delay finite, non-negative, and ≤ `MAX_TIMER_MS`
    (2^31−1 ms; Node fires a longer timer after 1 ms, so `max(gap, padding)` picked the "huge"
    gap and the loop flooded) with one warning per run for delay types; the queue's
    `getShuffleDelay` clamps the same way as defense in depth (replacing Step E's NaN guard).
14. Unknown scripts: one warning per conversion naming the run playlist and the unique unknown
    ids (was one per track, naming the nested playlist that owned it).
15. The queue's unpinned members (`startPlayingActivePlaylist`, `playNextTrack`,
    `dispatchTrack`, `addToBackOfQueue`, `queueHasInterruptible`, `removeInterruptibleFromQueue`,
    `clearQueue`, `currentTrack`) are private — no callers outside the class; this closes the
    only way around the one-timer and pass-floor invariants. `panicStop` also resets the
    per-run warning marker.
16. Tests closing gaps the reviews found: first-pass start recorded (a test starting away from
    t = 0), same-id re-run warns again (object identity, incl. takeover), empty nested arrays
    dropped on repeat passes, reshuffle pinned, padding for all three repeatable types, stale
    delay on a non-delay type, `repeatsLeft` logged as a string.

## Acceptance criteria

- [x] No repeating playlist starts passes more than once per ~second (1000 ms less the 5 ms slack),
      whatever its tracks or delay settings (a single pass of many instant tracks still bursts —
      Out of scope).
- [x] Single passes, passes ≥ 1 s, direct runs, and delay-type gaps keep their timing.
- [x] Padding is cancelled by `panicStop` and taken over by a replacement at its end.
- [x] One padding warning per padded playlist run; one warning per malformed `repeatsLeft`; one
      warning per run listing its unknown script ids; one per run for invalid delay settings.
- [x] Empty nested arrays are skipped; `[[]]` cannot recurse or wedge the queue.
- [x] Only `-1` means infinite repeat.
- [x] Every fix has a test that fails with the fix reverted (mutation checks recorded).
- [x] Pre-existing queue and converter tests pass. *Amended 2026-09-28 during implementation:* the
      approved design changes the timing of repeat passes shorter than 1 s, so nine older test
      definitions (ten cases) that repeated 100–300 ms passes were updated, keeping their
      sequences and intent (cycle counts, reshuffle, nested replay, interrupt landing points,
      stale delay settings ignored): most now use passes ≥ 1 s; "replays nested tracks on every
      pass" keeps its 300 ms pass and advances longer; the stale-delay tests use a 1 s track with
      a 500 ms stale gap. No expectation about passes ≥ 1 s changed.

## Out of scope

- A warning in the playlist editor for loops shorter than 1 s → Backlog.
- A **single** pass of many instant scripts: padding caps passes, not dispatches, so under repeat
  such a pass bursts every second, and at ≥ ~1000 tracks it is neither padded nor warned
  (reachable via repeated nested playlists) → PLAN.md Backlog.
- Cutting silence short on interrupt (Wait / gap / padding) — existing Backlog item.
- The pino logging sweep beyond the lines this task touches — existing Backlog item (high).
- Queue failure handling (`addToQueue`'s catch leaving the queue wedged; unguarded timer
  callbacks) — existing Backlog item.
- A `playing` field refactor — Backlog (folded into the queue phase-union item). The queue's
  unpinned members were made private in this task (Task 15).
- The "Repeat - Count with no number plays forever" UI/converter mapping — its own task
  (T-003's Contract pinned the 0 → -1 mapping).

## Verification

API (`astros_api/`):

- `npx vitest run src/serial/animation_queue/` — green, including every new case in Tasks 7–8 and
  13–16.
- `npx vitest run` — full suite green.
- `npm run prettier:write && npm run lint:fix`, then `npm run prettier:check` — clean.
- `npm run build` — green.
- Mutation checks: remove the padding (Step E back to immediate) → the 0 ms loop tests fail;
  measure with `Date.now()` → the clock-jump test fails; padding without the takeover check → the replacement-during-padding test fails; padding timer
  outside `currentTimeout` → the panic test fails; warn every pass → the once-per-run test
  fails; keep empty nested arrays → the `[[]]` test fails; restore "anything non-positive is
  infinite" → the malformed-`repeatsLeft` tests fail; drop the converter warning → its test
  fails.

Bench (log-verifiable, droid optional; `.docs/qa/playlist-playback.md` T-005 cases):

- A script with a single event at 0.0 s in `Sequential, Repeatable` + Infinite: the API log
  shows `dispatching script …` about once per second (not hundreds per second) and one padding
  warning; Panic Stop stops it.

## Failure-mode inventory

Single-threaded, timer-driven state machine; the new state is the pass start time and the
per-run warning marker. No filesystem, network, or cross-process state.

**Invariants to hold:**

- At most one pending timer; it is always `currentTimeout` (padding included), so `panicStop`
  cancels it.
- A repeat pass starts at least `MIN_REPEAT_PASS_MS − TIMER_SLACK_MS` (995 ms) after the previous
  pass started (measured on a monotonic clock).
- No synchronous `beginTrack ↔ playNextTrack` cycle: empty nested arrays never reach
  `beginTrack`.
- `item.tracks` is never mutated.

**Event × state matrix** (→ expected; each row pinned by a Task 7/16 test):

| State when event fires | Event | Expected |
|---|---|---|
| Pass ends after < 1 s, non-delay repeat type | timer fires | padding timer for `1000 - elapsed`; next pass at its end |
| Pass ends after < 1 s, delay type, gap G | timer fires | wait `max(G, 1000 - elapsed)` |
| Pass ends after ≥ 1 s (within `TIMER_SLACK_MS` = 5 ms of it counts) | timer fires | next pass immediately (non-delay) / after G (delay) — unchanged, no warning |
| Pass ends after < 1 s, delay type with an unset (NaN) delay | timer fires | padded (the delay normalizes to 0); two warnings per run — invalid delay settings, padding |
| Delay type with a delay beyond the timer maximum | pass boundary | gap clamped to `MAX_TIMER_MS` (not truncated to 1 ms), one invalid-delay warning — no flood |
| Padding pending | `addToQueue(x)` (interruptible active) | `x` at padding end; next pass never starts |
| Padding pending | `panicStop()` | timer cleared, nothing fires; recovery normal |
| New playlist run starts (addToQueue / takeover / advance) | first padded pass | one warning for this run |
| System clock jumps (NTP after boot) | pass boundary | no effect — elapsed uses `performance.now()` |
| Pass built from `[[]]` | `addToQueue` / repeat | empty nested array dropped; idle if nothing left |
| `repeatsLeft` malformed | pass ends | no repeat, one warning, queue advances |

## Implementation checklist

- [x] Precondition: vitest 3.2.4 default fake timers fake `performance.now()`; `vi.setSystemTime` moves `Date` only (probe)
- [x] Task 4 RED/GREEN — pass builder drops empty nested arrays (`[[]]` no recursion, no error log)
- [x] Task 5 RED/GREEN — `repeatsLeft`: only `-1` infinite; malformed → one pass + one warning
- [x] Tasks 1–3 RED/GREEN — repeat-pass padding (0 ms loops, nested, Wait-only, 300 ms pass, ≥ 1 s unchanged, delay max(), finite repeats, clock jump, replacement, panic, once-per-run warning)
- [x] Task 6 RED/GREEN — converter warns on unknown script id
- [x] Mutation checks recorded (pre-push additions: first pass start never recorded → the 0 ms loops and the 10 s-offset test; warn keyed on id → the same-id takeover test; repeat pass not built by `buildPass` → reshuffle + empty-nested-on-repeat; stale delay on non-delay types → 3; timer-max clamp removed → the huge-delay test. Pre-commit additions: NaN guard removed → the NaN-delay test; slack removed → the within-5-ms test; warn when the gap is longer → the delay-type gap-wins case): no padding → 8 tests; `Date.now()` instead of `performance.now()` → the clock-jump test; padding without the takeover → 2 (incl. the repeatable-interrupter padding test); padding timer outside `currentTimeout` → 3 (incl. panic → no pending timer); warn every pass → 1; keep empty nested arrays → 1; malformed `repeatsLeft` accepted → 4 (an `if (false)` mutant failed `tsc` in vitest's globalSetup — used `Number.isNaN(0)`); converter never warns → 1
- [x] Task 9 — QA plan cases
- [x] Pre-commit: prettier + lint, build, full suite, code review (findings addressed)
- [x] Pre-push: `/pr-review-toolkit:review-pr` (5 agents); findings addressed (Tasks 13–16, comment/doc sweep, PLAN.md Backlog)
- [x] Close-out: task file → `completed/`, PLAN.md checkbox + Log entry (bench cases 14–19 stay open until post-merge upkeep — run 2026-09-28: cases 14, 16–19 log-verified, passed; 15 covered by case 9 and unit tests)
- [x] PR #130 review (Copilot): `getShuffleDelay` clamps each bound before computing the random range — `Infinity - Infinity` was `NaN`, so infinite bounds gave a 0 ms gap instead of the timer maximum (`clampDelayMs`); `safeDelayMs` comment corrected (Infinity is clamped, not zeroed). The two timer-max tests now pin the gap to exactly `MAX_TIMER_MS` and check at 3 s first so a flood fails fast. Mutation checks: bounds not clamped first → the infinite-delay test; clamp to `MAX_TIMER_MS - 1` → both timer-max tests; no timer-max clamp → both
