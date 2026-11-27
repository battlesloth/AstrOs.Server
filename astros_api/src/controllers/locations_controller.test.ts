import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Kysely } from 'kysely';
import { Database } from '../dal/types.js';
import { createKyselyConnection, migrateToLatest } from '../dal/database.js';
import { getLocations, saveLocations } from './locations_controller.js';
import { LocationsRepository } from '../dal/repositories/locations_repository.js';
import { MaestroChannel, ModuleSubType, UartModule } from '../models/index.js';
import type { MaestroModule } from '../models/index.js';
import { logger } from 'src/logger.js';

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe('Locations Controller', () => {
  let db: Kysely<Database>;

  beforeEach(async () => {
    db = createKyselyConnection().db;
    await migrateToLatest(db);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await db.destroy();
  });

  describe('getLocations', () => {
    it('should classify seed locations into LocationCollection', async () => {
      const req: any = {};
      const res = mockRes();

      await getLocations(db, req, res, vi.fn());

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledTimes(1);

      const response = res.json.mock.calls[0][0];
      expect(response.bodyModule).toBeDefined();
      expect(response.bodyModule.locationName).toBe('body');
      expect(response.coreModule).toBeDefined();
      expect(response.coreModule.locationName).toBe('core');
      expect(response.domeModule).toBeDefined();
      expect(response.domeModule.locationName).toBe('dome');
    });

    it('should include controller data for mapped locations', async () => {
      const req: any = {};
      const res = mockRes();

      await getLocations(db, req, res, vi.fn());

      const response = res.json.mock.calls[0][0];
      // Body has master controller from seed data
      expect(response.bodyModule.controller.name).toBe('master');
      // Core has no controller — defaults
      expect(response.coreModule.controller.name).toBe('');
    });
  });

  describe('saveLocations releaseMs', () => {
    // The collection as the Modules page sends it back: what it loads from
    // `/locations/load` (GET `/locations/` carries no modules), as JSON.
    async function locationsAsSent(): Promise<any> {
      const locations = await new LocationsRepository(db).loadLocations();
      return JSON.parse(
        JSON.stringify(Object.fromEntries(locations.map((l) => [`${l.locationName}Module`, l]))),
      );
    }

    function bodyMaestro(locationId: string, releaseMs: number): UartModule {
      const mod = new UartModule(
        0,
        'maestro-1',
        'Body Maestro',
        locationId,
        ModuleSubType.maestro,
        1,
        9600,
      );
      mod.subModule = {
        boards: [
          {
            id: 'board-1',
            parentId: 'maestro-1',
            boardId: 0,
            name: 'Board 1',
            channelCount: 2,
            channels: [0, 1].map(
              (n) =>
                new MaestroChannel(
                  `ch-${n}`,
                  'board-1',
                  `ch ${n}`,
                  true,
                  n,
                  true,
                  500,
                  2500,
                  1500,
                  false,
                  releaseMs,
                ),
            ),
          },
        ],
      } satisfies MaestroModule;
      return mod;
    }

    // Body holds a Maestro module whose channels are at 5000; every location's
    // fingerprint is set to a marker that any updateLocation would overwrite.
    beforeEach(async () => {
      const sent = await locationsAsSent();
      sent.bodyModule.uartModules.push(bodyMaestro(sent.bodyModule.id, 5000));
      await new LocationsRepository(db).updateLocation(sent.bodyModule);
      await db.updateTable('locations').set({ config_fingerprint: 'unchanged' }).execute();
    });

    async function bodyChannels(): Promise<{ id: string; releaseMs: number }[]> {
      const { bodyModule } = await locationsAsSent();
      return bodyModule.uartModules[0].subModule.boards[0].channels.map((c: any) => ({
        id: c.id,
        releaseMs: c.releaseMs,
      }));
    }

    async function fingerprints(): Promise<Record<string, string>> {
      const rows = await db
        .selectFrom('locations')
        .select(['name', 'config_fingerprint'])
        .execute();
      return Object.fromEntries(rows.map((r) => [r.name, r.config_fingerprint]));
    }

    // Dome is written first, so a check after the first updateLocation would
    // let this dome change through before refusing the body channel.
    it('refuses a bad releaseMs with 400 and writes no location', async () => {
      const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
      const sent = await locationsAsSent();
      sent.domeModule.uartModules.push(
        JSON.parse(
          JSON.stringify(
            new UartModule(
              0,
              'serial-1',
              'Dome Serial',
              sent.domeModule.id,
              ModuleSubType.genericSerial,
              2,
              9600,
            ),
          ),
        ),
      );
      sent.bodyModule.uartModules[0].subModule.boards[0].channels[0].releaseMs = 15000;
      sent.bodyModule.uartModules[0].subModule.boards[0].channels[1].releaseMs = 999;
      const res = mockRes();

      await saveLocations(db, { body: sent }, res, vi.fn());

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        message: 'invalid_release_ms',
        problems: [
          {
            code: 'RELEASE_MS_OUT_OF_RANGE',
            location: 'body',
            moduleIndex: 0,
            boardIndex: 0,
            channelIndex: 1,
          },
        ],
      });
      expect(await fingerprints()).toEqual({
        body: 'unchanged',
        core: 'unchanged',
        dome: 'unchanged',
      });
      expect((await locationsAsSent()).domeModule.uartModules).toEqual([]);
      expect(await bodyChannels()).toEqual([
        { id: 'ch-0', releaseMs: 5000 },
        { id: 'ch-1', releaseMs: 5000 },
      ]);
      expect(warnSpy).toHaveBeenCalledWith(
        'saveLocations: refused: body uartModules[0].boards[0].channels[1] RELEASE_MS_OUT_OF_RANGE',
      );
    });

    it('reports every bad channel by code and position, in the reply and in one warn line', async () => {
      const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
      const sent = await locationsAsSent();
      const [ch0, ch1] = sent.bodyModule.uartModules[0].subModule.boards[0].channels;
      ch0.releaseMs = 999;
      ch1.releaseMs = 'x';
      const res = mockRes();

      await saveLocations(db, { body: sent }, res, vi.fn());

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        message: 'invalid_release_ms',
        problems: [
          {
            code: 'RELEASE_MS_OUT_OF_RANGE',
            location: 'body',
            moduleIndex: 0,
            boardIndex: 0,
            channelIndex: 0,
          },
          {
            code: 'RELEASE_MS_NOT_INTEGER',
            location: 'body',
            moduleIndex: 0,
            boardIndex: 0,
            channelIndex: 1,
          },
        ],
      });
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledWith(
        'saveLocations: refused: body uartModules[0].boards[0].channels[0] RELEASE_MS_OUT_OF_RANGE; ' +
          'body uartModules[0].boards[0].channels[1] RELEASE_MS_NOT_INTEGER',
      );
    });

    // The reply lists every problem; the log keeps the first 10.
    it.each([
      [10, ''],
      [11, '; … and 1 more'],
      [12, '; … and 2 more'],
    ])('logs at most 10 of %i problems, with a count of the rest', async (count, suffix) => {
      const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
      const sent = await locationsAsSent();
      const board = sent.bodyModule.uartModules[0].subModule.boards[0];
      board.channels = Array.from({ length: count }, (_, n) => ({
        ...board.channels[0],
        id: `ch-many-${n}`,
        channelNumber: n,
        releaseMs: 1,
      }));
      const res = mockRes();

      await saveLocations(db, { body: sent }, res, vi.fn());

      expect((res.json.mock.calls[0][0] as { problems: unknown[] }).problems).toHaveLength(count);
      const logged = Array.from(
        { length: 10 },
        (_, n) => `body uartModules[0].boards[0].channels[${n}] RELEASE_MS_OUT_OF_RANGE`,
      );
      expect(warnSpy).toHaveBeenCalledWith(`saveLocations: refused: ${logged.join('; ')}${suffix}`);
    });

    it('saves a valid releaseMs', async () => {
      const sent = await locationsAsSent();
      sent.bodyModule.uartModules[0].subModule.boards[0].channels[1].releaseMs = 120000;
      const res = mockRes();

      await saveLocations(db, { body: sent }, res, vi.fn());

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ message: 'success' });
      expect(await bodyChannels()).toEqual([
        { id: 'ch-0', releaseMs: 5000 },
        { id: 'ch-1', releaseMs: 120000 },
      ]);
    });

    // A tab loaded before the field existed sends channels without it.
    it('saves a channel without releaseMs as 5000', async () => {
      await db.updateTable('maestro_channels').set({ release_ms: 15000 }).execute();
      const sent = await locationsAsSent();
      delete sent.bodyModule.uartModules[0].subModule.boards[0].channels[0].releaseMs;
      const res = mockRes();

      await saveLocations(db, { body: sent }, res, vi.fn());

      expect(res.status).toHaveBeenCalledWith(200);
      expect(await bodyChannels()).toEqual([
        { id: 'ch-0', releaseMs: 5000 },
        { id: 'ch-1', releaseMs: 15000 },
      ]);
    });
  });
});
