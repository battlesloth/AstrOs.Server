import type { PlaylistTrack } from './playlistTrack.js';
import { PlaylistType } from './playlistType.js';

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
