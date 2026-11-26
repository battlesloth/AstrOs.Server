import { describe, it, expect } from 'vitest';
import { findInvalidReleaseMs, RELEASE_MS_DEFAULT } from './release_ms.js';

const ABSENT = Symbol('absent');

// Plain objects, as `PUT /api/locations/` receives them from JSON. 104 is
// ModuleSubType.maestro and 102 ModuleSubType.kangaroo, written as literals so
// a renumbered enum can't move both sides of the test together.
// Board ids start at 2 and channel numbers at 4, so a problem built from array
// positions instead of `boardId` and `channelNumber` can't match.
function board(releaseMs: unknown[], boardId = 2) {
  return {
    id: `board-${boardId}`,
    boardId,
    name: `Board ${boardId}`,
    channels: releaseMs.map((value, i) => ({
      id: `b${boardId}-ch${i}`,
      channelNumber: i + 4,
      ...(value === ABSENT ? {} : { releaseMs: value }),
    })),
  };
}

function maestroModule(name: string, releaseMs: unknown[], extra: Record<string, unknown> = {}) {
  return {
    id: `${name}-id`,
    name,
    moduleSubType: 104,
    subModule: { boards: [board(releaseMs)] },
    ...extra,
  };
}

const problem = (where: string, value: string) =>
  `${where}: releaseMs ${value} is not a whole number from 1000 to 120000`;

// The keys stay checked, so a typo can't make a test pass by being ignored.
function collection(parts: Partial<Record<'domeModule' | 'coreModule' | 'bodyModule', unknown>>) {
  return parts;
}

function domeWith(...releaseMs: unknown[]) {
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
      problem('dome, module "Dome Maestro", board 2, channel 5', shown),
    ]);
  });

  it.each([1000, 5000, 120000])('accepts %s', (value) => {
    expect(findInvalidReleaseMs(domeWith(value))).toEqual([]);
  });

  // The repository stores the default for every channel saved without the
  // field; a default outside the range would make each later save a 400.
  it('accepts RELEASE_MS_DEFAULT', () => {
    expect(findInvalidReleaseMs(domeWith(RELEASE_MS_DEFAULT))).toEqual([]);
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
      problem('dome, module "Dome Maestro", board 2, channel 4', '1'),
      problem('dome, module "Dome Maestro", board 2, channel 6', '2'),
      problem('core, module "Core Maestro", board 2, channel 6', '"x"'),
      problem('body, module "Body Maestro", board 2, channel 4', '999'),
    ]);
  });

  // The Vue store sends a location it hasn't loaded as null, and other
  // clients may leave a key out; neither may end the walk.
  it.each([
    ['null', { domeModule: null, coreModule: null }],
    ['missing', {}],
  ])('checks body when dome and core are %s', (_label, before) => {
    expect(
      findInvalidReleaseMs(
        collection({
          ...before,
          bodyModule: { uartModules: [maestroModule('Body Maestro', [999])] },
        }),
      ),
    ).toEqual([problem('body, module "Body Maestro", board 2, channel 4', '999')]);
  });

  // A droid with a Kangaroo drive and a Maestro is a real setup.
  it('checks a Maestro module that follows another UART module', () => {
    const kangaroo = maestroModule('Kangaroo', [5000], { moduleSubType: 102 });

    expect(
      findInvalidReleaseMs(
        collection({
          domeModule: { uartModules: [kangaroo, maestroModule('Dome Maestro', [999])] },
        }),
      ),
    ).toEqual([problem('dome, module "Dome Maestro", board 2, channel 4', '999')]);
  });

  it('checks every Maestro module in a location', () => {
    expect(
      findInvalidReleaseMs(
        collection({
          domeModule: {
            uartModules: [maestroModule('First', [5000]), maestroModule('Second', [999])],
          },
        }),
      ),
    ).toEqual([problem('dome, module "Second", board 2, channel 4', '999')]);
  });

  it('checks a Maestro module that follows one without boards', () => {
    const noBoards = { ...maestroModule('Empty', []), subModule: null };

    expect(
      findInvalidReleaseMs(
        collection({
          domeModule: { uartModules: [noBoards, maestroModule('Dome Maestro', [999])] },
        }),
      ),
    ).toEqual([problem('dome, module "Dome Maestro", board 2, channel 4', '999')]);
  });

  it('checks the boards after one without channels', () => {
    const mod = maestroModule('Dome Maestro', [5000]);
    mod.subModule.boards.unshift({} as ReturnType<typeof board>);
    mod.subModule.boards.push(board([999], 3));

    expect(findInvalidReleaseMs(collection({ domeModule: { uartModules: [mod] } }))).toEqual([
      problem('dome, module "Dome Maestro", board 3, channel 4', '999'),
    ]);
  });

  it('checks every board of a module', () => {
    const mod = maestroModule('Dome Maestro', [5000]);
    mod.subModule.boards.push(board([5000, 999], 3));

    expect(findInvalidReleaseMs(collection({ domeModule: { uartModules: [mod] } }))).toEqual([
      problem('dome, module "Dome Maestro", board 3, channel 5', '999'),
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
      problem('dome, module "Dome Maestro", board 2, channel 4', '{"toString":0,"valueOf":0}'),
    ]);
  });

  // A cycle makes JSON.stringify throw on every Node version; the refusal
  // must stay a 400, not a 500.
  it('describes a value JSON.stringify cannot print', () => {
    const cyclic: unknown[] = [];
    cyclic.push(cyclic);

    expect(findInvalidReleaseMs(domeWith(cyclic))).toEqual([
      problem('dome, module "Dome Maestro", board 2, channel 4', '(unprintable object)'),
    ]);
  });

  // Deep nesting that fits inside express.json's 100 kB limit overflows the
  // stack in JSON.stringify on today's Node; whatever it prints, the walk must
  // not throw.
  it('does not throw on a deeply nested value', () => {
    const deep = JSON.parse('['.repeat(20000) + ']'.repeat(20000));

    expect(findInvalidReleaseMs(domeWith(deep))).toHaveLength(1);
  });

  // Characterization: `${undefined}` prints "undefined" with or without
  // formatJsonValue's `?? 'undefined'`, which is there for its `string` type.
  it('names a module or channel that is missing its name or number', () => {
    const mod = maestroModule('x', [999]);
    delete (mod as { name?: string }).name;
    delete (mod.subModule.boards[0].channels[0] as { channelNumber?: number }).channelNumber;

    expect(findInvalidReleaseMs(collection({ domeModule: { uartModules: [mod] } }))).toEqual([
      problem('dome, module undefined, board 2, channel undefined', '999'),
    ]);
  });

  // A malformed body is left for the repository to handle (or fail on); the
  // validator only has to not throw on it.
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
      'a board without channels',
      { domeModule: { uartModules: [{ moduleSubType: 104, subModule: { boards: [{}] } }] } },
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
