import { describe, expect, it, vi } from 'vitest';
import { AnimationQueue } from './animation_queue.js';
import { AnimationQueuePlaylist } from './queue_item/animation_queue_item.js';
import { PlaylistType } from '../../models/playlists/playlistType.js';

describe('Animation Queue Tests', () => {
  it('should add animation to the queue and dispatch', () => {
    const mockDispatchCallback = vi.fn();

    // Create an instance of the AnimationQueue
    const animationQueue = new AnimationQueue(mockDispatchCallback);

    const playlist: AnimationQueuePlaylist = {
      id: 'test_playlist',
      playlistType: PlaylistType.Sequential,
      tracks: [
        { id: 'track1', duration: 10 },
        { id: 'track2', duration: 15 },
      ],
      repeatsLeft: 0,
      shuffleWaitMin: 0,
      shuffleWaitMax: 0,
      tracksRemaining: [],
    };

    // Add the animation to the queue
    animationQueue.addToQueue(playlist);

    // Assert that the dispatch callback was called with the correct animation
    expect(mockDispatchCallback).toHaveBeenCalledTimes(2);
    expect(mockDispatchCallback).toHaveBeenCalledWith('track1');
    expect(mockDispatchCallback).toHaveBeenCalledWith('track2');
  });

  it('should clear the queue and stop animations', async () => {
    const mockDispatchCallback = vi.fn();

    // Create an instance of the AnimationQueue
    const animationQueue = new AnimationQueue(mockDispatchCallback);

    const playlist: AnimationQueuePlaylist = {
      id: 'test_playlist',
      playlistType: PlaylistType.Sequential,
      tracks: [
        { id: 'track1', duration: 100 },
        { id: 'track2', duration: 15 },
      ],
      repeatsLeft: 0,
      shuffleWaitMin: 0,
      shuffleWaitMax: 0,
      tracksRemaining: [],
    };

    animationQueue.addToQueue(playlist);

    await new Promise((resolve) => setTimeout(resolve, 25));

    animationQueue.clearQueue();

    expect(mockDispatchCallback).toHaveBeenCalledTimes(1);
    expect(mockDispatchCallback).toHaveBeenCalledWith('track1');
  });
});
