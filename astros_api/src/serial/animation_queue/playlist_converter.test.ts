import { describe, expect, it, vi } from 'vitest';
import { convertPlaylistToQueueItem } from './playlist_converter.js';
import { Playlist, PlaylistSettings } from '../../models/playlists/playlist.js';
import { PlaylistTrack } from '../../models/playlists/playlistTrack.js';
import { PlaylistType } from '../../models/playlists/playlistType.js';
import { TrackType } from '../../models/playlists/trackType.js';
import { PlaylistRepository } from '../../dal/repositories/playlist_repository.js';

function makeSettings(overrides: Partial<PlaylistSettings> = {}): PlaylistSettings {
  return {
    repeat: false,
    repeatCount: 0,
    randomDelay: false,
    delayMin: 0,
    delayMax: 0,
    ...overrides,
  };
}

function makeTrack(overrides: Partial<PlaylistTrack>): PlaylistTrack {
  return {
    id: 'track-id',
    playlistId: 'playlist-id',
    idx: 0,
    durationDS: 10,
    randomWait: false,
    durationMaxDS: 0,
    trackType: TrackType.Script,
    trackId: 'script-1',
    trackName: 'Script 1',
    ...overrides,
  };
}

function makeMockRepo(playlists: Map<string, Playlist> = new Map()): PlaylistRepository {
  return {
    getPlaylist: vi.fn(async (id: string) => playlists.get(id) ?? null),
  } as unknown as PlaylistRepository;
}

