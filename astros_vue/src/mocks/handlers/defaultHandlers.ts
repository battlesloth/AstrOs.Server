import { http, HttpResponse } from 'msw';
import { mockScripts, mockPlaylists, mockScriptNames, mockRemoteControlEmpty } from './mockData';

export const defaultHandlers = [
  http.get('/api/scripts/all', () => {
    return HttpResponse.json(mockScripts);
  }),
  http.get('/api/playlists/all', () => {
    return HttpResponse.json(mockPlaylists);
  }),
  http.get('/api/scripts/all-names', () => {
    return HttpResponse.json(mockScriptNames);
  }),
  http.get('/api/remoteConfig', () => {
    return HttpResponse.json(JSON.stringify(mockRemoteControlEmpty));
  }),
  http.put('/api/remoteConfig', () => {
    return HttpResponse.json({ success: true, message: 'Configuration saved' });
  }),
];
