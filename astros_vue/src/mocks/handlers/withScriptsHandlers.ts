import { http, HttpResponse } from 'msw';
import { mockScripts, mockRemoteControlWithScripts } from './mockData';

export const withScriptsHandlers = [
  http.get('/api/scripts/all', () => {
    return HttpResponse.json(mockScripts);
  }),
  http.get('/api/remoteConfig', () => {
    return HttpResponse.json(JSON.stringify(mockRemoteControlWithScripts));
  }),
];
