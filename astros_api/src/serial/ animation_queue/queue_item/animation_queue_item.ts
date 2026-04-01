import { PlaylistType } from 'src/models/playlists/playlistType';

export interface QueueTrack {
  id: string;
  duration: number;
}

export interface AnimationQueuePlaylist {
  id: string;
  playlistType: PlaylistType;

  // Script and wait tracks are single QueueTrack, Sequential
  // playlist tracks area and array of QueueTrack ids played
  // in order. Only the top level of playlist track is supported,
  // so nested playlists are decomposed into a flat list of tracks.
  tracks: Array<QueueTrack | QueueTrack[]>;

  repeatsLeft: number; // -1 for infinite
  shuffleWaitMin: number;
  shuffleWaitMax: number;

  // For shuffle, we need to track the remaining tracks in the current
  // shuffle cycle. If the shuffle repeats, this will be reset to the
  // full list of tracks once it is empty.
  tracksRemaining: Array<QueueTrack | QueueTrack[]>;
}
