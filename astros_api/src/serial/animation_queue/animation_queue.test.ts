import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnimationQueue } from './animation_queue.js';
import { AnimationQueuePlaylist, QueueTrack } from './queue_item/animation_queue_item.js';
import { PlaylistType } from '../../models/playlists/playlistType.js';

function makeTrack(id: string, duration: number, isWait = false): QueueTrack {
  return { id, duration, isWait };
}

function makePlaylist(
  overrides: Partial<AnimationQueuePlaylist> & { playlistType: PlaylistType },
): AnimationQueuePlaylist {
  return {
    id: 'playlist-1',
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
      expect(dispatch).toHaveBeenCalledWith('track1');

      // advance past track1 duration
      vi.advanceTimersByTime(1000);

      expect(dispatch).toHaveBeenCalledTimes(2);
      expect(dispatch).toHaveBeenCalledWith('track2');

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
      expect(dispatch).toHaveBeenCalledWith('track1');

      // after track1: wait track starts (no dispatch)
      vi.advanceTimersByTime(1000);
      expect(dispatch).toHaveBeenCalledTimes(1);

      // after wait: track2 dispatched
      vi.advanceTimersByTime(2000);
      expect(dispatch).toHaveBeenCalledTimes(2);
      expect(dispatch).toHaveBeenCalledWith('track2');
    });

    it('should dispatch nested QueueTrack[] sub-tracks in order', () => {
      const dispatch = vi.fn();
      const queue = new AnimationQueue(dispatch);

      const subTracks: QueueTrack[] = [
        makeTrack('sub1', 500),
        makeTrack('sub2', 300),
      ];

      const playlist = makePlaylist({
        playlistType: PlaylistType.Sequential,
        tracks: [
          makeTrack('track1', 1000),
          [...subTracks], // copy to avoid mutation issues
          makeTrack('track3', 200),
        ],
      });

      queue.addToQueue(playlist);

      expect(dispatch).toHaveBeenCalledTimes(1);
      expect(dispatch).toHaveBeenCalledWith('track1');

      // after track1: sub1 dispatched
      vi.advanceTimersByTime(1000);
      expect(dispatch).toHaveBeenCalledTimes(2);
      expect(dispatch).toHaveBeenCalledWith('sub1');

      // after sub1: sub2 dispatched
      vi.advanceTimersByTime(500);
      expect(dispatch).toHaveBeenCalledTimes(3);
      expect(dispatch).toHaveBeenCalledWith('sub2');

      // after sub2: track3 dispatched
      vi.advanceTimersByTime(300);
      expect(dispatch).toHaveBeenCalledTimes(4);
      expect(dispatch).toHaveBeenCalledWith('track3');
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
        .mockReturnValueOnce(0.0);  // i=1: j=0

      const playlist = makePlaylist({
        playlistType: PlaylistType.Shuffle,
        tracks: [
          makeTrack('track1', 100),
          makeTrack('track2', 100),
          makeTrack('track3', 100),
        ],
      });

      queue.addToQueue(playlist);

      // Shuffled order: track2, track1, track3
      expect(dispatch).toHaveBeenCalledWith('track2');

      vi.advanceTimersByTime(100);
      expect(dispatch).toHaveBeenCalledWith('track1');

      vi.advanceTimersByTime(100);
      expect(dispatch).toHaveBeenCalledWith('track3');

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
      expect(dispatch).toHaveBeenCalledWith('track2');

      // after track2 duration, delay starts (not dispatched yet)
      vi.advanceTimersByTime(200);
      expect(dispatch).toHaveBeenCalledTimes(1);

      // after shuffle delay (1000ms), track1 dispatched
      vi.advanceTimersByTime(1000);
      expect(dispatch).toHaveBeenCalledTimes(2);
      expect(dispatch).toHaveBeenCalledWith('track1');

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
        tracks: [makeTrack('track1', 100), makeTrack('track2', 100)],
        repeatsLeft: 1,
      });

      queue.addToQueue(playlist);

      // Cycle 1: track1
      expect(dispatch).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(100);
      // Cycle 1: track2
      expect(dispatch).toHaveBeenCalledTimes(2);
      vi.advanceTimersByTime(100);

      // Cycle 2: track1 (repeat)
      expect(dispatch).toHaveBeenCalledTimes(3);
      vi.advanceTimersByTime(100);
      // Cycle 2: track2
      expect(dispatch).toHaveBeenCalledTimes(4);
      vi.advanceTimersByTime(100);

      // No cycle 3 — repeatsLeft was 1
      expect(dispatch).toHaveBeenCalledTimes(4);
    });

    it('SequentialRepeatable with repeatsLeft=-1 repeats indefinitely', () => {
      const dispatch = vi.fn();
      const queue = new AnimationQueue(dispatch);

      const playlist = makePlaylist({
        playlistType: PlaylistType.SequentialRepeatable,
        tracks: [makeTrack('track1', 100)],
        repeatsLeft: -1,
      });

      queue.addToQueue(playlist);

      // Play at least 5 cycles
      for (let i = 0; i < 5; i++) {
        expect(dispatch).toHaveBeenCalledTimes(i + 1);
        vi.advanceTimersByTime(100);
      }

      expect(dispatch).toHaveBeenCalledTimes(6);
    });

    it('ShuffleWithRepeat reshuffles and replays', () => {
      const dispatch = vi.fn();
      const queue = new AnimationQueue(dispatch);

      const randomSpy = vi.spyOn(Math, 'random');
      // Fisher-Yates for 2 items: 1 random call per shuffle
      // Cycle 1 shuffle: i=1, random=0.0 → j=0, swap → [track2, track1]
      randomSpy.mockReturnValueOnce(0.0);
      // Cycle 2 shuffle: i=1, random=0.99 → j=1, no swap → [track1, track2]
      randomSpy.mockReturnValueOnce(0.99);

      const playlist = makePlaylist({
        playlistType: PlaylistType.ShuffleWithRepeat,
        tracks: [makeTrack('track1', 100), makeTrack('track2', 100)],
        repeatsLeft: 1,
      });

      queue.addToQueue(playlist);

      // Cycle 1: shuffled to [track2, track1]
      expect(dispatch).toHaveBeenCalledTimes(1);
      expect(dispatch).toHaveBeenLastCalledWith('track2');
      vi.advanceTimersByTime(100);
      expect(dispatch).toHaveBeenCalledTimes(2);
      expect(dispatch).toHaveBeenLastCalledWith('track1');
      vi.advanceTimersByTime(100);

      // Cycle 2: reshuffled to [track1, track2]
      expect(dispatch).toHaveBeenCalledTimes(3);
      expect(dispatch).toHaveBeenLastCalledWith('track1');
      vi.advanceTimersByTime(100);
      expect(dispatch).toHaveBeenCalledTimes(4);
      expect(dispatch).toHaveBeenLastCalledWith('track2');
      vi.advanceTimersByTime(100);

      // Done
      expect(dispatch).toHaveBeenCalledTimes(4);

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
      expect(dispatch).toHaveBeenCalledWith('old1');

      // Add replacement while old1 is playing
      queue.addToQueue(playlist2);

      // old1 still playing, no new dispatch yet
      expect(dispatch).toHaveBeenCalledTimes(1);

      // old1 finishes — new playlist starts (not old2)
      vi.advanceTimersByTime(1000);
      expect(dispatch).toHaveBeenCalledTimes(2);
      expect(dispatch).toHaveBeenCalledWith('new1');
      expect(dispatch).not.toHaveBeenCalledWith('old2');
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
      expect(dispatch).toHaveBeenCalledWith('seq1');

      // Queue interruptible — goes to back of queue
      queue.addToQueue(interruptible1);

      // Queue another interruptible — replaces interruptible1 in queue
      queue.addToQueue(interruptible2);

      // seq finishes → interruptible2 should start (not interruptible1)
      vi.advanceTimersByTime(500);
      expect(dispatch).toHaveBeenCalledTimes(2);
      expect(dispatch).toHaveBeenCalledWith('int2-track');
      expect(dispatch).not.toHaveBeenCalledWith('int1-track');
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

      expect(dispatch).toHaveBeenCalledWith('p1-track');

      vi.advanceTimersByTime(100);
      expect(dispatch).toHaveBeenCalledWith('p2-track');

      vi.advanceTimersByTime(100);
      expect(dispatch).toHaveBeenCalledWith('p3-track');

      expect(dispatch).toHaveBeenCalledTimes(3);
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
      expect(dispatch).toHaveBeenCalledWith('b-track');
      expect(dispatch).not.toHaveBeenCalledWith('a-track');
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
      expect(dispatch).toHaveBeenCalledWith('track1');
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
      const realPlaylist2 = makePlaylist({
        id: 'real2',
        playlistType: PlaylistType.Sequential,
        tracks: [makeTrack('real-track2', 100)],
      });
      queue2.addToQueue(realPlaylist2);
      expect(dispatch2).toHaveBeenCalledTimes(1);
      expect(dispatch2).toHaveBeenCalledWith('real-track2');
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
});
