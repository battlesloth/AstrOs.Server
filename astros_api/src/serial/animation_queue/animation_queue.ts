import { PlaylistType } from 'src/models/playlists/playlistType.js';
import { AnimationQueuePlaylist, QueueTrack } from './queue_item/animation_queue_item.js';
import { logger } from 'src/logger.js';

export class AnimationQueue {
  inPanicStop = false;
  playlistQueue: AnimationQueuePlaylist[] = [];
  activePlaylist: AnimationQueuePlaylist | null = null;
  currentTrack: QueueTrack | QueueTrack[] | null = null;

  private currentTimeout: ReturnType<typeof setTimeout> | null = null;
  private playlistReplaced = false;

  dispatchCallback: (id: string) => void;

  constructor(dispatchCallback: (id: string) => void) {
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
        // if the current playlist is interruptible, we can replace the
        // current playlist as there can only be one interruptible playlist
        // in the queue at a time, and the new item will take its place
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
  }

  clearPanicStop() {
    this.inPanicStop = false;
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

    // Step B — playlist was replaced while current track was playing
    if (this.playlistReplaced) {
      this.playlistReplaced = false;
      this.startPlayingActivePlaylist();
      return;
    }

    // Step C — finish sequential sub-track array
    if (this.currentTrack !== null && Array.isArray(this.currentTrack) && this.currentTrack.length > 0) {
      const nextSubTrack = this.currentTrack.shift()!;
      this.dispatchTrack(nextSubTrack);
      return;
    }

    // Step D — pick next track from active playlist
    const track = this.pickNextTrack();
    if (track !== null) {
      if (this.hasShuffleDelay()) {
        const delay = this.getShuffleDelay();
        this.currentTimeout = setTimeout(() => {
          this.beginTrack(track);
        }, delay);
      } else {
        this.beginTrack(track);
      }
      return;
    }

    // Step E — tracks exhausted, check repeat
    if (this.handleRepeat()) {
      this.startPlayingActivePlaylist();
      return;
    }

    // Step F — playlist done, advance queue
    this.advanceQueue();
  }

  private beginTrack(track: QueueTrack | QueueTrack[]) {
    if (Array.isArray(track)) {
      if (track.length === 0) {
        this.playNextTrack();
        return;
      }
      const firstSubTrack = track.shift()!;
      this.currentTrack = track;
      this.dispatchTrack(firstSubTrack);
    } else {
      this.currentTrack = track;
      this.dispatchTrack(track);
    }
  }

  dispatchTrack(track: QueueTrack) {
    if (!track.isWait) {
      this.dispatchCallback(track.id);
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

    return this.activePlaylist.tracksRemaining.shift()!;
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
