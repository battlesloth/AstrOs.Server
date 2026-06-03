import { PlaylistType } from '@/enums/playlists/playlistType';
import type { Script } from '@/models/scripts/script';

// Mock scripts data
export const mockScripts: Script[] = [
  {
    id: '1',
    scriptName: 'Open Dome',
    description: 'Opens the observatory dome',
    lastSaved: new Date(),
    durationDS: 0,
    playlistCount: 0,
    deploymentStatus: {},
    scriptChannels: [],
  },
  {
    id: '2',
    scriptName: 'Close Dome',
    description: 'Closes the observatory dome',
    lastSaved: new Date(),
    durationDS: 0,
    playlistCount: 0,
    deploymentStatus: {},
    scriptChannels: [],
  },
  {
    id: '3',
    scriptName: 'Start Tracking',
    description: 'Begin telescope tracking',
    lastSaved: new Date(),
    durationDS: 0,
    playlistCount: 0,
    deploymentStatus: {},
    scriptChannels: [],
  },
  {
    id: '4',
    scriptName: 'Stop Tracking',
    description: 'Stop telescope tracking',
    lastSaved: new Date(),
    durationDS: 0,
    playlistCount: 0,
    deploymentStatus: {},
    scriptChannels: [],
  },
  {
    id: '5',
    scriptName: 'Emergency Stop',
    description: 'Emergency stop all motors',
    lastSaved: new Date(),
    durationDS: 0,
    playlistCount: 0,
    deploymentStatus: {},
    scriptChannels: [],
  },
];

// Mock playlists data
export const mockPlaylists = [
  {
    id: 'p_1',
    playlistName: 'Parade Mode',
    description: 'Parade animation sequence',
    playlistType: PlaylistType.Sequential,
    tracks: [],
    settings: { repeat: false, repeatCount: 0, randomDelay: false, delayMin: 0, delayMax: 0 },
  },
  {
    id: 'p_2',
    playlistName: 'Idle Animations',
    description: 'Random idle movements',
    playlistType: PlaylistType.ShuffleWithDelayAndRepeat,
    tracks: [],
    settings: { repeat: true, repeatCount: 0, randomDelay: true, delayMin: 5, delayMax: 15 },
  },
  {
    id: 'p_3',
    playlistName: 'Photo Op',
    description: 'Photo opportunity poses',
    playlistType: PlaylistType.Sequential,
    tracks: [],
    settings: { repeat: false, repeatCount: 0, randomDelay: false, delayMin: 0, delayMax: 0 },
  },
];

// Mock scripts used by playlists store
export const mockScriptNames = [
  { id: '1', scriptName: 'Open Dome' },
  { id: '2', scriptName: 'Close Dome' },
  { id: '3', scriptName: 'Start Tracking' },
  { id: '4', scriptName: 'Stop Tracking' },
  { id: '5', scriptName: 'Emergency Stop' },
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
