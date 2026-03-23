import { http, HttpResponse } from 'msw';
import { mockScripts, mockRemoteControlEmpty } from './mockData';

export const defaultHandlers = [
  http.get('/api/scripts/all', () => {
    return HttpResponse.json(mockScripts);
  }),
  http.get('/api/remoteConfig', () => {
    return HttpResponse.json(JSON.stringify(mockRemoteControlEmpty));
  }),
  http.put('/api/remoteConfig', () => {
    return HttpResponse.json({ success: true, message: 'Configuration saved' });
  }),
];
