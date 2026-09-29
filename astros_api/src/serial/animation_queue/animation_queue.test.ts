import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnimationQueue } from './animation_queue.js';
import { AnimationQueuePlaylist, QueueTrack } from './queue_item/animation_queue_item.js';
import { PlaylistType } from '../../models/playlists/playlistType.js';
import { ControllerLocation } from '../../models/control_module/controller_location.js';
// Same module instance the queue logs through (src/* alias, not a relative path).
import { logger } from 'src/logger.js';

function makeTrack(id: string, duration: number, isWait = false): QueueTrack {
  return { id, duration, isWait };
}

// A directly run script: Sequential (uninterruptible), one track, no repeat.
function makeScriptItem(
  id: string,
  duration: number,
  locations: ControllerLocation[] = [],
): AnimationQueuePlaylist {
  return makePlaylist({
    id: `script-${id}`,
    playlistType: PlaylistType.Sequential,
    locations,
    tracks: [makeTrack(id, duration)],
  });
}

function makeLocations(id: string): ControllerLocation[] {
  return [{ id } as ControllerLocation];
}

function dispatchedIds(dispatch: ReturnType<typeof vi.fn>): string[] {
  return dispatch.mock.calls.map((call) => call[0] as string);
}

function makePlaylist(
  overrides: Partial<AnimationQueuePlaylist> & { playlistType: PlaylistType },
): AnimationQueuePlaylist {
  return {
    id: 'playlist-1',
    locations: [],
    tracks: [],
    repeatsLeft: 0,
    shuffleWaitMin: 0,
    shuffleWaitMax: 0,
    tracksRemaining: [],
    ...overrides,
  };
}

