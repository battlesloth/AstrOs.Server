import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Kysely, NoResultError } from 'kysely';
import { Database } from '../dal/types.js';
import { createKyselyConnection, migrateToLatest } from '../dal/database.js';
import { Router } from 'express';
import {
  copyScript,
  deleteScript,
  registerScriptRoutes,
  saveScript,
} from './scripts_controller.js';
// The controller's own specifier: under vitest a relative import can load a
// second module instance, and a prototype spy on it would never apply.
import { ScriptRepository } from 'src/dal/repositories/script_repository.js';
import { PlaylistRepository } from '../dal/repositories/playlist_repository.js';
import { PlaylistType } from '../models/playlists/playlistType.js';
import { TrackType } from '../models/playlists/trackType.js';
import { v4 as uuid } from 'uuid';
import { logger } from 'src/logger.js';
import { upsertGpioModule } from '../dal/repositories/module_repositories/gpio_repository.js';
import {
  GpioChannel,
  GpioEvent,
  GpioModule,
  ModuleChannelTypes,
  ModuleSubType,
  ModuleType,
  ScriptChannelType,
  ScriptValidationError,
} from '../models/index.js';

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe('Scripts Controller', () => {
  let db: Kysely<Database>;

  beforeEach(async () => {
    db = createKyselyConnection().db;
    await migrateToLatest(db);
  });

  afterEach(async () => {
    await db.destroy();
  });

  describe('deleteScript', () => {
    it('should delete script and cascade to playlist tracks', async () => {
      const scriptRepo = new ScriptRepository(db);
      const playlistRepo = new PlaylistRepository(db);

      // Create a script
      const scriptId = uuid();
      await scriptRepo.upsertScript({
        id: scriptId,
        scriptName: 'Test Script',
        description: 'test',
        lastSaved: new Date(),
        durationDS: 100,
        playlistCount: 0,
        deploymentStatus: {},
        scriptChannels: [],
      });

      // Create a playlist that references the script
      const playlistId = uuid();
      await playlistRepo.upsertPlaylist({
        id: playlistId,
        playlistName: 'Test Playlist',
        description: '',
        playlistType: PlaylistType.Sequential,
        tracks: [
          {
            id: uuid(),
            playlistId: playlistId,
            idx: 0,
            durationDS: 100,
            randomWait: false,
            durationMaxDS: 0,
            trackType: TrackType.Script,
            trackId: scriptId,
            trackName: 'Test Script',
          },
        ],
        settings: {
          repeat: false,
          repeatCount: 0,
          randomDelay: false,
          delayMin: 0,
          delayMax: 0,
        },
      });

      // Verify the playlist has the track
      const before = await playlistRepo.getPlaylist(playlistId);
      expect(before).toBeDefined();
      expect(before?.tracks).toHaveLength(1);

      // Delete the script via controller
      const req: any = { query: { id: scriptId } };
      const res = mockRes();

      await deleteScript(db, req, res, vi.fn());

      expect(res.status).toHaveBeenCalledWith(200);

      // Playlist should still exist but track referencing the script should be removed
      const after = await playlistRepo.getPlaylist(playlistId);
      expect(after).toBeDefined();
      expect(after?.tracks).toHaveLength(0);
    });
  });

  describe('saveScript', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    // A request body whose one span is on a GPIO channel that is not in the
    // database, and the refusal's message.
    function missingChannelRequest(scriptId: unknown) {
      const scriptChannelId = uuid();
      const missingId = uuid();
      const body = {
        id: scriptId,
        scriptName: 'Refused',
        description: '',
        lastSaved: new Date(),
        durationDS: 0,
        playlistCount: 0,
        deploymentStatus: {},
        scriptChannels: [
          {
            id: scriptChannelId,
            scriptId,
            channelType: ScriptChannelType.GPIO,
            parentModuleId: uuid(),
            moduleChannelId: missingId,
            moduleChannelType: ModuleChannelTypes.GpioChannel,
            moduleChannel: new GpioChannel(missingId, uuid(), 0, true, 'GPIO 0', false),
            maxDuration: 0,
            events: {
              span: {
                id: 'span',
                scriptChannel: scriptChannelId,
                moduleType: ModuleType.gpio,
                moduleSubType: ModuleSubType.genericGpio,
                time: 2,
                endTime: 5,
                event: { minGapMs: 50, maxGapMs: 400 },
              },
            },
          },
        ],
      };
      const message = `Random span channel not found: ${ModuleChannelTypes.GpioChannel} ${missingId}`;
      return { req: { body }, message };
    }

    it('a refused save answers 400 with the reason', async () => {
      const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
      const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
      const scriptId = uuid();
      const { req, message } = missingChannelRequest(scriptId);
      const res = mockRes();

      await saveScript(db, req, res, vi.fn());

      // Exactly one response: a second res.json after the 400 would throw
      // ERR_HTTP_HEADERS_SENT out of the catch and crash the process.
      expect(res.status.mock.calls).toEqual([[400]]);
      expect(res.json.mock.calls).toEqual([[{ message }]]);
      // The repository logs the refusal; the controller only warns. No error
      // call may carry the refusal, bare or as { err }.
      const carriesRefusal = (arg: unknown) =>
        arg instanceof ScriptValidationError ||
        (arg as { err?: unknown } | null)?.err instanceof ScriptValidationError;
      expect(errorSpy.mock.calls.flat().some(carriesRefusal)).toBe(false);
      expect(warnSpy).toHaveBeenCalledWith({ scriptId }, `saveScript: refused script: ${message}`);
      const stored = await db
        .selectFrom('scripts')
        .select('id')
        .where('id', '=', scriptId)
        .executeTakeFirst();
      expect(stored).toBeUndefined();
    });

    // The warn carries the id as a field, never converted to text: a throw in
    // the catch would reject this async handler, which Express 4 leaves
    // unhandled, and the process would exit.
    it('a refused save whose script id String() throws on still answers one 400', async () => {
      const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
      vi.spyOn(logger, 'error').mockImplementation(() => undefined);
      const scriptId = { toString: 0 };
      const { req, message } = missingChannelRequest(scriptId);
      const res = mockRes();

      await expect(saveScript(db, req, res, vi.fn())).resolves.toBeUndefined();

      expect(res.status.mock.calls).toEqual([[400]]);
      expect(res.json.mock.calls).toEqual([[{ message }]]);
      expect(warnSpy).toHaveBeenCalledWith({ scriptId }, `saveScript: refused script: ${message}`);
    });

    it('any other save failure still answers 500 Internal server error', async () => {
      const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
      const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
      const failure = new Error('disk full');
      vi.spyOn(ScriptRepository.prototype, 'upsertScript').mockRejectedValue(failure);
      const res = mockRes();

      const req = { body: { id: uuid() } };

      await saveScript(db, req, res, vi.fn());

      expect(res.status.mock.calls).toEqual([[500]]);
      expect(res.json.mock.calls).toEqual([[{ message: 'Internal server error' }]]);
      expect(errorSpy).toHaveBeenCalledWith(
        { err: failure, scriptId: req.body.id },
        'saveScript: save failed',
      );
      expect(warnSpy).not.toHaveBeenCalled();
    });
  });

  describe('copyScript', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    // A saved script named 'Wave' with one GPIO channel holding one point
    // event at 1.5 s.
    async function seedScript() {
      const locationId = uuid();
      await db
        .insertInto('locations')
        .values({
          id: locationId,
          name: 'Test Location',
          description: '',
          config_fingerprint: 'test-fingerprint',
        })
        .execute();
      const gpioModule = new GpioModule(locationId);
      const channel = new GpioChannel(uuid(), locationId, 0, true, 'Test GPIO', false);
      gpioModule.channels.push(channel);
      await upsertGpioModule(db, gpioModule);

      const scriptId = uuid();
      const scriptChannelId = uuid();
      const eventId = uuid();
      await new ScriptRepository(db).upsertScript({
        id: scriptId,
        scriptName: 'Wave',
        description: '',
        lastSaved: new Date(),
        durationDS: 0,
        playlistCount: 0,
        deploymentStatus: {},
        scriptChannels: [
          {
            id: scriptChannelId,
            scriptId,
            channelType: ScriptChannelType.GPIO,
            parentModuleId: locationId,
            moduleChannelId: channel.id,
            moduleChannelType: ModuleChannelTypes.GpioChannel,
            moduleChannel: channel,
            maxDuration: 0,
            events: {
              [eventId]: {
                id: eventId,
                scriptChannel: scriptChannelId,
                moduleType: ModuleType.gpio,
                moduleSubType: ModuleSubType.genericGpio,
                time: 1.5,
                endTime: null,
                event: { setHigh: true } as GpioEvent,
              },
            },
          },
        ],
      });
      return { scriptId, scriptChannelId, eventId, moduleChannelId: channel.id };
    }

    async function storedScriptIds() {
      const rows = await db.selectFrom('scripts').select('id').execute();
      return rows.map((r) => r.id);
    }

    const passthroughAuth = (_req: unknown, _res: unknown, next: () => void) => next();

    function copyRouteLayers() {
      const router = Router();
      registerScriptRoutes(router, passthroughAuth, db);
      return router.stack.filter((layer) => layer.route?.path === '/scripts/copy');
    }

    // Pins the API half of the method contract; the Vue store spec pins the
    // other. Copy must stay POST-only: the write guard blocks POST in
    // read-only mode and during a flash, but lets a GET to this path through.
    it('copy is registered as POST /scripts/copy', () => {
      expect(copyRouteLayers().map((layer) => layer.route?.methods)).toEqual([{ post: true }]);
    });

    it('copy runs the auth handler first', () => {
      const [layer] = copyRouteLayers();

      const handlers = layer.route?.stack.map((routeLayer) => routeLayer.handle);
      expect(handlers).toHaveLength(2);
      expect(handlers?.[0]).toBe(passthroughAuth);
    });

    // Wiring the route to another handler would fail every copy while the
    // registration tests above still pass. Awaiting the handler relies on the
    // route's arrow wrapper returning copyScript's promise.
    it('the copy route hands the request to copyScript', async () => {
      const { scriptId } = await seedScript();
      const [layer] = copyRouteLayers();
      const handler = layer.route?.stack[1].handle as (
        req: unknown,
        res: unknown,
        next: unknown,
      ) => Promise<void>;
      const res = mockRes();

      await handler({ body: { id: scriptId } }, res, vi.fn());

      expect(res.status.mock.calls).toEqual([[200]]);
      expect(res.json.mock.calls[0][0].scriptName).toBe('Wave (Copy)');
    });

    it('copyScript copies the script named in the body', async () => {
      const { scriptId, scriptChannelId, eventId, moduleChannelId } = await seedScript();
      const res = mockRes();

      await copyScript(db, { body: { id: scriptId } }, res, vi.fn());

      expect(res.status.mock.calls).toEqual([[200]]);
      expect(res.json.mock.calls).toHaveLength(1);
      const copy = res.json.mock.calls[0][0];
      expect(copy.id).not.toBe(scriptId);
      expect(copy.scriptName).toBe('Wave (Copy)');
      expect(copy.scriptChannels).toEqual([]);

      const stored = await new ScriptRepository(db).getScript(copy.id);
      expect(stored.scriptChannels).toHaveLength(1);
      const [channel] = stored.scriptChannels;
      expect(channel.id).not.toBe(scriptChannelId);
      expect(channel.moduleChannelId).toBe(moduleChannelId);
      const events = Object.values(channel.events);
      expect(events).toHaveLength(1);
      expect(events[0].id).not.toBe(eventId);
      expect([events[0].time, events[0].endTime, events[0].event]).toEqual([
        1.5,
        null,
        { setHigh: true },
      ]);
    });

    // Pins the body as the only source: a `req.body.id ?? req.query.id`
    // fallback would copy here and answer 200.
    it('copyScript ignores a query-string id', async () => {
      vi.spyOn(logger, 'error').mockImplementation(() => undefined);
      const { scriptId } = await seedScript();
      const res = mockRes();

      await copyScript(db, { query: { id: scriptId }, body: {} }, res, vi.fn());

      expect(res.status.mock.calls).toEqual([[500]]);
      expect(res.json.mock.calls).toEqual([[{ message: 'Internal server error' }]]);
      // Express sends on json(): a status set after it would reach the client as 200.
      expect(res.status.mock.invocationCallOrder[0]).toBeLessThan(
        res.json.mock.invocationCallOrder[0],
      );
      expect(await storedScriptIds()).toEqual([scriptId]);
    });

    // The id is in the body, so no access-log line names the script; when the
    // lookup fails, this is the only log line that does.
    it('a failed copy logs the id it was asked for', async () => {
      const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
      const res = mockRes();

      await copyScript(db, { body: { id: 'sMissing' } }, res, vi.fn());

      expect(res.status.mock.calls).toEqual([[500]]);
      expect(errorSpy).toHaveBeenCalledWith(
        { err: expect.any(NoResultError), scriptId: 'sMissing' },
        'copyScript: copy failed',
      );
    });

    // The log takes the id as a field, never converted to text: a throw in the
    // catch would reject this async handler, which Express 4 leaves unhandled.
    it('a failed copy whose body id String() throws on still answers one 500', async () => {
      const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
      const id = { toString: 0 };
      const res = mockRes();

      await expect(copyScript(db, { body: { id } }, res, vi.fn())).resolves.toBeUndefined();

      expect(res.status.mock.calls).toEqual([[500]]);
      expect(res.json.mock.calls).toEqual([[{ message: 'Internal server error' }]]);
      expect(errorSpy).toHaveBeenCalledWith(
        { err: expect.anything(), scriptId: id },
        'copyScript: copy failed',
      );
    });
  });
});
