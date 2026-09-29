# T-003: Fix playlist repeat/interrupt bugs and cover every interrupt path

<!-- File: .docs/tasks/completed/T-003-playlist-interrupt-fixes.md. Branch: feature/T-003-playlist-interrupt-fixes.
     PR title: "T-003: Fix playlist repeat/interrupt bugs and cover every interrupt path". -->

## Context

User report (2026-09-27, via Jeff): "interrupt doesn't seem to be working if the playlist is set
for infinite repeat", and the reporter says they "set the sequential playlist to repeat". Plain
`Sequential` cannot repeat — the repeat dropdown is disabled for it and `isRepeatableType()`
excludes it. The reporter's follow-up answers are below. This task fixes the defects found while
investigating and closes the coverage gaps; it does **not** change what any playlist type is
documented to do.

Investigation (2026-09-27). Bugs 1–3 were reproduced with throwaway vitest probes (deleted);
4–6 are from code reading.

1. **Nested playlist tracks are consumed in place.** `beginTrack` calls `track.shift()` on a
   nested `QueueTrack[]`, and `tracksRemaining = [...tracks]` is a shallow copy, so the arrays
   inside `tracks` are emptied during pass 1. Pass 2+ sees empty arrays.
   - Finite repeat: nested tracks are silently skipped on every repeat. Probe
     (`[s1, [n1, n2]]`, `repeatsLeft: 1`) dispatched `s1,n1,n2,s1`.
   - Infinite repeat, nested-only playlist: `beginTrack([]) → playNextTrack → handleRepeat →
     startPlayingActivePlaylist → beginTrack([])` recurses synchronously →
     `RangeError: Maximum call stack size exceeded`, thrown inside a `setTimeout` callback. There
     is no `uncaughtException` handler, so the API process dies. Affects `SequentialRepeatable`,
     `ShuffleWithRepeat`, `ShuffleWithDelayAndRepeat` (every type that allows nested tracks and
     repeats).
   - The existing test "should dispatch nested QueueTrack[] sub-tracks in order" passes
     `[...subTracks], // copy to avoid mutation issues` — it worked around this bug instead of
     catching it.
2. **Interrupting during a shuffle gap plays a stale track.** Step D picks the next track
   *before* scheduling the gap, and the gap callback calls `beginTrack(track)` unconditionally.
   A replacement during the gap waits out the gap, then one old-playlist track plays, then the
   replacement. Probe (`ShuffleWithDelayAndRepeat`, 5 s gap, script queued in the gap):
   `a -> b -> SCRIPT`, script first dispatched at 5200 ms.
3. **No gap at the repeat boundary.** Step E (`handleRepeat` → `startPlayingActivePlaylist`)
   begins the next pass immediately. Probe (`ShuffleWithDelayAndRepeat`, 1000 ms gap, 100 ms
   tracks): dispatches at `0:b 1100:a 1200:a 2300:b` — no gap between passes, and the same track
   played back-to-back.
4. **`randomDelay` is ignored.** The API never reads `settings.randomDelay`; the converter maps
   `delayMin`/`delayMax` straight to `shuffleWaitMin`/`shuffleWaitMax`. Nothing lowers
   `delayMax` once Random Delay is off (its input is hidden, and raising `delayMin` only ever
   raises it — e.g. Delay 10 s then Delay 2 s leaves 2–10 s whether or not Random Delay was ever
   on), so the "fixed" delay stays random.
5. **A disabled repeat dropdown shows a stale mode.** `AstrosPlaylistSettings` is not re-keyed on
   type change and nothing resets `settings.repeat`, so switching `SequentialRepeatable` +
   "Repeat - Infinite" → `Sequential` leaves a greyed-out dropdown reading "Repeat - Infinite"
   (also after reload — the pre-fix `initRepeatMode()` rebuilt it from the stored JSON). The backend plays
   the playlist once, uninterruptibly. Likely source of the reporter's "sequential set to repeat".
6. **Interrupts land between a nested playlist's sub-tracks.** In `playNextTrack` the replacement
   check (Step B in the pre-fix code) runs before the sub-track step (Step C; the fix swaps them,
   so the labels now read the other way), so an interruptible playlist is cut
   mid-nested-playlist. The editor presents a nested playlist as one track and only offers
   `Sequential` (uninterruptible) playlists as nested tracks, and the help text says interruption happens "as soon as
   the current track finishes". Decision (Jeff, 2026-09-27): switch only after the whole nested
   track finishes.

