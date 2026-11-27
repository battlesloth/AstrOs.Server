import { Constants, LocationName } from 'src/models/constants.js';
import { ModuleSubType } from 'src/models/enums.js';

// A Maestro channel's minimum powered time after a move, in ms. Firmware
// 1.3.0+ (ESP T-010) releases a servo channel at max(releaseMs, modeled
// travel + 10 %) once the server sends it (T-014); 1.2.1–1.2.2 use a fixed
// 5000 floor for every channel.
// Mirrored in astros_vue/src/constants/maestro.ts; keep the two in sync.
export const RELEASE_MS_DEFAULT = 5000;
export const RELEASE_MS_MIN = 1000;
export const RELEASE_MS_MAX = 120000;

// Why a releaseMs is refused. The values are wire codes (the 400 reply and its
// warn line), mapped to messages by the Vue side (T-015): the server sends
// codes, not English, and the 400 reply and its warn line never echo the
// request's own text.
export enum ReleaseMsProblem {
  // not a finite whole number: a string, null, a fraction, NaN, Infinity…
  NotInteger = 'RELEASE_MS_NOT_INTEGER',
  // a whole number outside RELEASE_MS_MIN–RELEASE_MS_MAX
  OutOfRange = 'RELEASE_MS_OUT_OF_RANGE',
}

// One refused channel, found by its position in the request: the location,
// then the indexes into that location's `uartModules`, the module's
// `subModule.boards` and the board's `channels`, so the client can index what
// it sent. Every field is server-generated, so an entry has a fixed size.
export interface ReleaseMsProblemEntry {
  code: ReleaseMsProblem;
  location: LocationName;
  moduleIndex: number;
  boardIndex: number;
  channelIndex: number;
}

// Locations in the order saveLocations writes them.
const LOCATIONS = [
  ['domeModule', Constants.DOME],
  ['coreModule', Constants.CORE],
  ['bodyModule', Constants.BODY],
] as const;

// Null for a valid releaseMs. Reads only `Number.isInteger` (which never
// coerces) and numeric comparisons, so no value (one whose String() throws, a
// cycle, deep nesting) can make it throw.
export function releaseMsProblem(value: unknown): ReleaseMsProblem | null {
  if (!Number.isInteger(value)) return ReleaseMsProblem.NotInteger;
  const ms = value as number;
  return ms < RELEASE_MS_MIN || ms > RELEASE_MS_MAX ? ReleaseMsProblem.OutOfRange : null;
}

/**
 * Lists every Maestro channel in a `PUT /api/locations/` body whose
 * `releaseMs` is present but refused by `releaseMsProblem`. An absent
 * (`undefined`) value is not a problem: the repository stores
 * RELEASE_MS_DEFAULT for it.
 *
 * The body is untrusted JSON (saveLocations passes `req.body` as received),
 * so the walk skips anything that isn't the expected shape instead of
 * throwing. A malformed body is left for the repository to handle (or fail
 * on).
 */
export function findInvalidReleaseMs(body: unknown): ReleaseMsProblemEntry[] {
  const problems: ReleaseMsProblemEntry[] = [];

  for (const [key, location] of LOCATIONS) {
    const uartModules = asRecord(asRecord(body)?.[key])?.uartModules;
    if (!Array.isArray(uartModules)) continue;

    uartModules.forEach((entry, moduleIndex) => {
      const mod = asRecord(entry);
      if (mod?.moduleSubType !== ModuleSubType.maestro) return;
      const boards = asRecord(mod.subModule)?.boards;
      if (!Array.isArray(boards)) return;

      boards.forEach((boardEntry, boardIndex) => {
        const board = asRecord(boardEntry);
        if (!board || !Array.isArray(board.channels)) return;

        board.channels.forEach((channelEntry, channelIndex) => {
          const channel = asRecord(channelEntry);
          if (!channel || channel.releaseMs === undefined) return;
          const code = releaseMsProblem(channel.releaseMs);
          if (code !== null) {
            problems.push({ code, location, moduleIndex, boardIndex, channelIndex });
          }
        });
      });
    });
  }

  return problems;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}
