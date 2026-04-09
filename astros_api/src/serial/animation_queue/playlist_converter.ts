import { Playlist } from '../../models/playlists/playlist.js';
import { PlaylistTrack } from '../../models/playlists/playlistTrack.js';
import { TrackType } from '../../models/playlists/trackType.js';
import { PlaylistRepository } from '../../dal/repositories/playlist_repository.js';
import { ControllerLocation } from '../../models/control_module/controller_location.js';
import { AnimationQueuePlaylist, QueueTrack } from './queue_item/animation_queue_item.js';
import { logger } from '../../logger.js';

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
async function flattenPlaylistTrack(
  track: PlaylistTrack,
  playlistRepo: PlaylistRepository,
): Promise<QueueTrack[]> {
  const nestedPlaylist = await playlistRepo.getPlaylist(track.trackId);

  if (!nestedPlaylist) {
    logger.warn(`Nested playlist ${track.trackId} not found, skipping track`);
    return [];
  }

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
        const deepTracks = await flattenPlaylistTrack(subTrack, playlistRepo);
        subTracks.push(...deepTracks);
        break;
      }
    }
  }

  return subTracks;
}

export async function convertPlaylistToQueueItem(
  playlist: Playlist,
  playlistRepo: PlaylistRepository,
  locations: Array<ControllerLocation>,
): Promise<AnimationQueuePlaylist> {
  const tracks: Array<QueueTrack | QueueTrack[]> = [];

  for (const track of playlist.tracks) {
    switch (track.trackType) {
      case TrackType.Script:
        tracks.push(convertScriptTrack(track));
        break;
      case TrackType.Wait:
        tracks.push(convertWaitTrack(track));
        break;
      case TrackType.Playlist: {
        const subTracks = await flattenPlaylistTrack(track, playlistRepo);
        if (subTracks.length > 0) {
          tracks.push(subTracks);
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
