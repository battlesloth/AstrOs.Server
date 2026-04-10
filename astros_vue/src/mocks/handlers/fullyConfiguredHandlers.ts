import { http, HttpResponse } from 'msw';
import { mockScripts, mockPlaylists, mockScriptNames } from './mockData';

export const fullyConfiguredHandlers = [
  http.get('/api/playlists/all', () => {
    return HttpResponse.json(mockPlaylists);
  }),
  http.get('/api/scripts/all-names', () => {
    return HttpResponse.json(mockScriptNames);
  }),
  http.get('/api/scripts/all', () => {
    return HttpResponse.json([
      ...mockScripts,
      {
        id: '6',
        scriptName: 'Focus Camera',
        description: 'Auto-focus the camera',
        lastSaved: new Date().toISOString(),
        deploymentStatus: {},
        scriptChannels: [],
      },
      {
        id: '7',
        scriptName: 'Calibrate',
        description: 'Run calibration routine',
        lastSaved: new Date().toISOString(),
        deploymentStatus: {},
        scriptChannels: [],
      },
      {
        id: '8',
        scriptName: 'Park Telescope',
        description: 'Park the telescope',
        lastSaved: new Date().toISOString(),
        deploymentStatus: {},
        scriptChannels: [],
      },
      {
        id: '9',
        scriptName: 'Unpark Telescope',
        description: 'Unpark the telescope',
        lastSaved: new Date().toISOString(),
        deploymentStatus: {},
        scriptChannels: [],
      },
    ]);
  }),
  http.get('/api/remoteConfig', () => {
    return HttpResponse.json(
      JSON.stringify([
        {
          button1: { id: '1', name: 'Open Dome' },
          button2: { id: '2', name: 'Close Dome' },
          button3: { id: '3', name: 'Start Tracking' },
          button4: { id: '4', name: 'Stop Tracking' },
          button5: { id: '5', name: 'Emergency Stop' },
          button6: { id: '6', name: 'Focus Camera' },
          button7: { id: '7', name: 'Calibrate' },
          button8: { id: '8', name: 'Park Telescope' },
          button9: { id: '9', name: 'Unpark Telescope' },
        },
      ]),
    );
  }),
];
