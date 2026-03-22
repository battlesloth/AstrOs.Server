import { TrackType } from '@/enums/playlists/trackType';
import type { PlaylistTrack } from '@/models/playlists/playlistTrack';
import { v4 as uuid } from 'uuid';

export const scriptIds = [
  '2ade558c-f32a-476c-8c91-7d75e20ecf29',
  '3b1e5c9d-8c4a-4f0e-9b2a-1f6e5d8a7c3f',
  '4c9f7e1a-5d2b-4a8f-9c3e-2a7b6d5e8f1a',
  '5d8a7c3f-1e6b-4f0e-9b2a-3c4d5e6f7a8b',
  '6e5d8a7c-3f1a-4b2c-9c3e-4d5e6f7a8b9c',
  '7f1a6b5c-8c4a-4f0e-9b2a-5d8a7c3f1e6b',
  '8c4a7d5e-9b2a-4f0e-9c3e-6e5d8a7c3f1a',
  '9b2a8c4a-1e6b-4f0e-9c3e-7f1a6b5c8c4a',
  '1e6b9b2a-3f1a-4b2c-9c3e-8c4a7d5e9b2a',
  '3f1a1e6b-5d8a-4f0e-9c3e-9b2a8c4a7d5e',
  '5d8a3f1a-6b5c-4f0e-9c3e-1e6b9b2a3f1a',
];

function createMockTrack(playlistId: string, name: string, idx: number): PlaylistTrack {
  let type = idx % 2 === 0 ? TrackType.Playlist : TrackType.Script;
  type = idx === 3 ? TrackType.Wait : type;
  return {
    id: uuid(),
    playlistId,
    trackName: name,
    trackType: type,
    trackId: type === TrackType.Script ? scriptIds[idx]! : `playlist-${playlistId}`,
    durationDS: 10,
    idx: idx,
  };
}

function createMockTracks(playlistId: string) {
  const tracks = [];
  for (let i = 1; i <= 5; i++) {
    tracks.push(createMockTrack(playlistId, `Track ${i}`, i - 1));
  }
  return tracks;
}

function createMockPlaylist(id: string, name: string) {
  return {
    id,
    playlistName: name,
    tracks: createMockTracks(id),
  };
}

export function createMockPlaylists() {
  const playlists = [];
  for (let i = 1; i <= 5; i++) {
    playlists.push(createMockPlaylist(uuid(), `Playlist ${i}`));
  }
  return playlists;
}

function createMockScript(id: string, scriptName: string, description: string) {
  return {
    id,
    scriptName,
    description,
  };
}

export function createMockScripts() {
  const scripts = [];
  for (let i = 1; i <= 5; i++) {
    scripts.push(createMockScript(scriptIds[i - 1]!, `Script ${i}`, `Description for Script ${i}`));
  }
  return scripts;
}
