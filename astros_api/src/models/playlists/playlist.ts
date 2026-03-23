import type { PlaylistTrack } from './playlistTrack.js';

export interface Playlist {
  id: string;
  playlistName: string;
  description: string;
  tracks: PlaylistTrack[];
}
