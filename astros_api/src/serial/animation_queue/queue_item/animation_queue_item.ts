import { PlaylistType } from 'src/models/playlists/playlistType.js';
import { ControllerLocation } from 'src/models/control_module/controller_location.js';

export interface QueueTrack {
  id: string;
  duration: number;
  isWait: boolean;
}

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

  repeatsLeft: number; // -1 infinite, 0 no further passes, N more passes
  // Milliseconds; read only by the delay types; equal when Random Delay is off.
  shuffleWaitMin: number;
  shuffleWaitMax: number;

  // Tracks not yet played this pass (every type): filled from `tracks` by
  // addToQueue and refilled by handleRepeat (shuffled for shuffle types). A
  // shallow copy — nested arrays are shared with `tracks`, so never mutate them.
  tracksRemaining: Array<QueueTrack | QueueTrack[]>;
}
