import { PlaylistType } from 'src/models/playlists/playlistType.js';
import { ControllerLocation } from 'src/models/control_module/controller_location.js';
import { AnimationQueuePlaylist, QueueTrack } from './queue_item/animation_queue_item.js';
import { logger } from 'src/logger.js';
import type { PanicState } from 'src/models/networking/panic_responses.js';

export class AnimationQueue {
  inPanicStop = false;
  playlistQueue: AnimationQueuePlaylist[] = [];
  // The playlist addToQueue routes against. After a replacement it is already the new
  // item while the replaced playlist's current track, nested track, or gap
  // finishes (see playlistReplaced).
  activePlaylist: AnimationQueuePlaylist | null = null;
  // For a nested track, the sub-tracks still to play (not the one playing).
  currentTrack: QueueTrack | QueueTrack[] | null = null;

  // Locations of the playlist the current track came from, captured when the
  // track begins: after a replacement, activePlaylist already points at the new
  // item while a nested track's remaining sub-tracks still play.
  private currentLocations: Array<ControllerLocation> = [];
  private currentTimeout: ReturnType<typeof setTimeout> | null = null;
  // Set when an interruptible activePlaylist is replaced; consumed by
  // takeOverIfReplaced at the end of the current track or gap.
  private playlistReplaced = false;
  private panicListeners = new Set<(state: PanicState) => void>();

  dispatchCallback: (id: string, locations: Array<ControllerLocation>) => void;

  constructor(dispatchCallback: (id: string, locations: Array<ControllerLocation>) => void) {
    this.dispatchCallback = dispatchCallback;
  }

  addToQueue(item: AnimationQueuePlaylist) {
    if (this.inPanicStop) {
      logger.warn('Attempted to add item to animation queue while in panic stop', { item });
      return;
    }

    try {
      item.tracksRemaining = [...item.tracks];
      if (this.isShufflePlaylistType(item.playlistType)) {
        this.shuffleArray(item.tracksRemaining);
      }

      // if the current playlist is sequential we can add the new item
      // to the end of the queue without worrying about needing to
      // interrupt it
      if (
        this.activePlaylist !== null &&
        this.activePlaylist.playlistType === PlaylistType.Sequential
      ) {
        this.addToBackOfQueue(item);
        return;
      }

      if (
        this.activePlaylist !== null &&
        this.activePlaylist.playlistType !== PlaylistType.Sequential
      ) {
        // if the current playlist is interruptible, the new item replaces it:
        // it becomes activePlaylist now and takes over when the current track
        // (a nested track counts as one) or gap ends. The replaced playlist
        // never resumes.
        this.activePlaylist = item;
        this.playlistReplaced = true;
        return;
      }

      this.activePlaylist = item;
      this.startPlayingActivePlaylist();
    } catch (error) {
      logger.error('Error adding item to animation queue', { error, item });
    }
  }

  addToBackOfQueue(item: AnimationQueuePlaylist) {
    if (this.queueHasInterruptible()) {
      this.removeInterruptibleFromQueue();
    }
    this.playlistQueue.push(item);
  }

  queueHasInterruptible() {
    return this.playlistQueue.some((item) => item.playlistType !== PlaylistType.Sequential);
  }

  removeInterruptibleFromQueue() {
    this.playlistQueue = this.playlistQueue.filter(
      (item) => item.playlistType === PlaylistType.Sequential,
    );
  }

  clearQueue() {
    this.playlistQueue = [];
  }

  panicStop() {
    this.inPanicStop = true;
    if (this.currentTimeout) {
      clearTimeout(this.currentTimeout);
      this.currentTimeout = null;
    }
    this.activePlaylist = null;
    this.currentTrack = null;
    this.playlistReplaced = false;
    this.clearQueue();
    this.notifyPanic();
  }

  clearPanicStop() {
    this.inPanicStop = false;
    this.notifyPanic();
  }

  getPanicState(): PanicState {
    return { inPanicStop: this.inPanicStop };
  }

  // Observable panic state — api_server subscribes to broadcast the change to
  // WebSocket clients (and reads getPanicState() for the on-connect snapshot
  // and the GET hydrate endpoint). Mirrors JobLock.subscribe.
  subscribe(listener: (state: PanicState) => void): () => void {
    this.panicListeners.add(listener);
    return () => {
      this.panicListeners.delete(listener);
    };
  }

  private notifyPanic(): void {
    const state = this.getPanicState();
    for (const fn of this.panicListeners) {
      try {
        fn(state);
      } catch (error) {
        logger.error('Error in panic listener:', error);
      }
    }
  }

  startPlayingActivePlaylist() {
    if (this.inPanicStop) {
      return;
    }
    if (this.activePlaylist === null) {
      return;
    }

    const track = this.pickNextTrack();
    if (track === null) {
      this.advanceQueue();
      return;
    }

    this.beginTrack(track);
  }

