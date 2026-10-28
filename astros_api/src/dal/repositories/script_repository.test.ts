import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Kysely } from 'kysely';
import { Database } from '../types.js';
import { createKyselyConnection, migrateToLatest } from '../database.js';
import { ScriptRepository } from './script_repository.js';
import { logger } from 'src/logger.js';
import {
  Script,
  ScriptChannel,
  ScriptEvent,
  GpioModule,
  GpioChannel,
  MaestroChannel,
  ScriptChannelType,
  ModuleChannelTypes,
  ModuleType,
  ModuleSubType,
  MaestroEvent,
  GpioEvent,
  RandomGpioEvent,
  RandomMaestroEvent,
  UartModule,
  UartChannel,
  HumanCyborgRelationsEvent,
  HcrCommand,
  HumanCyborgRelationsCmd,
  HcrCommandCategory,
  UploadStatus,
} from '../../models/index.js';
import type { MaestroModule } from '../../models/index.js';
import { upsertGpioModule } from './module_repositories/gpio_repository.js';
import { upsertUartModules } from './module_repositories/uart_repository.js';
import { PlaylistRepository } from './playlist_repository.js';
import { Playlist } from '../../models/playlists/playlist.js';
import { TrackType } from '../../models/playlists/trackType.js';
import { PlaylistType } from '../../models/playlists/playlistType.js';

import { v4 as uuid } from 'uuid';

