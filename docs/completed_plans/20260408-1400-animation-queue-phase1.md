# Animation Queue — Phase 1: Core Queue Logic + Unit Tests

## Context

AstrOs playlists let users chain scripts into complex animations (sequential, shuffle, repeatable, interruptible) and "character loops" that make the droid feel alive. The UI and database work is done. What remains is the server-side queue that processes playlists and dispatches script-run commands to ESP32 controllers at the right time.

This is Phase 1 of 2. It covers the AnimationQueue state machine and its unit tests — all pure logic with no DB or serial dependencies. Phase 2 (separate plan) will cover the playlist-to-queue-item converter, api_server wiring, panic clear endpoint, and integration.

## Files to modify

- `astros_api/src/serial/animation_queue/queue_item/animation_queue_item.ts` — add `isWait` field to `QueueTrack`
- `astros_api/src/serial/animation_queue/animation_queue.ts` — complete the state machine
- `astros_api/src/serial/animation_queue/animation_queue.test.ts` — comprehensive tests

## Tasks

### 1. Add `isWait` to `QueueTrack` interface

In `queue_item/animation_queue_item.ts`, add `isWait: boolean` to the `QueueTrack` interface. Wait tracks use the timer for delay but should NOT call `dispatchCallback`.

### 2. Add internal state fields to `AnimationQueue`

Add these private fields:
- `currentTimeout: ReturnType<typeof setTimeout> | null` — handle to cancel pending dispatch on panic stop
- `playlistReplaced: boolean` — signals that `addToQueue` swapped the active playlist while a track was playing (interruptible replacement)

Remove the `loadingItem` field and its busy-wait loop. In single-threaded Node.js with `setTimeout`-based timing, `addToQueue` and `playNextTrack` cannot actually race — the busy-wait is unnecessary and dangerous.

### 3. Write helper methods

**`pickNextTrack(): QueueTrack | QueueTrack[] | null`**
- For shuffle types (`Shuffle`, `ShuffleWith*`): pick random index from `tracksRemaining`, splice it out, return it.
- For sequential types: shift from front of `tracksRemaining`.
- Return `null` if `tracksRemaining` is empty.

**`isInterruptible(): boolean`**
- Returns `true` if active playlist type is anything other than `Sequential` (SequentialInterruptible, SequentialRepeatable, all Shuffle types are interruptible).

**`isRepeatableType(): boolean`**
- Returns `true` for `SequentialRepeatable`, `ShuffleWithRepeat`, `ShuffleWithDelayAndRepeat`.

**`handleRepeat(): boolean`**
- If not repeatable type or `repeatsLeft === 0`, return `false`.
- If `repeatsLeft > 0`, decrement. If `-1` (infinite), don't decrement.
- Reset `tracksRemaining = [...tracks]`.
- Return `true`.

**`hasShuffleDelay(): boolean`**
- `true` for `ShuffleWithDelay` and `ShuffleWithDelayAndRepeat`.

**`getShuffleDelay(): number`**
- Random value between `shuffleWaitMin` and `shuffleWaitMax` (inclusive).

### 4. Implement `startPlayingActivePlaylist()`

Currently empty (just null/panic guards). Needs to:
1. Guard on `inPanicStop` and `activePlaylist === null` (already there).
2. Call `pickNextTrack()` to get the first track.
3. If the track is a `QueueTrack[]` (sequential playlist sub-tracks), shift the first element off, store the rest in `currentTrack`, and dispatch the first element.
4. If the track is a single `QueueTrack`, set `currentTrack = track` and dispatch it.
5. Use `dispatchCurrentTrack()` (see task 5) to handle the dispatch + timeout.

### 5. Rewrite `dispatchNextTrack` → `dispatchTrack(track: QueueTrack)`

Update the existing `dispatchNextTrack` method:
- If `track.isWait` is `false`, call `this.dispatchCallback(track.id)`.
- If `track.isWait` is `true`, skip the callback (just wait).
- Store the timeout handle: `this.currentTimeout = setTimeout(() => this.playNextTrack(), track.duration)`.

### 6. Rewrite `playNextTrack()` — the core state machine

Remove the `while(this.loadingItem)` busy-wait. The method should flow:

**Step A — Check panic:** If `inPanicStop`, return.

