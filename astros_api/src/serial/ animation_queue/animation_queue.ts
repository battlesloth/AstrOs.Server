import { PlaylistType } from 'src/models/playlists/playlistType.js';
import { AnimationQueuePlaylist, QueueTrack } from './queue_item/animation_queue_item.js';
import { logger } from 'src/logger.js';

export class AnimationQueue {
  // prevent race conditions
  loadingItem = false;

  inPanicStop = false;
  playlistQueue: AnimationQueuePlaylist[] = [];
  activePlaylist: AnimationQueuePlaylist | null = null;
  currentTrack: QueueTrack | QueueTrack[] | null = null;

  dispatchCallback: (id: string) => void;

  constructor(dispatchCallback: (id: string) => void) {
    this.dispatchCallback = dispatchCallback;
  }

  addToQueue(item: AnimationQueuePlaylist) {
    if (this.inPanicStop) {
      logger.warn('Attempted to add item to animation queue while in panic stop', { item });
      return;
    }

    this.loadingItem = true;
    try {
      item.tracksRemaining = [...item.tracks];

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
        return;
      }

      this.activePlaylist = item;
      this.startPlayingActivePlaylist();
    } catch (error) {
      logger.error('Error adding item to animation queue', { error, item });
    } finally {
      this.loadingItem = false;
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
    this.activePlaylist = null;
    this.currentTrack = null;
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
  }

  playNextTrack() {
    if (this.inPanicStop) {
      return;
    }

    while (this.loadingItem) {
      // wait for the item to finish loading
      // before trying to play the next track
    }

    // if current track is a sequential playlist and there
    // are scripts remaining, play the next one
    if (
      this.currentTrack !== null &&
      Array.isArray(this.currentTrack) &&
      this.currentTrack.length > 0
    ) {
      const nextScript = this.currentTrack.shift();
      if (nextScript) {
        this.dispatchNextTrack(nextScript);
      }
      /* TODO: we probably don't want to
       * return just yet becuase
       * if we are at the end and need to repeat...
       * we will work on this later.
       * Unit test the hell out of this.
       */
      return;
    }
  }

  dispatchNextTrack(track: QueueTrack) {
    this.dispatchCallback(track.id);
    // call playNextTrack again after the duration of
    // nextScript to play the next script in the sequential playlist
    setTimeout(() => {
      this.playNextTrack();
    }, track.duration);
  }