describe('Script Repository', () => {
  let db: Kysely<Database>;
  let raw: ReturnType<typeof createKyselyConnection>['raw'];
  let locationId: string;

  beforeEach(async () => {
    const conn = createKyselyConnection();
    db = conn.db;
    raw = conn.raw;

    await migrateToLatest(db);

    // Create a test location
    locationId = uuid();
    await db
      .insertInto('locations')
      .values({
        id: locationId,
        name: 'Test Location',
        description: 'Test Location Description',
        config_fingerprint: 'test-fingerprint',
      })
      .execute();
  });

  afterEach(async () => {
    await db.destroy();
  });

  it('should save script', async () => {
    const scriptId = uuid();

    const script: Script = {
      id: scriptId,
      scriptName: 'Test Script',
      description: 'Test Description',
      lastSaved: new Date(Date.now()),
      durationDS: 0,
      playlistCount: 0,
      deploymentStatus: {},
      scriptChannels: [],
    };

    const repo = new ScriptRepository(db);

    await repo.upsertScript(script);

    const savedScripts = await repo.getScripts();

    expect(savedScripts.length).toBe(1);
    expect(savedScripts[0].id).toBe(scriptId);
    expect(savedScripts[0].scriptName).toBe('Test Script');
    expect(savedScripts[0].description).toBe('Test Description');
    expect(savedScripts[0].deploymentStatus).toEqual({});
  });

  it('should update script', async () => {
    const scriptId = uuid();

    const script: Script = {
      id: scriptId,
      scriptName: 'Test Script',
      description: 'Test Description',
      lastSaved: new Date(Date.now()),
      durationDS: 0,
      playlistCount: 0,
      deploymentStatus: {},
      scriptChannels: [],
    };

    const repo = new ScriptRepository(db);

    await repo.upsertScript(script);

    const savedScripts = await repo.getScripts();

    expect(savedScripts.length).toBe(1);
    expect(savedScripts[0].id).toBe(scriptId);
    expect(savedScripts[0].scriptName).toBe('Test Script');
    expect(savedScripts[0].description).toBe('Test Description');
    expect(savedScripts[0].deploymentStatus).toEqual({});

    script.scriptName = 'Updated Script';
    script.description = 'Updated Description';

    await repo.upsertScript(script);

    const updatedScripts = await repo.getScripts();

    expect(updatedScripts.length).toBe(1);
    expect(updatedScripts[0].id).toBe(scriptId);
    expect(updatedScripts[0].scriptName).toBe('Updated Script');
    expect(updatedScripts[0].description).toBe('Updated Description');
    expect(updatedScripts[0].deploymentStatus).toEqual({});
  });

  it('should delete script', async () => {
    const scriptId = uuid();

    const script: Script = {
      id: scriptId,
      scriptName: 'Test Script',
      description: 'Test Description',
      lastSaved: new Date(Date.now()),
      durationDS: 0,
      playlistCount: 0,
      deploymentStatus: {},
      scriptChannels: [],
    };

    const repo = new ScriptRepository(db);

    await repo.upsertScript(script);

    const savedScripts = await repo.getScripts();

    expect(savedScripts.length).toBe(1);
    expect(savedScripts[0].id).toBe(scriptId);
    expect(savedScripts[0].scriptName).toBe('Test Script');
    expect(savedScripts[0].description).toBe('Test Description');
    expect(savedScripts[0].deploymentStatus).toEqual({});

    await repo.deleteScript(scriptId);

    const updatedScripts = await repo.getScripts();

    expect(updatedScripts.length).toBe(0);
  });

  it('should copy script', async () => {
    const scriptId = uuid();
    const channelId = uuid();

    // Create a GPIO channel in the database
    const gpioModule = new GpioModule(locationId);
    const gpioChannel = new GpioChannel(channelId, locationId, 0, true, 'Test GPIO Channel', false);
    gpioModule.channels.push(gpioChannel);
    await upsertGpioModule(db, gpioModule);

    // Create a script with a GPIO channel
    const script: Script = {
      id: scriptId,
      scriptName: 'Original Script',
      description: 'Original Description',
      lastSaved: new Date(Date.now()),
      durationDS: 0,
      playlistCount: 0,
      deploymentStatus: {},
      scriptChannels: [],
    };

    const scriptChannel: ScriptChannel = {
      id: uuid(),
      scriptId: scriptId,
      channelType: ScriptChannelType.GPIO,
      parentModuleId: locationId,
      moduleChannelId: channelId,
      moduleChannelType: ModuleChannelTypes.GpioChannel,
      moduleChannel: gpioChannel,
      maxDuration: 0,
      events: {},
    };

    script.scriptChannels.push(scriptChannel);

    const repo = new ScriptRepository(db);

    await repo.upsertScript(script);
    const copyResult = await repo.copyScript(scriptId);

    const allScripts = await repo.getScripts();

    expect(allScripts.length).toBe(2);

    const originalScript = allScripts.find((s) => s.id === scriptId);
    expect(originalScript).toBeDefined();
    expect(originalScript?.scriptName).toBe('Original Script');
    expect(originalScript?.description).toBe('Original Description');

    const copiedScript = allScripts.find((s) => s.id === copyResult.id);
    expect(copiedScript).toBeDefined();
    expect(copiedScript?.id).toMatch(/^s[0-9]{7}[A-Za-z]{3}$/);
    expect(copiedScript?.scriptName).toBe('Original Script (Copy)');
    expect(copiedScript?.description).toBe('Original Description');

    // Verify channels of copy
    const fullCopy = await repo.getScript(copyResult.id);
    expect(fullCopy.scriptChannels.length).toBe(1);
    expect(fullCopy.scriptChannels[0].channelType).toBe(ScriptChannelType.GPIO);
    expect(fullCopy.scriptChannels[0].moduleChannelType).toBe(ModuleChannelTypes.GpioChannel);
    expect(fullCopy.scriptChannels[0].moduleChannel.channelName).toBe('Test GPIO Channel');
  });

  it('should save and retrieve script with GPIO channel', async () => {
    const scriptId = uuid();
    const channelId = uuid();

    // Create a GPIO channel in the database
    const gpioModule = new GpioModule(locationId);
    const gpioChannel = new GpioChannel(channelId, locationId, 0, true, 'Test GPIO Channel', false);
    gpioModule.channels.push(gpioChannel);
    await upsertGpioModule(db, gpioModule);

    // Create a script with a GPIO channel
    const script: Script = {
      id: scriptId,
      scriptName: 'GPIO Test Script',
      description: 'Script with GPIO channel',
      lastSaved: new Date(Date.now()),
      durationDS: 0,
      playlistCount: 0,
      deploymentStatus: {},
      scriptChannels: [],
    };

    const scriptChannel: ScriptChannel = {
      id: uuid(),
      scriptId: scriptId,
      channelType: ScriptChannelType.GPIO,
      parentModuleId: locationId,
      moduleChannelId: channelId,
      moduleChannelType: ModuleChannelTypes.GpioChannel,
      moduleChannel: gpioChannel,
      maxDuration: 0,
      events: {},
    };

    script.scriptChannels.push(scriptChannel);

    const repo = new ScriptRepository(db);
    await repo.upsertScript(script);

    // Retrieve and verify
    const savedScript = await repo.getScript(scriptId);

    expect(savedScript.scriptChannels.length).toBe(1);
    expect(savedScript.scriptChannels[0].channelType).toBe(ScriptChannelType.GPIO);
    expect(savedScript.scriptChannels[0].moduleChannelType).toBe(ModuleChannelTypes.GpioChannel);
    expect(savedScript.scriptChannels[0].moduleChannel.channelName).toBe('Test GPIO Channel');
  });

  it('should save and retrieve script with Maestro channel', async () => {
    const scriptId = uuid();
    const maestroModuleId = uuid();
    const maestroChannelId = uuid();

    // Create a Maestro module and channel in the database
    const maestroModule: MaestroModule = { boards: [] };

    maestroModule.boards.push({
      id: maestroModuleId,
      parentId: locationId,
      boardId: 0,
      name: 'Test Board',
      channelCount: 24,
      channels: [],
    });

    const maestroChannel = new MaestroChannel(
      maestroChannelId,
      maestroModuleId,
      'Servo Channel 1',
      true,
      0,
      true,
      500,
      2500,
      1500,
      false,
    );

    maestroModule.boards[0].channels.push(maestroChannel);

    // Wrap the maestro module in a UartModule
    const uartModule = new UartModule(
      0,
      maestroModuleId,
      'Test Maestro',
      locationId,
      ModuleSubType.maestro,
      0,
      9600,
    );
    uartModule.subModule = maestroModule;

    await db.transaction().execute(async (trx) => {
      await upsertUartModules(trx, [uartModule]);
    });

    // Create a script with a Maestro channel
    const script: Script = {
      id: scriptId,
      scriptName: 'Maestro Test Script',
      description: 'Script with Maestro channel',
      lastSaved: new Date(Date.now()),
      durationDS: 0,
      playlistCount: 0,
      deploymentStatus: {},
      scriptChannels: [],
    };

    const scriptChannel: ScriptChannel = {
      id: uuid(),
      scriptId: scriptId,
      channelType: ScriptChannelType.SERVO,
      parentModuleId: maestroModuleId,
      moduleChannelId: maestroChannelId,
      moduleChannelType: ModuleChannelTypes.MaestroChannel,
      moduleChannel: maestroChannel,
      maxDuration: 0,
      events: {},
    };

    script.scriptChannels.push(scriptChannel);

    const repo = new ScriptRepository(db);
    await repo.upsertScript(script);

    // Retrieve and verify
    const savedScript = await repo.getScript(scriptId);

    expect(savedScript.scriptChannels.length).toBe(1);
    expect(savedScript.scriptChannels[0].channelType).toBe(ScriptChannelType.SERVO);
    expect(savedScript.scriptChannels[0].moduleChannelType).toBe(ModuleChannelTypes.MaestroChannel);
    expect(savedScript.scriptChannels[0].moduleChannel.channelName).toBe('Servo Channel 1');
  });

  it('should save and retrieve script with events', async () => {
    const scriptId = uuid();
    const channelId = uuid();
    const eventId = uuid();

    // Create a GPIO channel
    const gpioModule = new GpioModule(locationId);
    const gpioChannel = new GpioChannel(channelId, locationId, 0, true, 'Test GPIO', false);
    gpioModule.channels.push(gpioChannel);
    await upsertGpioModule(db, gpioModule);

    // Create a script with a channel and event
    const script: Script = {
      id: scriptId,
      scriptName: 'Event Test Script',
      description: 'Script with events',
      lastSaved: new Date(Date.now()),
      durationDS: 0,
      playlistCount: 0,
      deploymentStatus: {},
      scriptChannels: [],
    };

    const scriptChannel: ScriptChannel = {
      id: uuid(),
      scriptId: scriptId,
      channelType: ScriptChannelType.GPIO,
      parentModuleId: locationId,
      moduleChannelId: channelId,
      moduleChannelType: ModuleChannelTypes.GpioChannel,
      moduleChannel: gpioChannel,
      maxDuration: 0,
      events: {},
    };

    const scriptEvent: ScriptEvent = {
      id: eventId,
      scriptChannel: scriptChannel.id,
      moduleType: ModuleType.gpio,
      moduleSubType: ModuleSubType.genericGpio,
      time: 5.5,
      endTime: null,
      event: { setHigh: true } as GpioEvent,
    };

    scriptChannel.events[eventId] = scriptEvent;
    script.scriptChannels.push(scriptChannel);

    const repo = new ScriptRepository(db);
    await repo.upsertScript(script);

    // Retrieve and verify
    const savedScript = await repo.getScript(scriptId);

    expect(savedScript.scriptChannels.length).toBe(1);
    expect(Object.keys(savedScript.scriptChannels[0].events).length).toBe(1);

    const savedEvent = savedScript.scriptChannels[0].events[eventId];
    expect(savedEvent).toBeDefined();
    expect(savedEvent.time).toBe(5.5);
    expect(savedEvent.moduleType).toBe(ModuleType.gpio);
    expect(savedEvent.moduleSubType).toBe(ModuleSubType.genericGpio);
  });

  it('should update Maestro channel number in events', async () => {
    const scriptId = uuid();
    const maestroModuleId = uuid();
    const maestroChannelId = uuid();
    const eventId = uuid();

    // Create Maestro module and channel
    const maestroModule: MaestroModule = { boards: [] };

    maestroModule.boards.push({
      id: maestroModuleId,
      parentId: locationId,
      boardId: 0,
      name: 'Test Board',
      channelCount: 24,
      channels: [],
    });

    const maestroChannel = new MaestroChannel(
      maestroChannelId,
      maestroModuleId,
      'Servo Channel 5',
      true,
      5, // Channel number
      true, // isServo
      500,
      2500,
      1500,
      false,
    );

    maestroModule.boards[0].channels.push(maestroChannel);
    // Wrap the maestro module in a UartModule
    const uartModule = new UartModule(
      0,
      maestroModuleId,
      'Test Maestro',
      locationId,
      ModuleSubType.maestro,
      0,
      9600,
    );
    uartModule.subModule = maestroModule;

    await db.transaction().execute(async (trx) => {
      await upsertUartModules(trx, [uartModule]);
    });

    // Create script with Maestro event
    const script: Script = {
      id: scriptId,
      scriptName: 'Maestro Event Test',
      description: 'Test Maestro event channel update',
      lastSaved: new Date(Date.now()),
      durationDS: 0,
      playlistCount: 0,
      deploymentStatus: {},
      scriptChannels: [],
    };

    const scriptChannel: ScriptChannel = {
      id: uuid(),
      scriptId: scriptId,
      channelType: ScriptChannelType.SERVO,
      parentModuleId: maestroModuleId,
      moduleChannelId: maestroChannelId,
      moduleChannelType: ModuleChannelTypes.MaestroChannel,
      moduleChannel: maestroChannel,
      maxDuration: 0,
      events: {},
    };

    const maestroEvent = {
      channel: 0,
      isServo: true,
      position: 1500,
      speed: 0,
      acceleration: 0,
    } as MaestroEvent; // Channel is 0 initially
    const scriptEvent: ScriptEvent = {
      id: eventId,
      scriptChannel: scriptChannel.id,
      moduleType: ModuleType.uart,
      moduleSubType: ModuleSubType.maestro,
      time: 2.0,
      endTime: null,
      event: maestroEvent,
    };

    scriptChannel.events[eventId] = scriptEvent;
    script.scriptChannels.push(scriptChannel);

    const repo = new ScriptRepository(db);
    await repo.upsertScript(script);

    // Retrieve and verify channel number was updated
    const savedScript = await repo.getScript(scriptId);
    const savedEvent = savedScript.scriptChannels[0].events[eventId] as ScriptEvent;

    expect(savedEvent).toBeDefined();
    const savedMaestroEvent = savedEvent.event as MaestroEvent;
    expect(savedMaestroEvent.channel).toBe(5); // Should be updated to match the channel
  });

  it('should save and retrieve script with Human Cyborg Relations channel', async () => {
    const scriptId = uuid();
    const hcrModuleId = uuid();

    // Create an HCR UART module and channel in the database
    // For generic UART channels, the channel ID is the same as the module ID
    const uartChannel = new UartChannel(
      hcrModuleId,
      hcrModuleId,
      'HCR Channel 1',
      ModuleSubType.humanCyborgRelationsSerial,
      true,
    );

    const uartModule = new UartModule(
      0,
      hcrModuleId,
      'Test HCR',
      locationId,
      ModuleSubType.humanCyborgRelationsSerial,
      0,
      9600,
    );

    await db.transaction().execute(async (trx) => {
      await upsertUartModules(trx, [uartModule]);
    });

    // Create a script with an HCR channel
    const script: Script = {
      id: scriptId,
      scriptName: 'HCR Test Script',
      description: 'Script with HCR channel',
      lastSaved: new Date(Date.now()),
      durationDS: 0,
      playlistCount: 0,
      deploymentStatus: {},
      scriptChannels: [],
    };

    const scriptChannel: ScriptChannel = {
      id: uuid(),
      scriptId: scriptId,
      channelType: ScriptChannelType.GENERIC_UART,
      parentModuleId: hcrModuleId,
      moduleChannelId: hcrModuleId,
      moduleChannelType: ModuleChannelTypes.UartChannel,
      moduleChannel: uartChannel,
      maxDuration: 0,
      events: {},
    };

    script.scriptChannels.push(scriptChannel);

    const repo = new ScriptRepository(db);
    await repo.upsertScript(script);

    // Retrieve and verify
    const savedScript = await repo.getScript(scriptId);

    expect(savedScript.scriptChannels.length).toBe(1);
    expect(savedScript.scriptChannels[0].channelType).toBe(ScriptChannelType.GENERIC_UART);
    expect(savedScript.scriptChannels[0].moduleChannelType).toBe(ModuleChannelTypes.UartChannel);
    // For generic UART channels, the channel name comes from the module name
    expect(savedScript.scriptChannels[0].moduleChannel.channelName).toBe('Test HCR');
  });

  it('should save and retrieve script with HCR events', async () => {
    const scriptId = uuid();
    const hcrModuleId = uuid();
    const eventId = uuid();

    // Create an HCR UART module and channel
    // For generic UART channels, the channel ID is the same as the module ID
    const uartChannel = new UartChannel(
      hcrModuleId,
      hcrModuleId,
      'HCR Channel 1',
      ModuleSubType.humanCyborgRelationsSerial,
      true,
    );

    const uartModule = new UartModule(
      0,
      hcrModuleId,
      'Test HCR',
      locationId,
      ModuleSubType.humanCyborgRelationsSerial,
      0,
      9600,
    );

    await db.transaction().execute(async (trx) => {
      await upsertUartModules(trx, [uartModule]);
    });

    // Create a script with an HCR channel and event
    const script: Script = {
      id: scriptId,
      scriptName: 'HCR Event Test Script',
      description: 'Script with HCR events',
      lastSaved: new Date(Date.now()),
      durationDS: 0,
      playlistCount: 0,
      deploymentStatus: {},
      scriptChannels: [],
    };

    const scriptChannel: ScriptChannel = {
      id: uuid(),
      scriptId: scriptId,
      channelType: ScriptChannelType.GENERIC_UART,
      parentModuleId: hcrModuleId,
      moduleChannelId: hcrModuleId,
      moduleChannelType: ModuleChannelTypes.UartChannel,
      moduleChannel: uartChannel,
      maxDuration: 0,
      events: {},
    };

    // Create HCR commands
    const hcrCommands = [
      {
        id: uuid(),
        category: HcrCommandCategory.stimuli,
        command: HumanCyborgRelationsCmd.mildHappy,
        valueA: 0,
        valueB: 0,
      } as HcrCommand,
      {
        id: uuid(),
        category: HcrCommandCategory.volume,
        command: HumanCyborgRelationsCmd.vocalizerVolume,
        valueA: 75,
        valueB: 0,
      } as HcrCommand,
    ];

    const hcrEvent = { commands: hcrCommands } as HumanCyborgRelationsEvent;
    const scriptEvent: ScriptEvent = {
      id: eventId,
      scriptChannel: scriptChannel.id,
      moduleType: ModuleType.uart,
      moduleSubType: ModuleSubType.humanCyborgRelationsSerial,
      time: 3.5,
      endTime: null,
      event: hcrEvent,
    };

    scriptChannel.events[eventId] = scriptEvent;
    script.scriptChannels.push(scriptChannel);

    const repo = new ScriptRepository(db);
    await repo.upsertScript(script);

    // Retrieve and verify
    const savedScript = await repo.getScript(scriptId);

    expect(savedScript.scriptChannels.length).toBe(1);
    expect(Object.keys(savedScript.scriptChannels[0].events).length).toBe(1);

    const savedEvent = savedScript.scriptChannels[0].events[eventId];
    expect(savedEvent).toBeDefined();
    expect(savedEvent.time).toBe(3.5);
    expect(savedEvent.moduleType).toBe(ModuleType.uart);
    expect(savedEvent.moduleSubType).toBe(ModuleSubType.humanCyborgRelationsSerial);

    const savedHcrEvent = savedEvent.event as HumanCyborgRelationsEvent;
    expect(savedHcrEvent.commands).toBeDefined();
    expect(savedHcrEvent.commands.length).toBe(2);
    expect(savedHcrEvent.commands[0].category).toBe(HcrCommandCategory.stimuli);
    expect(savedHcrEvent.commands[0].command).toBe(HumanCyborgRelationsCmd.mildHappy);
    expect(savedHcrEvent.commands[1].category).toBe(HcrCommandCategory.volume);
    expect(savedHcrEvent.commands[1].command).toBe(HumanCyborgRelationsCmd.vocalizerVolume);
    expect(savedHcrEvent.commands[1].valueA).toBe(75);
  });

  it('should remove playlist tracks referencing deleted script', async () => {
    const scriptId = uuid();
    const playlistId = uuid();

    const script: Script = {
      id: scriptId,
      scriptName: 'Test Script',
      description: 'Description',
      lastSaved: new Date(),
      durationDS: 0,
      playlistCount: 0,
      deploymentStatus: {},
      scriptChannels: [],
    };
    const scriptRepo = new ScriptRepository(db);
    await scriptRepo.upsertScript(script);

    const playlist: Playlist = {
      id: playlistId,
      playlistName: 'Test Playlist',
      description: '',
      playlistType: PlaylistType.Sequential,
      settings: { randomDelay: false, delayMin: 0, delayMax: 0, repeat: false, repeatCount: 0 },
      tracks: [
        {
          id: uuid(),
          idx: 0,
          playlistId,
          durationDS: 100,
          trackType: TrackType.Script,
          trackId: scriptId,
          trackName: 'Test Script',
          randomWait: false,
          durationMaxDS: 0,
        },
      ],
    };

    const playlistRepo = new PlaylistRepository(db);
    await playlistRepo.upsertPlaylist(playlist);

    // Verify track exists
    const before = await playlistRepo.getPlaylist(playlistId);
    expect(before).toBeDefined();
    expect(before?.tracks.length).toBe(1);

    await scriptRepo.deleteScript(scriptId);

    // Playlist track should be removed
    const after = await playlistRepo.getPlaylist(playlistId);
    expect(after).toBeDefined();
    expect(after?.tracks.length).toBe(0);
  });

  it('should only remove playlist tracks for the deleted script', async () => {
    const scriptId1 = uuid();
    const scriptId2 = uuid();
    const playlistId = uuid();

    const scriptRepo = new ScriptRepository(db);
    await scriptRepo.upsertScript({
      id: scriptId1,
      scriptName: 'Script 1',
      description: '',
      lastSaved: new Date(),
      durationDS: 0,
      playlistCount: 0,
      deploymentStatus: {},
      scriptChannels: [],
    });
    await scriptRepo.upsertScript({
      id: scriptId2,
      scriptName: 'Script 2',
      description: '',
      lastSaved: new Date(),
      durationDS: 0,
      playlistCount: 0,
      deploymentStatus: {},
      scriptChannels: [],
    });

    const playlist: Playlist = {
      id: playlistId,
      playlistName: 'Test Playlist',
      description: '',
      playlistType: PlaylistType.Sequential,
      settings: { randomDelay: false, delayMin: 0, delayMax: 0, repeat: false, repeatCount: 0 },
      tracks: [
        {
          id: uuid(),
          idx: 0,
          playlistId,
          durationDS: 100,
          trackType: TrackType.Script,
          trackId: scriptId1,
          trackName: 'Script 1',
          randomWait: false,
          durationMaxDS: 0,
        },
        {
          id: uuid(),
          idx: 1,
          playlistId,
          durationDS: 100,
          trackType: TrackType.Script,
          trackId: scriptId2,
          trackName: 'Script 2',
          randomWait: false,
          durationMaxDS: 0,
        },
      ],
    };

    const playlistRepo = new PlaylistRepository(db);
    await playlistRepo.upsertPlaylist(playlist);

    await scriptRepo.deleteScript(scriptId1);

    const after = await playlistRepo.getPlaylist(playlistId);
    expect(after).toBeDefined();
    expect(after?.tracks.length).toBe(1);
    expect(after?.tracks[0].trackId).toBe(scriptId2);
  });

  it('should remove tracks from multiple playlists when script is deleted', async () => {
    const scriptId = uuid();
    const playlistId1 = uuid();
    const playlistId2 = uuid();

    const scriptRepo = new ScriptRepository(db);
    await scriptRepo.upsertScript({
      id: scriptId,
      scriptName: 'Test Script',
      description: '',
      lastSaved: new Date(),
      durationDS: 0,
      playlistCount: 0,
      deploymentStatus: {},
      scriptChannels: [],
    });

    const makePlaylist = (plId: string, name: string): Playlist => ({
      id: plId,
      playlistName: name,
      description: '',
      playlistType: PlaylistType.Sequential,
      settings: { randomDelay: false, delayMin: 0, delayMax: 0, repeat: false, repeatCount: 0 },
      tracks: [
        {
          id: uuid(),
          idx: 0,
          playlistId: plId,
          durationDS: 100,
          trackType: TrackType.Script,
          trackId: scriptId,
          trackName: 'Test Script',
          randomWait: false,
          durationMaxDS: 0,
        },
      ],
    });

    const playlistRepo = new PlaylistRepository(db);
    await playlistRepo.upsertPlaylist(makePlaylist(playlistId1, 'Playlist 1'));
    await playlistRepo.upsertPlaylist(makePlaylist(playlistId2, 'Playlist 2'));

    await scriptRepo.deleteScript(scriptId);

    const after1 = await playlistRepo.getPlaylist(playlistId1);
    const after2 = await playlistRepo.getPlaylist(playlistId2);
    expect(after1).toBeDefined();
    expect(after2).toBeDefined();
    expect(after1?.tracks.length).toBe(0);
    expect(after2?.tracks.length).toBe(0);
  });

  it('should not remove non-Script track types when script is deleted', async () => {
    const scriptId = uuid();
    const playlistId = uuid();
    const waitTrackId = uuid();

    const scriptRepo = new ScriptRepository(db);
    await scriptRepo.upsertScript({
      id: scriptId,
      scriptName: 'Test Script',
      description: '',
      lastSaved: new Date(),
      durationDS: 0,
      playlistCount: 0,
      deploymentStatus: {},
      scriptChannels: [],
    });

    const playlist: Playlist = {
      id: playlistId,
      playlistName: 'Test Playlist',
      description: '',
      playlistType: PlaylistType.Shuffle,
      settings: { randomDelay: false, delayMin: 0, delayMax: 0, repeat: false, repeatCount: 0 },
      tracks: [
        {
          id: uuid(),
          idx: 0,
          playlistId,
          durationDS: 100,
          trackType: TrackType.Script,
          trackId: scriptId,
          trackName: 'Test Script',
          randomWait: false,
          durationMaxDS: 0,
        },
        {
          id: waitTrackId,
          idx: 1,
          playlistId,
          durationDS: 50,
          trackType: TrackType.Wait,
          trackId: '',
          trackName: 'Wait',
          randomWait: false,
          durationMaxDS: 0,
        },
      ],
    };

    const playlistRepo = new PlaylistRepository(db);
    await playlistRepo.upsertPlaylist(playlist);

    await scriptRepo.deleteScript(scriptId);

    const after = await playlistRepo.getPlaylist(playlistId);
    expect(after).toBeDefined();
    expect(after?.tracks.length).toBe(1);
    expect(after?.tracks[0].id).toBe(waitTrackId);
    expect(after?.tracks[0].trackType).toBe(TrackType.Wait);
  });

  describe('script_deployments FK contract', () => {
    // Regression: handleScriptDeployResponse stored the location NAME in
    // script_deployments.location_id, which is a FK to locations.id (a UUID).
    // Once migration_6 added that FK, uploading a script threw
    // "FOREIGN KEY constraint failed". These pin the contract: a deployment row
    // must be keyed by the location id, never the name.
    async function seedScript(): Promise<string> {
      const scriptId = uuid();
      const scriptRepo = new ScriptRepository(db);
      await scriptRepo.upsertScript({
        id: scriptId,
        scriptName: 'Deploy Test',
        description: '',
        lastSaved: new Date(),
        durationDS: 0,
        playlistCount: 0,
        deploymentStatus: {},
        scriptChannels: [],
      });
      return scriptId;
    }

    it('records a deployment keyed by the location id and round-trips the date', async () => {
      const scriptRepo = new ScriptRepository(db);
      const scriptId = await seedScript();

      const deployedAt = new Date('2026-05-31T12:00:00.000Z');
      await scriptRepo.updateScriptControllerUploaded(scriptId, locationId, deployedAt);

      const roundTrip = await scriptRepo.getLastScriptUploadedDate(scriptId, locationId);
      expect(roundTrip.getTime()).toBe(deployedAt.getTime());
    });

    it('upserts last_deployed on repeat deployment (single row per script+location)', async () => {
      const scriptRepo = new ScriptRepository(db);
      const scriptId = await seedScript();

      const first = new Date('2026-05-31T12:00:00.000Z');
      const second = new Date('2026-05-31T13:30:00.000Z');
      await scriptRepo.updateScriptControllerUploaded(scriptId, locationId, first);
      await scriptRepo.updateScriptControllerUploaded(scriptId, locationId, second);

      const roundTrip = await scriptRepo.getLastScriptUploadedDate(scriptId, locationId);
      expect(roundTrip.getTime()).toBe(second.getTime());

      const rows = await db
        .selectFrom('script_deployments')
        .selectAll()
        .where('script_id', '=', scriptId)
        .execute();
      expect(rows.length).toBe(1);
    });

    it('rejects a deployment whose location_id is a location NAME, not an id (the original bug)', async () => {
      const scriptRepo = new ScriptRepository(db);
      const scriptId = await seedScript();

      // 'dome' is what getLocationNameByMac returns; it is a locations.name, not
      // a locations.id, so the FK on script_deployments.location_id rejects it.
      await expect(
        scriptRepo.updateScriptControllerUploaded(scriptId, 'dome', new Date()),
      ).rejects.toThrow(/FOREIGN KEY constraint failed/);
    });
  });

  describe('getScriptDurationsDS', () => {
    it('returns a map of script id → recorded duration_ds for every script', async () => {
      const scriptRepo = new ScriptRepository(db);
      const a = uuid();
      const b = uuid();
      await db
        .insertInto('scripts')
        .values([
          {
            id: a,
            name: 'A',
            description: '',
            last_modified: Date.now(),
            enabled: 1,
            duration_ds: 8,
          },
          {
            id: b,
            name: 'B',
            description: '',
            last_modified: Date.now(),
            enabled: 1,
            duration_ds: 50,
          },
        ])
        .execute();

      const durations = await scriptRepo.getScriptDurationsDS();

      expect(durations.get(a)).toBe(8);
      expect(durations.get(b)).toBe(50);
    });
  });

  describe('getScript duration', () => {
    it('recomputes a legacy -1 duration from the loaded channels', async () => {
      const scriptId = uuid();
      const channelId = uuid();
      const eventId = uuid();

      const gpioModule = new GpioModule(locationId);
      const gpioChannel = new GpioChannel(channelId, locationId, 0, true, 'Test GPIO', false);
      gpioModule.channels.push(gpioChannel);
      await upsertGpioModule(db, gpioModule);

      const scriptChannel: ScriptChannel = {
        id: uuid(),
        scriptId,
        channelType: ScriptChannelType.GPIO,
        parentModuleId: locationId,
        moduleChannelId: channelId,
        moduleChannelType: ModuleChannelTypes.GpioChannel,
        moduleChannel: gpioChannel,
        maxDuration: 0,
        events: {
          [eventId]: {
            id: eventId,
            scriptChannel: '',
            moduleType: ModuleType.gpio,
            moduleSubType: ModuleSubType.genericGpio,
            time: 45,
            endTime: null,
            event: { setHigh: true } as GpioEvent,
          },
        },
      };
      scriptChannel.events[eventId].scriptChannel = scriptChannel.id;

      const repo = new ScriptRepository(db);
      await repo.upsertScript({
        id: scriptId,
        scriptName: 'Legacy Duration',
        description: '',
        lastSaved: new Date(),
        durationDS: 0,
        playlistCount: 0,
        deploymentStatus: {},
        scriptChannels: [scriptChannel],
      });

      // A row never re-saved since migration_2 still holds the column default.
      await db.updateTable('scripts').set({ duration_ds: -1 }).where('id', '=', scriptId).execute();

      const warnSpy = vi.spyOn(logger, 'warn');
      try {
        const script = await repo.getScript(scriptId);

        expect(script.durationDS).toBe(450);
        // The repair is observable, not silent: getScriptDurationsDS (the
        // playlist path) still returns the raw stored value.
        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringMatching(new RegExp(`${scriptId}.*-1.*\\b450\\b`)),
        );
      } finally {
        warnSpy.mockRestore();
      }
    });

    it('does not warn for a valid stored duration', async () => {
      const scriptId = uuid();
      const repo = new ScriptRepository(db);
      await repo.upsertScript({
        id: scriptId,
        scriptName: 'Valid Duration',
        description: '',
        lastSaved: new Date(),
        durationDS: 0,
        playlistCount: 0,
        deploymentStatus: {},
        scriptChannels: [],
      });

      const warnSpy = vi.spyOn(logger, 'warn');
      try {
        await repo.getScript(scriptId);

        expect(warnSpy).not.toHaveBeenCalledWith(
          expect.stringContaining('invalid stored duration_ds'),
        );
      } finally {
        warnSpy.mockRestore();
      }
    });
  });

  describe('deploymentStatus keying (read path)', () => {
    // Regression: getScripts()/getScript() keyed deploymentStatus by the
    // location id (UUID FK), but the WebSocket update path (ScriptResponse) and
    // every frontend consumer key it by the location NAME ('body'|'core'|'dome').
    // On page refresh the UUID-keyed entries never matched the name lookup, so
    // every status badge reverted to "Not uploaded". The read path must key the
    // returned deploymentStatus by the location name, never the id.
    async function seedDeployedScript(
      locName: string,
    ): Promise<{ scriptId: string; deployedAt: Date }> {
      // The body/core/dome locations are seeded by migration_0 with a UNIQUE
      // name; resolve the seeded id rather than inserting a duplicate.
      const { id: locId } = await db
        .selectFrom('locations')
        .select('id')
        .where('name', '=', locName)
        .executeTakeFirstOrThrow();

      const scriptId = uuid();
      const scriptRepo = new ScriptRepository(db);
      await scriptRepo.upsertScript({
        id: scriptId,
        scriptName: 'Deployed Script',
        description: '',
        lastSaved: new Date(),
        durationDS: 0,
        playlistCount: 0,
        deploymentStatus: {},
        scriptChannels: [],
      });

      const deployedAt = new Date('2026-05-31T12:00:00.000Z');
      await scriptRepo.updateScriptControllerUploaded(scriptId, locId, deployedAt);

      return { scriptId, deployedAt };
    }

    it('getScripts keys deploymentStatus by location name, not the id', async () => {
      const { scriptId, deployedAt } = await seedDeployedScript('dome');
      const scriptRepo = new ScriptRepository(db);

      const script = (await scriptRepo.getScripts()).find((s) => s.id === scriptId);

      expect(script).toBeDefined();
      // 'dome' is the SOLE key — keyed by the location name the frontend looks up
      // by, never the location id UUID (the original bug).
      expect(Object.keys(script?.deploymentStatus ?? {})).toEqual(['dome']);
      const status = script?.deploymentStatus['dome'];
      expect(status?.value).toBe(UploadStatus.uploaded);
      expect(status?.date.getTime()).toBe(deployedAt.getTime());
    });

    it('getScript keys deploymentStatus by location name, not the id', async () => {
      const { scriptId, deployedAt } = await seedDeployedScript('body');
      const scriptRepo = new ScriptRepository(db);

      const script = await scriptRepo.getScript(scriptId);

      expect(Object.keys(script.deploymentStatus)).toEqual(['body']);
      const status = script.deploymentStatus['body'];
      expect(status?.value).toBe(UploadStatus.uploaded);
      expect(status?.date.getTime()).toBe(deployedAt.getTime());
    });

    it('skips (and logs) a deployment row whose location was removed', async () => {
      const { scriptId } = await seedDeployedScript('dome');
      const scriptRepo = new ScriptRepository(db);

      // The FK cascade (migration_6) normally prevents an orphaned deployment;
      // manufacture one by deleting the location with foreign keys disabled, so
      // the left join yields a null location_name on read.
      raw.pragma('foreign_keys = OFF');
      await db.deleteFrom('locations').where('name', '=', 'dome').execute();
      raw.pragma('foreign_keys = ON');

      const warnSpy = vi.spyOn(logger, 'warn');
      try {
        const fromList = (await scriptRepo.getScripts()).find((s) => s.id === scriptId);
        expect(fromList?.deploymentStatus).toEqual({});

        const single = await scriptRepo.getScript(scriptId);
        expect(single.deploymentStatus).toEqual({});

        // The skip is observable, not silent.
        expect(warnSpy).toHaveBeenCalled();
      } finally {
        warnSpy.mockRestore();
      }
    });
  });

  describe('random span events', () => {
    const maestroChannelNumber = 5;

    async function seedMaestroChannel(): Promise<{ moduleId: string; channel: MaestroChannel }> {
      const moduleId = uuid();
      const channel = new MaestroChannel(
        uuid(),
        moduleId,
        'Servo Channel 5',
        true,
        maestroChannelNumber,
        true, // isServo
        500,
        2500,
        1500,
        false,
      );
      const maestroModule: MaestroModule = {
        boards: [
          {
            id: moduleId,
            parentId: locationId,
            boardId: 0,
            name: 'Test Board',
            channelCount: 24,
            channels: [channel],
          },
        ],
      };
      const uartModule = new UartModule(
        0,
        moduleId,
        'Test Maestro',
        locationId,
        ModuleSubType.maestro,
        0,
        9600,
      );
      uartModule.subModule = maestroModule;
      await db.transaction().execute(async (trx) => {
        await upsertUartModules(trx, [uartModule]);
      });
      return { moduleId, channel };
    }

    async function seedGpioChannel(): Promise<GpioChannel> {
      const gpioModule = new GpioModule(locationId);
      const channel = new GpioChannel(uuid(), locationId, 0, true, 'Test GPIO', false);
      gpioModule.channels.push(channel);
      await upsertGpioModule(db, gpioModule);
      return channel;
    }

    function scriptWith(scriptChannel: ScriptChannel, evt: ScriptEvent): Script {
      scriptChannel.events[evt.id] = evt;
      return {
        id: scriptChannel.scriptId,
        scriptName: 'Span Test Script',
        description: '',
        lastSaved: new Date(Date.now()),
        durationDS: 0,
        playlistCount: 0,
        deploymentStatus: {},
        scriptChannels: [scriptChannel],
      };
    }

    function gpioScriptChannel(scriptId: string, channel: GpioChannel): ScriptChannel {
      return {
        id: uuid(),
        scriptId,
        channelType: ScriptChannelType.GPIO,
        parentModuleId: locationId,
        moduleChannelId: channel.id,
        moduleChannelType: ModuleChannelTypes.GpioChannel,
        moduleChannel: channel,
        maxDuration: 0,
        events: {},
      };
    }

    async function storedRow(eventId: string) {
      return db
        .selectFrom('script_events')
        .select(['time', 'end_time', 'data'])
        .where('id', '=', eventId)
        .executeTakeFirstOrThrow();
    }

    it('round-trips a random maestro span', async () => {
      const { moduleId, channel } = await seedMaestroChannel();
      const scriptId = uuid();
      const scriptChannel: ScriptChannel = {
        id: uuid(),
        scriptId,
        channelType: ScriptChannelType.SERVO,
        parentModuleId: moduleId,
        moduleChannelId: channel.id,
        moduleChannelType: ModuleChannelTypes.MaestroChannel,
        moduleChannel: channel,
        maxDuration: 0,
        events: {},
      };
      const payload: RandomMaestroEvent = {
        channel: -1,
        isServo: true,
        minGapMs: 400,
        maxGapMs: 2000,
        minPos: 20,
        maxPos: 100,
        minMove: 15,
        maxMove: 60,
        speed: 0,
        acceleration: 0,
      };
      const evt: ScriptEvent = {
        id: uuid(),
        scriptChannel: scriptChannel.id,
        moduleType: ModuleType.uart,
        moduleSubType: ModuleSubType.maestro,
        time: 2.0,
        endTime: 18.5,
        // A copy: the repository overwrites channel on the object it saves.
        event: { ...payload },
      };

      const repo = new ScriptRepository(db);
      await repo.upsertScript(scriptWith(scriptChannel, evt));

      expect(await storedRow(evt.id)).toMatchObject({ time: 20, end_time: 185 });

      const saved = (await repo.getScript(scriptId)).scriptChannels[0].events[evt.id];
      expect(saved.time).toBe(2.0);
      expect(saved.endTime).toBe(18.5);
      expect(saved.event).toEqual({ ...payload, channel: maestroChannelNumber });
    });

    it('round-trips a random gpio span with maxMove-free payload', async () => {
      const channel = await seedGpioChannel();
      const scriptId = uuid();
      const scriptChannel = gpioScriptChannel(scriptId, channel);
      const payload: RandomGpioEvent = { minGapMs: 50, maxGapMs: 400 };
      const evt: ScriptEvent = {
        id: uuid(),
        scriptChannel: scriptChannel.id,
        moduleType: ModuleType.gpio,
        moduleSubType: ModuleSubType.genericGpio,
        time: 0.5,
        // x10 === 453.00000000000006: stored rounded, like time.
        endTime: 45.2 + 0.1,
        event: { ...payload },
      };

      const repo = new ScriptRepository(db);
      await repo.upsertScript(scriptWith(scriptChannel, evt));

      expect(await storedRow(evt.id)).toMatchObject({ time: 5, end_time: 453 });

      const saved = (await repo.getScript(scriptId)).scriptChannels[0].events[evt.id];
      expect(saved.endTime).toBe(45.3);
      expect(saved.event).toEqual(payload);
    });

    // Arithmetic-derived end times drift either side of a whole decisecond:
    // the above-integer case separates rounding from ceil, the below-integer
    // case from floor/trunc.
    it.each([
      { label: '45.2 + 0.1', endTime: 45.2 + 0.1, ds: 453 }, // x10 === 453.00000000000006
      { label: '0.7 + 0.1', endTime: 0.7 + 0.1, ds: 8 }, // x10 === 7.999999999999999
    ])('stores endTime $label s as $ds ds', async ({ endTime, ds }) => {
      const channel = await seedGpioChannel();
      const scriptId = uuid();
      const scriptChannel = gpioScriptChannel(scriptId, channel);
      const evt: ScriptEvent = {
        id: uuid(),
        scriptChannel: scriptChannel.id,
        moduleType: ModuleType.gpio,
        moduleSubType: ModuleSubType.genericGpio,
        time: 0,
        endTime,
        event: { minGapMs: 50, maxGapMs: 400 },
      };

      const repo = new ScriptRepository(db);
      await repo.upsertScript(scriptWith(scriptChannel, evt));

      expect((await storedRow(evt.id)).end_time).toBe(ds);
      const saved = (await repo.getScript(scriptId)).scriptChannels[0].events[evt.id];
      expect(saved.endTime).toBe(ds / 10);
    });

    function gpioSpan(scriptChannel: ScriptChannel, time: number, endTime: number): ScriptEvent {
      return {
        id: uuid(),
        scriptChannel: scriptChannel.id,
        moduleType: ModuleType.gpio,
        moduleSubType: ModuleSubType.genericGpio,
        time,
        endTime,
        event: { minGapMs: 50, maxGapMs: 400 },
      };
    }

    // The playlist queue reads getScriptDurationsDS; runScript reads getScript.
    it("a span script's stored duration counts the span's end", async () => {
      const channel = await seedGpioChannel();
      const scriptId = uuid();
      const scriptChannel = gpioScriptChannel(scriptId, channel);
      const point: ScriptEvent = {
        id: uuid(),
        scriptChannel: scriptChannel.id,
        moduleType: ModuleType.gpio,
        moduleSubType: ModuleSubType.genericGpio,
        time: 10.0,
        endTime: null,
        event: { setHigh: true } as GpioEvent,
      };
      scriptChannel.events[point.id] = point;
      const repo = new ScriptRepository(db);
      await repo.upsertScript(scriptWith(scriptChannel, gpioSpan(scriptChannel, 2.0, 18.5)));

      expect((await repo.getScriptDurationsDS()).get(scriptId)).toBe(185);
      expect((await repo.getScript(scriptId)).durationDS).toBe(185);
    });

    it('copying a script keeps its spans', async () => {
      const channel = await seedGpioChannel();
      const scriptId = uuid();
      const scriptChannel = gpioScriptChannel(scriptId, channel);
      const repo = new ScriptRepository(db);
      await repo.upsertScript(scriptWith(scriptChannel, gpioSpan(scriptChannel, 2.0, 18.5)));

      const copy = await repo.getScript((await repo.copyScript(scriptId)).id);

      const events = Object.values(copy.scriptChannels[0].events);
      expect(events.map((e) => [e.time, e.endTime, e.event])).toEqual([
        [2.0, 18.5, { minGapMs: 50, maxGapMs: 400 }],
      ]);
      expect(copy.durationDS).toBe(185);
    });

    it('point events read back endTime null', async () => {
      const channel = await seedGpioChannel();
      const scriptId = uuid();
      const scriptChannel = gpioScriptChannel(scriptId, channel);
      const evt: ScriptEvent = {
        id: uuid(),
        scriptChannel: scriptChannel.id,
        moduleType: ModuleType.gpio,
        moduleSubType: ModuleSubType.genericGpio,
        time: 3.0,
        endTime: null,
        event: { setHigh: true } as GpioEvent,
      };

      const repo = new ScriptRepository(db);
      await repo.upsertScript(scriptWith(scriptChannel, evt));

      expect(await storedRow(evt.id)).toEqual({
        time: 30,
        end_time: null,
        data: '{"setHigh":true}',
      });
      const saved = (await repo.getScript(scriptId)).scriptChannels[0].events[evt.id];
      expect(saved.endTime).toBeNull();
      expect(saved.event).toEqual({ setHigh: true });
    });

    // A client that predates endTime (or any JSON body that omits it) must
    // still save a point event, not undefined * 10 = NaN.
    it('an event object without an endTime property is stored as NULL and reads back null', async () => {
      const channel = await seedGpioChannel();
      const scriptId = uuid();
      const scriptChannel = gpioScriptChannel(scriptId, channel);
      const evt: ScriptEvent = {
        id: uuid(),
        scriptChannel: scriptChannel.id,
        moduleType: ModuleType.gpio,
        moduleSubType: ModuleSubType.genericGpio,
        time: 1.5,
        endTime: null,
        event: { setHigh: false } as GpioEvent,
      };
      delete (evt as Partial<ScriptEvent>).endTime;
      expect('endTime' in evt).toBe(false);

      const repo = new ScriptRepository(db);
      await repo.upsertScript(scriptWith(scriptChannel, evt));

      expect((await storedRow(evt.id)).end_time).toBeNull();
      const saved = (await repo.getScript(scriptId)).scriptChannels[0].events[evt.id];
      expect(saved.endTime).toBeNull();
    });

    // BACKUP_FAILED and the MIGRATION_FAILED_* modes skip or undo migration 9
    // but still serve reads, so the table may have no end_time column: those
    // rows are point events, not spans.
    it('reads rows from a table without end_time as point events', async () => {
      const channel = await seedGpioChannel();
      const scriptId = uuid();
      const scriptChannel = gpioScriptChannel(scriptId, channel);
      const gpioEvt: ScriptEvent = {
        id: uuid(),
        scriptChannel: scriptChannel.id,
        moduleType: ModuleType.gpio,
        moduleSubType: ModuleSubType.genericGpio,
        time: 2.5,
        endTime: null,
        event: { setHigh: true } as GpioEvent,
      };
      const serialEvt: ScriptEvent = {
        ...gpioEvt,
        id: uuid(),
        time: 4.0,
        event: { setHigh: false } as GpioEvent,
      };
      scriptChannel.events[serialEvt.id] = serialEvt;
      const repo = new ScriptRepository(db);
      await repo.upsertScript(scriptWith(scriptChannel, gpioEvt));
      // The row's sub-type drives the parser: a serial row has no span payload.
      await db
        .updateTable('script_events')
        .set({ module_sub_type: ModuleSubType.genericSerial, data: '{"value":"hi"}' })
        .where('id', '=', serialEvt.id)
        .execute();
      await db.schema.alterTable('script_events').dropColumn('end_time').execute();

      const events = (await repo.getScript(scriptId)).scriptChannels[0].events;
      expect(events[gpioEvt.id].endTime).toBeNull();
      expect(events[gpioEvt.id].event).toEqual({ setHigh: true });
      expect(events[serialEvt.id].endTime).toBeNull();
      expect(events[serialEvt.id].event).toEqual({ value: 'hi' });
    });

    // A span on a sub-type with no span payload (serial here) is refused on
    // save and left out on load.
    async function seedSerialScriptChannel(scriptId: string): Promise<ScriptChannel> {
      const moduleId = uuid();
      // For generic UART channels, the channel ID is the same as the module ID.
      const channel = new UartChannel(
        moduleId,
        moduleId,
        'Serial 1',
        ModuleSubType.genericSerial,
        true,
      );
      const uartModule = new UartModule(
        0,
        moduleId,
        'Test Serial',
        locationId,
        ModuleSubType.genericSerial,
        0,
        9600,
      );
      await db.transaction().execute(async (trx) => {
        await upsertUartModules(trx, [uartModule]);
      });
      return {
        id: uuid(),
        scriptId,
        channelType: ScriptChannelType.GENERIC_UART,
        parentModuleId: moduleId,
        moduleChannelId: moduleId,
        moduleChannelType: ModuleChannelTypes.UartChannel,
        moduleChannel: channel,
        maxDuration: 0,
        events: {},
      };
    }

    function serialEvent(scriptChannel: ScriptChannel, time: number, endTime: number | null) {
      const evt: ScriptEvent = {
        id: uuid(),
        scriptChannel: scriptChannel.id,
        moduleType: ModuleType.uart,
        moduleSubType: ModuleSubType.genericSerial,
        time,
        endTime,
        event: { value: `at ${time}` },
      };
      return evt;
    }

    async function storedRowsOf(scriptId: string) {
      return db
        .selectFrom('script_events')
        .select(['id', 'time', 'end_time'])
        .where('script_id', '=', scriptId)
        .execute();
    }

    it('saving a span on a sub-type without a span payload is refused and keeps the stored script', async () => {
      const scriptId = uuid();
      const scriptChannel = await seedSerialScriptChannel(scriptId);
      const point = serialEvent(scriptChannel, 1.0, null);
      const repo = new ScriptRepository(db);
      await repo.upsertScript(scriptWith(scriptChannel, point));

      // The resubmission moves the point and renames the script before the
      // refused span, so only a rollback leaves the stored script unchanged.
      const span = serialEvent(scriptChannel, 2.0, 5.0);
      scriptChannel.events = { [point.id]: { ...point, time: 2.5 }, [span.id]: span };
      const resubmitted: Script = {
        ...scriptWith(scriptChannel, scriptChannel.events[point.id]),
        scriptName: 'Renamed',
      };
      const errorSpy = vi.spyOn(logger, 'error');
      try {
        await expect(repo.upsertScript(resubmitted)).rejects.toThrow(
          `Random span not supported for moduleSubType: ${ModuleSubType.genericSerial}`,
        );
        expect(errorSpy).toHaveBeenCalledWith(
          expect.stringMatching(
            new RegExp(
              `refusing event ${span.id} on channel .* in script ${scriptId}: Random span not supported`,
            ),
          ),
        );
      } finally {
        errorSpy.mockRestore();
      }

      expect(await storedRowsOf(scriptId)).toEqual([{ id: point.id, time: 10, end_time: null }]);
      expect((await repo.getScript(scriptId)).scriptName).toBe('Span Test Script');
    });

    // The refusal applies to spans only: a client that omits endTime saves
    // serial point events as before.
    it('a serial point event without an endTime property is not refused', async () => {
      const scriptId = uuid();
      const scriptChannel = await seedSerialScriptChannel(scriptId);
      const point = serialEvent(scriptChannel, 1.0, null);
      delete (point as Partial<ScriptEvent>).endTime;

      await new ScriptRepository(db).upsertScript(scriptWith(scriptChannel, point));

      expect(await storedRowsOf(scriptId)).toEqual([{ id: point.id, time: 10, end_time: null }]);
    });

    // Seeds a saved serial script, then turns one of its rows into a span by
    // hand, which the API cannot do.
    async function seedHandCodedSerialSpan() {
      const scriptId = uuid();
      const scriptChannel = await seedSerialScriptChannel(scriptId);
      const kept = serialEvent(scriptChannel, 1.0, null);
      const handCoded = serialEvent(scriptChannel, 3.0, null);
      scriptChannel.events[handCoded.id] = handCoded;
      const repo = new ScriptRepository(db);
      await repo.upsertScript(scriptWith(scriptChannel, kept));
      await db
        .updateTable('script_events')
        .set({ end_time: 80 })
        .where('id', '=', handCoded.id)
        .execute();
      return { repo, scriptId, keptId: kept.id, handCodedId: handCoded.id };
    }

    it('a hand-coded span on a sub-type without a span payload is dropped on load, with a warning', async () => {
      const { repo, scriptId, keptId, handCodedId } = await seedHandCodedSerialSpan();
      const warnSpy = vi.spyOn(logger, 'warn');

      try {
        const events = (await repo.getScript(scriptId)).scriptChannels[0].events;

        expect(Object.keys(events)).toEqual([keptId]);
        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringMatching(
            new RegExp(
              `dropping random span ${handCodedId} on channel .* in script ${scriptId} ` +
                `\\(time 30, end_time 80, data .*at 3.*\\): moduleSubType ${ModuleSubType.genericSerial} ` +
                `has no span payload; the row is deleted when this script is next saved`,
            ),
          ),
        );
      } finally {
        warnSpy.mockRestore();
      }
    });

    // Only known sub-types without a span payload are dropped: a row the
    // server cannot interpret at all fails the read, as a point row does.
    it('a span row with an unknown sub-type fails the read', async () => {
      const { repo, scriptId, handCodedId } = await seedHandCodedSerialSpan();
      await db
        .updateTable('script_events')
        .set({ module_sub_type: 999 })
        .where('id', '=', handCodedId)
        .execute();

      await expect(repo.getScript(scriptId)).rejects.toThrow('Unknown moduleSubType: 999');
    });

    it('saving the loaded script removes the dropped span row', async () => {
      const { repo, scriptId, keptId } = await seedHandCodedSerialSpan();

      await repo.upsertScript(await repo.getScript(scriptId));

      expect(await storedRowsOf(scriptId)).toEqual([{ id: keptId, time: 10, end_time: null }]);
    });
  });
});
