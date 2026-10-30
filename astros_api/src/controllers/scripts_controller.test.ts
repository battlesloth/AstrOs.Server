import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Kysely } from 'kysely';
import { Database } from '../dal/types.js';
import { createKyselyConnection, migrateToLatest } from '../dal/database.js';
import { deleteScript, saveScript } from './scripts_controller.js';
import { ScriptRepository } from 'src/dal/repositories/script_repository.js';
import { PlaylistRepository } from '../dal/repositories/playlist_repository.js';
import { PlaylistType } from '../models/playlists/playlistType.js';
import { TrackType } from '../models/playlists/trackType.js';
import { v4 as uuid } from 'uuid';
import { logger } from 'src/logger.js';
import {
  GpioChannel,
  ModuleChannelTypes,
  ModuleSubType,
  ModuleType,
  ScriptChannelType,
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

    it('a refused save answers 400 with the reason', async () => {
      const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
      vi.spyOn(logger, 'error').mockImplementation(() => undefined);
      const scriptId = uuid();
      const scriptChannelId = uuid();
      // A span on a GPIO channel that is not in the database.
      const missingId = uuid();
      const req: any = {
        body: {
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
        },
      };
      const res = mockRes();

      await saveScript(db, req, res, vi.fn());

      const message = `Random span channel not found: ${ModuleChannelTypes.GpioChannel} ${missingId}`;
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message });
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining(`script ${scriptId}: ${message}`),
      );
      const stored = await db
        .selectFrom('scripts')
        .select('id')
        .where('id', '=', scriptId)
        .executeTakeFirst();
      expect(stored).toBeUndefined();
    });

    it('any other save failure still answers 500 Internal server error', async () => {
      const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
      const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
      const failure = new Error('disk full');
      vi.spyOn(ScriptRepository.prototype, 'upsertScript').mockRejectedValue(failure);
      const res = mockRes();

      await saveScript(db, { body: { id: uuid() } }, res, vi.fn());

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ message: 'Internal server error' });
      expect(errorSpy).toHaveBeenCalledWith(failure);
      expect(warnSpy).not.toHaveBeenCalled();
    });
  });
});
