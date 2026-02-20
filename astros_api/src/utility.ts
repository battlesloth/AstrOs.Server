import { Script } from 'astros-common';

/**
 * Updates the duration of a script if it is undefined, null, NaN, or less than 0.
 * Modifies the script object in place.
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
 * Calculates the length of a script in deciseconds by finding the maximum time of all events across all channels.
 * @param script The script to calculate the length for
 * @returns The length of the script in deciseconds
 */
export function calculateLengthDS(script: Script): number {
  let totalLengthDS = 0;

  // get all events for all channels, find max time

  const allEvents = script.scriptChannels.flatMap((channel) => Object.values(channel.events));

  if (allEvents.length === 0) {
    return 0;
  }

  totalLengthDS = Math.max(...allEvents.map((event) => event.time));

  return totalLengthDS;
}
