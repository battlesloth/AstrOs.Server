import type { PlaylistType } from '@/enums/playlists/playlistType';
import type { PlaylistTrack } from './playlistTrack';
import type { PlaylistSettings } from './playlistSettings';

export interface Playlist {
  id: string;
  playlistName: string;
  description: string;
  playlistType: PlaylistType;
  tracks: PlaylistTrack[];
  settings: PlaylistSettings;
}
