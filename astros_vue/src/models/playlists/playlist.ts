import type { PlaylistTrack } from './playlistTrack';

export interface Playlist {
  id: string;
  durationDS: number;
  playlistName: string;
  description: string;
  tracks: PlaylistTrack[];
}