describe('Animation Queue Tests', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── Sequential playback ──────────────────────────────────────

  describe('Sequential playback', () => {
    it('should dispatch 2 script tracks in order', () => {
      const dispatch = vi.fn();
      const queue = new AnimationQueue(dispatch);

      const playlist = makePlaylist({
        playlistType: PlaylistType.Sequential,
        tracks: [makeTrack('track1', 1000), makeTrack('track2', 500)],
      });

      queue.addToQueue(playlist);

      // track1 dispatched immediately
      expect(dispatch).toHaveBeenCalledTimes(1);
      expect(dispatch).toHaveBeenCalledWith('track1', []);

      // advance past track1 duration
      vi.advanceTimersByTime(1000);

      expect(dispatch).toHaveBeenCalledTimes(2);
      expect(dispatch).toHaveBeenCalledWith('track2', []);

      // advance past track2 duration — no more dispatches
      vi.advanceTimersByTime(500);
      expect(dispatch).toHaveBeenCalledTimes(2);
    });

    it('should not dispatch for Wait tracks but respect timing', () => {
      const dispatch = vi.fn();
      const queue = new AnimationQueue(dispatch);

      const playlist = makePlaylist({
        playlistType: PlaylistType.Sequential,
        tracks: [
          makeTrack('track1', 1000),
          makeTrack('wait-1', 2000, true),
          makeTrack('track2', 500),
        ],
      });

      queue.addToQueue(playlist);

      expect(dispatch).toHaveBeenCalledTimes(1);
      expect(dispatch).toHaveBeenCalledWith('track1', []);

      // after track1: wait track starts (no dispatch)
      vi.advanceTimersByTime(1000);
      expect(dispatch).toHaveBeenCalledTimes(1);

      // after wait: track2 dispatched
      vi.advanceTimersByTime(2000);
      expect(dispatch).toHaveBeenCalledTimes(2);
      expect(dispatch).toHaveBeenCalledWith('track2', []);
    });

    it('should dispatch nested QueueTrack[] sub-tracks in order', () => {
      const dispatch = vi.fn();
      const queue = new AnimationQueue(dispatch);

      const subTracks: QueueTrack[] = [makeTrack('sub1', 500), makeTrack('sub2', 300)];

      const playlist = makePlaylist({
        playlistType: PlaylistType.Sequential,
        tracks: [makeTrack('track1', 1000), subTracks, makeTrack('track3', 200)],
      });

      queue.addToQueue(playlist);

      expect(dispatch).toHaveBeenCalledTimes(1);
      expect(dispatch).toHaveBeenCalledWith('track1', []);

      // after track1: sub1 dispatched
      vi.advanceTimersByTime(1000);
      expect(dispatch).toHaveBeenCalledTimes(2);
      expect(dispatch).toHaveBeenCalledWith('sub1', []);

      // after sub1: sub2 dispatched
      vi.advanceTimersByTime(500);
      expect(dispatch).toHaveBeenCalledTimes(3);
      expect(dispatch).toHaveBeenCalledWith('sub2', []);

      // after sub2: track3 dispatched
      vi.advanceTimersByTime(300);
      expect(dispatch).toHaveBeenCalledTimes(4);
      expect(dispatch).toHaveBeenCalledWith('track3', []);

      // Playback must not consume the playlist's own nested array — a repeat
      // pass replays from it.
      expect(subTracks.map((t) => t.id)).toEqual(['sub1', 'sub2']);
    });
  });

  // ── Shuffle playback ─────────────────────────────────────────

  describe('Shuffle playback', () => {
    it('should dispatch all tracks exactly once in shuffled order', () => {
      const dispatch = vi.fn();
      const queue = new AnimationQueue(dispatch);

      // Fisher-Yates for 3 items: 2 random calls
      // i=2: Math.random()=0.99 → j=2, swap [2]↔[2] (no-op) → [track1, track2, track3]
      // i=1: Math.random()=0.0 → j=0, swap [1]↔[0] → [track2, track1, track3]
      const randomSpy = vi.spyOn(Math, 'random');
      randomSpy
        .mockReturnValueOnce(0.99) // i=2: j=2
        .mockReturnValueOnce(0.0); // i=1: j=0

      const playlist = makePlaylist({
        playlistType: PlaylistType.Shuffle,
        tracks: [makeTrack('track1', 100), makeTrack('track2', 100), makeTrack('track3', 100)],
      });

      queue.addToQueue(playlist);

      // Shuffled order: track2, track1, track3
      expect(dispatch).toHaveBeenCalledWith('track2', []);

      vi.advanceTimersByTime(100);
      expect(dispatch).toHaveBeenCalledWith('track1', []);

      vi.advanceTimersByTime(100);
      expect(dispatch).toHaveBeenCalledWith('track3', []);

      expect(dispatch).toHaveBeenCalledTimes(3);

      // no more dispatches after all tracks played
      vi.advanceTimersByTime(100);
      expect(dispatch).toHaveBeenCalledTimes(3);

      randomSpy.mockRestore();
    });

    it('should add delay between tracks for ShuffleWithDelay', () => {
      const dispatch = vi.fn();
      const queue = new AnimationQueue(dispatch);

      const randomSpy = vi.spyOn(Math, 'random');
      // Fisher-Yates for 2 items: 1 random call
      // i=1: Math.random()=0.0 → j=0, swap [1]↔[0] → [track2, track1]
      randomSpy.mockReturnValueOnce(0.0);
      // Shuffle delay random — between 500-1500, 0.5 → 1000
      randomSpy.mockReturnValueOnce(0.5);

      const playlist = makePlaylist({
        playlistType: PlaylistType.ShuffleWithDelay,
        tracks: [makeTrack('track1', 200), makeTrack('track2', 200)],
        shuffleWaitMin: 500,
        shuffleWaitMax: 1500,
      });

      queue.addToQueue(playlist);

      // Shuffled order: track2, track1
      // track2 dispatched immediately (no delay before first track)
      expect(dispatch).toHaveBeenCalledTimes(1);
      expect(dispatch).toHaveBeenCalledWith('track2', []);

      // after track2 duration, delay starts (not dispatched yet)
      vi.advanceTimersByTime(200);
      expect(dispatch).toHaveBeenCalledTimes(1);

      // after shuffle delay (1000ms), track1 dispatched
      vi.advanceTimersByTime(1000);
      expect(dispatch).toHaveBeenCalledTimes(2);
      expect(dispatch).toHaveBeenCalledWith('track1', []);

      randomSpy.mockRestore();
    });
  });

  // ── Repeat ───────────────────────────────────────────────────

  describe('Repeat', () => {
    it('SequentialRepeatable with repeatsLeft=1 plays 2 total cycles', () => {
      const dispatch = vi.fn();
      const queue = new AnimationQueue(dispatch);

      const playlist = makePlaylist({
        playlistType: PlaylistType.SequentialRepeatable,
        tracks: [makeTrack('track1', 500), makeTrack('track2', 500)],
        repeatsLeft: 1,
      });

      queue.addToQueue(playlist);

      // Cycle 1: track1
      expect(dispatch).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(500);
      // Cycle 1: track2
      expect(dispatch).toHaveBeenCalledTimes(2);
      vi.advanceTimersByTime(500);

      // Cycle 2: track1 (repeat)
      expect(dispatch).toHaveBeenCalledTimes(3);
      vi.advanceTimersByTime(500);
      // Cycle 2: track2
      expect(dispatch).toHaveBeenCalledTimes(4);
      vi.advanceTimersByTime(500);

      // No cycle 3 — repeatsLeft was 1
      expect(dispatch).toHaveBeenCalledTimes(4);
    });

    it('SequentialRepeatable with repeatsLeft=-1 repeats indefinitely', () => {
      const dispatch = vi.fn();
      const queue = new AnimationQueue(dispatch);

      const playlist = makePlaylist({
        playlistType: PlaylistType.SequentialRepeatable,
        tracks: [makeTrack('track1', 1000)],
        repeatsLeft: -1,
      });

      queue.addToQueue(playlist);

      // Play at least 5 cycles
      for (let i = 0; i < 5; i++) {
        expect(dispatch).toHaveBeenCalledTimes(i + 1);
        vi.advanceTimersByTime(1000);
      }

      expect(dispatch).toHaveBeenCalledTimes(6);
    });

    it('ShuffleWithRepeat reshuffles and replays', () => {
      const dispatch = vi.fn();
      const queue = new AnimationQueue(dispatch);

      const randomSpy = vi.spyOn(Math, 'random');
      // Fisher-Yates for 3 items: 2 random calls per shuffle (i=2: j=floor(r*3), i=1: j=floor(r*2))
      // Pass 1: 0.0 → swap [0]↔[2], 0.99 → no swap → [track3, track2, track1]
      randomSpy.mockReturnValueOnce(0.0).mockReturnValueOnce(0.99);
      // Pass 2: 0.5 → swap [1]↔[2], 0.0 → swap [0]↔[1] → [track3, track1, track2]
      // (differs from both the unshuffled order and pass 1, so a pass that is
      // not reshuffled fails)
      randomSpy.mockReturnValueOnce(0.5).mockReturnValueOnce(0.0);

      const playlist = makePlaylist({
        playlistType: PlaylistType.ShuffleWithRepeat,
        tracks: [makeTrack('track1', 400), makeTrack('track2', 400), makeTrack('track3', 400)],
        repeatsLeft: 1,
      });

      queue.addToQueue(playlist);
      vi.advanceTimersByTime(5000); // 1.2 s passes — no padding

      expect(dispatchedIds(dispatch)).toEqual([
        'track3',
        'track2',
        'track1',
        'track3',
        'track1',
        'track2',
      ]);

      randomSpy.mockRestore();
    });
  });

  // ── Interruptible replacement ────────────────────────────────

  describe('Interruptible replacement', () => {
    it('SequentialInterruptible is replaced, current track finishes then new playlist starts', () => {
      const dispatch = vi.fn();
      const queue = new AnimationQueue(dispatch);

      const playlist1 = makePlaylist({
        id: 'interruptible-1',
        playlistType: PlaylistType.SequentialInterruptible,
        tracks: [makeTrack('old1', 1000), makeTrack('old2', 1000)],
      });

      const playlist2 = makePlaylist({
        id: 'new-playlist',
        playlistType: PlaylistType.Sequential,
        tracks: [makeTrack('new1', 500)],
      });

      queue.addToQueue(playlist1);
      expect(dispatch).toHaveBeenCalledWith('old1', []);

      // Add replacement while old1 is playing
      queue.addToQueue(playlist2);

      // old1 still playing, no new dispatch yet
      expect(dispatch).toHaveBeenCalledTimes(1);

      // old1 finishes — new playlist starts (not old2)
      vi.advanceTimersByTime(1000);
      expect(dispatch).toHaveBeenCalledTimes(2);
      expect(dispatch).toHaveBeenCalledWith('new1', []);
      expect(dispatch).not.toHaveBeenCalledWith('old2', []);
    });

    it('non-interruptible active, interruptible queued, then replaced by another', () => {
      const dispatch = vi.fn();
      const queue = new AnimationQueue(dispatch);

      const seqPlaylist = makePlaylist({
        id: 'seq',
        playlistType: PlaylistType.Sequential,
        tracks: [makeTrack('seq1', 500)],
      });

      const interruptible1 = makePlaylist({
        id: 'int1',
        playlistType: PlaylistType.SequentialInterruptible,
        tracks: [makeTrack('int1-track', 500)],
      });

      const interruptible2 = makePlaylist({
        id: 'int2',
        playlistType: PlaylistType.SequentialInterruptible,
        tracks: [makeTrack('int2-track', 500)],
      });

      queue.addToQueue(seqPlaylist);
      expect(dispatch).toHaveBeenCalledWith('seq1', []);

      // Queue interruptible — goes to back of queue
      queue.addToQueue(interruptible1);

      // Queue another interruptible — replaces interruptible1 in queue
      queue.addToQueue(interruptible2);

      // seq finishes → interruptible2 should start (not interruptible1)
      vi.advanceTimersByTime(500);
      expect(dispatch).toHaveBeenCalledTimes(2);
      expect(dispatch).toHaveBeenCalledWith('int2-track', []);
      expect(dispatch).not.toHaveBeenCalledWith('int1-track', []);
    });
  });

  // ── Queue ordering ───────────────────────────────────────────

  describe('Queue ordering', () => {
    it('multiple Sequential playlists play in FIFO order', () => {
      const dispatch = vi.fn();
      const queue = new AnimationQueue(dispatch);

      const playlist1 = makePlaylist({
        id: 'p1',
        playlistType: PlaylistType.Sequential,
        tracks: [makeTrack('p1-track', 100)],
      });

      const playlist2 = makePlaylist({
        id: 'p2',
        playlistType: PlaylistType.Sequential,
        tracks: [makeTrack('p2-track', 100)],
      });

      const playlist3 = makePlaylist({
        id: 'p3',
        playlistType: PlaylistType.Sequential,
        tracks: [makeTrack('p3-track', 100)],
      });

      queue.addToQueue(playlist1);
      queue.addToQueue(playlist2);
      queue.addToQueue(playlist3);

      expect(dispatch).toHaveBeenCalledWith('p1-track', []);

      vi.advanceTimersByTime(100);
      expect(dispatch).toHaveBeenCalledWith('p2-track', []);

      vi.advanceTimersByTime(100);
      expect(dispatch).toHaveBeenCalledWith('p3-track', []);

      expect(dispatch).toHaveBeenCalledTimes(3);
    });

    it('queued playlists each dispatch with their own locations', () => {
      const dispatch = vi.fn();
      const queue = new AnimationQueue(dispatch);
      const locA = makeLocations('loc-A');
      const locB = makeLocations('loc-B');
      queue.addToQueue(
        makePlaylist({
          id: 'A',
          playlistType: PlaylistType.Sequential,
          locations: locA,
          tracks: [makeTrack('a', 100)],
        }),
      );
      queue.addToQueue(
        makePlaylist({
          id: 'B',
          playlistType: PlaylistType.Sequential,
          locations: locB,
          tracks: [makeTrack('b', 100)],
        }),
      );
      vi.advanceTimersByTime(1000);

      expect(dispatch.mock.calls).toEqual([
        ['a', locA],
        ['b', locB],
      ]);
    });

    it('only one interruptible item in queue at a time', () => {
      const dispatch = vi.fn();
      const queue = new AnimationQueue(dispatch);

      const seq = makePlaylist({
        id: 'seq',
        playlistType: PlaylistType.Sequential,
        tracks: [makeTrack('seq1', 500)],
      });

      // Use SequentialInterruptible to avoid needing shuffle mocks
      const intA = makePlaylist({
        id: 'intA',
        playlistType: PlaylistType.SequentialInterruptible,
        tracks: [makeTrack('a-track', 100)],
      });

      const intB = makePlaylist({
        id: 'intB',
        playlistType: PlaylistType.SequentialInterruptible,
        tracks: [makeTrack('b-track', 100)],
      });

      queue.addToQueue(seq);
      queue.addToQueue(intA);
      queue.addToQueue(intB); // replaces intA in queue

      vi.advanceTimersByTime(500);
      expect(dispatch).toHaveBeenCalledWith('b-track', []);
      expect(dispatch).not.toHaveBeenCalledWith('a-track', []);
    });
  });

  // ── Panic stop ───────────────────────────────────────────────

  describe('Panic stop', () => {
    it('cancels timeout and prevents further dispatches', () => {
      const dispatch = vi.fn();
      const queue = new AnimationQueue(dispatch);

      const playlist = makePlaylist({
        playlistType: PlaylistType.Sequential,
        tracks: [makeTrack('track1', 1000), makeTrack('track2', 500)],
      });

      queue.addToQueue(playlist);
      expect(dispatch).toHaveBeenCalledTimes(1);

      // Panic stop mid-track
      queue.panicStop();

      // Advance past all durations — track2 should never dispatch
      vi.advanceTimersByTime(5000);
      expect(dispatch).toHaveBeenCalledTimes(1);
    });

    it('rejects items added while in panic', () => {
      const dispatch = vi.fn();
      const queue = new AnimationQueue(dispatch);

      queue.panicStop();

      const playlist = makePlaylist({
        playlistType: PlaylistType.Sequential,
        tracks: [makeTrack('track1', 100)],
      });

      queue.addToQueue(playlist);
      expect(dispatch).toHaveBeenCalledTimes(0);
      expect(queue.activePlaylist).toBeNull();
    });

    it('clearPanicStop allows new items to be queued', () => {
      const dispatch = vi.fn();
      const queue = new AnimationQueue(dispatch);

      queue.panicStop();
      queue.clearPanicStop();

      const playlist = makePlaylist({
        playlistType: PlaylistType.Sequential,
        tracks: [makeTrack('track1', 100)],
      });

      queue.addToQueue(playlist);
      expect(dispatch).toHaveBeenCalledTimes(1);
      expect(dispatch).toHaveBeenCalledWith('track1', []);
    });
  });

  // ── Edge cases ───────────────────────────────────────────────

  describe('Edge cases', () => {
    it('empty playlist is skipped, advances to next in queue', () => {
      const dispatch = vi.fn();
      const queue = new AnimationQueue(dispatch);

      const emptyPlaylist = makePlaylist({
        id: 'empty',
        playlistType: PlaylistType.Sequential,
        tracks: [],
      });

      const realPlaylist = makePlaylist({
        id: 'real',
        playlistType: PlaylistType.Sequential,
        tracks: [makeTrack('real-track', 100)],
      });

      queue.addToQueue(emptyPlaylist);
      // Empty playlist should be skipped but we need the second one queued
      // Since emptyPlaylist becomes active and has no tracks, it advances.
      // But realPlaylist isn't queued yet. Let's test with both queued.

      // Reset
      const dispatch2 = vi.fn();
      const queue2 = new AnimationQueue(dispatch2);

      queue2.addToQueue(emptyPlaylist);
      // emptyPlaylist becomes active, has no tracks → advances → queue is empty → idle
      expect(dispatch2).toHaveBeenCalledTimes(0);

      // Now add a real playlist — it should start immediately since queue is idle

      queue2.addToQueue(realPlaylist);
      expect(dispatch2).toHaveBeenCalledTimes(1);
      expect(dispatch2).toHaveBeenCalledWith('real-track', []);
    });

    it('single-track playlist dispatches once then done', () => {
      const dispatch = vi.fn();
      const queue = new AnimationQueue(dispatch);

      const playlist = makePlaylist({
        playlistType: PlaylistType.Sequential,
        tracks: [makeTrack('only-track', 200)],
      });

      queue.addToQueue(playlist);
      expect(dispatch).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(200);
      expect(dispatch).toHaveBeenCalledTimes(1);
      expect(queue.activePlaylist).toBeNull();
    });
  });

  describe('panic state observability', () => {
    it('getPanicState reflects panicStop / clearPanicStop', () => {
      const queue = new AnimationQueue(vi.fn());
      expect(queue.getPanicState()).toEqual({ inPanicStop: false });
      queue.panicStop();
      expect(queue.getPanicState()).toEqual({ inPanicStop: true });
      queue.clearPanicStop();
      expect(queue.getPanicState()).toEqual({ inPanicStop: false });
    });

    it('notifies subscribers on panicStop and clearPanicStop', () => {
      const queue = new AnimationQueue(vi.fn());
      const seen: boolean[] = [];
      queue.subscribe((s) => seen.push(s.inPanicStop));
      queue.panicStop();
      queue.clearPanicStop();
      expect(seen).toEqual([true, false]);
    });

    it('unsubscribe stops notifications', () => {
      const queue = new AnimationQueue(vi.fn());
      const seen: boolean[] = [];
      const off = queue.subscribe((s) => seen.push(s.inPanicStop));
      off();
      queue.panicStop();
      expect(seen).toEqual([]);
    });

    it('a throwing subscriber does not stop other subscribers or block the state change', () => {
      // The per-listener try/catch in notifyPanic is load-bearing: if it were
      // moved outside the loop, one bad WS-broadcast subscriber would silently
      // drop panic notifications to every other client. Reverting that guard
      // makes this fail (mutation-test the defensive feature).
      const queue = new AnimationQueue(vi.fn());
      const seen: boolean[] = [];
      queue.subscribe(() => {
        throw new Error('boom');
      });
      queue.subscribe((s) => seen.push(s.inPanicStop));
      queue.panicStop();
      expect(seen).toEqual([true]); // second listener still ran
      expect(queue.getPanicState()).toEqual({ inPanicStop: true }); // state still set
    });
  });

  // ── Repeat with nested tracks ────────────────────────────────

  describe('Repeat with nested tracks', () => {
    it('replays nested tracks on every pass', () => {
      const dispatch = vi.fn();
      const queue = new AnimationQueue(dispatch);

      queue.addToQueue(
        makePlaylist({
          playlistType: PlaylistType.SequentialRepeatable,
          tracks: [makeTrack('s1', 100), [makeTrack('n1', 100), makeTrack('n2', 100)]],
          repeatsLeft: 1,
        }),
      );
      vi.advanceTimersByTime(3000);

      expect(dispatchedIds(dispatch)).toEqual(['s1', 'n1', 'n2', 's1', 'n1', 'n2']);
    });

    it('keeps cycling a nested-only playlist on infinite repeat without throwing', () => {
      const dispatch = vi.fn();
      const queue = new AnimationQueue(dispatch);

      queue.addToQueue(
        makePlaylist({
          playlistType: PlaylistType.SequentialRepeatable,
          tracks: [[makeTrack('n1', 500), makeTrack('n2', 500)]],
          repeatsLeft: -1,
        }),
      );

      // Emptied nested arrays used to recurse into a stack overflow inside the
      // timer callback. buildPass and the repeat padding would now stop that
      // too, so the dispatch list below is what pins T-003's copy-on-begin.
      expect(() => vi.advanceTimersByTime(5000)).not.toThrow();
      // t = 0, 500, …, 5000 → 11 dispatches alternating n1, n2 (1 s passes).
      expect(dispatchedIds(dispatch)).toEqual([
        'n1',
        'n2',
        'n1',
        'n2',
        'n1',
        'n2',
        'n1',
        'n2',
        'n1',
        'n2',
        'n1',
      ]);
    });
  });

  // ── Interrupt during a nested track ──────────────────────────

  describe('Interrupt during a nested track', () => {
    // A nested playlist is one track in the editor (which only offers
    // Sequential playlists as nested tracks), so a replacement waits for its
    // last sub-track.
    it('finishes the nested track first, dispatching its sub-tracks with the original locations', () => {
      const dispatch = vi.fn();
      const queue = new AnimationQueue(dispatch);
      const locA = makeLocations('loc-A');
      const locX = makeLocations('loc-X');

      queue.addToQueue(
        makePlaylist({
          id: 'A',
          playlistType: PlaylistType.SequentialInterruptible,
          locations: locA,
          tracks: [
            [makeTrack('n1', 100), makeTrack('n2', 100), makeTrack('n3', 100)],
            makeTrack('c', 100),
          ],
        }),
      );
      vi.advanceTimersByTime(50);
      queue.addToQueue(makeScriptItem('X', 100, locX));
      vi.advanceTimersByTime(1000);

      expect(dispatch.mock.calls).toEqual([
        ['n1', locA],
        ['n2', locA],
        ['n3', locA],
        ['X', locX],
      ]);
    });

    it('switches at the end of the last sub-track when interrupted during it', () => {
      const dispatch = vi.fn();
      const queue = new AnimationQueue(dispatch);

      queue.addToQueue(
        makePlaylist({
          playlistType: PlaylistType.SequentialInterruptible,
          tracks: [[makeTrack('n1', 100), makeTrack('n2', 100)], makeTrack('c', 100)],
        }),
      );
      vi.advanceTimersByTime(150); // n2 playing
      queue.addToQueue(makeScriptItem('X', 100));
      vi.advanceTimersByTime(49);
      expect(dispatchedIds(dispatch)).toEqual(['n1', 'n2']);
      vi.advanceTimersByTime(1);
      expect(dispatchedIds(dispatch)).toEqual(['n1', 'n2', 'X']);

      vi.advanceTimersByTime(1000);
      expect(dispatchedIds(dispatch)).toEqual(['n1', 'n2', 'X']);
    });
  });

  // ── Shuffle gaps ─────────────────────────────────────────────

  describe('Shuffle gaps', () => {
    // Math.random 0.99 keeps Fisher-Yates order (j === i) and, with
    // shuffleWaitMin === shuffleWaitMax, the gap is exactly that value.
    let randomSpy: ReturnType<typeof vi.spyOn>;
    beforeEach(() => {
      randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.99);
    });
    afterEach(() => {
      randomSpy.mockRestore();
    });

    it('starts a replacement queued during a gap when the gap ends, never the pre-picked track', () => {
      const dispatch = vi.fn();
      const queue = new AnimationQueue(dispatch);

      queue.addToQueue(
        makePlaylist({
          playlistType: PlaylistType.ShuffleWithDelay,
          tracks: [makeTrack('a', 100), makeTrack('b', 100)],
          shuffleWaitMin: 1000,
          shuffleWaitMax: 1000,
        }),
      );
      vi.advanceTimersByTime(500); // a ended at 100; in the gap until 1100
      queue.addToQueue(makeScriptItem('X', 100));

      vi.advanceTimersByTime(599);
      expect(dispatchedIds(dispatch)).toEqual(['a']);
      vi.advanceTimersByTime(1);
      expect(dispatchedIds(dispatch)).toEqual(['a', 'X']);

      vi.advanceTimersByTime(5000);
      expect(dispatchedIds(dispatch)).toEqual(['a', 'X']);
    });

    it('waits a gap before the first track of each repeat pass', () => {
      const dispatch = vi.fn();
      const queue = new AnimationQueue(dispatch);

      queue.addToQueue(
        makePlaylist({
          playlistType: PlaylistType.ShuffleWithDelayAndRepeat,
          tracks: [makeTrack('a', 100), makeTrack('b', 100)],
          repeatsLeft: 1,
          shuffleWaitMin: 1000,
          shuffleWaitMax: 1000,
        }),
      );
      // Pass 1: a at 0, gap, b at 1100 (ends 1200). Pass 2 must wait the gap too.
      vi.advanceTimersByTime(2199);
      expect(dispatchedIds(dispatch)).toEqual(['a', 'b']);
      vi.advanceTimersByTime(1);
      expect(dispatchedIds(dispatch)).toEqual(['a', 'b', 'a']);
      vi.advanceTimersByTime(1100);
      expect(dispatchedIds(dispatch)).toEqual(['a', 'b', 'a', 'b']);
      // No trailing gap: idle as soon as the final track ends (3300 + 100).
      vi.advanceTimersByTime(100);
      expect(queue.activePlaylist).toBeNull();

      vi.advanceTimersByTime(5000);
      expect(dispatchedIds(dispatch)).toEqual(['a', 'b', 'a', 'b']);
    });

    it('starts a replacement queued in the repeat-boundary gap when the gap ends; the next pass never starts', () => {
      const dispatch = vi.fn();
      const queue = new AnimationQueue(dispatch);

      queue.addToQueue(
        makePlaylist({
          playlistType: PlaylistType.ShuffleWithDelayAndRepeat,
          tracks: [makeTrack('a', 100)],
          repeatsLeft: -1,
          shuffleWaitMin: 1000,
          shuffleWaitMax: 1000,
        }),
      );
      vi.advanceTimersByTime(500); // a ended at 100; boundary gap until 1100
      queue.addToQueue(makeScriptItem('X', 100));

      vi.advanceTimersByTime(599);
      expect(dispatchedIds(dispatch)).toEqual(['a']);
      vi.advanceTimersByTime(1);
      expect(dispatchedIds(dispatch)).toEqual(['a', 'X']);

      vi.advanceTimersByTime(5000);
      expect(dispatchedIds(dispatch)).toEqual(['a', 'X']);
    });
  });

  // ── Replacement flag ─────────────────────────────────────────

  describe('Replacement flag', () => {
    // A script or Sequential interrupter plays the same whether it is taken
    // over or merely picked next; repeat and delay interrupters expose whether
    // the takeover happened and whether the flag was cleared afterwards.
    let randomSpy: ReturnType<typeof vi.spyOn>;
    beforeEach(() => {
      randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.99);
    });
    afterEach(() => {
      randomSpy.mockRestore();
    });

    function playInterruptible(queue: AnimationQueue) {
      queue.addToQueue(
        makePlaylist({
          id: 'A',
          playlistType: PlaylistType.SequentialInterruptible,
          tracks: [makeTrack('a1', 1000), makeTrack('a2', 1000)],
        }),
      );
    }

    it('a repeatable interrupter keeps its repeat passes', () => {
      const dispatch = vi.fn();
      const queue = new AnimationQueue(dispatch);
      playInterruptible(queue);
      vi.advanceTimersByTime(500);
      queue.addToQueue(
        makePlaylist({
          id: 'B',
          playlistType: PlaylistType.SequentialRepeatable,
          tracks: [makeTrack('b1', 1000)],
          repeatsLeft: 1,
        }),
      );

      vi.advanceTimersByTime(500); // a1 ends at 1000 → b1
      expect(dispatchedIds(dispatch)).toEqual(['a1', 'b1']);
      vi.advanceTimersByTime(1000); // pass 2
      expect(dispatchedIds(dispatch)).toEqual(['a1', 'b1', 'b1']);
      vi.advanceTimersByTime(5000);
      expect(dispatchedIds(dispatch)).toEqual(['a1', 'b1', 'b1']);
      expect(queue.activePlaylist).toBeNull();
    });

    it('a delay-type interrupter starts with its first track and keeps its gaps', () => {
      const dispatch = vi.fn();
      const queue = new AnimationQueue(dispatch);
      playInterruptible(queue);
      vi.advanceTimersByTime(500);
      queue.addToQueue(
        makePlaylist({
          id: 'B',
          playlistType: PlaylistType.ShuffleWithDelay,
          tracks: [makeTrack('b1', 100), makeTrack('b2', 100)],
          shuffleWaitMin: 1000,
          shuffleWaitMax: 1000,
        }),
      );

      vi.advanceTimersByTime(500); // a1 ends at 1000 → b1
      expect(dispatchedIds(dispatch)).toEqual(['a1', 'b1']);
      vi.advanceTimersByTime(1099); // b1 ends 1100, gap until 2100
      expect(dispatchedIds(dispatch)).toEqual(['a1', 'b1']);
      vi.advanceTimersByTime(1);
      expect(dispatchedIds(dispatch)).toEqual(['a1', 'b1', 'b2']);
    });

    it('a playlist started after an interrupt repeats normally', () => {
      const dispatch = vi.fn();
      const queue = new AnimationQueue(dispatch);
      playInterruptible(queue);
      vi.advanceTimersByTime(500);
      queue.addToQueue(makeScriptItem('X', 100));
      vi.advanceTimersByTime(5000);
      expect(dispatchedIds(dispatch)).toEqual(['a1', 'X']);
      expect(queue.activePlaylist).toBeNull();

      queue.addToQueue(
        makePlaylist({
          id: 'R',
          playlistType: PlaylistType.SequentialRepeatable,
          tracks: [makeTrack('r', 100)],
          repeatsLeft: 2,
        }),
      );
      vi.advanceTimersByTime(5000);

      expect(dispatchedIds(dispatch)).toEqual(['a1', 'X', 'r', 'r', 'r']);
    });

    it('a delay-type replacement queued in the repeat-boundary gap keeps its own first gap', () => {
      const dispatch = vi.fn();
      const queue = new AnimationQueue(dispatch);
      queue.addToQueue(
        makePlaylist({
          playlistType: PlaylistType.ShuffleWithDelayAndRepeat,
          tracks: [makeTrack('a', 100)],
          repeatsLeft: -1,
          shuffleWaitMin: 1000,
          shuffleWaitMax: 1000,
        }),
      );
      vi.advanceTimersByTime(500); // a ended at 100; boundary gap until 1100
      queue.addToQueue(
        makePlaylist({
          id: 'B',
          playlistType: PlaylistType.ShuffleWithDelay,
          tracks: [makeTrack('b1', 100), makeTrack('b2', 100)],
          shuffleWaitMin: 2000,
          shuffleWaitMax: 2000,
        }),
      );

      vi.advanceTimersByTime(600); // gap ends at 1100 → b1
      expect(dispatchedIds(dispatch)).toEqual(['a', 'b1']);
      vi.advanceTimersByTime(2099); // b1 ends 1200, gap until 3200
      expect(dispatchedIds(dispatch)).toEqual(['a', 'b1']);
      vi.advanceTimersByTime(1);
      expect(dispatchedIds(dispatch)).toEqual(['a', 'b1', 'b2']);
    });
  });

  // ── Interrupt matrix ─────────────────────────────────────────

  describe('Interrupt matrix', () => {
    // 0.99 keeps shuffle order; min === max makes a delay type's gap exact.
    let randomSpy: ReturnType<typeof vi.spyOn>;
    beforeEach(() => {
      randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.99);
    });
    afterEach(() => {
      randomSpy.mockRestore();
    });

    it.each([
      [PlaylistType.SequentialInterruptible, 'no repeat', 0],
      [PlaylistType.SequentialRepeatable, 'count 2', 2],
      [PlaylistType.SequentialRepeatable, 'infinite', -1],
      [PlaylistType.Shuffle, 'no repeat', 0],
      [PlaylistType.ShuffleWithRepeat, 'count 2', 2],
      [PlaylistType.ShuffleWithRepeat, 'infinite', -1],
      [PlaylistType.ShuffleWithDelay, 'no repeat', 0],
      [PlaylistType.ShuffleWithDelayAndRepeat, 'count 2', 2],
      [PlaylistType.ShuffleWithDelayAndRepeat, 'infinite', -1],
    ] as const)(
      '%s, %s: a script queued mid-track starts when the track ends and the playlist never returns',
      (type, _label, repeatsLeft) => {
        const dispatch = vi.fn();
        const queue = new AnimationQueue(dispatch);

        queue.addToQueue(
          makePlaylist({
            playlistType: type,
            tracks: [makeTrack('a', 1000), makeTrack('b', 1000)],
            repeatsLeft,
            shuffleWaitMin: 1000,
            shuffleWaitMax: 1000,
          }),
        );
        vi.advanceTimersByTime(500);
        queue.addToQueue(makeScriptItem('X', 300));

        vi.advanceTimersByTime(499);
        expect(dispatchedIds(dispatch)).toEqual(['a']);
        vi.advanceTimersByTime(1);
        expect(dispatchedIds(dispatch)).toEqual(['a', 'X']);

        vi.advanceTimersByTime(20000);
        expect(dispatchedIds(dispatch)).toEqual(['a', 'X']);
        expect(queue.activePlaylist).toBeNull();
      },
    );

    it('Sequential: a script queued mid-track waits for the whole playlist', () => {
      const dispatch = vi.fn();
      const queue = new AnimationQueue(dispatch);

      queue.addToQueue(
        makePlaylist({
          playlistType: PlaylistType.Sequential,
          tracks: [makeTrack('a', 1000), makeTrack('b', 1000)],
        }),
      );
      vi.advanceTimersByTime(500);
      queue.addToQueue(makeScriptItem('X', 300));

      vi.advanceTimersByTime(1499);
      expect(dispatchedIds(dispatch)).toEqual(['a', 'b']);
      vi.advanceTimersByTime(1);
      expect(dispatchedIds(dispatch)).toEqual(['a', 'b', 'X']);
    });
  });

  // ── Interrupt timing ─────────────────────────────────────────

  describe('Interrupt timing', () => {
    it('during a Wait track: switches when the wait ends', () => {
      const dispatch = vi.fn();
      const queue = new AnimationQueue(dispatch);

      queue.addToQueue(
        makePlaylist({
          playlistType: PlaylistType.SequentialInterruptible,
          tracks: [makeTrack('a', 100), makeTrack('wait', 1000, true), makeTrack('b', 100)],
        }),
      );
      vi.advanceTimersByTime(500);
      queue.addToQueue(makeScriptItem('X', 100));

      vi.advanceTimersByTime(599);
      expect(dispatchedIds(dispatch)).toEqual(['a']);
      vi.advanceTimersByTime(1);
      expect(dispatchedIds(dispatch)).toEqual(['a', 'X']);
      vi.advanceTimersByTime(5000);
      expect(dispatchedIds(dispatch)).toEqual(['a', 'X']);
    });

    it('on the last track of the final pass: switches at that track end', () => {
      const dispatch = vi.fn();
      const queue = new AnimationQueue(dispatch);

      queue.addToQueue(
        makePlaylist({
          playlistType: PlaylistType.SequentialRepeatable,
          tracks: [makeTrack('a', 500), makeTrack('b', 500)],
          repeatsLeft: 1,
        }),
      );
      vi.advanceTimersByTime(1750); // pass 2's b plays 1500–2000
      queue.addToQueue(makeScriptItem('X', 100));

      vi.advanceTimersByTime(249);
      expect(dispatchedIds(dispatch)).toEqual(['a', 'b', 'a', 'b']);
      vi.advanceTimersByTime(1);
      expect(dispatchedIds(dispatch)).toEqual(['a', 'b', 'a', 'b', 'X']);
      vi.advanceTimersByTime(5000);
      expect(dispatchedIds(dispatch)).toEqual(['a', 'b', 'a', 'b', 'X']);
    });
  });

  // ── Interrupter kind ─────────────────────────────────────────

  describe('Interrupter kind', () => {
    function playInterruptible(queue: AnimationQueue) {
      queue.addToQueue(
        makePlaylist({
          id: 'A',
          playlistType: PlaylistType.SequentialInterruptible,
          tracks: [makeTrack('a1', 1000), makeTrack('a2', 1000)],
        }),
      );
    }

    it('a Sequential playlist replaces an interruptible one and plays through', () => {
      const dispatch = vi.fn();
      const queue = new AnimationQueue(dispatch);
      playInterruptible(queue);

      vi.advanceTimersByTime(500);
      queue.addToQueue(
        makePlaylist({
          id: 'P',
          playlistType: PlaylistType.Sequential,
          tracks: [makeTrack('p1', 100), makeTrack('p2', 100)],
        }),
      );
      vi.advanceTimersByTime(5000);

      expect(dispatchedIds(dispatch)).toEqual(['a1', 'p1', 'p2']);
    });

    it('an interruptible replacement can itself be interrupted', () => {
      const dispatch = vi.fn();
      const queue = new AnimationQueue(dispatch);
      playInterruptible(queue);

      vi.advanceTimersByTime(500);
      queue.addToQueue(
        makePlaylist({
          id: 'B',
          playlistType: PlaylistType.SequentialInterruptible,
          tracks: [makeTrack('b1', 1000), makeTrack('b2', 1000)],
        }),
      );
      vi.advanceTimersByTime(1000); // b1 started at 1000
      queue.addToQueue(makeScriptItem('X', 100));
      vi.advanceTimersByTime(5000);

      expect(dispatchedIds(dispatch)).toEqual(['a1', 'b1', 'X']);
    });

    it('two arrivals in one track: a later item replaces a pending interruptible replacement', () => {
      const dispatch = vi.fn();
      const queue = new AnimationQueue(dispatch);
      playInterruptible(queue);

      vi.advanceTimersByTime(300);
      queue.addToQueue(
        makePlaylist({
          id: 'B',
          playlistType: PlaylistType.SequentialInterruptible,
          tracks: [makeTrack('b1', 100)],
        }),
      );
      vi.advanceTimersByTime(300);
      queue.addToQueue(makeScriptItem('X', 100));
      vi.advanceTimersByTime(5000);

      expect(dispatchedIds(dispatch)).toEqual(['a1', 'X']);
    });

    it('two arrivals in one track: a later item queues behind a pending Sequential replacement', () => {
      const dispatch = vi.fn();
      const queue = new AnimationQueue(dispatch);
      playInterruptible(queue);

      vi.advanceTimersByTime(300);
      queue.addToQueue(makeScriptItem('X', 100));
      vi.advanceTimersByTime(300);
      queue.addToQueue(makeScriptItem('Y', 100));

      vi.advanceTimersByTime(400); // a1 ends at 1000
      expect(dispatchedIds(dispatch)).toEqual(['a1', 'X']);
      vi.advanceTimersByTime(100);
      expect(dispatchedIds(dispatch)).toEqual(['a1', 'X', 'Y']);
      vi.advanceTimersByTime(5000);
      expect(dispatchedIds(dispatch)).toEqual(['a1', 'X', 'Y']);
    });
  });

  // ── Panic interleavings ──────────────────────────────────────

  describe('Panic interleavings', () => {
    let randomSpy: ReturnType<typeof vi.spyOn>;
    beforeEach(() => {
      randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.99);
    });
    afterEach(() => {
      randomSpy.mockRestore();
    });

    // panicStop must leave no pending timer. Recovery then happens *before*
    // the interrupted playlist's deadline, with a delay-type item: a gap timer
    // kept outside currentTimeout would dispatch the old playlist's pre-picked
    // track, and a replacement flag panicStop failed to reset would skip the
    // recovery item's gap (r2 at +2000, not +3000).
    function expectCleanRecovery(
      queue: AnimationQueue,
      dispatch: ReturnType<typeof vi.fn>,
      before: string[],
    ) {
      queue.panicStop();
      expect(vi.getTimerCount()).toBe(0);
      vi.advanceTimersByTime(10);
      expect(dispatchedIds(dispatch)).toEqual(before);

      queue.clearPanicStop();
      queue.addToQueue(
        makePlaylist({
          id: 'R',
          playlistType: PlaylistType.ShuffleWithDelay,
          tracks: [makeTrack('r1', 2000), makeTrack('r2', 100)],
          shuffleWaitMin: 1000,
          shuffleWaitMax: 1000,
        }),
      );
      expect(dispatchedIds(dispatch)).toEqual([...before, 'r1']);
      vi.advanceTimersByTime(2999);
      expect(dispatchedIds(dispatch)).toEqual([...before, 'r1']);
      vi.advanceTimersByTime(1);
      expect(dispatchedIds(dispatch)).toEqual([...before, 'r1', 'r2']);

      vi.advanceTimersByTime(10000);
      expect(dispatchedIds(dispatch)).toEqual([...before, 'r1', 'r2']);
    }

    it('during a shuffle gap', () => {
      const dispatch = vi.fn();
      const queue = new AnimationQueue(dispatch);
      queue.addToQueue(
        makePlaylist({
          playlistType: PlaylistType.ShuffleWithDelay,
          tracks: [makeTrack('a', 100), makeTrack('b', 100)],
          shuffleWaitMin: 1000,
          shuffleWaitMax: 1000,
        }),
      );
      vi.advanceTimersByTime(500); // in the gap

      expectCleanRecovery(queue, dispatch, ['a']);
    });

    it('during a Wait track', () => {
      const dispatch = vi.fn();
      const queue = new AnimationQueue(dispatch);
      queue.addToQueue(
        makePlaylist({
          playlistType: PlaylistType.SequentialInterruptible,
          tracks: [makeTrack('a', 100), makeTrack('wait', 1000, true), makeTrack('b', 100)],
        }),
      );
      vi.advanceTimersByTime(500);

      expectCleanRecovery(queue, dispatch, ['a']);
    });

    it('mid-nested track', () => {
      const dispatch = vi.fn();
      const queue = new AnimationQueue(dispatch);
      queue.addToQueue(
        makePlaylist({
          playlistType: PlaylistType.SequentialInterruptible,
          tracks: [[makeTrack('n1', 100), makeTrack('n2', 100), makeTrack('n3', 100)]],
        }),
      );
      vi.advanceTimersByTime(50);

      expectCleanRecovery(queue, dispatch, ['n1']);
    });

    it('with a replacement pending', () => {
      const dispatch = vi.fn();
      const queue = new AnimationQueue(dispatch);
      queue.addToQueue(
        makePlaylist({
          playlistType: PlaylistType.SequentialInterruptible,
          tracks: [makeTrack('a1', 1000), makeTrack('a2', 1000)],
        }),
      );
      vi.advanceTimersByTime(300);
      queue.addToQueue(
        makePlaylist({
          id: 'B',
          playlistType: PlaylistType.SequentialInterruptible,
          tracks: [makeTrack('b1', 100)],
        }),
      );
      vi.advanceTimersByTime(300);

      expectCleanRecovery(queue, dispatch, ['a1']);
    });
  });

  // ── Repeat counts and non-repeat types ───────────────────────

  describe('Repeat counts and non-repeat types', () => {
    let randomSpy: ReturnType<typeof vi.spyOn>;
    beforeEach(() => {
      randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.99);
    });
    afterEach(() => {
      randomSpy.mockRestore();
    });

    it('repeatsLeft 2 plays three passes', () => {
      const dispatch = vi.fn();
      const queue = new AnimationQueue(dispatch);
      queue.addToQueue(
        makePlaylist({
          playlistType: PlaylistType.SequentialRepeatable,
          tracks: [makeTrack('a', 100)],
          repeatsLeft: 2,
        }),
      );
      vi.advanceTimersByTime(5000);

      expect(dispatchedIds(dispatch)).toEqual(['a', 'a', 'a']);
      expect(queue.activePlaylist).toBeNull();
    });

    it('a nested-only playlist on infinite repeat is interruptible after its nested track', () => {
      const dispatch = vi.fn();
      const queue = new AnimationQueue(dispatch);
      queue.addToQueue(
        makePlaylist({
          playlistType: PlaylistType.SequentialRepeatable,
          tracks: [[makeTrack('n1', 500), makeTrack('n2', 500)]],
          repeatsLeft: -1,
        }),
      );
      vi.advanceTimersByTime(1250); // pass 2's n1 plays 1000–1500
      queue.addToQueue(makeScriptItem('X', 100));
      vi.advanceTimersByTime(5000);

      expect(dispatchedIds(dispatch)).toEqual(['n1', 'n2', 'n1', 'n2', 'X']);
    });

    it.each([
      PlaylistType.Sequential,
      PlaylistType.SequentialInterruptible,
      PlaylistType.Shuffle,
      PlaylistType.ShuffleWithDelay,
    ])('%s ignores repeatsLeft -1 and plays one pass', (type) => {
      const dispatch = vi.fn();
      const queue = new AnimationQueue(dispatch);
      queue.addToQueue(
        makePlaylist({
          playlistType: type,
          tracks: [makeTrack('a', 100), makeTrack('b', 100)],
          repeatsLeft: -1,
          shuffleWaitMin: 1000,
          shuffleWaitMax: 1000,
        }),
      );
      vi.advanceTimersByTime(10000);

      expect(dispatchedIds(dispatch)).toEqual(['a', 'b']);
      expect(queue.activePlaylist).toBeNull();
    });

    // The converter fills shuffleWaitMin/Max from the settings for every type,
    // so stale delay settings reach the queue; only the delay types wait their stored delay.
    it.each([
      PlaylistType.Sequential,
      PlaylistType.SequentialInterruptible,
      PlaylistType.SequentialRepeatable,
      PlaylistType.Shuffle,
      PlaylistType.ShuffleWithRepeat,
    ])('%s never waits between tracks, even with delay settings stored', (type) => {
      const dispatch = vi.fn();
      const queue = new AnimationQueue(dispatch);
      queue.addToQueue(
        makePlaylist({
          playlistType: type,
          tracks: [makeTrack('a', 100), makeTrack('b', 100)],
          shuffleWaitMin: 1000,
          shuffleWaitMax: 1000,
        }),
      );
      vi.advanceTimersByTime(100);

      expect(dispatchedIds(dispatch)).toEqual(['a', 'b']);
    });

    it.each([PlaylistType.SequentialRepeatable, PlaylistType.ShuffleWithRepeat])(
      '%s starts the next 1 s pass immediately, even with delay settings stored',
      (type) => {
        const dispatch = vi.fn();
        const queue = new AnimationQueue(dispatch);
        queue.addToQueue(
          makePlaylist({
            playlistType: type,
            tracks: [makeTrack('a', 1000)],
            repeatsLeft: 1,
            shuffleWaitMin: 500,
            shuffleWaitMax: 500,
          }),
        );
        vi.advanceTimersByTime(1000);

        expect(dispatchedIds(dispatch)).toEqual(['a', 'a']);
      },
    );

    it('an empty playlist on infinite repeat goes idle', () => {
      const dispatch = vi.fn();
      const queue = new AnimationQueue(dispatch);

      // addToQueue catches and logs, so assert on the log, not on a throw.
      const errorSpy = vi.spyOn(logger, 'error');
      try {
        queue.addToQueue(
          makePlaylist({
            playlistType: PlaylistType.SequentialRepeatable,
            tracks: [],
            repeatsLeft: -1,
          }),
        );
        vi.advanceTimersByTime(1000);

        expect(errorSpy).not.toHaveBeenCalled();
        expect(dispatch).not.toHaveBeenCalled();
        expect(queue.activePlaylist).toBeNull();
      } finally {
        errorSpy.mockRestore();
      }
    });
  });

  // ── Empty nested tracks ──────────────────────────────────────

  describe('Empty nested tracks', () => {
    // beginTrack([]) calls playNextTrack synchronously; on infinite repeat an
    // empty nested array recursed into a RangeError that addToQueue's catch
    // swallowed, leaving the queue stuck with no timer.
    it('a playlist of only an empty nested track goes idle without an error', () => {
      const dispatch = vi.fn();
      const queue = new AnimationQueue(dispatch);
      const errorSpy = vi.spyOn(logger, 'error');
      try {
        queue.addToQueue(
          makePlaylist({
            playlistType: PlaylistType.SequentialRepeatable,
            tracks: [[]],
            repeatsLeft: -1,
          }),
        );

        expect(errorSpy).not.toHaveBeenCalled();
        expect(queue.activePlaylist).toBeNull();
        expect(vi.getTimerCount()).toBe(0);
        expect(dispatch).not.toHaveBeenCalled();
      } finally {
        errorSpy.mockRestore();
      }
    });

    it('skips an empty nested track on every pass without changing the playlist', () => {
      const dispatch = vi.fn();
      const queue = new AnimationQueue(dispatch);
      const tracks: Array<QueueTrack | QueueTrack[]> = [[], makeTrack('a', 1000)];
      queue.addToQueue(
        makePlaylist({
          playlistType: PlaylistType.SequentialRepeatable,
          tracks,
          repeatsLeft: 1,
        }),
      );
      vi.advanceTimersByTime(5000);

      expect(dispatchedIds(dispatch)).toEqual(['a', 'a']);
      expect(queue.activePlaylist).toBeNull();
      expect(tracks).toHaveLength(2);
      expect(tracks[0]).toEqual([]);
    });
  });

  // ── Malformed repeatsLeft ────────────────────────────────────

  describe('Malformed repeatsLeft', () => {
    // Settings reach the converter unvalidated, so repeatsLeft can be anything;
    // only -1 means infinite.
    it.each([
      ['undefined', undefined],
      ['NaN', NaN],
      ['-2', -2],
      ['1.5', 1.5],
    ])('repeatsLeft %s plays one pass and warns once', (label, repeatsLeft) => {
      const dispatch = vi.fn();
      const queue = new AnimationQueue(dispatch);
      const warnSpy = vi.spyOn(logger, 'warn');
      try {
        queue.addToQueue(
          makePlaylist({
            playlistType: PlaylistType.SequentialRepeatable,
            tracks: [makeTrack('a', 100)],
            repeatsLeft: repeatsLeft as number,
          }),
        );
        vi.advanceTimersByTime(5000);

        expect(dispatchedIds(dispatch)).toEqual(['a']);
        expect(queue.activePlaylist).toBeNull();
        expect(warnSpy).toHaveBeenCalledTimes(1);
        // Logged as a string: pino drops undefined keys and writes NaN as null.
        expect(warnSpy).toHaveBeenCalledWith(
          expect.objectContaining({ playlistId: 'playlist-1', repeatsLeft: label }),
          'Invalid repeatsLeft; not repeating',
        );
      } finally {
        warnSpy.mockRestore();
      }
    });

    it.each([
      ['-1 (infinite)', -1, ['a', 'a', 'a', 'a']],
      ['2', 2, ['a', 'a', 'a']],
    ])('repeatsLeft %s repeats without a warning', (_label, repeatsLeft, expected) => {
      const dispatch = vi.fn();
      const queue = new AnimationQueue(dispatch);
      const warnSpy = vi.spyOn(logger, 'warn');
      try {
        queue.addToQueue(
          makePlaylist({
            playlistType: PlaylistType.SequentialRepeatable,
            tracks: [makeTrack('a', 1000)],
            repeatsLeft,
          }),
        );
        vi.advanceTimersByTime(3000);

        expect(dispatchedIds(dispatch)).toEqual(expected);
        expect(warnSpy).not.toHaveBeenCalled();
      } finally {
        warnSpy.mockRestore();
      }
    });
  });

  // ── Minimum repeat pass ──────────────────────────────────────

  describe('Minimum repeat pass', () => {
    // A repeat pass shorter than 1 s is padded before the next pass, so a loop
    // of zero-length tracks cannot re-send SCRIPT_RUN every tick.
    let randomSpy: ReturnType<typeof vi.spyOn>;
    let warnSpy: ReturnType<typeof vi.spyOn>;
    beforeEach(() => {
      randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.99);
      warnSpy = vi.spyOn(logger, 'warn');
    });
    afterEach(() => {
      randomSpy.mockRestore();
      warnSpy.mockRestore();
    });

    function loop(tracks: Array<QueueTrack | QueueTrack[]>, overrides = {}) {
      return makePlaylist({
        playlistType: PlaylistType.SequentialRepeatable,
        tracks,
        repeatsLeft: -1,
        ...overrides,
      });
    }

    it.each([
      PlaylistType.SequentialRepeatable,
      PlaylistType.ShuffleWithRepeat,
      PlaylistType.ShuffleWithDelayAndRepeat,
    ])('%s: a 0 ms script on infinite repeat dispatches once per second', (type) => {
      const dispatch = vi.fn();
      const queue = new AnimationQueue(dispatch);
      queue.addToQueue(loop([makeTrack('a', 0)], { playlistType: type }));

      vi.advanceTimersByTime(999);
      expect(dispatchedIds(dispatch)).toEqual(['a']);
      vi.advanceTimersByTime(1);
      expect(dispatchedIds(dispatch)).toEqual(['a', 'a']);
      vi.advanceTimersByTime(999);
      expect(dispatchedIds(dispatch)).toEqual(['a', 'a']);
      vi.advanceTimersByTime(1);
      expect(dispatchedIds(dispatch)).toEqual(['a', 'a', 'a']);
    });

    it('a nested playlist of 0 ms sub-tracks plays each pass back-to-back, passes 1 s apart', () => {
      const dispatch = vi.fn();
      const queue = new AnimationQueue(dispatch);
      queue.addToQueue(loop([[makeTrack('n1', 0), makeTrack('n2', 0)]]));

      vi.advanceTimersByTime(999);
      expect(dispatchedIds(dispatch)).toEqual(['n1', 'n2']);
      vi.advanceTimersByTime(1);
      expect(dispatchedIds(dispatch)).toEqual(['n1', 'n2', 'n1']);
      // A 0 ms timer set inside a timer callback fires >= 1 ms later (fake
      // timers, like Node), so pass 2's n2 follows at +1.
      vi.advanceTimersByTime(1);
      expect(dispatchedIds(dispatch)).toEqual(['n1', 'n2', 'n1', 'n2']);
    });

    it('a 0 s Wait-only loop is paced at one pass per second', () => {
      const dispatch = vi.fn();
      const queue = new AnimationQueue(dispatch);
      queue.addToQueue(loop([makeTrack('wait', 0, true)]));

      vi.advanceTimersByTime(2500);
      // Unpaced, the loop would restart every ~1 ms and X would take over at
      // once; paced, pass 3 began at 2000 and its padding ends at 3000.
      queue.addToQueue(makeScriptItem('X', 100));
      vi.advanceTimersByTime(499);
      expect(dispatch).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(dispatchedIds(dispatch)).toEqual(['X']);
    });

    it('a 300 ms pass waits the remaining 700 ms', () => {
      const dispatch = vi.fn();
      const queue = new AnimationQueue(dispatch);
      // Start away from t = 0 (passStartedAt's initial value), so a first pass
      // whose start is never recorded would go unpadded and fail.
      vi.advanceTimersByTime(10_000);
      queue.addToQueue(loop([makeTrack('a', 100), makeTrack('b', 100), makeTrack('c', 100)]));

      vi.advanceTimersByTime(999);
      expect(dispatchedIds(dispatch)).toEqual(['a', 'b', 'c']);
      vi.advanceTimersByTime(1);
      expect(dispatchedIds(dispatch)).toEqual(['a', 'b', 'c', 'a']);
    });

    it('a pass of 1 s or more keeps its timing', () => {
      const dispatch = vi.fn();
      const queue = new AnimationQueue(dispatch);
      queue.addToQueue(loop([makeTrack('a', 1200)]));

      vi.advanceTimersByTime(1199);
      expect(dispatchedIds(dispatch)).toEqual(['a']);
      vi.advanceTimersByTime(1);
      expect(dispatchedIds(dispatch)).toEqual(['a', 'a']);
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it.each([
      // [label, gap, pass 2 starts at, padding warnings]
      ['the gap is longer than the padding', 1000, 1100, 0],
      ['the padding is longer than the gap', 200, 1000, 1],
    ])(
      'a delay type waits the longer of gap and padding when %s',
      (_label, gap, pass2, warnings) => {
        const dispatch = vi.fn();
        const queue = new AnimationQueue(dispatch);
        queue.addToQueue(
          loop([makeTrack('a', 100)], {
            playlistType: PlaylistType.ShuffleWithDelayAndRepeat,
            shuffleWaitMin: gap,
            shuffleWaitMax: gap,
          }),
        );

        vi.advanceTimersByTime(pass2 - 1);
        expect(dispatchedIds(dispatch)).toEqual(['a']);
        vi.advanceTimersByTime(1);
        expect(dispatchedIds(dispatch)).toEqual(['a', 'a']);
        // The gap alone paces the loop when it is longer — no padding warning.
        expect(warnSpy).toHaveBeenCalledTimes(warnings);
      },
    );

    it('a delay type with an unset (NaN) delay is still padded', () => {
      // Stored settings with repeat on but no delayMin (e.g. a legacy '{}' row
      // later saved with repeat) give NaN bounds; Math.max(NaN, padding) must
      // not switch the padding off.
      const dispatch = vi.fn();
      const queue = new AnimationQueue(dispatch);
      queue.addToQueue(
        loop([makeTrack('a', 0)], {
          playlistType: PlaylistType.ShuffleWithDelayAndRepeat,
          shuffleWaitMin: NaN,
          shuffleWaitMax: NaN,
        }),
      );

      vi.advanceTimersByTime(2500);

      expect(dispatchedIds(dispatch)).toEqual(['a', 'a', 'a']); // 0, 1000, 2000
      expect(warnSpy).toHaveBeenCalledTimes(1);
    });

    // Real timers can fire ~1 ms early against performance.now(), so a pass
    // meant to last exactly 1 s may measure 999.x ms; a few ms of slack keeps
    // it unpadded and unwarned.
    it('a pass within a few ms of 1 s is not padded or warned', () => {
      const dispatch = vi.fn();
      const queue = new AnimationQueue(dispatch);
      queue.addToQueue(loop([makeTrack('a', 996)]));

      vi.advanceTimersByTime(996);
      expect(dispatchedIds(dispatch)).toEqual(['a', 'a']);
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('a pass more than a few ms short of 1 s is padded', () => {
      const dispatch = vi.fn();
      const queue = new AnimationQueue(dispatch);
      queue.addToQueue(loop([makeTrack('a', 994)]));

      vi.advanceTimersByTime(999);
      expect(dispatchedIds(dispatch)).toEqual(['a']);
      vi.advanceTimersByTime(1);
      expect(dispatchedIds(dispatch)).toEqual(['a', 'a']);
      expect(warnSpy).toHaveBeenCalledTimes(1);
    });

    it('a delay beyond the timer maximum is clamped, not truncated to 1 ms', () => {
      // Node cuts a delay over 2^31-1 ms to 1 ms; max(gap, padding) would then
      // pick that "huge" gap over the padding and the loop would flood.
      const dispatch = vi.fn();
      const queue = new AnimationQueue(dispatch);
      queue.addToQueue(
        loop([makeTrack('a', 0)], {
          playlistType: PlaylistType.ShuffleWithDelayAndRepeat,
          shuffleWaitMin: 3e9,
          shuffleWaitMax: 3e9,
        }),
      );

      vi.advanceTimersByTime(3000);

      expect(dispatchedIds(dispatch)).toEqual(['a']);
    });

    it('finite repeats are padded too, then go idle', () => {
      const dispatch = vi.fn();
      const queue = new AnimationQueue(dispatch);
      queue.addToQueue(loop([makeTrack('a', 0)], { repeatsLeft: 2 }));

      vi.advanceTimersByTime(1999);
      expect(dispatchedIds(dispatch)).toEqual(['a', 'a']);
      vi.advanceTimersByTime(1);
      expect(dispatchedIds(dispatch)).toEqual(['a', 'a', 'a']);
      vi.advanceTimersByTime(1); // the last 0 ms track ends (>= 1 ms)
      expect(queue.activePlaylist).toBeNull();
    });

    it('a system clock jump mid-pass does not change the cadence', () => {
      const dispatch = vi.fn();
      const queue = new AnimationQueue(dispatch);
      queue.addToQueue(loop([makeTrack('a', 600)]));

      // setSystemTime moves Date, not performance.now (e.g. NTP after boot).
      vi.advanceTimersByTime(300);
      vi.setSystemTime(Date.now() - 3_600_000);
      vi.advanceTimersByTime(699);
      expect(dispatchedIds(dispatch)).toEqual(['a']);
      vi.advanceTimersByTime(1); // 1000
      expect(dispatchedIds(dispatch)).toEqual(['a', 'a']);

      vi.advanceTimersByTime(300);
      vi.setSystemTime(Date.now() + 7_200_000);
      vi.advanceTimersByTime(699);
      expect(dispatchedIds(dispatch)).toEqual(['a', 'a']);
      vi.advanceTimersByTime(1); // 2000
      expect(dispatchedIds(dispatch)).toEqual(['a', 'a', 'a']);
    });

    it('a replacement queued during padding takes over when the padding ends', () => {
      const dispatch = vi.fn();
      const queue = new AnimationQueue(dispatch);
      queue.addToQueue(loop([makeTrack('a', 0)]));

      vi.advanceTimersByTime(500);
      // A repeatable replacement: if the padding timer started it without
      // taking over (flag left set), its repeat pass would be lost.
      queue.addToQueue(loop([makeTrack('r', 1000)], { id: 'R', repeatsLeft: 1 }));
      vi.advanceTimersByTime(499);
      expect(dispatchedIds(dispatch)).toEqual(['a']);
      vi.advanceTimersByTime(1); // padding ends at 1000
      expect(dispatchedIds(dispatch)).toEqual(['a', 'r']);
      vi.advanceTimersByTime(1000);
      expect(dispatchedIds(dispatch)).toEqual(['a', 'r', 'r']);
      vi.advanceTimersByTime(5000);
      expect(dispatchedIds(dispatch)).toEqual(['a', 'r', 'r']);
    });

    it('panicStop during padding leaves no pending timer', () => {
      const dispatch = vi.fn();
      const queue = new AnimationQueue(dispatch);
      queue.addToQueue(loop([makeTrack('a', 0)]));

      vi.advanceTimersByTime(500);
      queue.panicStop();
      expect(vi.getTimerCount()).toBe(0);
      vi.advanceTimersByTime(5000);
      expect(dispatchedIds(dispatch)).toEqual(['a']);

      queue.clearPanicStop();
      queue.addToQueue(makeScriptItem('X', 100));
      vi.advanceTimersByTime(5000);
      expect(dispatchedIds(dispatch)).toEqual(['a', 'X']);
    });

    it('drops empty nested tracks on repeat passes too', () => {
      // Visible only for a delay type: a kept [] on pass 2 would add a gap.
      const dispatch = vi.fn();
      const queue = new AnimationQueue(dispatch);
      queue.addToQueue(
        loop([[], makeTrack('a', 100)], {
          playlistType: PlaylistType.ShuffleWithDelayAndRepeat,
          repeatsLeft: 1,
          shuffleWaitMin: 1000,
          shuffleWaitMax: 1000,
        }),
      );

      vi.advanceTimersByTime(1099);
      expect(dispatchedIds(dispatch)).toEqual(['a']);
      vi.advanceTimersByTime(1);
      expect(dispatchedIds(dispatch)).toEqual(['a', 'a']);
    });

    it('a non-delay type ignores a stale delay longer than the padding', () => {
      const dispatch = vi.fn();
      const queue = new AnimationQueue(dispatch);
      queue.addToQueue(loop([makeTrack('a', 100)], { shuffleWaitMin: 5000, shuffleWaitMax: 5000 }));

      vi.advanceTimersByTime(999);
      expect(dispatchedIds(dispatch)).toEqual(['a']);
      vi.advanceTimersByTime(1); // padding, not the stale 5 s gap
      expect(dispatchedIds(dispatch)).toEqual(['a', 'a']);
    });

    it('warns again for a fresh run of the same playlist, including one that takes over', () => {
      const dispatch = vi.fn();
      const queue = new AnimationQueue(dispatch);
      queue.addToQueue(loop([makeTrack('a', 0)], { id: 'same' }));
      vi.advanceTimersByTime(500);
      expect(warnSpy).toHaveBeenCalledTimes(1);

      // Re-running the same playlist builds a new item with the same id.
      queue.addToQueue(loop([makeTrack('b', 0)], { id: 'same' }));
      vi.advanceTimersByTime(1500); // takes over at 1000; its first boundary pads

      expect(warnSpy).toHaveBeenCalledTimes(2);
    });

    it('warns once per playlist run, not once per pass', () => {
      const dispatch = vi.fn();
      const queue = new AnimationQueue(dispatch);
      queue.addToQueue(loop([makeTrack('a', 0)], { id: 'run-1', repeatsLeft: 2 }));
      vi.advanceTimersByTime(5000); // two padded boundaries

      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.objectContaining({ playlistId: 'run-1' }),
        expect.any(String),
      );

      queue.addToQueue(loop([makeTrack('a', 0)], { id: 'run-2', repeatsLeft: 1 }));
      vi.advanceTimersByTime(5000);

      expect(warnSpy).toHaveBeenCalledTimes(2);
      expect(warnSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({ playlistId: 'run-2' }),
        expect.any(String),
      );
    });
  });
});
