import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Kysely } from 'kysely';
import { Database } from '../dal/types.js';
import { createKyselyConnection, migrateToLatest } from '../dal/database.js';
import { deleteScript } from './scripts_controller.js';
import { ScriptRepository } from '../dal/repositories/script_repository.js';
import { PlaylistRepository } from '../dal/repositories/playlist_repository.js';
import { PlaylistType } from '../models/playlists/playlistType.js';
import { TrackType } from '../models/playlists/trackType.js';
import { v4 as uuid } from 'uuid';

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
});
