import { Script } from '../models/index.js';

/**
 * Updates the duration of a script if it is undefined, null, NaN, or less than 0.
 * Modifies the script object in place. Reads `script.scriptChannels`, so call it
 * only after the channels and events are loaded — on an unloaded script it computes 0.
 * @param script The script to update
 */
export function updateScriptDuration(script: Script): void {
  if (
    script.durationDS === undefined ||
    script.durationDS === null ||
    isNaN(script.durationDS) ||
    script.durationDS < 0
  ) {
    script.durationDS = calculateLengthDS(script);
  }
}

/**
 * Calculates the length of a script in deciseconds from the latest event time across all channels.
 * Event times are in seconds (0.1 s precision); the result is deciseconds, the unit
 * `scripts.duration_ds` is stored in and every consumer reads it as. The length ends
 * at the start of the last event; that event's own run time is not included.
 * @param script The script to calculate the length for
 * @returns The length of the script in deciseconds
 */
export function calculateLengthDS(script: Script): number {
  const allEvents = script.scriptChannels.flatMap((channel) => Object.values(channel.events));

  if (allEvents.length === 0) {
    return 0;
  }

  const lastEventSeconds = Math.max(...allEvents.map((event) => event.time));

  return Math.round(lastEventSeconds * 10);
}