Coverage today: interrupts are tested only for `SequentialInterruptible` (plus the
queued-interruptible replacement rule). Nothing covers interrupting `SequentialRepeatable` or any
shuffle type, repeat with nested tracks, gap interleavings, panic during a gap, non-repeat types
ignoring `repeatsLeft`, or the converter's `repeatCount: -1` (the value the editor actually saves
for Infinite — only `0` — every new playlist's default, which also means infinite when `repeat` is on — is tested).

Reporter answers (2026-09-27): a **`Sequential, Repeatable`** playlist, **Infinite** repeat, whose
one track is a script with a single event at **45 s**; the 45 s event keeps firing over and over
and a script sent mid-loop never interrupts it. None of bugs 1–6 applies (no nested playlist, no
shuffle). Root cause is a units bug, owned by **T-004**
(`.docs/tasks/completed/T-004-script-duration-units.md`): `calculateLengthDS` stores the last event time in
*seconds* in `scripts.duration_ds`, which every consumer reads as deciseconds, so the queue times
the 45 s script as 4.5 s. The server re-sends `SCRIPT_RUN` ten times per real run, the ESP's
30-slot script queue fills, and the interrupting script is dropped (`Queue is full`) or queued
behind ~22 min of backlog. (An earlier note here blamed track-boundary latency; that probe assumed
the column really held deciseconds.)

This task stays as scoped: bugs 1–6 are real (bug 1 crashes the API) and independent of the
report. T-004 landed first (PR #128, merged 2026-09-28).

## Contract (pinned — do not change)

- **`PlaylistType` values and documented semantics** (`astros_api/src/models/playlists/playlistType.ts`,
  `astros_vue/src/enums/playlists/playlistType.ts`, `playlist_editor_view.help_*` strings). The
  fixes make the code conform to these docs; the docs do not change. `Sequential` stays
  non-repeatable.
- **Queue routing rules** in `addToQueue`: `Sequential` active → new item goes to the back of the
  queue; interruptible active → new item replaces it (switch at the next track boundary); at most
  one interruptible item waits in the queue and it is dropped when any later item is queued;
  queued items play FIFO. Routing keys off `activePlaylist` exactly as today (a replacement
  becomes `activePlaylist` immediately).
- **`AnimationQueue` public surface**: `constructor(dispatchCallback)`,
  `dispatchCallback(id, locations)` signature, `addToQueue`, `panicStop`, `clearPanicStop`,
  `getPanicState`, `subscribe`, and the public `activePlaylist` / `playlistQueue` / `inPanicStop`
  fields.
- **`AnimationQueuePlaylist` / `QueueTrack` shapes** (`queue_item/animation_queue_item.ts`).
- **`convertPlaylistToQueueItem(playlist, playlistRepo, scriptDurations, locations)`** signature
  and repeat mapping (`repeat: false` → 0; `repeatCount` 0 or -1 → -1; N → N).
- **`runScript`** wraps a single script as `PlaylistType.Sequential`, `repeatsLeft: 0`
  (built by `convertScriptToQueueItem` in `playlist_converter.ts` since T-004; previously inline
  in `api_server.ts` — location updated 2026-09-28, behavior unchanged).
- **`PlaylistSettings` JSON as stored in the DB** — no migration, no write-side change. Fix 5 is
  display-only.
- **Timing semantics not being changed**: an interrupt that arrives during a Wait track or a
  shuffle gap still switches when that wait/gap ends (see Out of scope).

## Task

API — `astros_api/src/serial/animation_queue/animation_queue.ts`:

1. `beginTrack` must not mutate its argument: for a nested array, copy it, shift the copy, and
   store the remainder in `currentTrack`. A playlist's `tracks` are unchanged after any number of
   passes.
2. Route every inter-track gap through one private helper (e.g. `scheduleGap(then: () => void)`)
   that stores its timer in `currentTimeout` (so `panicStop` cancels it) and, when it fires,
   first honors a pending replacement (clear `playlistReplaced`, `startPlayingActivePlaylist()`);
   otherwise it runs `then`. Step D uses it before the next track — the stale pre-picked track
   never plays after a replacement.
3. Step E: when `handleRepeat()` starts another pass of a shuffle-with-delay type, run the first
   track of the new pass through the same gap helper.
4. `playNextTrack`: run the nested sub-track step before the replacement step, so a pending
   replacement waits until the current nested track's sub-tracks are exhausted. Sub-tracks keep
   dispatching with the locations of the playlist they belong to — capture the locations when
   the track begins (`beginTrack`) instead of reading `this.activePlaylist.locations` at
   dispatch time (`activePlaylist` already points at the replacement).

API — `astros_api/src/serial/animation_queue/playlist_converter.ts`:

5. When `settings.randomDelay` is false, `shuffleWaitMax = shuffleWaitMin` (fixed delay =
   `delayMin`).

Vue — `astros_vue/src/components/playlists/playlistEditor/AstrosPlaylistSettings.vue`:

6. When `repeatEnabled` is false, the repeat select displays `none` and the count input displays
   empty, regardless of stored `settings.repeat`/`repeatCount`. Stored values are not modified
   (switching back to a repeat type shows them again).

Tests — each fix RED-first; after it goes green, revert the fix and confirm the test fails
(record the mutation check in the PR body):

7. `animation_queue.test.ts`, new `describe` blocks (keep existing tests; the only change to an
   existing test is removing the defensive `[...subTracks]` copy and asserting the source
   array is untouched after playback):
   - **Interrupt matrix** (`it.each` over types; count + infinite rows for the three repeat
     types): a script queued mid-track on each interruptible type starts when that track ends;
     the old playlist dispatches nothing more and does not return (not after the replacement
     finishes, not via repeat). `Sequential` active: the queued script waits for the whole
     playlist.
   - **Interrupt timing**: during a script track; during a Wait track (switch at wait end);
     during a shuffle gap (switch at gap end, no stale track — fix 2); during a nested track
     (switch after the last sub-track — fix 4); on the last track of the final pass; during the
     repeat-boundary gap (fix 3).
   - **Interrupter kind**: a script; a `Sequential` playlist; an interruptible playlist (which is
     itself then interruptible). Two arrivals during one track: if the first replacement is
     interruptible, the second replaces it; if the first is `Sequential` (e.g. a script), the
     second queues behind it.
   - **Sub-track locations after replacement**: remaining sub-tracks dispatch with the original
     playlist's locations; the replacement dispatches with its own (use distinct non-empty
     location arrays).
   - **Panic interleavings**: `panicStop` during a shuffle gap, during a Wait track, mid-nested
     track, and with a replacement pending → no further dispatches; after `clearPanicStop` no
     stale timer or replacement fires, and a newly added item plays normally.
   - **Repeat**: nested tracks replay on every pass (finite); nested-only playlist with
     `repeatsLeft: -1` does not throw, keeps cycling, and is interruptible (fix 1); gap applied
     at the repeat boundary for `ShuffleWithDelayAndRepeat` (fix 3); `repeatsLeft: 2` plays 3
     passes.
   - **Non-repeat types ignore `repeatsLeft`**: `Sequential`, `SequentialInterruptible`,
     `Shuffle`, `ShuffleWithDelay` with `repeatsLeft: -1` play exactly one pass.
   - **Empty repeatable playlist** with `repeatsLeft: -1` goes idle (no hang, no throw).