describe('Playlist Converter', () => {
  it('should convert script tracks with durationDS to ms', async () => {
    const playlist: Playlist = {
      id: 'p1',
      playlistName: 'Test',
      description: '',
      playlistType: PlaylistType.Sequential,
      tracks: [
        makeTrack({ idx: 0, durationDS: 50, trackId: 'script-1' }),
        makeTrack({ idx: 1, durationDS: 30, trackId: 'script-2' }),
      ],
      settings: makeSettings(),
    };

    const result = await convertPlaylistToQueueItem(playlist, makeMockRepo(), []);

    expect(result.tracks).toHaveLength(2);
    expect(result.tracks[0]).toEqual({ id: 'script-1', duration: 5000, isWait: false });
    expect(result.tracks[1]).toEqual({ id: 'script-2', duration: 3000, isWait: false });
  });

  it('should convert wait tracks with isWait=true', async () => {
    const playlist: Playlist = {
      id: 'p1',
      playlistName: 'Test',
      description: '',
      playlistType: PlaylistType.Sequential,
      tracks: [
        makeTrack({ idx: 0, trackType: TrackType.Wait, trackId: 'wait-1', durationDS: 20 }),
      ],
      settings: makeSettings(),
    };

    const result = await convertPlaylistToQueueItem(playlist, makeMockRepo(), []);

    expect(result.tracks).toHaveLength(1);
    expect(result.tracks[0]).toEqual({ id: 'wait-1', duration: 2000, isWait: true });
  });

  it('should randomize duration when randomWait is true', async () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValueOnce(0.5);

    const playlist: Playlist = {
      id: 'p1',
      playlistName: 'Test',
      description: '',
      playlistType: PlaylistType.Sequential,
      tracks: [
        makeTrack({
          idx: 0,
          trackType: TrackType.Wait,
          trackId: 'wait-1',
          durationDS: 10,
          randomWait: true,
          durationMaxDS: 50,
        }),
      ],
      settings: makeSettings(),
    };

    const result = await convertPlaylistToQueueItem(playlist, makeMockRepo(), []);

    // min=1000ms, max=5000ms, random=0.5 → 1000 + floor(0.5 * 4001) = 1000 + 2000 = 3000
    expect(result.tracks[0]).toEqual({ id: 'wait-1', duration: 3000, isWait: true });

    randomSpy.mockRestore();
  });

  it('should resolve nested playlist tracks into QueueTrack[]', async () => {
    const nestedPlaylist: Playlist = {
      id: 'nested-p',
      playlistName: 'Nested',
      description: '',
      playlistType: PlaylistType.Sequential,
      tracks: [
        makeTrack({ idx: 0, trackId: 'sub-script-1', durationDS: 15 }),
        makeTrack({ idx: 1, trackId: 'sub-script-2', durationDS: 25 }),
      ],
      settings: makeSettings(),
    };

    const repo = makeMockRepo(new Map([['nested-p', nestedPlaylist]]));

    const playlist: Playlist = {
      id: 'p1',
      playlistName: 'Test',
      description: '',
      playlistType: PlaylistType.Sequential,
      tracks: [
        makeTrack({ idx: 0, trackId: 'script-1', durationDS: 10 }),
        makeTrack({ idx: 1, trackType: TrackType.Playlist, trackId: 'nested-p', durationDS: 0 }),
      ],
      settings: makeSettings(),
    };

    const result = await convertPlaylistToQueueItem(playlist, repo, []);

    expect(result.tracks).toHaveLength(2);
    // First track: regular script
    expect(result.tracks[0]).toEqual({ id: 'script-1', duration: 1000, isWait: false });
    // Second track: nested playlist as QueueTrack[]
    expect(Array.isArray(result.tracks[1])).toBe(true);
    const subTracks = result.tracks[1] as Array<{ id: string; duration: number; isWait: boolean }>;
    expect(subTracks).toHaveLength(2);
    expect(subTracks[0]).toEqual({ id: 'sub-script-1', duration: 1500, isWait: false });
    expect(subTracks[1]).toEqual({ id: 'sub-script-2', duration: 2500, isWait: false });
  });

  it('should flatten deeply nested playlists into a single QueueTrack[]', async () => {
    // Structure: top [a, [b, c, [e, f], g], h]
    // Expected:  top [a, [b, c, e, f, g], h]

    const deepPlaylist: Playlist = {
      id: 'deep-p',
      playlistName: 'Deep',
      description: '',
      playlistType: PlaylistType.Sequential,
      tracks: [
        makeTrack({ idx: 0, trackId: 'e', durationDS: 10 }),
        makeTrack({ idx: 1, trackId: 'f', durationDS: 10 }),
      ],
      settings: makeSettings(),
    };

    const midPlaylist: Playlist = {
      id: 'mid-p',
      playlistName: 'Mid',
      description: '',
      playlistType: PlaylistType.Sequential,
      tracks: [
        makeTrack({ idx: 0, trackId: 'b', durationDS: 10 }),
        makeTrack({ idx: 1, trackId: 'c', durationDS: 10 }),
        makeTrack({ idx: 2, trackType: TrackType.Playlist, trackId: 'deep-p', durationDS: 0 }),
        makeTrack({ idx: 3, trackId: 'g', durationDS: 10 }),
      ],
      settings: makeSettings(),
    };

    const repo = makeMockRepo(new Map([
      ['mid-p', midPlaylist],
      ['deep-p', deepPlaylist],
    ]));

    const playlist: Playlist = {
      id: 'top',
      playlistName: 'Top',
      description: '',
      playlistType: PlaylistType.Sequential,
      tracks: [
        makeTrack({ idx: 0, trackId: 'a', durationDS: 10 }),
        makeTrack({ idx: 1, trackType: TrackType.Playlist, trackId: 'mid-p', durationDS: 0 }),
        makeTrack({ idx: 2, trackId: 'h', durationDS: 10 }),
      ],
      settings: makeSettings(),
    };

    const result = await convertPlaylistToQueueItem(playlist, repo, []);

    expect(result.tracks).toHaveLength(3);
    // track 0: script 'a'
    expect(result.tracks[0]).toEqual({ id: 'a', duration: 1000, isWait: false });
    // track 1: flattened [b, c, e, f, g]
    expect(Array.isArray(result.tracks[1])).toBe(true);
    const flat = result.tracks[1] as Array<{ id: string }>;
    expect(flat.map((t) => t.id)).toEqual(['b', 'c', 'e', 'f', 'g']);
    // track 2: script 'h'
    expect(result.tracks[2]).toEqual({ id: 'h', duration: 1000, isWait: false });
  });

  it('should skip nested playlist track if not found in DB', async () => {
    const repo = makeMockRepo(); // empty — getPlaylist returns null

    const playlist: Playlist = {
      id: 'p1',
      playlistName: 'Test',
      description: '',
      playlistType: PlaylistType.Sequential,
      tracks: [
        makeTrack({ idx: 0, trackType: TrackType.Playlist, trackId: 'missing-playlist' }),
      ],
      settings: makeSettings(),
    };

    const result = await convertPlaylistToQueueItem(playlist, repo, []);

    expect(result.tracks).toHaveLength(0);
  });

  it('should map repeat settings: repeat=true, repeatCount=3 → repeatsLeft=3', async () => {
    const playlist: Playlist = {
      id: 'p1',
      playlistName: 'Test',
      description: '',
      playlistType: PlaylistType.SequentialRepeatable,
      tracks: [makeTrack({ idx: 0 })],
      settings: makeSettings({ repeat: true, repeatCount: 3 }),
    };

    const result = await convertPlaylistToQueueItem(playlist, makeMockRepo(), []);
    expect(result.repeatsLeft).toBe(3);
  });

  it('should map repeat settings: repeat=true, repeatCount=0 → repeatsLeft=-1 (infinite)', async () => {
    const playlist: Playlist = {
      id: 'p1',
      playlistName: 'Test',
      description: '',
      playlistType: PlaylistType.SequentialRepeatable,
      tracks: [makeTrack({ idx: 0 })],
      settings: makeSettings({ repeat: true, repeatCount: 0 }),
    };

    const result = await convertPlaylistToQueueItem(playlist, makeMockRepo(), []);
    expect(result.repeatsLeft).toBe(-1);
  });

  it('should map repeat settings: repeat=false → repeatsLeft=0', async () => {
    const playlist: Playlist = {
      id: 'p1',
      playlistName: 'Test',
      description: '',
      playlistType: PlaylistType.Sequential,
      tracks: [makeTrack({ idx: 0 })],
      settings: makeSettings({ repeat: false }),
    };

    const result = await convertPlaylistToQueueItem(playlist, makeMockRepo(), []);
    expect(result.repeatsLeft).toBe(0);
  });

  it('should map delay settings with durationDS to ms', async () => {
    const playlist: Playlist = {
      id: 'p1',
      playlistName: 'Test',
      description: '',
      playlistType: PlaylistType.ShuffleWithDelay,
      tracks: [makeTrack({ idx: 0 })],
      settings: makeSettings({ randomDelay: true, delayMin: 10, delayMax: 50 }),
    };

    const result = await convertPlaylistToQueueItem(playlist, makeMockRepo(), []);
    expect(result.shuffleWaitMin).toBe(1000);
    expect(result.shuffleWaitMax).toBe(5000);
  });

  it('should preserve playlistType from source', async () => {
    const playlist: Playlist = {
      id: 'p1',
      playlistName: 'Test',
      description: '',
      playlistType: PlaylistType.ShuffleWithDelayAndRepeat,
      tracks: [],
      settings: makeSettings(),
    };

    const result = await convertPlaylistToQueueItem(playlist, makeMockRepo(), []);
    expect(result.playlistType).toBe(PlaylistType.ShuffleWithDelayAndRepeat);
  });

  it('should initialize tracksRemaining as empty', async () => {
    const playlist: Playlist = {
      id: 'p1',
      playlistName: 'Test',
      description: '',
      playlistType: PlaylistType.Sequential,
      tracks: [makeTrack({ idx: 0 })],
      settings: makeSettings(),
    };

    const result = await convertPlaylistToQueueItem(playlist, makeMockRepo(), []);
    expect(result.tracksRemaining).toEqual([]);
  });
});
