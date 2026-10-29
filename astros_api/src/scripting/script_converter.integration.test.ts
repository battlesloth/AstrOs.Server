import { describe, it, expect, beforeEach, afterEach, vi, MockInstance } from 'vitest';
import { Kysely } from 'kysely';
import { v4 as uuid } from 'uuid';
import { Database } from '../dal/types.js';
import { createKyselyConnection, migrateToLatest } from '../dal/database.js';
import { ScriptRepository } from '../dal/repositories/script_repository.js';
import { upsertGpioModule } from '../dal/repositories/module_repositories/gpio_repository.js';
import { upsertUartModules } from '../dal/repositories/module_repositories/uart_repository.js';
import { logger } from '../logger.js';
import { ScriptConverter } from './script_converter.js';
import {
  GpioChannel,
  GpioEvent,
  GpioModule,
  MaestroChannel,
  MaestroModule,
  ModuleChannelTypes,
  ModuleSubType,
  RandomGpioEvent,
  RandomMaestroEvent,
  ScriptChannel,
  ScriptChannelType,
  ScriptEvent,
  ScriptEventTypes,
  UartModule,
} from '../models/index.js';

const SERVO_SPAN: RandomMaestroEvent = {
  // -1 is the UI placeholder; the save overwrites it with the channel's number
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

// The unit tests mock the repository, so they can only assume how
// getGpioChannelMap keys its map and what getScript puts in moduleChannel.
// These tests check both against the real repository.
describe('script conversion, save → convert', () => {
  let db: Kysely<Database>;
  let locationId: string;
  let warnSpy: MockInstance<typeof logger.warn>;

  beforeEach(async () => {
    db = createKyselyConnection().db;
    await migrateToLatest(db);

    locationId = uuid();
    await db
      .insertInto('locations')
      .values({ id: locationId, name: 'Test Location', description: '', config_fingerprint: 'fp' })
      .execute();

    warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await db.destroy();
  });

  async function addGpioChannel(enabled: boolean): Promise<GpioChannel> {
    const gpioChannel = new GpioChannel(uuid(), locationId, 3, enabled, 'GPIO 3', false);
    const gpioModule = new GpioModule(locationId);
    gpioModule.channels.push(gpioChannel);
    await upsertGpioModule(db, gpioModule);
    return gpioChannel;
  }

  // A UART module holding one board holding Maestro channel 6.
  async function addMaestroChannel(
    isServo: boolean,
  ): Promise<{ moduleId: string; channel: MaestroChannel; idx: number }> {
    const moduleId = uuid();
    const boardId = uuid();
    const channel = new MaestroChannel(
      uuid(),
      boardId,
      'Channel 6',
      true,
      6,
      isServo,
      500,
      2500,
      1500,
      false,
    );
    const maestroModule: MaestroModule = {
      boards: [
        {
          id: boardId,
          parentId: moduleId,
          boardId: 0,
          name: 'Board',
          channelCount: 24,
          channels: [channel],
        },
      ],
    };
    const uartModule = new UartModule(
      0,
      moduleId,
      'Maestro',
      locationId,
      ModuleSubType.maestro,
      0,
      9600,
    );
    uartModule.subModule = maestroModule;
    await db.transaction().execute((trx) => upsertUartModules(trx, [uartModule]));

    const { idx } = await db
      .selectFrom('uart_modules')
      .select('idx')
      .where('id', '=', moduleId)
      .executeTakeFirstOrThrow();
    return { moduleId, channel, idx };
  }

  async function saveAndConvert(...channels: ScriptChannel[]): Promise<string | undefined> {
    const scriptId = channels[0].scriptId;
    const repo = new ScriptRepository(db);
    await repo.upsertScript({
      id: scriptId,
      scriptName: 'T-008',
      description: '',
      lastSaved: new Date(),
      durationDS: 0,
      playlistCount: 0,
      deploymentStatus: {},
      scriptChannels: channels,
    });
    const result = await new ScriptConverter(repo).convertScript(scriptId);
    return result.get(locationId);
  }

  it('gpio and maestro channels convert through the real repository', async () => {
    const gpioChannel = await addGpioChannel(true);
    const maestro = await addMaestroChannel(true);

    const scriptId = uuid();
    const gpioCh = scriptChannel(scriptId, locationId, gpioChannel, ScriptChannelType.GPIO);
    addEvent(gpioCh, 1, null, { setHigh: true } as GpioEvent);
    addEvent(gpioCh, 2, 16, { minGapMs: 50, maxGapMs: 400 } as RandomGpioEvent);
    const maestroCh = scriptChannel(
      scriptId,
      maestro.moduleId,
      maestro.channel,
      ScriptChannelType.SERVO,
    );
    addEvent(maestroCh, 0, 14, { ...SERVO_SPAN });

    expect(await saveAndConvert(gpioCh, maestroCh)).toBe(
      `6|1000|${maestro.idx}|6|14000|400|2000|20|100|15|60|0|0;5|1000|3|1;7|14000|3|14000|50|400;0|0|0`,
    );
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('a span on a disabled gpio channel is skipped, naming the channel', async () => {
    // getGpioChannelMap reads enabled channels only
    const gpioChannel = await addGpioChannel(false);

    const gpioCh = scriptChannel(uuid(), locationId, gpioChannel, ScriptChannelType.GPIO);
    addEvent(gpioCh, 2, 16, { minGapMs: 50, maxGapMs: 400 } as RandomGpioEvent);

    expect(await saveAndConvert(gpioCh)).toBe('0|2000|0;0|14000|0;0|0|0');
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining(`GPIO channel 3 (${gpioChannel.id}) is disabled`),
    );
  });

  it('a maestro channel stored as digital sends the digital form', async () => {
    const maestro = await addMaestroChannel(false);

    const maestroCh = scriptChannel(
      uuid(),
      maestro.moduleId,
      maestro.channel,
      ScriptChannelType.GPIO,
    );
    // the payload still says servo; the stored channel setting wins
    addEvent(maestroCh, 0, 14, { ...SERVO_SPAN });

    expect(await saveAndConvert(maestroCh)).toBe(
      `6|14000|${maestro.idx}|6|14000|400|2000|0|0|0|0|0|0;0|0|0`,
    );
  });
});

// The script channel gets its own id, distinct from its module channel's (as
// the Vue scripter assigns them), so a lookup by the wrong key fails here.
function scriptChannel(
  scriptId: string,
  parentModuleId: string,
  moduleChannel: GpioChannel | MaestroChannel,
  channelType: ScriptChannelType,
): ScriptChannel {
  return {
    id: uuid(),
    scriptId,
    channelType,
    parentModuleId,
    moduleChannelId: moduleChannel.id,
    moduleChannelType:
      moduleChannel instanceof MaestroChannel
        ? ModuleChannelTypes.MaestroChannel
        : ModuleChannelTypes.GpioChannel,
    moduleChannel,
    maxDuration: 0,
    events: {},
  };
}

function addEvent(
  ch: ScriptChannel,
  time: number,
  endTime: number | null,
  event: ScriptEventTypes,
): void {
  const evt: ScriptEvent = {
    id: uuid(),
    scriptChannel: ch.id,
    moduleType: ch.moduleChannel.moduleType,
    moduleSubType: ch.moduleChannel.moduleSubType,
    time,
    endTime,
    event,
  };
  ch.events[evt.id] = evt;
}
