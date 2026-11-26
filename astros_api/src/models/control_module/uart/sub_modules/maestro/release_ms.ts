import { Constants } from 'src/models/constants.js';
import { ModuleSubType } from 'src/models/enums.js';
import type { LocationCollection } from 'src/models/location_collection.js';

// A Maestro channel's minimum powered time after a move, in ms. The firmware
// releases a servo channel at max(releaseMs, modeled travel + 10 %).
// Mirrored in astros_vue/src/constants/maestro.ts; keep the two in sync.
export const RELEASE_MS_DEFAULT = 5000;
export const RELEASE_MS_MIN = 1000;
export const RELEASE_MS_MAX = 120000;

// Locations in the order saveLocations writes them.
const LOCATIONS = [
  ['domeModule', Constants.DOME],
  ['coreModule', Constants.CORE],
  ['bodyModule', Constants.BODY],
] as const;

/**
 * Lists every Maestro channel in a `PUT /api/locations/` body whose
 * `releaseMs` is present but not a whole number from RELEASE_MS_MIN to
 * RELEASE_MS_MAX. An absent (`undefined`) value is not a problem: the
 * repository stores RELEASE_MS_DEFAULT for it.
 *
 * The body is untrusted JSON, so the walk skips anything that isn't the
 * expected shape instead of throwing; a malformed body then behaves in the
 * repository as it did before this check existed.
 */
export function findInvalidReleaseMs(collection: LocationCollection): string[] {
  const problems: string[] = [];

  for (const [key, locationName] of LOCATIONS) {
    const uartModules = asRecord(asRecord(collection)?.[key])?.uartModules;
    if (!Array.isArray(uartModules)) continue;

    for (const mod of uartModules.map(asRecord)) {
      if (mod?.moduleSubType !== ModuleSubType.maestro) continue;
      const boards = asRecord(mod.subModule)?.boards;
      if (!Array.isArray(boards)) continue;

      for (const board of boards.map(asRecord)) {
        if (!board || !Array.isArray(board.channels)) continue;

        for (const channel of board.channels.map(asRecord)) {
          if (!channel || channel.releaseMs === undefined || isValidReleaseMs(channel.releaseMs)) {
            continue;
          }
          problems.push(
            `${locationName}, module ${formatValue(mod.name)}, board ${formatValue(board.boardId)}, ` +
              `channel ${formatValue(channel.channelNumber)}: releaseMs ${formatValue(channel.releaseMs)} ` +
              `is not a whole number from ${RELEASE_MS_MIN} to ${RELEASE_MS_MAX}`,
          );
        }
      }
    }
  }

  return problems;
}

function isValidReleaseMs(value: unknown): boolean {
  return (
    Number.isInteger(value) &&
    (value as number) >= RELEASE_MS_MIN &&
    (value as number) <= RELEASE_MS_MAX
  );
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

// String() throws on a JSON value such as {"toString":0}, and JSON.stringify
// shows NaN and Infinity as null, so numbers go through String() and
// everything else through JSON.stringify.
function formatValue(value: unknown): string {
  if (typeof value === 'number') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return typeof value;
  }
}
