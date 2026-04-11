import type { TrackType } from './trackType.js';

export interface PlaylistTrack {
  id: string;
  playlistId: string;
  idx: number;
  durationDS: number;
  randomWait: boolean;
  durationMaxDS: number;
  trackType: TrackType;
  trackId: string;
  trackName: string;
}
