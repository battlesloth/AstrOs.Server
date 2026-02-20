import type { TrackType } from './trackType.js';

export interface PlaylistTrack {
  id: string;
  idx: number;
  durationDS: number;
  trackType: TrackType;
  trackId: string;
  trackName: string;
}
