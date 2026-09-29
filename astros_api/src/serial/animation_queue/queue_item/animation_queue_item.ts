import { PlaylistType } from 'src/models/playlists/playlistType.js';
import { ControllerLocation } from 'src/models/control_module/controller_location.js';

// Node's timer maximum (2^31-1 ms, ~24.8 days); a longer delay fires after
// 1 ms instead, so shuffle delays are clamped to it (Wait durations are not
// yet — PLAN.md Backlog).
export const MAX_TIMER_MS = 2 ** 31 - 1;

export interface QueueTrack {
  id: string;
  duration: number;
  isWait: boolean;
}

// One object is one run: the queue takes ownership and mutates
// tracksRemaining and repeatsLeft, so re-adding a used object is unsupported
// (the converter builds a fresh one per run).
export interface AnimationQueuePlaylist {
  id: string;
  playlistType: PlaylistType;
  locations: Array<ControllerLocation>;

  // Script and wait tracks are single QueueTracks; a nested playlist track is
  // an array of QueueTracks played in order (nested playlists are flattened
  // into it). The queue treats a nested array as one track: no gap between its
  // sub-tracks, and an interrupt waits for the last one. Never mutated — each
  // pass replays from it.
  tracks: Array<QueueTrack | QueueTrack[]>;

  // -1 infinite, 0 no further passes, N (a positive integer) more passes; any
  // other value → no further passes, warned. Counted down by the queue.
  repeatsLeft: number;
  // Milliseconds; read only by the delay types; equal when Random Delay is off.
  shuffleWaitMin: number;
  shuffleWaitMax: number;

  // Tracks not yet played this pass (every type): filled from `tracks` by
  // addToQueue and refilled by handleRepeat (shuffled for shuffle types). A
  // filtered shallow copy (empty nested arrays dropped) — nested arrays are
  // shared with `tracks`, so never mutate them.
  tracksRemaining: Array<QueueTrack | QueueTrack[]>;
}
