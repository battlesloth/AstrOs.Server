import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Kysely } from 'kysely';
import { v4 as uuid } from 'uuid';
import { Database } from '../dal/types.js';
import { createKyselyConnection, migrateToLatest } from '../dal/database.js';
import { ScriptRepository } from '../dal/repositories/script_repository.js';
import { upsertGpioModule } from '../dal/repositories/module_repositories/gpio_repository.js';
import { upsertUartModules } from '../dal/repositories/module_repositories/uart_repository.js';
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

// The unit tests mock the repository, so they can only assume how
// getGpioChannelMap keys its map and what getScript puts in moduleChannel.
// A wrong assumption about the GPIO key hid a bug from 2025-12 to T-008:
// every GPIO event threw and the whole upload went out empty.
describe('script conversion, save → convert', () => {
  let db: Kysely<Database>;
  let locationId: string;

  beforeEach(async () => {
    db = createKyselyConnection().db;
    await migrateToLatest(db);

    locationId = uuid();
    await db
      .insertInto('locations')
      .values({ id: locationId, name: 'Test Location', description: '', config_fingerprint: 'fp' })
      .execute();
  });

  afterEach(async () => {
    await db.destroy();
  });

  it('gpio and maestro channels convert through the real repository', async () => {
    const gpioChannel = new GpioChannel(uuid(), locationId, 3, true, 'GPIO 3', false);
    const gpioModule = new GpioModule(locationId);
    gpioModule.channels.push(gpioChannel);
    await upsertGpioModule(db, gpioModule);

    const maestroModuleId = uuid();
    const maestroChannel = new MaestroChannel(
      uuid(),
      maestroModuleId,
      'Servo 6',
      true,
      6,
      true,
      500,
      2500,
      1500,
      false,
    );
    const maestroModule: MaestroModule = {
      boards: [
        {
          id: maestroModuleId,
          parentId: locationId,
          boardId: 0,
          name: 'Board',
          channelCount: 24,
          channels: [maestroChannel],
        },
      ],
    };
    const uartModule = new UartModule(
      0,
      maestroModuleId,
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
      .where('id', '=', maestroModuleId)
      .executeTakeFirstOrThrow();

    const scriptId = uuid();
    const gpioCh = scriptChannel(scriptId, locationId, gpioChannel, ScriptChannelType.GPIO);
    addEvent(gpioCh, 1, null, { setHigh: true } as GpioEvent);
    addEvent(gpioCh, 2, 16, { minGapMs: 50, maxGapMs: 400 } as RandomGpioEvent);
    const maestroCh = scriptChannel(
      scriptId,
      maestroModuleId,
      maestroChannel,
      ScriptChannelType.SERVO,
    );
    // channel -1 is the UI placeholder; the save overwrites it with 6
    addEvent(maestroCh, 0, 14, {
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
    } as RandomMaestroEvent);

    const repo = new ScriptRepository(db);
    await repo.upsertScript({
      id: scriptId,
      scriptName: 'T-008',
      description: '',
      lastSaved: new Date(),
      durationDS: 0,
      playlistCount: 0,
      deploymentStatus: {},
      scriptChannels: [gpioCh, maestroCh],
    });

    const result = await new ScriptConverter(repo).convertScript(scriptId);

    expect(result.get(locationId)).toBe(
      `6|1000|${idx}|6|14000|400|2000|20|100|15|60|0|0;5|1000|3|1;7|14000|3|14000|50|400;0|0|0`,
    );
  });
});

function scriptChannel(
  scriptId: string,
  parentModuleId: string,
  moduleChannel: GpioChannel | MaestroChannel,
  channelType: ScriptChannelType,
): ScriptChannel {
  return {
    // a script channel has its own id, never its module channel's
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
