import { Playlist } from 'src/models/playlists/playlist.js';
import { PlaylistTrack } from 'src/models/playlists/playlistTrack.js';
import { TrackType } from 'src/models/playlists/trackType.js';
import { PlaylistRepository } from 'src/dal/repositories/playlist_repository.js';
import { ControllerLocation } from 'src/models/control_module/controller_location.js';
import { AnimationQueuePlaylist, QueueTrack } from './queue_item/animation_queue_item.js';
import { logger } from 'src/logger.js';
import { PlaylistCycleError } from 'src/models/playlists/playlist_cycle_error.js';

function dsToMs(ds: number): number {
  return ds * 100;
}

function getTrackDuration(track: PlaylistTrack): number {
  if (track.randomWait && track.durationMaxDS > track.durationDS) {
    const minMs = dsToMs(track.durationDS);
    const maxMs = dsToMs(track.durationMaxDS);
    return minMs + Math.floor(Math.random() * (maxMs - minMs + 1));
  }
  return dsToMs(track.durationDS);
}

function convertScriptTrack(track: PlaylistTrack): QueueTrack {
  return {
    id: track.trackId,
    duration: getTrackDuration(track),
    isWait: false,
  };
}

function convertWaitTrack(track: PlaylistTrack): QueueTrack {
  return {
    id: track.trackId,
    duration: getTrackDuration(track),
    isWait: true,
  };
}

// Recursively flattens nested playlist tracks into a single QueueTrack[].
// e.g. playlist [a, [b, c, [e, f], g], h] becomes [a, [b, c, e, f, g], h]
// at the top level — all sub-playlists within a playlist track are
// flattened into one sequential array of QueueTracks.
//
// The `visited` set contains the IDs of playlists currently on the recursion
// path (seeded by convertPlaylistToQueueItem with the top-level playlist's
// ID). If the track being processed references an ID already in `visited`, a
// PlaylistCycleError is thrown. Entries are removed from `visited` after the
// recursive call returns so that legitimate sibling duplicates of the same
// sub-playlist (not a cycle) are still allowed.
async function flattenPlaylistTrack(
  track: PlaylistTrack,
  playlistRepo: PlaylistRepository,
  visited: Set<string>,
): Promise<QueueTrack[]> {
  if (visited.has(track.trackId)) {
    throw new PlaylistCycleError(track.trackId, {
      id: track.id,
      trackName: track.trackName,
      idx: track.idx,
      trackId: track.trackId,
    });
  }

  const nestedPlaylist = await playlistRepo.getPlaylist(track.trackId);

  if (!nestedPlaylist) {
    logger.warn(`Nested playlist ${track.trackId} not found, skipping track`);
    return [];
  }

  visited.add(track.trackId);
  try {
    const subTracks: QueueTrack[] = [];
    for (const subTrack of nestedPlaylist.tracks) {
      switch (subTrack.trackType) {
        case TrackType.Script:
          subTracks.push(convertScriptTrack(subTrack));
          break;
        case TrackType.Wait:
          subTracks.push(convertWaitTrack(subTrack));
          break;
        case TrackType.Playlist: {
          const deepTracks = await flattenPlaylistTrack(subTrack, playlistRepo, visited);
          subTracks.push(...deepTracks);
          break;
        }
      }
    }
    return subTracks;
  } finally {
    visited.delete(track.trackId);
  }
}

export async function convertPlaylistToQueueItem(
  playlist: Playlist,
  playlistRepo: PlaylistRepository,
  locations: Array<ControllerLocation>,
): Promise<AnimationQueuePlaylist> {
  const tracks: Array<QueueTrack | QueueTrack[]> = [];
  // Seed the visited set with the top-level playlist's own ID so that direct
  // self-reference (A → A) is caught on the first recursive call.
  const visited = new Set<string>([playlist.id]);

  for (const track of playlist.tracks) {
    switch (track.trackType) {
      case TrackType.Script:
        tracks.push(convertScriptTrack(track));
        break;
      case TrackType.Wait:
        tracks.push(convertWaitTrack(track));
        break;
      case TrackType.Playlist: {
        try {
          const subTracks = await flattenPlaylistTrack(track, playlistRepo, visited);
          if (subTracks.length > 0) {
            tracks.push(subTracks);
          }
        } catch (err) {
          if (err instanceof PlaylistCycleError) {
            // Re-throw with the top-level track as the offender so the caller
            // (and, through the controller, the user) can identify which
            // user-visible track created the cycle.
            throw new PlaylistCycleError(
              playlist.id,
              {
                id: track.id,
                trackName: track.trackName,
                idx: track.idx,
                trackId: track.trackId,
              },
              `Playlist "${playlist.playlistName}" cannot play: track "${track.trackName}" at position ${track.idx + 1} creates an infinite loop.`,
            );
          }
          throw err;
        }
        break;
      }
    }
  }

  const { settings } = playlist;
  let repeatsLeft = 0;
  if (settings.repeat) {
    repeatsLeft = settings.repeatCount === 0 ? -1 : settings.repeatCount;
  }

  return {
    id: playlist.id,
    playlistType: playlist.playlistType,
    locations,
    tracks,
    repeatsLeft,
    shuffleWaitMin: dsToMs(settings.delayMin),
    shuffleWaitMax: dsToMs(settings.delayMax),
    tracksRemaining: [],
  };
}
