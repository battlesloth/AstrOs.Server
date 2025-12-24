import { http, HttpResponse } from 'msw';

// Mock scripts data
const mockScripts = [
  {
    id: '1',
    scriptName: 'Open Dome',
    description: 'Opens the observatory dome',
    lastSaved: new Date().toISOString(),
    deploymentStatus: {},
    scriptChannels: [],
  },
  {
    id: '2',
    scriptName: 'Close Dome',
    description: 'Closes the observatory dome',
    lastSaved: new Date().toISOString(),
    deploymentStatus: {},
    scriptChannels: [],
  },
  {
    id: '3',
    scriptName: 'Start Tracking',
    description: 'Begin telescope tracking',
    lastSaved: new Date().toISOString(),
    deploymentStatus: {},
    scriptChannels: [],
  },
  {
    id: '4',
    scriptName: 'Stop Tracking',
    description: 'Stop telescope tracking',
    lastSaved: new Date().toISOString(),
    deploymentStatus: {},
    scriptChannels: [],
  },
  {
    id: '5',
    scriptName: 'Emergency Stop',
    description: 'Emergency stop all motors',
    lastSaved: new Date().toISOString(),
    deploymentStatus: {},
    scriptChannels: [],
  },
];

// Mock remote control configuration
const mockRemoteControlEmpty = [
  {
    button1: { id: '0', name: 'None' },
    button2: { id: '0', name: 'None' },
    button3: { id: '0', name: 'None' },
    button4: { id: '0', name: 'None' },
    button5: { id: '0', name: 'None' },
    button6: { id: '0', name: 'None' },
    button7: { id: '0', name: 'None' },
    button8: { id: '0', name: 'None' },
    button9: { id: '0', name: 'None' },
  },
];

const mockRemoteControlWithScripts = [
  {
    button1: { id: '1', name: 'Open Dome' },
    button2: { id: '2', name: 'Close Dome' },
    button3: { id: '3', name: 'Start Tracking' },
    button4: { id: '4', name: 'Stop Tracking' },
    button5: { id: '5', name: 'Emergency Stop' },
    button6: { id: '0', name: 'None' },
    button7: { id: '0', name: 'None' },
    button8: { id: '0', name: 'None' },
    button9: { id: '0', name: 'None' },
  },
];

export const handlers = [
  // Get all scripts
  http.get('/api/scripts/all', () => {
    return HttpResponse.json(mockScripts);
  }),

  // Get remote control config - empty
  http.get('/api/remoteConfig', () => {
    return HttpResponse.json(JSON.stringify(mockRemoteControlEmpty));
  }),

  // Save remote control config
  http.put('/api/remoteConfig', () => {
    return HttpResponse.json({ success: true, message: 'Configuration saved' });
  }),
];

// Handlers for specific story scenarios
export const noScriptsHandlers = [
  http.get('/api/scripts/all', () => {
    return HttpResponse.json([]);
  }),
  http.get('/api/remoteConfig', () => {
    return HttpResponse.json(JSON.stringify(mockRemoteControlEmpty));
  }),
];

export const withScriptsHandlers = [
  http.get('/api/scripts/all', () => {
    return HttpResponse.json(mockScripts);
  }),
  http.get('/api/remoteConfig', () => {
    return HttpResponse.json(JSON.stringify(mockRemoteControlWithScripts));
  }),
];

export const multiplePagesHandlers = [
  http.get('/api/scripts/all', () => {
    return HttpResponse.json(mockScripts);
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
          button6: { id: '0', name: 'None' },
          button7: { id: '0', name: 'None' },
          button8: { id: '0', name: 'None' },
          button9: { id: '0', name: 'None' },
        },
        {
          button1: { id: '0', name: 'None' },
          button2: { id: '0', name: 'None' },
          button3: { id: '0', name: 'None' },
          button4: { id: '0', name: 'None' },
          button5: { id: '0', name: 'None' },
          button6: { id: '0', name: 'None' },
          button7: { id: '0', name: 'None' },
          button8: { id: '0', name: 'None' },
          button9: { id: '0', name: 'None' },
        },
        {
          button1: { id: '1', name: 'Open Dome' },
          button2: { id: '0', name: 'None' },
          button3: { id: '0', name: 'None' },
          button4: { id: '0', name: 'None' },
          button5: { id: '0', name: 'None' },
          button6: { id: '0', name: 'None' },
          button7: { id: '0', name: 'None' },
          button8: { id: '0', name: 'None' },
          button9: { id: '2', name: 'Close Dome' },
        },
      ])
    );
  }),
];

export const fullyConfiguredHandlers = [
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
      ])
    );
  }),
];

