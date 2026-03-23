import type { PlaylistType } from '@/enums/playlists/playlistType';
import type { PlaylistTrack } from './playlistTrack';

export interface PlaylistSettings {
  randomDelay: boolean;
  delayMin: number;
  delayMax: number;
}

export interface Playlist {
  id: string;
  playlistName: string;
  description: string;
  playlistType: PlaylistType;
  tracks: PlaylistTrack[];
  settings: PlaylistSettings;
}
