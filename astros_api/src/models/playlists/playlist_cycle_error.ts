/**
 * Thrown when a playlist is detected to contain a cyclic reference to itself,
 * either directly (A → A) or transitively (A → B → A). Carries the specific
 * top-level track responsible for the cycle so the UI can tell the user which
 * entry to remove instead of making them guess.
 *
 * Thrown from:
 *   - PlaylistRepository.upsertPlaylist (at save time, before any DB writes)
 *   - convertPlaylistToQueueItem (at playback time, as defense in depth)
 */
export interface OffendingTrackInfo {
  id: string;
  trackName: string;
  idx: number;
  trackId: string;
}

export class PlaylistCycleError extends Error {
  constructor(
    public readonly playlistId: string,
    public readonly offendingTrack: OffendingTrackInfo,
    message?: string,
  ) {
    super(
      message ??
        `Playlist "${playlistId}" contains a cyclic reference via track "${offendingTrack.trackName}" (position ${offendingTrack.idx + 1}).`,
    );
    this.name = 'PlaylistCycleError';
  }
}
