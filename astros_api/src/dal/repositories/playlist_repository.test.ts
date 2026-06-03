/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Kysely } from 'kysely';
import { Database } from '../types.js';
import { createKyselyConnection, migrateToLatest } from '../database.js';
import { PlaylistRepository } from './playlist_repository.js';
import { Playlist } from '../../models/playlists/playlist.js';
import { TrackType } from '../../models/playlists/trackType.js';
import { v4 as uuid } from 'uuid';
import { PlaylistTrack } from '../../models/playlists/playlistTrack.js';
import { PlaylistType } from '../../models/playlists/playlistType.js';
// Imported via `src/*` alias to match the repository's own import path.
// Using a relative path here would create two separate class instances at
// runtime (dual-module) and break `instanceof` checks in the assertions.
import { PlaylistCycleError } from 'src/models/playlists/playlist_cycle_error.js';

describe('Playlist Repository', () => {
  let db: Kysely<Database>;

  beforeEach(async () => {
    db = createKyselyConnection().db;

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
        playlistId: playlistId,
        durationDS: 100,
        trackType: TrackType.Script,
        trackId: scriptId1,
        trackName: 'Test Script',
        randomWait: false,
        durationMaxDS: 0,
      },
    ];

    const playlist: Playlist = {
      id: playlistId,
      playlistName: 'Test Playlist',
      description: 'Test Description',
      playlistType: PlaylistType.Sequential,
      settings: {
        randomDelay: false,
        delayMin: 0,
        delayMax: 0,
        repeat: false,
        repeatCount: 0,
      },
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
    expect(savedPlaylist!.playlistType).toBe(PlaylistType.Sequential);
    expect(savedPlaylist!.settings.randomDelay).toBe(false);
    expect(savedPlaylist!.settings.delayMin).toBe(0);
    expect(savedPlaylist!.settings.delayMax).toBe(0);
  });

  it('should update playlist', async () => {
    const playlistId = uuid();
    const playlist: Playlist = {
      id: playlistId,
      playlistName: 'Test Playlist',
      description: 'Test Description',
      playlistType: PlaylistType.Sequential,
      settings: {
        randomDelay: false,
        delayMin: 0,
        delayMax: 0,
        repeat: false,
        repeatCount: 0,
      },
      tracks: [],
    };

    const repo = new PlaylistRepository(db);
    await repo.upsertPlaylist(playlist);

    const savedPlaylist = await repo.getPlaylist(playlistId);
    expect(savedPlaylist).not.toBeNull();
    expect(savedPlaylist!.playlistName).toBe('Test Playlist');
    expect(savedPlaylist!.playlistType).toBe(PlaylistType.Sequential);
    expect(savedPlaylist!.settings.randomDelay).toBe(false);
    expect(savedPlaylist!.settings.delayMin).toBe(0);
    expect(savedPlaylist!.settings.delayMax).toBe(0);

    // Update
    playlist.playlistName = 'Updated Playlist';
    playlist.playlistType = PlaylistType.Shuffle;
    playlist.settings.randomDelay = true;
    playlist.settings.delayMin = 5;
    playlist.settings.delayMax = 10;
    await repo.upsertPlaylist(playlist);

    const updatedPlaylist = await repo.getPlaylist(playlistId);
    expect(updatedPlaylist).not.toBeNull();
    expect(updatedPlaylist!.playlistName).toBe('Updated Playlist');
    expect(updatedPlaylist!.playlistType).toBe(PlaylistType.Shuffle);
    expect(updatedPlaylist!.settings.randomDelay).toBe(true);
    expect(updatedPlaylist!.settings.delayMin).toBe(5);
    expect(updatedPlaylist!.settings.delayMax).toBe(10);
  });

  it('should get all playlists', async () => {
    const repo = new PlaylistRepository(db);
    const p1Id = uuid();
    const p2Id = uuid();

    await repo.upsertPlaylist({
      id: p1Id,
      playlistName: 'P1',
      description: 'D1',
      playlistType: PlaylistType.Sequential,
      settings: {
        randomDelay: false,
        delayMin: 0,
        delayMax: 0,
        repeat: false,
        repeatCount: 0,
      },
      tracks: [],
    });

    await repo.upsertPlaylist({
      id: p2Id,
      playlistName: 'P2',
      description: 'D2',
      playlistType: PlaylistType.Sequential,
      settings: {
        randomDelay: false,
        delayMin: 0,
        delayMax: 0,
        repeat: false,
        repeatCount: 0,
      },
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
      playlistType: PlaylistType.Sequential,
      settings: {
        randomDelay: false,
        delayMin: 0,
        delayMax: 0,
        repeat: false,
        repeatCount: 0,
      },
      tracks: [
        {
          id: trackId,
          idx: 0,
          playlistId: playlistId,
          durationDS: 50,
          trackType: TrackType.Wait,
          trackId: 'wait-1',
          trackName: 'Wait 1',
          randomWait: false,
          durationMaxDS: 0,
        },
      ],
    };

    await repo.upsertPlaylist(originalPlaylist);

    const result = await repo.copyPlaylist(playlistId);
    expect(result).not.toBeNull();
    expect(result?.id).not.toBe(playlistId); // New ID
    expect(result?.playlistName).toBe('Original (Copy)');
    expect(result?.description).toBe('Original Desc');
    expect(result?.playlistType).toBe(PlaylistType.Sequential);
    expect(result?.settings.randomDelay).toBe(false);
    expect(result?.settings.delayMin).toBe(0);
    expect(result?.settings.delayMax).toBe(0);

    const allPlaylists = await repo.getAllPlaylists();
    expect(allPlaylists.length).toBe(2);

    const copiedPlaylist = allPlaylists.find((p) => p.id !== playlistId);
    expect(copiedPlaylist).toBeDefined();
    expect(copiedPlaylist!.playlistName).toBe('Original (Copy)');
    expect(copiedPlaylist!.id).toMatch(/^p[0-9]{7}[A-Za-z]{3}$/);

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
      playlistType: PlaylistType.Sequential,
      settings: {
        randomDelay: false,
        delayMin: 0,
        delayMax: 0,
        repeat: false,
        repeatCount: 0,
      },
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
    const script1Id = uuid();
    const script2Id = uuid();
    const p1Id = uuid();
    const p2Id = uuid();

    await repo.upsertPlaylist({
      id: p1Id,
      playlistName: 'Playlist One',
      description: 'd1',
      playlistType: PlaylistType.Sequential,
      settings: {
        randomDelay: false,
        delayMin: 0,
        delayMax: 0,
        repeat: false,
        repeatCount: 0,
      },
      tracks: [
        {
          id: uuid(),
          idx: 0,
          playlistId: p1Id,
          durationDS: 10,
          trackType: TrackType.Script,
          trackId: script1Id,
          trackName: 'The Script',
          randomWait: false,
          durationMaxDS: 0,
        },
      ],
    });

    await repo.upsertPlaylist({
      id: p2Id,
      playlistName: 'Playlist Two',
      description: 'd2',
      playlistType: PlaylistType.Sequential,
      settings: {
        randomDelay: false,
        delayMin: 0,
        delayMax: 0,
        repeat: false,
        repeatCount: 0,
      },
      tracks: [
        {
          id: uuid(),
          idx: 0,
          playlistId: p2Id,
          durationDS: 10,
          trackType: TrackType.Script,
          trackId: script2Id,
          trackName: 'Another Script',
          randomWait: false,
          durationMaxDS: 0,
        },
      ],
    });

    const names = await repo.getPlaylistNamesThatUseScript(script1Id);
    expect(names.length).toBe(1);
    expect(names[0]).toBe('Playlist One');
  });

  it('should delete tracks by script id', async () => {
    const repo = new PlaylistRepository(db);
    const script1Id = uuid();
    const script2Id = uuid();
    const p1Id = uuid();
    const p2Id = uuid();

    await repo.upsertPlaylist({
      id: p1Id,
      playlistName: 'Playlist One',
      description: 'd1',
      playlistType: PlaylistType.Sequential,
      settings: {
        randomDelay: false,
        delayMin: 0,
        delayMax: 0,
        repeat: false,
        repeatCount: 0,
      },
      tracks: [
        {
          id: uuid(),
          idx: 0,
          playlistId: p1Id,
          durationDS: 10,
          trackType: TrackType.Script,
          trackId: script1Id,
          trackName: 'The Script',
          randomWait: false,
          durationMaxDS: 0,
        },
        {
          id: uuid(),
          idx: 1,
          playlistId: p1Id,
          durationDS: 5,
          trackType: TrackType.Wait,
          trackId: 'wait-id',
          trackName: 'Wait',
          randomWait: false,
          durationMaxDS: 0,
        },
      ],
    });

    await repo.upsertPlaylist({
      id: p2Id,
      playlistName: 'Playlist Two',
      description: 'd2',
      playlistType: PlaylistType.Sequential,
      settings: {
        randomDelay: false,
        delayMin: 0,
        delayMax: 0,
        repeat: false,
        repeatCount: 0,
      },
      tracks: [
        {
          id: uuid(),
          idx: 0,
          playlistId: p1Id,
          durationDS: 10,
          trackType: TrackType.Script,
          trackId: script2Id,
          trackName: 'Another Script',
          randomWait: false,
          durationMaxDS: 0,
        },
      ],
    });

    await repo.deleteTracksByScriptId(script1Id);

    const playlist1 = await repo.getPlaylist(p1Id);
    expect(playlist1).not.toBeNull();
    // Only the Wait track should remain
    expect(playlist1!.tracks.length).toBe(1);
    expect(playlist1!.tracks[0].trackType).toBe(TrackType.Wait);

    const playlist2 = await repo.getPlaylist(p2Id);
    expect(playlist2).not.toBeNull();
    // Playlist 2 should be unaffected
    expect(playlist2!.tracks.length).toBe(1);
    expect(playlist2!.tracks[0].trackType).toBe(TrackType.Script);
  });

  describe('cycle detection on save', () => {
    function makePlaylist(id: string, name: string, tracks: PlaylistTrack[]): Playlist {
      return {
        id,
        playlistName: name,
        description: '',
        playlistType: PlaylistType.Sequential,
        settings: {
          randomDelay: false,
          delayMin: 0,
          delayMax: 0,
          repeat: false,
          repeatCount: 0,
        },
        tracks,
      };
    }

    function makePlaylistTrack(
      playlistId: string,
      idx: number,
      targetPlaylistId: string,
      trackName: string,
    ): PlaylistTrack {
      return {
        id: uuid(),
        playlistId,
        idx,
        durationDS: 0,
        durationMaxDS: 0,
        randomWait: false,
        trackType: TrackType.Playlist,
        trackId: targetPlaylistId,
        trackName,
      };
    }

    it('should throw PlaylistCycleError on direct self-reference', async () => {
      const repo = new PlaylistRepository(db);
      const playlistId = uuid();

      const selfRef = makePlaylist(playlistId, 'Self Loop', [
        makePlaylistTrack(playlistId, 0, playlistId, 'Points To Self'),
      ]);

      await expect(repo.upsertPlaylist(selfRef)).rejects.toThrow(PlaylistCycleError);
    });

    it('should identify the offending top-level track on direct self-reference', async () => {
      const repo = new PlaylistRepository(db);
      const playlistId = uuid();
      const offendingTrack = makePlaylistTrack(playlistId, 2, playlistId, 'Recursive Entry');

      const selfRef = makePlaylist(playlistId, 'Self Loop', [
        {
          id: uuid(),
          playlistId,
          idx: 0,
          durationDS: 10,
          durationMaxDS: 0,
          randomWait: false,
          trackType: TrackType.Script,
          trackId: uuid(),
          trackName: 'Safe Script 1',
        },
        {
          id: uuid(),
          playlistId,
          idx: 1,
          durationDS: 10,
          durationMaxDS: 0,
          randomWait: false,
          trackType: TrackType.Script,
          trackId: uuid(),
          trackName: 'Safe Script 2',
        },
        offendingTrack,
      ]);

      await expect(repo.upsertPlaylist(selfRef)).rejects.toMatchObject({
        name: 'PlaylistCycleError',
        offendingTrack: {
          id: offendingTrack.id,
          trackName: 'Recursive Entry',
          idx: 2,
          trackId: playlistId,
        },
      });
    });

    it('should throw PlaylistCycleError on transitive cycle A → B → A and identify the A-level track', async () => {
      const repo = new PlaylistRepository(db);
      const aId = uuid();
      const bId = uuid();

      // Save B first, with a dangling reference to A (A doesn't exist yet).
      const playlistB = makePlaylist(bId, 'Playlist B', [
        makePlaylistTrack(bId, 0, aId, 'Points Back To A'),
      ]);
      await repo.upsertPlaylist(playlistB);

      // Now try to save A with a track pointing to B. This creates A → B → A.
      const offendingTrack = makePlaylistTrack(aId, 0, bId, 'Points To B');
      const playlistA = makePlaylist(aId, 'Playlist A', [offendingTrack]);

      await expect(repo.upsertPlaylist(playlistA)).rejects.toMatchObject({
        name: 'PlaylistCycleError',
        offendingTrack: {
          id: offendingTrack.id,
          trackName: 'Points To B',
          idx: 0,
          trackId: bId,
        },
      });
    });

    it('should allow sibling duplicates of the same sub-playlist (not a cycle)', async () => {
      const repo = new PlaylistRepository(db);
      const childId = uuid();
      const parentId = uuid();

      // Save child with a simple script track (no cycle).
      const child = makePlaylist(childId, 'Child', [
        {
          id: uuid(),
          playlistId: childId,
          idx: 0,
          durationDS: 10,
          durationMaxDS: 0,
          randomWait: false,
          trackType: TrackType.Script,
          trackId: uuid(),
          trackName: 'Child Script',
        },
      ]);
      await repo.upsertPlaylist(child);

      // Parent contains two references to the same child — not a cycle.
      const parent = makePlaylist(parentId, 'Parent', [
        makePlaylistTrack(parentId, 0, childId, 'First Child Ref'),
        makePlaylistTrack(parentId, 1, childId, 'Second Child Ref'),
      ]);

      await expect(repo.upsertPlaylist(parent)).resolves.toBe(true);
    });

    it('should allow legitimate nested playlists (no cycle)', async () => {
      const repo = new PlaylistRepository(db);
      const grandchildId = uuid();
      const childId = uuid();
      const parentId = uuid();

      const grandchild = makePlaylist(grandchildId, 'Grandchild', []);
      await repo.upsertPlaylist(grandchild);

      const child = makePlaylist(childId, 'Child', [
        makePlaylistTrack(childId, 0, grandchildId, 'Points To Grandchild'),
      ]);
      await repo.upsertPlaylist(child);

      const parent = makePlaylist(parentId, 'Parent', [
        makePlaylistTrack(parentId, 0, childId, 'Points To Child'),
      ]);

      await expect(repo.upsertPlaylist(parent)).resolves.toBe(true);
    });
  });
});
