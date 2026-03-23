/*
 * Sequtial: Plays tracks in the order they were added. Once the end
 *     of the playlist is reached, it stops.
 *
 * SequentialInterruptible: Similar to Sequential, but if a new playlist
 *     is started while one is already playing, it will interrupt the
 *     current playlist and start the new one as soon as the current track
 *     finishes.
 *
 * SequentialRepeatable: Plays tracks in the order they were added. Once
 *     the end of the playlist is reached, it starts over from the
 *     beginning. This type is always interruptible.
 *
 * Shuffle: Plays tracks in a random order. Each track is played once
 *     until all tracks have been played, then it stops. This type is
 *     always interruptible.
 *
 * ShuffleWithRepeat: Similar to Shuffle, but once all tracks have been
 *     played, it reshuffles and starts again. This type is always
 *     interruptible.
 *
 * ShuffleWithDelay: Similar to Shuffle, but after each track is
 *     played, it waits for a specified delay before playing the next
 *     track. This type is always interruptible.
 *
 * ShuffleWithDelayAndRepeat: Similar to ShuffleWithDelay, but once all
 *     tracks have been played, it reshuffles and starts again. This type
 *     is always interruptible.
 */
export enum PlaylistType {
  Sequential = 'Sequential',
  SequentialInterruptible = 'SequentialInterruptible',
  SequentialRepeatable = 'SequentialRepeatable',
  Shuffle = 'Shuffle',
  ShuffleWithRepeat = 'ShuffleWithRepeat',
  ShuffleWithDelay = 'ShuffleWithDelay',
  ShuffleWithDelayAndRepeat = 'ShuffleWithDelayAndRepeat',
}
