// Mock scripts data
export const mockScripts = [
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

// Mock remote control configurations
export const mockRemoteControlEmpty = [
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

export const mockRemoteControlWithScripts = [
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