8. `playlist_converter.test.ts`: `repeatCount: -1` → `repeatsLeft: -1`; `randomDelay: false` with
   a stale larger `delayMax` → `shuffleWaitMax === shuffleWaitMin`; `randomDelay: true` keeps
   both bounds (fix 5).
9. `astros_vue/src/components/playlists/playlistEditor/AstrosPlaylistSettings.spec.ts` (new,
   colocated): with stored `repeat: true, repeatCount: -1`, a non-repeat type shows `none` and a
   disabled select; a repeat type shows `infinite`; stored settings are not mutated by mounting
   or by a type change.

Docs:

10. Extend `.docs/qa/playlist-playback.md` (created by T-004) covering interrupt
    behavior per type, nested-track interrupts, shuffle gaps at the repeat boundary, fixed vs
    random delay, and the repeat dropdown display.

Added after the pre-commit and pre-push reviews (2026-09-28):

11. `animation_queue.ts`: `takeOverIfReplaced()` shared by the track-end and gap-end paths
    (behavior-preserving). Comments corrected: `activePlaylist`/`currentTrack`/`playlistReplaced`
    semantics, `addToQueue`'s replacement comment, `scheduleGap`, and `animation_queue_item.ts`
    (comments only — the pinned shape is unchanged).
12. Fix 6 hardening, display only: `AstrosPlaylistSettings` derives the repeat mode from the model
    instead of copying it once at setup, so opening playlist B after A no longer shows A's mode
    (confirmed by a component test that swaps `modelValue`); the count shows only in Count mode.
13. Tests closing gaps the reviews found: repeatable and delay-type interrupters (a flag never
    cleared, or a deleted takeover step, passed the first suite), a playlist run after an
    interrupt, a delay-type replacement in the repeat-boundary gap, no pending timer after
    `panicStop`, per-playlist locations on FIFO advance, no trailing gap, stale delay settings on
    non-delay types, the Vue display for all seven types and swapped-in settings.

