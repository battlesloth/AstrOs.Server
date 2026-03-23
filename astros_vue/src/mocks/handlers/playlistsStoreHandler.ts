import { PLAYLISTS_ALL, SCRIPTS_ALL_NAMES } from '@/api/endpoints';
import { http, HttpResponse } from 'msw';
import { createMockPlaylists, createMockScripts } from './playlistsMockData';

export const playlistsStoreHandler = [
  http.get(PLAYLISTS_ALL, () => {
    return HttpResponse.json({
      playlists: createMockPlaylists(),
    });
  }),
  http.get(SCRIPTS_ALL_NAMES, () => {
    return HttpResponse.json({
      scripts: createMockScripts(),
    });
  }),
];
