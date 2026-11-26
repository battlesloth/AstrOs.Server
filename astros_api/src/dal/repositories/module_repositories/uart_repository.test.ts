/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Kysely } from 'kysely';
import { Database } from '../../types.js';
import { createKyselyConnection, migrateToLatest } from '../../database.js';
import {
  Constants,
  UartModule,
  ModuleSubType,
  ModuleType,
  MaestroChannel,
} from '../../../models/index.js';
import type { KangarooX2, MaestroModule, MaestroBoard } from '../../../models/index.js';
import { getUartModules, readMaestroChannel, upsertUartModules } from './uart_repository.js';
import { v4 as uuid } from 'uuid';

describe('UartRepository', () => {
  let db: Kysely<Database>;
  const location = Constants.BODY;

  beforeEach(async () => {
    db = createKyselyConnection().db;

    await migrateToLatest(db);
  });

  afterEach(async () => {
    await db.destroy();
  });

  it('should get no modules from new database', async () => {
    const locationId = await db
      .selectFrom('locations')
      .select(['id'])
      .where('name', '=', location)
      .executeTakeFirstOrThrow();

    const module = await getUartModules(db, locationId.id);

    expect(module).toBeDefined();

    expect(module.length).toBe(0);
  });

  it('should save and get a module', async () => {
    const locationId = await db
      .selectFrom('locations')
      .select(['id'])
      .where('name', '=', location)
      .executeTakeFirstOrThrow();

    const modId = uuid();

    const module = new UartModule(
      0,
      modId,
      'Uart Module',
      locationId.id,
      ModuleSubType.genericSerial,
      1,
      9600,
    );

    await db.transaction().execute(async (trx) => {
      await upsertUartModules(trx, [module]);
    });

    const modules = await getUartModules(db, locationId.id);

    expect(modules.length).toBe(1);
    expect(modules[0].id).toBe(modId);
    expect(modules[0].locationId).toBe(locationId.id);
    expect(modules[0].name).toBe('Uart Module');
    expect(modules[0].uartChannel).toBe(1);
    expect(modules[0].baudRate).toBe(9600);
    expect(modules[0].moduleType).toBe(ModuleType.uart);
    expect(modules[0].moduleSubType).toBe(ModuleSubType.genericSerial);
  });

  it('should update changes', async () => {
    const locationId = await db
      .selectFrom('locations')
      .select(['id'])
      .where('name', '=', location)
      .executeTakeFirstOrThrow();

    const modId = uuid();

    const module = new UartModule(
      0,
      modId,
      'Uart Module',
      locationId.id,
      ModuleSubType.genericSerial,
      1,
      9600,
    );

    await db.transaction().execute(async (trx) => {
      await upsertUartModules(trx, [module]);
    });

    const modules = await getUartModules(db, locationId.id);

    expect(modules.length).toBe(1);
    expect(modules[0].id).toBe(modId);
    expect(modules[0].locationId).toBe(locationId.id);
    expect(modules[0].name).toBe('Uart Module');
    expect(modules[0].uartChannel).toBe(1);
    expect(modules[0].baudRate).toBe(9600);
    expect(modules[0].moduleType).toBe(ModuleType.uart);
    expect(modules[0].moduleSubType).toBe(ModuleSubType.genericSerial);

    modules[0].name = 'New Name';
    modules[0].uartChannel = 2;
    modules[0].baudRate = 115200;

    await db.transaction().execute(async (trx) => {
      await upsertUartModules(trx, modules);
    });

    const updatedModules = await getUartModules(db, locationId.id);

    expect(updatedModules.length).toBe(1);
    expect(updatedModules[0].id).toBe(modId);
    expect(updatedModules[0].locationId).toBe(locationId.id);
    expect(updatedModules[0].name).toBe('New Name');
    expect(updatedModules[0].uartChannel).toBe(2);
    expect(updatedModules[0].baudRate).toBe(115200);
    expect(updatedModules[0].moduleType).toBe(ModuleType.uart);
    expect(updatedModules[0].moduleSubType).toBe(ModuleSubType.genericSerial);
  });

  it('should update kanagroo module', async () => {
    const locationId = await db
      .selectFrom('locations')
      .select(['id'])
      .where('name', '=', location)
      .executeTakeFirstOrThrow();

    const modId = uuid();

    const subModuleId = uuid();

    const module = new UartModule(
      0,
      modId,
      'Uart Module',
      locationId.id,
      ModuleSubType.kangaroo,
      1,
      9600,
    );

    const subModule: KangarooX2 = { id: subModuleId, ch1Name: 'channel 1', ch2Name: 'channel 2' };

    module.subModule = subModule;

    await db.transaction().execute(async (trx) => {
      await upsertUartModules(trx, [module]);
    });

    const modules = await getUartModules(db, locationId.id);

    const savedSubmodule = modules[0].subModule as KangarooX2;

    expect(modules.length).toBe(1);
    expect(modules[0].id).toBe(modId);
    expect(modules[0].locationId).toBe(locationId.id);
    expect(modules[0].name).toBe('Uart Module');
    expect(modules[0].uartChannel).toBe(1);
    expect(modules[0].baudRate).toBe(9600);
    expect(modules[0].moduleType).toBe(ModuleType.uart);
    expect(modules[0].moduleSubType).toBe(ModuleSubType.kangaroo);
    expect(modules[0].subModule).toBeDefined();
    expect(savedSubmodule.ch1Name).toBe('channel 1');
    expect(savedSubmodule.ch2Name).toBe('channel 2');

    modules[0].name = 'New Name';
    modules[0].uartChannel = 2;
    modules[0].baudRate = 115200;
    savedSubmodule.ch1Name = 'new channel 1';
    savedSubmodule.ch2Name = 'new channel 2';

    await db.transaction().execute(async (trx) => {
      await upsertUartModules(trx, modules);
    });

    const updatedModules = await getUartModules(db, locationId.id);
    const updatedSubmodule = updatedModules[0].subModule as KangarooX2;

    expect(updatedModules.length).toBe(1);
    expect(updatedModules[0].id).toBe(modId);
    expect(updatedModules[0].locationId).toBe(locationId.id);
    expect(updatedModules[0].name).toBe('New Name');
    expect(updatedModules[0].uartChannel).toBe(2);
    expect(updatedModules[0].baudRate).toBe(115200);
    expect(updatedModules[0].moduleType).toBe(ModuleType.uart);
    expect(updatedModules[0].moduleSubType).toBe(ModuleSubType.kangaroo);
    expect(updatedModules[0].subModule).toBeDefined();
    expect(updatedSubmodule.ch1Name).toBe('new channel 1');
    expect(updatedSubmodule.ch2Name).toBe('new channel 2');
  });

  it('should handle maestro module with invalid position values', async () => {
    const locationId = await db
      .selectFrom('locations')
      .select(['id'])
      .where('name', '=', location)
      .executeTakeFirstOrThrow();

    const modId = uuid();
    const boardId = uuid();
    const channel1Id = uuid();
    const channel2Id = uuid();
    const channel3Id = uuid();

    const module = new UartModule(
      0,
      modId,
      'Maestro Module',
      locationId.id,
      ModuleSubType.maestro,
      1,
      9600,
    );

    const maestroModule: MaestroModule = { boards: [] };
    const board: MaestroBoard = {
      id: boardId,
      parentId: modId,
      boardId: 0,
      name: 'Board 1',
      channelCount: 3,
      channels: [],
    };

    // Create channels with various invalid position values
    // Channel 1: undefined values (simulating disabled channel cleared by user)
    const channel1 = new MaestroChannel(
      channel1Id,
      boardId,
      'Channel 0',
      false,
      0,
      false,
      undefined as any, // Invalid minPos
      undefined as any, // Invalid maxPos
      undefined as any, // Invalid homePos
      false,
      5000,
    );

    // Channel 2: NaN values (simulating invalid number input)
    const channel2 = new MaestroChannel(
      channel2Id,
      boardId,
      'Channel 1',
      false,
      1,
      true,
      NaN, // Invalid minPos
      NaN, // Invalid maxPos
      NaN, // Invalid homePos
      false,
      5000,
    );

    // Channel 3: null values
    const channel3 = new MaestroChannel(
      channel3Id,
      boardId,
      'Channel 2',
      true,
      2,
      true,
      null as any, // Invalid minPos
      null as any, // Invalid maxPos
      null as any, // Invalid homePos
      false,
      5000,
    );

    board.channels.push(channel1, channel2, channel3);
    maestroModule.boards.push(board);
    module.subModule = maestroModule;

    // This should not throw an error, invalid values should be replaced with defaults
    await db.transaction().execute(async (trx) => {
      await upsertUartModules(trx, [module]);
    });

    const modules = await getUartModules(db, locationId.id);

    expect(modules.length).toBe(1);
    expect(modules[0].subModule).toBeDefined();
    const savedMaestro = modules[0].subModule as MaestroModule;
    expect(savedMaestro.boards.length).toBe(1);
    expect(savedMaestro.boards[0].channels.length).toBe(3);

    // Check that invalid values were replaced with defaults (500, 2500, 1250)
    const savedChannel1 = savedMaestro.boards[0].channels.find((c) => c.id === channel1Id);
    expect(savedChannel1).toBeDefined();
    expect(savedChannel1!.minPos).toBe(500);
    expect(savedChannel1!.maxPos).toBe(2500);
    expect(savedChannel1!.homePos).toBe(1250);

    const savedChannel2 = savedMaestro.boards[0].channels.find((c) => c.id === channel2Id);
    expect(savedChannel2).toBeDefined();
    expect(savedChannel2!.minPos).toBe(500);
    expect(savedChannel2!.maxPos).toBe(2500);
    expect(savedChannel2!.homePos).toBe(1250);

    const savedChannel3 = savedMaestro.boards[0].channels.find((c) => c.id === channel3Id);
    expect(savedChannel3).toBeDefined();
    expect(savedChannel3!.minPos).toBe(500);
    expect(savedChannel3!.maxPos).toBe(2500);
    expect(savedChannel3!.homePos).toBe(1250);
  });

  describe('Maestro channel releaseMs', () => {
    let locationId: string;

    beforeEach(async () => {
      locationId = (
        await db
          .selectFrom('locations')
          .select(['id'])
          .where('name', '=', location)
          .executeTakeFirstOrThrow()
      ).id;
    });

    // One Maestro module with one board; each entry is a channel's releaseMs,
    // or undefined for a channel saved without the field (a stale browser tab).
    function maestroWith(modId: string, releaseMs: (number | undefined | null)[]): UartModule {
      const module = new UartModule(
        0,
        modId,
        'Maestro Module',
        locationId,
        ModuleSubType.maestro,
        1,
        9600,
      );
      const boardId = `${modId}-board`;
      const board: MaestroBoard = {
        id: boardId,
        parentId: modId,
        boardId: 0,
        name: 'Board 1',
        channelCount: releaseMs.length,
        channels: releaseMs.map(
          (ms, i) =>
            new MaestroChannel(
              `${modId}-ch${i}`,
              boardId,
              `Channel ${i}`,
              true,
              i,
              true,
              500,
              2500,
              1500,
              false,
              ms as number,
            ),
        ),
      };
      module.subModule = { boards: [board] } satisfies MaestroModule;
      return module;
    }

    async function save(module: UartModule): Promise<void> {
      await db.transaction().execute(async (trx) => {
        await upsertUartModules(trx, [module]);
      });
    }

    async function loadedReleaseMs(): Promise<number[]> {
      const [mod] = await getUartModules(db, locationId);
      return (mod.subModule as MaestroModule).boards[0].channels.map((c) => c.releaseMs);
    }

    it('loads the releaseMs each channel was saved with', async () => {
      await save(maestroWith('m1', [15000, 1000, 120000]));

      expect(await loadedReleaseMs()).toEqual([15000, 1000, 120000]);
    });

    it('stores 5000 for a channel saved without releaseMs', async () => {
      await save(maestroWith('m1', [undefined, 15000]));

      expect(await loadedReleaseMs()).toEqual([5000, 15000]);
    });

    // saveLocations refuses a null; the repository still must not hand one to
    // a NOT NULL column (Kysely drops undefined keys, but sends null).
    it('stores 5000 for a null releaseMs', async () => {
      await save(maestroWith('m1', [null, 15000]));

      expect(await loadedReleaseMs()).toEqual([5000, 15000]);
    });

    it('a later save replaces releaseMs, and one without it resets it to 5000', async () => {
      await save(maestroWith('m1', [15000, 15000]));

      await save(maestroWith('m1', [20000, undefined]));

      expect(await loadedReleaseMs()).toEqual([20000, 5000]);
    });

    it('readMaestroChannel returns releaseMs', async () => {
      await save(maestroWith('m1', [5000, 42000]));

      expect((await readMaestroChannel(db, 'm1-ch1')).releaseMs).toBe(42000);
    });
  });
});
