import { describe, it, expect } from 'vitest';
import { findInvalidReleaseMs } from './release_ms.js';
import type { LocationCollection } from 'src/models/location_collection.js';

const ABSENT = Symbol('absent');

// Plain objects, as `PUT /api/locations/` receives them from JSON. 104 is
// ModuleSubType.maestro and 102 ModuleSubType.kangaroo, written as literals so
// a renumbered enum can't move both sides of the test together.
function maestroModule(name: string, releaseMs: unknown[], extra: Record<string, unknown> = {}) {
  return {
    id: `${name}-id`,
    name,
    moduleSubType: 104,
    subModule: {
      boards: [
        {
          id: `${name}-board`,
          boardId: 0,
          name: 'Board 1',
          channels: releaseMs.map((value, i) => ({
            id: `${name}-ch${i}`,
            channelNumber: i,
            ...(value === ABSENT ? {} : { releaseMs: value }),
          })),
        },
      ],
    },
    ...extra,
  };
}

function collection(parts: Partial<Record<keyof LocationCollection, unknown>>): LocationCollection {
  return parts as unknown as LocationCollection;
}

function domeWith(...releaseMs: unknown[]): LocationCollection {
  return collection({ domeModule: { uartModules: [maestroModule('Dome Maestro', releaseMs)] } });
}

describe('findInvalidReleaseMs', () => {
  // The first column is the value as the problem shows it, so the string
  // case's title reads "flags "5000"", not "flags 5000".
  it.each([
    ['999', 999],
    ['120001', 120001],
    ['1500.5', 1500.5],
    ['NaN', NaN],
    ['"5000"', '5000'],
    ['null', null],
    ['Infinity', Infinity],
    ['0', 0],
    ['true', true],
  ])('flags %s, naming the location, module, board, channel and value', (shown, value) => {
    expect(findInvalidReleaseMs(domeWith(5000, value))).toEqual([
      `dome, module "Dome Maestro", board 0, channel 1: releaseMs ${shown} is not a whole number from 1000 to 120000`,
    ]);
  });

  it.each([1000, 5000, 120000])('accepts %s', (value) => {
    expect(findInvalidReleaseMs(domeWith(value))).toEqual([]);
  });

  it('ignores an absent releaseMs, whether the key is missing or undefined', () => {
    expect(findInvalidReleaseMs(domeWith(ABSENT, undefined))).toEqual([]);
  });

  it('reports every bad channel in every location, in save order (dome, core, body)', () => {
    const problems = findInvalidReleaseMs(
      collection({
        bodyModule: { uartModules: [maestroModule('Body Maestro', [999])] },
        coreModule: { uartModules: [maestroModule('Core Maestro', [5000, 5000, 'x'])] },
        domeModule: { uartModules: [maestroModule('Dome Maestro', [1, 5000, 2])] },
      }),
    );

    expect(problems).toEqual([
      'dome, module "Dome Maestro", board 0, channel 0: releaseMs 1 is not a whole number from 1000 to 120000',
      'dome, module "Dome Maestro", board 0, channel 2: releaseMs 2 is not a whole number from 1000 to 120000',
      'core, module "Core Maestro", board 0, channel 2: releaseMs "x" is not a whole number from 1000 to 120000',
      'body, module "Body Maestro", board 0, channel 0: releaseMs 999 is not a whole number from 1000 to 120000',
    ]);
  });

  // The repository stores Maestro channels only for a Maestro module, so a
  // stray field on another sub-type is never written and must not refuse a save.
  it('checks only Maestro UART modules', () => {
    const notMaestro = maestroModule('Kangaroo', [999], { moduleSubType: 102 });

    expect(findInvalidReleaseMs(collection({ domeModule: { uartModules: [notMaestro] } }))).toEqual(
      [],
    );
  });

  // String() throws on this JSON-parsable value; a refusal must stay a 400.
  it('describes a value whose string conversion throws', () => {
    expect(findInvalidReleaseMs(domeWith({ toString: 0, valueOf: 0 }))).toEqual([
      'dome, module "Dome Maestro", board 0, channel 0: releaseMs {"toString":0,"valueOf":0} is not a whole number from 1000 to 120000',
    ]);
  });

  // A malformed body still reaches the repository and behaves there as it did
  // before the check; the validator only has to not throw on it.
  it.each([
    ['an empty body', {}],
    ['a location without uartModules', { domeModule: {} }],
    ['uartModules that is not an array', { domeModule: { uartModules: 'x' } }],
    ['a null module', { domeModule: { uartModules: [null] } }],
    [
      'a Maestro module without a subModule',
      { domeModule: { uartModules: [{ moduleSubType: 104, subModule: null }] } },
    ],
    [
      'boards that is not an array',
      { domeModule: { uartModules: [{ moduleSubType: 104, subModule: { boards: 1 } }] } },
    ],
    [
      'a null board and a null channel',
      {
        domeModule: {
          uartModules: [
            { moduleSubType: 104, subModule: { boards: [null, { channels: [null] }] } },
          ],
        },
      },
    ],
  ])('does not throw on %s', (_label, body) => {
    expect(findInvalidReleaseMs(collection(body))).toEqual([]);
  });
});