## Acceptance criteria

- [x] A playlist's `tracks` (including nested arrays) are unchanged after playback; nested tracks
      replay on every repeat pass.
- [x] A nested-only playlist with infinite repeat cycles indefinitely without throwing and is
      interruptible.
- [x] A replacement queued during a shuffle gap starts when the gap ends; no track from the
      replaced playlist dispatches after the replacement arrives (outside of an in-progress
      nested track).
- [x] `ShuffleWithDelayAndRepeat` applies the gap before the first track of each repeat pass.
- [x] An interrupt during a nested track switches only after the nested track's last sub-track;
      those sub-tracks dispatch with the original playlist's locations.
- [x] `randomDelay: false` yields a fixed delay of `delayMin`.
- [x] The repeat dropdown shows "Repeat - None" for types that cannot repeat, and follows the
      currently loaded playlist's settings; stored settings are untouched.
- [x] Interrupt matrix covers all 7 types (count + infinite rows for repeat types) and the
      timing, interrupter-kind, and panic cases listed in Task 7.
- [x] Every fix has a test that fails with the fix reverted (mutation checks recorded).
- [x] All pre-existing queue and converter tests pass unmodified (except the nested-copy removal
      in Task 7).
- [x] `.docs/qa/playlist-playback.md` exists and covers the cases in Task 10.

## Out of scope

- **Uninterruptible repeat** (`Sequential` + repeat, or a new type) — withdrawn; the reporter
  uses `Sequential, Repeatable`, so it is not what the report needs.
