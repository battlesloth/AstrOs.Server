import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Kysely } from 'kysely';
import { v4 as uuid } from 'uuid';
import { Database } from '../dal/types.js';
import { createKyselyConnection, migrateToLatest } from '../dal/database.js';
import { ScriptRepository } from '../dal/repositories/script_repository.js';
import { PlaylistRepository } from '../dal/repositories/playlist_repository.js';
import { upsertGpioModule } from '../dal/repositories/module_repositories/gpio_repository.js';
import {
  GpioChannel,
  GpioEvent,
  GpioModule,
  ModuleChannelTypes,
  ModuleSubType,
  ModuleType,
  ScriptChannel,
  ScriptChannelType,
} from '../models/index.js';
import { Playlist } from '../models/playlists/playlist.js';
import { PlaylistType } from '../models/playlists/playlistType.js';
import { TrackType } from '../models/playlists/trackType.js';
import { convertPlaylistToQueueItem } from '../serial/animation_queue/playlist_converter.js';

// The unit chain a script length crosses before it times the animation queue:
// scripter event time (seconds) → script_events.time (ds) → scripts.duration_ds
// (ds) → queue track (ms). Each hop was unit-tested with numbers already in the
// hop's unit, so a seconds value stored as deciseconds passed every test while
// the queue timed scripts 10x short.
describe('script duration units, save → queue', () => {
  let db: Kysely<Database>;
  let scriptId: string;

  beforeEach(async () => {
    db = createKyselyConnection().db;
    await migrateToLatest(db);

    const locationId = uuid();
    await db
      .insertInto('locations')
      .values({ id: locationId, name: 'Test Location', description: '', config_fingerprint: 'fp' })
      .execute();

    const channelId = uuid();
    const gpioModule = new GpioModule(locationId);
    const gpioChannel = new GpioChannel(channelId, locationId, 0, true, 'GPIO', false);
    gpioModule.channels.push(gpioChannel);
    await upsertGpioModule(db, gpioModule);

    scriptId = uuid();
    const eventId = uuid();
    const scriptChannel: ScriptChannel = {
      id: uuid(),
      scriptId,
      channelType: ScriptChannelType.GPIO,
      parentModuleId: locationId,
      moduleChannelId: channelId,
      moduleChannelType: ModuleChannelTypes.GpioChannel,
      moduleChannel: gpioChannel,
      maxDuration: 0,
      events: {},
    };
    // One event at 45.0 s — the scripter stores event times in seconds.
    scriptChannel.events[eventId] = {
      id: eventId,
      scriptChannel: scriptChannel.id,
      moduleType: ModuleType.gpio,
      moduleSubType: ModuleSubType.genericGpio,
      time: 45,
      event: { setHigh: true } as GpioEvent,
    };

    await new ScriptRepository(db).upsertScript({
      id: scriptId,
      scriptName: 'Forty-five',
      description: '',
      lastSaved: new Date(),
      durationDS: 0,
      playlistCount: 0,
      deploymentStatus: {},
      scriptChannels: [scriptChannel],
    });
  });

  afterEach(async () => {
    await db.destroy();
  });

  it('a directly run script is timed at 45 000 ms', async () => {
    const script = await new ScriptRepository(db).getScript(scriptId);

    // runScript builds its queue item with duration = durationDS * 100 ms.
    expect(script.durationDS * 100).toBe(45000);
  });

  it('a playlist script track is timed at 45 000 ms', async () => {
    const playlist: Playlist = {
      id: 'p-loop',
      playlistName: 'Loop',
      description: '',
      playlistType: PlaylistType.SequentialRepeatable,
      tracks: [
        {
          id: 't-1',
          playlistId: 'p-loop',
          idx: 0,
          // Script tracks carry no duration of their own; the converter must
          // use the script's recorded duration.
          durationDS: 0,
          randomWait: false,
          durationMaxDS: 0,
          trackType: TrackType.Script,
          trackId: scriptId,
          trackName: 'Forty-five',
        },
      ],
      settings: { repeat: true, repeatCount: -1, randomDelay: false, delayMin: 0, delayMax: 0 },
    };

    const item = await convertPlaylistToQueueItem(
      playlist,
      new PlaylistRepository(db),
      await new ScriptRepository(db).getScriptDurationsDS(),
      [],
    );

    expect(item.tracks).toEqual([{ id: scriptId, duration: 45000, isWait: false }]);
  });
});
