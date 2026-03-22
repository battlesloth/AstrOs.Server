import type { TrackType } from './trackType';

export interface PlaylistTrack {
  id: string;
  playlistId: string;
  idx: number;
  durationDS: number;
  trackType: TrackType;
  trackId: string;
  trackName: string;
}
