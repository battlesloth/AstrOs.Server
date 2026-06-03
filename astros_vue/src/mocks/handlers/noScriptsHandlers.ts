import { http, HttpResponse } from 'msw';
import { mockRemoteControlEmpty } from './mockData';

export const noScriptsHandlers = [
  http.get('/api/scripts/all', () => {
    return HttpResponse.json([]);
  }),
  http.get('/api/playlists/all', () => {
    return HttpResponse.json([]);
  }),
  http.get('/api/scripts/all-names', () => {
    return HttpResponse.json([]);
  }),
  http.get('/api/remoteConfig', () => {
    return HttpResponse.json(JSON.stringify(mockRemoteControlEmpty));
  }),
];
