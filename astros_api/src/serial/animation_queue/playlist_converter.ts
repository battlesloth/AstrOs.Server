import { Playlist } from 'src/models/playlists/playlist.js';
import { PlaylistTrack } from 'src/models/playlists/playlistTrack.js';
import { TrackType } from 'src/models/playlists/trackType.js';
import { PlaylistRepository } from 'src/dal/repositories/playlist_repository.js';
import { ControllerLocation } from 'src/models/control_module/controller_location.js';
import {
  AnimationQueuePlaylist,
  MAX_TIMER_MS,
  QueueTrack,
} from './queue_item/animation_queue_item.js';
import { logger } from 'src/logger.js';
import { PlaylistCycleError } from 'src/models/playlists/playlist_cycle_error.js';
import { PlaylistType } from 'src/models/playlists/playlistType.js';
import { Script } from 'src/models/scripts/script.js';

function dsToMs(ds: number): number {
  return ds * 100;
}

// A delay a timer can honor: settings reach the converter unvalidated
// (JSON.parse), so a missing, negative, or non-finite delay means none, and one
// beyond the timer maximum is clamped (Node would fire it after 1 ms).
function safeDelayMs(ds: number): number {
  const ms = dsToMs(ds);
  if (Number.isNaN(ms) || ms < 0) return 0;
  return Math.min(ms, MAX_TIMER_MS);
}

const DELAY_TYPES = [PlaylistType.ShuffleWithDelay, PlaylistType.ShuffleWithDelayAndRepeat];

function getTrackDuration(track: PlaylistTrack): number {
  if (track.randomWait && track.durationMaxDS > track.durationDS) {
    const minMs = dsToMs(track.durationDS);
    const maxMs = dsToMs(track.durationMaxDS);
    return minMs + Math.floor(Math.random() * (maxMs - minMs + 1));
  }
  return dsToMs(track.durationDS);
}

function convertScriptTrack(
  track: PlaylistTrack,
  scriptDurations: Map<string, number>,
  unknownScripts: Map<string, string>,
): QueueTrack {
  // A playlist Script track's own durationDS is meaningless — the editor
  // exposes no duration control for script tracks, so it stays 0 (or stale).
  // Use the referenced script's recorded duration instead; otherwise the queue
  // would treat the script as instantaneous and run the next track over it.
  // Unknown scriptId (no scripts row — deleting a script soft-disables it and
  // removes its tracks, so this means imported or hand-edited data) → 0 ms;
  // collected and warned once per conversion. The queue's minimum repeat pass
  // keeps a loop of them from flooding.
  const durationDS = scriptDurations.get(track.trackId);
  if (durationDS === undefined) {
    unknownScripts.set(track.trackId, track.trackName);
  }
  return {
    id: track.trackId,
    duration: dsToMs(durationDS ?? 0),
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
  scriptDurations: Map<string, number>,
  unknownScripts: Map<string, string>,
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
          subTracks.push(convertScriptTrack(subTrack, scriptDurations, unknownScripts));
          break;
        case TrackType.Wait:
          subTracks.push(convertWaitTrack(subTrack));
          break;
        case TrackType.Playlist: {
          const deepTracks = await flattenPlaylistTrack(
            subTrack,
            playlistRepo,
            visited,
            scriptDurations,
            unknownScripts,
          );
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
  scriptDurations: Map<string, number>,
  locations: Array<ControllerLocation>,
): Promise<AnimationQueuePlaylist> {
  const tracks: Array<QueueTrack | QueueTrack[]> = [];
  // Seed the visited set with the top-level playlist's own ID so that direct
  // self-reference (A → A) is caught on the first recursive call.
  const visited = new Set<string>([playlist.id]);
  // id → track name (the only human-readable hint for a missing script).
  const unknownScripts = new Map<string, string>();

  for (const track of playlist.tracks) {
    switch (track.trackType) {
      case TrackType.Script:
        tracks.push(convertScriptTrack(track, scriptDurations, unknownScripts));
        break;
      case TrackType.Wait:
        tracks.push(convertWaitTrack(track));
        break;
      case TrackType.Playlist: {
        try {
          const subTracks = await flattenPlaylistTrack(
            track,
            playlistRepo,
            visited,
            scriptDurations,
            unknownScripts,
          );
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

  if (unknownScripts.size > 0) {
    logger.warn(
      {
        playlistId: playlist.id,
        unknownScripts: [...unknownScripts].map(([id, trackName]) => ({ id, trackName })),
      },
      'Playlist references unknown scripts; timing them as 0 ms',
    );
  }

  const { settings } = playlist;
  // Random Delay off → a fixed delay of delayMin. delayMax can be stale:
  // nothing lowers it once Random Delay is off (its input is hidden, and
  // raising delayMin only ever raises it).
  const delayMaxDS = settings.randomDelay ? settings.delayMax : settings.delayMin;
  const shuffleWaitMin = safeDelayMs(settings.delayMin);
  const shuffleWaitMax = safeDelayMs(delayMaxDS);
  if (
    DELAY_TYPES.includes(playlist.playlistType) &&
    (shuffleWaitMin !== dsToMs(settings.delayMin) || shuffleWaitMax !== dsToMs(delayMaxDS))
  ) {
    // String(): pino drops undefined keys and writes NaN as null.
    logger.warn(
      {
        playlistId: playlist.id,
        randomDelay: String(settings.randomDelay),
        delayMin: String(settings.delayMin),
        delayMax: String(settings.delayMax),
        shuffleWaitMin,
        shuffleWaitMax,
      },
      'Invalid playlist delay settings; using a safe value',
    );
  }
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
    shuffleWaitMin,
    shuffleWaitMax,
    tracksRemaining: [],
  };
}

// A directly run script queues as a one-track playlist: Sequential, so it is
// uninterruptible and anything run meanwhile waits behind it, and no repeat.
export function convertScriptToQueueItem(
  script: Script,
  locations: Array<ControllerLocation>,
): AnimationQueuePlaylist {
  return {
    id: `script-${script.id}`,
    playlistType: PlaylistType.Sequential,
    locations,
    tracks: [{ id: script.id, duration: dsToMs(script.durationDS), isWait: false }],
    repeatsLeft: 0,
    shuffleWaitMin: 0,
    shuffleWaitMax: 0,
    tracksRemaining: [],
  };
}