  /*
  Playlist Types
  Sequential Playlist
  Sequential Playlist - Interruptible
  Sequential Playlist - Repeatable
  Shuffle Playlist
  Shuffle Playlist - Repeatable
  Shuffle Playlist - With Delay
  Shuffle Playlist - With Delay and Repeatable

  Track Types
  Script Track
  Sequential Playlist Track
  Wait Track


  Animation Queue Items contain a list of tracks to run. Each track has a 
  duration which is used to determine when the next track in the list should 
  be dispatched. Generally, once all tracks in the list have been dispatched,
  the next item in the queue will be processed after the duration of the 
  last track ends.

  A single script that is queued can be considered a playlist with one track,
  so the logic for handling scripts and playlists is the same.

  Tracks can be either scripts or sequential playlists. At this time repeating 
  sequential playlists, interruptible sequential playlists, and all shuffle
  playlists are not supported as tracks. 
  
  There are also Wait Tracks, which are not scripts or playlists, but just a
  track that waits for a specified duration before dispatching the next track.
  Wait Tracks can be a set time or a random time between a min and max wait time. 

  Scripts and Sequential Playlists are uninterruptible, meaning that once they 
  start, they will run to completion before the next item in the queue can start. 

  It is assumed that sequential playlists and scripts have to be played to 
  completion because either they have to complete in order to put the droid in 
  a safe state or they are a part of a larger sequence that has to be played in order.
  
  You can queue up as many scripts and sequential playlists as you want, and they 
  will run sequentially. The only way to remove them from the queue is to send
  a clear queue command, which will clear any queued items, but the currently
  running item will continue to run until completion. Or you can send a panic stop
  command, which will immediately stop the currently running item and clear the queue. 

  You will need to manually put your droid in a safe state after sending a panic stop
  command, as the system won't know what position any animation is in. The system will
  not queue up new items until a panic clear is received.


  Interruptible Playlists

  Interruptible Playlists are considered interruptible, meaning that they can be 
  interrupted while playing and will be replaced by any new item added to the queue
  if they are not yet started. You can make a sequential playlist interruptible.

  If an interruptible item is added to the queue while a non-interruptible item 
  is running, the interruptible item will wait until the non-interruptible item
  is finished before it starts.
  
  Anything queued after the interruptible item has been added to the queue will 
  replace the interruptible item and the interruptible item will never run. 
  
  If the interruptible item is currently running when a new item is added to the
  queue, the interruptible item will be replaced by the new item, though the 
  currently running track will continue until completion.

  This means the following is true:

  Scenario 1:

  Script A - is a script.
  Playlist B - is a sequential playlist with Script B1 and Script B2.
  Playlist C - is an interruptible playlist with Script C1 and Script C2.

  If the queue is: A, B, C, then A will run, then B1 and B2 will run sequentially, 
  then C1 and C2 will run sequentially.

  If another script or playlist is added to the queue before C starts, it will
  replace C in the queue and C will never run. 

  Scenario 2:

  Script A - is a script.
  Playlist B - is a sequential playlist with Script B1 and Script B2.
  Playlist C - is an interruptible playlist with Script C1 and Script C2.
  Playlist D - is an interruptible playlist with Script D1 and Script D2.
  Playlist E - is a sequential playlist with Script E1 and Script E2.

  The queue is currently: A, B, C. A is running, B and C are queued up.

  If D is added before C starts, it replaces C in the queue. Once A finishes, 
  B1 and B2 will run sequentially, but C1 and C2 will never run because they 
  were replaced by D in the queue. After B finishes, D1 and D2 will run.

  If E is added before D starts, it will replace D in the queue and D will 
  never run. Once B finishes, E1 and E2 will run sequentially, but D1 and 
  D2 will never run because they were replaced by E in the queue.

  If E is added after D1 has been dispatched, but before D2 is dispatched, it will
  replace D, and D2 will never run. E1 will be the next script dispatched 
  and E2 will follow.

  Basically this means that there can only ever be one interruptible item in the queue
  and it will always be the last item on the queue since anything added to the queue
  will replace it.

  This is intentional. Creating logic that would allow queueing up multiple 
  interruptible items and know which one you wanted to interupt and which one you
  didn't want to interrupt would require scripting logic rather than simple command
  dispatches from the API.


  Repeatable Playlists

  Repeatable Playlists are always interruptible, meaning that they can be 
  interrupted while playing and will be replaced by any new item added to the queue
  if they are not yet started. You can make a sequential playlist repeatable.

  A repeatable playlist can be set to repeat either a set number of times or 
  indefinitely until it is interrupted. 


  Shuffle Playlists

  Shuffle Playlists are always interruptible and can also be set to repeat.

  Shuffle playlists will shuffle the order of the scripts in the playlist each time
  they are played. If a shuffle playlist is set to repeat, it will reshuffle the 
  order of the scripts each time it repeats. If a shuffle playlist is not set to repeat,
  it will play through all scripts in the shuffled order and then stop.

  If a shuffle playlist with wait enabled, it will wait either a set amount of time,
  or a random amount of time between the configured min and max wait times, after each 
  script or playlist before playing the next script.

  If a Sequential Playlist is a track of a Shuffle Playlist, the Sequential Playlist
  will be shuffled as a whole, meaning that the scripts in the Sequential Playlist will play
  in order, but the position of the Sequential Playlist in the Shuffle Playlist will be 
  shuffled with the other tracks in the playlist. 

  A shuffle playlist can never be a track as that can lead to unexpected behavior.

  */
}
