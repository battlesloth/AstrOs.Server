import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import SQLite from 'better-sqlite3';
import { Kysely, SqliteDialect } from 'kysely';
import { Database } from '../dal/types.js';
import { migrateToLatest } from '../dal/database.js';
import { getPlaylist, savePlaylist } from './playlist_controller.js';
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

describe('Playlist Controller', () => {
  let db: Kysely<Database>;

  beforeEach(async () => {
    db = new Kysely<Database>({
      dialect: new SqliteDialect({ database: new SQLite(':memory:') }),
    });
    await migrateToLatest(db);
  });

  afterEach(async () => {
    await db.destroy();
  });

  describe('getPlaylist', () => {
    it('should return 200 with playlist data when found', async () => {
      const repo = new PlaylistRepository(db);
      const playlistId = uuid();

      await repo.upsertPlaylist({
        id: playlistId,
        playlistName: 'Test Playlist',
        description: 'A test',
        playlistType: PlaylistType.Sequential,
        tracks: [],
        settings: {
          repeat: false,
          repeatCount: 0,
          randomDelay: false,
          delayMin: 0,
          delayMax: 0,
        },
      });

      const req: any = { query: { id: playlistId } };
      const res = mockRes();

      await getPlaylist(db, req, res, vi.fn());

      expect(res.status).toHaveBeenCalledWith(200);
      const response = res.json.mock.calls[0][0];
      expect(response.playlistName).toBe('Test Playlist');
    });

    it('should return 404 when playlist not found', async () => {
      const req: any = { query: { id: 'nonexistent' } };
      const res = mockRes();

      await getPlaylist(db, req, res, vi.fn());

      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  describe('savePlaylist', () => {
    it('should return 400 with structured error when saving a cyclic playlist', async () => {
      const playlistId = uuid();
      const offendingTrackId = uuid();

      const cyclicPlaylist = {
        id: playlistId,
        playlistName: 'Self Loop',
        description: '',
        playlistType: PlaylistType.Sequential,
        tracks: [
          {
            id: offendingTrackId,
            playlistId,
            idx: 0,
            durationDS: 0,
            durationMaxDS: 0,
            randomWait: false,
            trackType: TrackType.Playlist,
            trackId: playlistId, // points to itself
            trackName: 'Recursive Entry',
          },
        ],
        settings: {
          repeat: false,
          repeatCount: 0,
          randomDelay: false,
          delayMin: 0,
          delayMax: 0,
        },
      };

      const req: any = { body: cyclicPlaylist };
      const res = mockRes();

      await savePlaylist(db, req, res, vi.fn());

      expect(res.status).toHaveBeenCalledWith(400);
      const response = res.json.mock.calls[0][0];
      expect(response.error).toBe('playlist_cycle');
      expect(response.message).toContain('Recursive Entry');
      expect(response.offendingTrack).toMatchObject({
        id: offendingTrackId,
        trackName: 'Recursive Entry',
        idx: 0,
        trackId: playlistId,
      });
    });

    it('should return 200 with success when saving a valid playlist', async () => {
      const playlistId = uuid();

      const validPlaylist = {
        id: playlistId,
        playlistName: 'Valid',
        description: '',
        playlistType: PlaylistType.Sequential,
        tracks: [],
        settings: {
          repeat: false,
          repeatCount: 0,
          randomDelay: false,
          delayMin: 0,
          delayMax: 0,
        },
      };

      const req: any = { body: validPlaylist };
      const res = mockRes();

      await savePlaylist(db, req, res, vi.fn());

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ message: 'success' });
    });
  });
});
