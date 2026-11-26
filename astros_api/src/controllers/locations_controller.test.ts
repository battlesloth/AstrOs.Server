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
          'body, module "Body Maestro", board 0, channel 1: releaseMs 999 is not a whole number from 1000 to 120000',
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
        'saveLocations: refused: body, module "Body Maestro", board 0, channel 1: releaseMs 999 is not a whole number from 1000 to 120000',
      );
    });

    // Each problem already contains ", ", so the log joins them with "; ".
    it('reports every bad channel, in the reply and in one warn line', async () => {
      const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
      const sent = await locationsAsSent();
      const [ch0, ch1] = sent.bodyModule.uartModules[0].subModule.boards[0].channels;
      ch0.releaseMs = 999;
      ch1.releaseMs = 'x';
      const res = mockRes();

      await saveLocations(db, { body: sent }, res, vi.fn());

      const problems = [
        'body, module "Body Maestro", board 0, channel 0: releaseMs 999 is not a whole number from 1000 to 120000',
        'body, module "Body Maestro", board 0, channel 1: releaseMs "x" is not a whole number from 1000 to 120000',
      ];
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: 'invalid_release_ms', problems });
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledWith(`saveLocations: refused: ${problems.join('; ')}`);
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