  playNextTrack() {
    // Step A — panic guard
    if (this.inPanicStop) {
      return;
    }

    // Step B — finish sequential sub-track array. A nested playlist is one
    // track, so its sub-tracks finish before a replacement takes over.
    if (
      this.currentTrack !== null &&
      Array.isArray(this.currentTrack) &&
      this.currentTrack.length > 0
    ) {
      const nextSubTrack = this.currentTrack.shift();
      if (nextSubTrack) {
        this.dispatchTrack(nextSubTrack);
      }
      return;
    }

    // Step C — playlist was replaced while current track was playing
    if (this.takeOverIfReplaced()) {
      return;
    }

    // Step D — pick next track from active playlist
    const track = this.pickNextTrack();
    if (track !== null) {
      if (this.hasShuffleDelay()) {
        this.scheduleGap(() => this.beginTrack(track));
      } else {
        this.beginTrack(track);
      }
      return;
    }

    // Step E — tracks exhausted, check repeat. A delay type waits its gap
    // before the first track of the new pass, as between any two tracks.
    if (this.handleRepeat()) {
      if (this.hasShuffleDelay()) {
        this.scheduleGap(() => this.startPlayingActivePlaylist());
      } else {
        this.startPlayingActivePlaylist();
      }
      return;
    }

    // Step F — playlist done, advance queue
    this.advanceQueue();
  }

  // Every inter-track gap goes through here. The timer lives in currentTimeout
  // so panicStop cancels it, and a replacement that arrived during the gap
  // takes over when it ends instead of `then` (e.g. a track picked from the
  // replaced playlist before the gap started). Taking over also clears the
  // flag, so the replacement's own first track end is not treated as another
  // takeover (which would skip its gap).
  private scheduleGap(then: () => void) {
    const delay = this.getShuffleDelay();
    if (this.currentTimeout) {
      clearTimeout(this.currentTimeout);
    }
    this.currentTimeout = setTimeout(() => {
      if (this.takeOverIfReplaced()) {
        return;
      }
      then();
    }, delay);
  }

  // A replacement that arrived during the current track or gap takes over at
  // its end (addToQueue already made it the activePlaylist).
  private takeOverIfReplaced(): boolean {
    if (!this.playlistReplaced) {
      return false;
    }
    this.playlistReplaced = false;
    this.startPlayingActivePlaylist();
    return true;
  }

  private beginTrack(track: QueueTrack | QueueTrack[]) {
    this.currentLocations = this.activePlaylist?.locations ?? [];
    if (Array.isArray(track)) {
      if (track.length === 0) {
        this.playNextTrack();
        return;
      }
      // Shift a copy: `track` is the playlist's own nested array, and a repeat
      // pass replays from it.
      const remaining = [...track];
      const firstSubTrack = remaining.shift();
      this.currentTrack = remaining;
      if (firstSubTrack) {
        this.dispatchTrack(firstSubTrack);
      }
    } else {
      this.currentTrack = track;
      this.dispatchTrack(track);
    }
  }

  dispatchTrack(track: QueueTrack) {
    if (!track.isWait && this.activePlaylist) {
      this.dispatchCallback(track.id, this.currentLocations);
    }
    if (this.currentTimeout) {
      clearTimeout(this.currentTimeout);
    }
    this.currentTimeout = setTimeout(() => {
      this.playNextTrack();
    }, track.duration);
  }

  private advanceQueue() {
    this.activePlaylist = this.playlistQueue.shift() ?? null;
    this.currentTrack = null;
    if (this.activePlaylist) {
      this.startPlayingActivePlaylist();
    }
  }

  private pickNextTrack(): QueueTrack | QueueTrack[] | null {
    if (!this.activePlaylist || this.activePlaylist.tracksRemaining.length === 0) {
      return null;
    }

    return this.activePlaylist.tracksRemaining.shift() ?? null;
  }

  private isShufflePlaylistType(playlistType: PlaylistType): boolean {
    return (
      playlistType === PlaylistType.Shuffle ||
      playlistType === PlaylistType.ShuffleWithRepeat ||
      playlistType === PlaylistType.ShuffleWithDelay ||
      playlistType === PlaylistType.ShuffleWithDelayAndRepeat
    );
  }

  private isRepeatableType(): boolean {
    return (
      this.activePlaylist?.playlistType === PlaylistType.SequentialRepeatable ||
      this.activePlaylist?.playlistType === PlaylistType.ShuffleWithRepeat ||
      this.activePlaylist?.playlistType === PlaylistType.ShuffleWithDelayAndRepeat
    );
  }

  private handleRepeat(): boolean {
    if (!this.activePlaylist || !this.isRepeatableType()) return false;
    if (this.activePlaylist.repeatsLeft === 0) return false;
    if (this.activePlaylist.repeatsLeft > 0) this.activePlaylist.repeatsLeft--;
    // -1 means infinite, don't decrement
    this.activePlaylist.tracksRemaining = [...this.activePlaylist.tracks];
    if (this.isShufflePlaylistType(this.activePlaylist.playlistType)) {
      this.shuffleArray(this.activePlaylist.tracksRemaining);
    }
    return true;
  }

  private shuffleArray<T>(array: T[]): void {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
  }

  private hasShuffleDelay(): boolean {
    return (
      this.activePlaylist?.playlistType === PlaylistType.ShuffleWithDelay ||
      this.activePlaylist?.playlistType === PlaylistType.ShuffleWithDelayAndRepeat
    );
  }

  private getShuffleDelay(): number {
    if (!this.activePlaylist) return 0;
    const { shuffleWaitMin, shuffleWaitMax } = this.activePlaylist;
    return shuffleWaitMin + Math.floor(Math.random() * (shuffleWaitMax - shuffleWaitMin + 1));
  }
}