- **Script durations 10× too short** (the reporter's actual root cause) — fixed by T-004 (PR #128).
- **Cutting silence short on interrupt** — starting a replacement immediately during a Wait track
  or shuffle gap instead of at its end. Behavior change → PLAN.md Backlog.
- **Zero-duration tracks + infinite repeat** — scripts with no recorded duration (e.g. deleted →
  0 ms) re-dispatch back-to-back every tick. → **T-005** (promoted 2026-09-28; must also cover
  zero-duration sub-tracks inside nested tracks and empty nested arrays — see PLAN.md).
- **Process-level crash logging** (`uncaughtException`) — already tracked by the existing
  Backlog item about the unlogged 16:32 crash-restart loop; bug 1 is another instance.
- **Clearing stale `settings.repeat` on type change / data migration** — fix 5 is display-only.
- **Clamping `delayMax < delayMin`** in the converter (the editor prevents it today).
- **Accessible labels** on the repeat select and count input (pending the a11y pass).
- Tidying the dead first-queue setup in the existing "empty playlist is skipped" test.

## Verification

API (`astros_api/`):

- `npx vitest run src/serial/animation_queue/` — green, including every new case in Task 7–8.
- `npx vitest run` — full suite green.
- `npm run prettier:write && npm run lint:fix`, then `npm run prettier:check` — clean.
- `npm run build` — green.
- Mutation checks: revert each of fixes 1–5 individually → at least one named test fails per
  revert.

Vue (`astros_vue/`):

- `npx vitest run src/components/playlists/playlistEditor/AstrosPlaylistSettings.spec.ts` — green.
- `npm run test:unit -- --run` — full suite green.
- `npm run format && npm run lint`, then `npx prettier --check --experimental-cli "src/**"` —
  clean.
- `npm run build` — green.
- Mutation check: revert fix 6 → the spec's non-repeat-type case fails; revert the derived repeat mode (a `ref` copied at setup) → the swapped-settings case fails; drop `repeat = true` from the Count branch → the user-edit case fails.

Bench (human-gated, from `.docs/qa/playlist-playback.md`):

- `Sequential, Repeatable`, Infinite, tracks = only nested playlists: plays through more than one
  pass; the API stays up; a remote script press plays after the current nested playlist
  finishes.
- `Shuffle with Delay and Repeat`, fixed delay: the gap appears between passes; a script pressed
  during a gap plays at the gap's end with no extra old track.
- A playlist switched from `Sequential, Repeatable` + Infinite to `Sequential` shows
  "Repeat - None".

## Failure-mode inventory

The queue is a single-threaded, timer-driven state machine; the hazards are timer interleavings
on shared in-memory state (`activePlaylist`, `currentTrack`, `currentTimeout`,
`playlistReplaced`, `playlistQueue`). No filesystem, network, or cross-process state.

**Invariants to hold:**

- At most one pending timer; it is always `currentTimeout`, so `panicStop` cancels it.
- No synchronous `beginTrack ↔ playNextTrack` cycle without a timer in between (bug 1's
  recursion is unreachable once nested arrays are never emptied; the converter never emits an
  empty nested array).
- While an interruptible playlist is active the queue is empty (routing rules put it last, and a
  later push drops it); replacement therefore never needs to consult `playlistQueue`.
- A track dispatches with the locations of the playlist it came from.

**Event × state matrix** (→ expected outcome; each row pinned by a Task 7 test):

| State when event fires | Event | Expected |
|---|---|---|
| Script track playing (interruptible active) | `addToQueue(x)` | `x` starts at track end; old never resumes |
| Wait track playing (interruptible active) | `addToQueue(x)` | `x` starts at wait end |
| Mid-nested track, sub-tracks left | `addToQueue(x)` | sub-tracks finish with old locations, then `x` |
| Mid-nested track, last sub-track playing | `addToQueue(x)` | `x` at sub-track end |
| Shuffle gap within a pass | `addToQueue(x)` | `x` at gap end; pre-picked track never dispatches |
| Shuffle gap at the repeat boundary | `addToQueue(x)` | `x` at gap end; new pass never starts |
| Replacement pending, first is interruptible | `addToQueue(y)` | `y` replaces it (latest wins) |
| Replacement pending, first is `Sequential` | `addToQueue(y)` | `y` queues behind it |
| Any playing state, gap, or replacement pending | `panicStop()` | timer cleared (`vi.getTimerCount() === 0`), flag reset, no dispatch |
| After `panicStop` | timers advance | nothing fires; recovery before the old deadline shows no stale timer or flag |
| After `clearPanicStop` | `addToQueue(x)` | `x` plays normally, no stale replacement |
| Last track of the final pass | timer fires | queue advances / goes idle |
| Nested-only, infinite repeat, pass ends | timer fires | next pass begins via timer (no recursion) |

## Implementation checklist

- [x] Fix 1 RED/GREEN — `beginTrack` copies nested arrays (nested replay on repeat, source untouched, nested-only infinite loop no throw)
- [x] Fix 4 RED/GREEN — nested sub-tracks finish before a replacement; captured locations
- [x] Fix 2 RED/GREEN — `scheduleGap`; no stale pre-picked track after a replacement in a gap
- [x] Fix 3 RED/GREEN — gap before the first track of each repeat pass
- [x] Task 7 coverage — interrupt matrix (7 types, count + infinite rows), timing, interrupter kind, panic interleavings, repeat, non-repeat, empty
- [x] Fix 5 RED/GREEN — converter `randomDelay: false` → fixed delay; `repeatCount: -1` row
- [x] Fix 6 RED/GREEN — `AstrosPlaylistSettings.spec.ts`; repeat dropdown shows none for non-repeat types
- [x] Mutation checks recorded (fixes 1–6): fix 1 revert → 4 tests fail (source untouched, nested replay, nested-only infinite RangeError, nested-only interruptible); fix 4 step order → 2, captured locations → 1; fix 2 gap ignores replacement → 1; fix 3 no boundary gap → 2, gap keyed on repeatable instead of delay → 7; fix 5 revert → 1, always-delayMin → 1 (existing random test); fix 6 each binding → its own test, always-empty count → 1. Review round: gap timer outside `currentTimeout` → panic-gap test, `panicStop` keeping `playlistReplaced` → panic-replacement test (both escaped the first version of the panic tests)
- [x] Task 10 — extend `.docs/qa/playlist-playback.md`
- [x] Pre-commit: api + vue format/lint, builds, full suites, code review (findings addressed)
- [x] Tasks 11–13 (review fixes): `takeOverIfReplaced`; repeat mode derived from the model (swap test RED `'infinite'` vs `'none'` first; count-only-in-Count RED `'3'` vs `''`); new tests. Mutations now caught that the first suite missed: takeover never clears the flag → 4 tests; takeover step deleted → 1; `panicStop` skips `clearTimeout` → 4; boundary gap without the takeover → 1; locations not captured on a normal start → 2; Count branch forgets `repeat = true` → 1 (Vue); count always empty → 1 (Vue)
- [x] Pre-push: `/pr-review-toolkit:review-pr` (5 agents) + a per-commit review of the fix batch; findings addressed (Tasks 11–13, doc/comment sweep, Backlog)
- [x] Close-out: task file → `completed/`, PLAN.md checkbox + Log entry (bench items in Verification stay open until post-merge upkeep — run 2026-09-28: cases 7–13 log-verified, passed)