**Step B — Check playlist replacement:** If `playlistReplaced` is `true`, reset the flag, call `startPlayingActivePlaylist()`, return. (This handles the case where `addToQueue` swapped the active interruptible playlist while a track was playing. The current track finished, now we start the new playlist.)

**Step C — Finish sequential sub-track array:** If `currentTrack` is a `QueueTrack[]` with remaining items, shift the next one and dispatch it. Return.

**Step D — Pick next track from active playlist:** Call `pickNextTrack()`.
- If a track is returned:
  - For shuffle-with-delay types: set timeout for `getShuffleDelay()` ms, then dispatch the track. (The delay goes *between* tracks, not before the first one.)
  - Otherwise: dispatch immediately.
  - Handle the QueueTrack[] case same as step 4 in `startPlayingActivePlaylist`.
  - Return.

**Step E — Tracks exhausted, check repeat:** If `pickNextTrack()` returned `null`:
- Call `handleRepeat()`. If it returns `true`, call `startPlayingActivePlaylist()`, return.

**Step F — Playlist done, advance queue:**
- `this.activePlaylist = this.playlistQueue.shift() ?? null`
- `this.currentTrack = null`
- If `activePlaylist` is not null, call `startPlayingActivePlaylist()`.

### 7. Update `addToQueue()` — interruptible replacement flag

The existing logic on lines 40-49 replaces `this.activePlaylist` when the active playlist is interruptible. Add `this.playlistReplaced = true` in that branch so `playNextTrack` knows to start fresh when the current track's timeout fires.

Also set `tracksRemaining = [...item.tracks]` (already done on line 28) — verify this happens before all return paths.

### 8. Update `panicStop()` — cancel active timeout

Add `clearTimeout(this.currentTimeout)` and reset `this.currentTimeout = null` so the currently-scheduled `playNextTrack` call is cancelled immediately, not just guarded by the flag check.

### 9. Write unit tests

Use `vi.useFakeTimers()` throughout so all `setTimeout` calls are controlled. Use `vi.advanceTimersByTime(ms)` to simulate time passing.

**Sequential playback:**
- [x] Sequential playlist with 2 script tracks: dispatches track1 immediately, track2 after track1's duration
- [x] Sequential playlist with a Wait track: no dispatch for wait, but timing respected before next track
- [x] Sequential playlist with nested QueueTrack[] (sub-playlist): dispatches sub-scripts in order

**Shuffle playback:**
- [x] Shuffle playlist: all tracks dispatched exactly once (spy on `Math.random` for determinism)
- [x] ShuffleWithDelay: delay inserted between tracks, verify timing

**Repeat:**
- [x] SequentialRepeatable with `repeatsLeft = 1`: plays 2 total cycles then stops
- [x] SequentialRepeatable with `repeatsLeft = -1`: plays at least 3 cycles without stopping
- [x] ShuffleWithRepeat: reshuffles and replays

**Interruptible replacement:**
- [x] SequentialInterruptible active, new item added: current track finishes, then new playlist starts
- [x] Sequential (non-interruptible) active, interruptible added to queue, then replaced by another item before it starts

**Queue ordering:**
- [x] Multiple Sequential playlists queued: play in FIFO order
- [x] Only one interruptible item in queue at a time: new interruptible replaces queued interruptible

**Panic stop:**
- [x] Panic during playback: timeout cancelled, no more dispatches
- [x] addToQueue while in panic: item rejected
- [x] clearPanicStop then addToQueue: item accepted

**Edge cases:**
- [x] Empty playlist (no tracks): skipped, advances to next in queue
- [x] Single-track playlist: dispatches once, done

## Verification

```bash
cd astros_api && npx vitest run src/serial/animation_queue/
```

All tests should pass. The queue is pure logic with a callback — no DB, serial, or network dependencies in Phase 1.

## Phase 2 (next plan, not this one)

- `playlist_converter.ts` — convert `Playlist` (DB model) → `AnimationQueuePlaylist` (queue model), resolving nested playlist tracks and converting durationDS → milliseconds
- `api_server.ts` wiring — instantiate AnimationQueue, implement `runPlaylist()`, extract `dispatchScriptFromQueue()` from existing `runScript()` logic
- Panic clear endpoint — `POST /api/panicClear` to call `animationQueue.clearPanicStop()`
- Converter unit tests + integration testing
