/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import SQLite from 'better-sqlite3';
import { Kysely, SqliteDialect } from 'kysely';
import { Database } from '../types.js';
import { migrateToLatest } from '../database.js';
import { PlaylistRepository } from './playlist_repository.js';
import { Playlist } from '../../models/playlists/playlist.js';
import { TrackType } from '../../models/playlists/trackType.js';
import { v4 as uuid } from 'uuid';
import { PlaylistTrack } from '../../models/playlists/playlistTrack.js';

describe('Playlist Repository', () => {
  let db: Kysely<Database>;

  beforeEach(async () => {
    const dialect = new SqliteDialect({
      database: new SQLite(':memory:'),
    });

    db = new Kysely<Database>({
      dialect,
    });

    await migrateToLatest(db);
  });

  afterEach(async () => {
    await db.destroy();
  });

  it('should save playlist', async () => {
    const playlistId = uuid();
    const trackId1 = uuid();
    const scriptId1 = uuid();

    const tracks: PlaylistTrack[] = [
      {
        id: trackId1,
        idx: 0,
        durationDS: 100,
        trackType: TrackType.Script,
        trackId: scriptId1,
        trackName: 'Test Script',
      },
    ];

    const playlist: Playlist = {
      id: playlistId,
      playlistName: 'Test Playlist',
      description: 'Test Description',
      tracks: tracks,
    };

    const repo = new PlaylistRepository(db);

    await repo.upsertPlaylist(playlist);

    const savedPlaylist = await repo.getPlaylist(playlistId);

    expect(savedPlaylist).not.toBeNull();
    expect(savedPlaylist!.id).toBe(playlistId);
    expect(savedPlaylist!.playlistName).toBe('Test Playlist');
    expect(savedPlaylist!.description).toBe('Test Description');
    expect(savedPlaylist!.tracks.length).toBe(1);
    expect(savedPlaylist!.tracks[0].id).toBe(trackId1);
    expect(savedPlaylist!.tracks[0].trackType).toBe(TrackType.Script);
  });

  it('should update playlist', async () => {
    const playlistId = uuid();
    const playlist: Playlist = {
      id: playlistId,
      playlistName: 'Test Playlist',
      description: 'Test Description',
      tracks: [],
    };

    const repo = new PlaylistRepository(db);
    await repo.upsertPlaylist(playlist);

    const savedPlaylist = await repo.getPlaylist(playlistId);
    expect(savedPlaylist).not.toBeNull();
    expect(savedPlaylist!.playlistName).toBe('Test Playlist');

    // Update
    playlist.playlistName = 'Updated Playlist';
    await repo.upsertPlaylist(playlist);

    const updatedPlaylist = await repo.getPlaylist(playlistId);
    expect(updatedPlaylist).not.toBeNull();
    expect(updatedPlaylist!.playlistName).toBe('Updated Playlist');
  });

  it('should get all playlists', async () => {
    const repo = new PlaylistRepository(db);
    const p1Id = uuid();
    const p2Id = uuid();

    await repo.upsertPlaylist({
      id: p1Id,
      playlistName: 'P1',
      description: 'D1',
      tracks: [],
    });

    await repo.upsertPlaylist({
      id: p2Id,
      playlistName: 'P2',
      description: 'D2',
      tracks: [],
    });

    const playlists = await repo.getAllPlaylists();
    expect(playlists.length).toBe(2);
    const ids = playlists.map((p) => p.id);
    expect(ids).toContain(p1Id);
    expect(ids).toContain(p2Id);
  });

  it('should copy playlist', async () => {
    const repo = new PlaylistRepository(db);
    const playlistId = uuid();
    const trackId = uuid();

    const originalPlaylist: Playlist = {
      id: playlistId,
      playlistName: 'Original',
      description: 'Original Desc',
      tracks: [
        {
          id: trackId,
          idx: 0,
          durationDS: 50,
          trackType: TrackType.Wait,
          trackId: 'wait-1',
          trackName: 'Wait 1',
        },
      ],
    };

    await repo.upsertPlaylist(originalPlaylist);

    const result = await repo.copyPlaylist(playlistId);
    expect(result).toBe(true);

    const allPlaylists = await repo.getAllPlaylists();
    expect(allPlaylists.length).toBe(2);

    const copiedPlaylist = allPlaylists.find((p) => p.id !== playlistId);
    expect(copiedPlaylist).toBeDefined();
    expect(copiedPlaylist!.playlistName).toBe('Original (Copy)');

    // Verify tracks of copy
    const fullCopy = await repo.getPlaylist(copiedPlaylist!.id);
    expect(fullCopy!.tracks.length).toBe(1);
    expect(fullCopy!.tracks[0].id).not.toBe(trackId); // New ID
    expect(fullCopy!.tracks[0].trackType).toBe(TrackType.Wait);
  });

  it('should delete playlist', async () => {
    const repo = new PlaylistRepository(db);
    const playlistId = uuid();

    await repo.upsertPlaylist({
      id: playlistId,
      playlistName: 'To Delete',
      description: 'Desc',
      tracks: [],
    });

    await repo.deletePlaylist(playlistId);

    const result = await repo.getPlaylist(playlistId);
    expect(result).toBeNull();

    const all = await repo.getAllPlaylists();
    const found = all.find((p) => p.id === playlistId);
    expect(found).toBeUndefined();
  });

  it('should get playlist names that use a script', async () => {
    const repo = new PlaylistRepository(db);
    const scriptId = uuid();
    const p1Id = uuid();
    const p2Id = uuid();

    // Playlist 1 uses script
    await repo.upsertPlaylist({
      id: p1Id,
      playlistName: 'Playlist One',
      description: 'd1',
      tracks: [
        {
          id: uuid(),
          idx: 0,
          durationDS: 10,
          trackType: TrackType.Script,
          trackId: scriptId,
          trackName: 'The Script',
        },
      ],
    });

    // Playlist 2 doesn't use script
    await repo.upsertPlaylist({
      id: p2Id,
      playlistName: 'Playlist Two',
      description: 'd2',
      tracks: [],
    });

    const names = await repo.getPlaylistNamesThatUseScript(scriptId);
    expect(names.length).toBe(1);
    expect(names[0]).toBe('Playlist One');
  });

  it('should delete tracks by script id', async () => {
    const repo = new PlaylistRepository(db);
    const scriptId = uuid();
    const p1Id = uuid();

    await repo.upsertPlaylist({
      id: p1Id,
      playlistName: 'Playlist One',
      description: 'd1',
      tracks: [
        {
          id: uuid(),
          idx: 0,
          durationDS: 10,
          trackType: TrackType.Script,
          trackId: scriptId,
          trackName: 'The Script',
        },
        {
          id: uuid(),
          idx: 1,
          durationDS: 5,
          trackType: TrackType.Wait,
          trackId: 'wait-id',
          trackName: 'Wait',
        },
      ],
    });

    await repo.deleteTracksByScriptId(scriptId);

    const playlist = await repo.getPlaylist(p1Id);
    expect(playlist).not.toBeNull();
    // Only the Wait track should remain
    expect(playlist!.tracks.length).toBe(1);
    expect(playlist!.tracks[0].trackType).toBe(TrackType.Wait);
  });
});
