import { describe, it, expect } from 'vitest';
import {
  findInvalidReleaseMs,
  releaseMsProblem,
  ReleaseMsProblem,
  RELEASE_MS_DEFAULT,
} from './release_ms.js';

const ABSENT = Symbol('absent');

// Plain objects, as `PUT /api/locations/` receives them from JSON. 104 is
// ModuleSubType.maestro and 102 ModuleSubType.kangaroo, written as literals so
// a renumbered enum can't move both sides of the test together.
// Board ids start at 2 and channel numbers at 4, so a position taken from
// `boardId` or `channelNumber` instead of the array index can't match.
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

// The keys stay checked, so a typo can't make a test pass by being ignored.
function collection(parts: Partial<Record<'domeModule' | 'coreModule' | 'bodyModule', unknown>>) {
  return parts;
}

function domeWith(...releaseMs: unknown[]) {
  return collection({ domeModule: { uartModules: [maestroModule('Dome Maestro', releaseMs)] } });
}

const at = (
  location: string,
  moduleIndex: number,
  boardIndex: number,
  channelIndex: number,
  code: ReleaseMsProblem,
) => ({ code, location, moduleIndex, boardIndex, channelIndex });

const cyclic: unknown[] = [];
cyclic.push(cyclic);

describe('releaseMsProblem', () => {
  it.each([
    ['999', 'RELEASE_MS_OUT_OF_RANGE', 999],
    ['120001', 'RELEASE_MS_OUT_OF_RANGE', 120001],
    ['0', 'RELEASE_MS_OUT_OF_RANGE', 0],
    ['-5000', 'RELEASE_MS_OUT_OF_RANGE', -5000],
    ['1500.5', 'RELEASE_MS_NOT_INTEGER', 1500.5],
    ['NaN', 'RELEASE_MS_NOT_INTEGER', NaN],
    ['Infinity', 'RELEASE_MS_NOT_INTEGER', Infinity],
    ['the string "5000"', 'RELEASE_MS_NOT_INTEGER', '5000'],
    ['null', 'RELEASE_MS_NOT_INTEGER', null],
    ['true', 'RELEASE_MS_NOT_INTEGER', true],
    ['undefined', 'RELEASE_MS_NOT_INTEGER', undefined],
  ])('classifies %s as %s', (_label, code, value) => {
    expect(releaseMsProblem(value)).toBe(code);
  });

  // Values whose String() or JSON.stringify would throw: the classification
  // reads neither, so a refusal stays a 400.
  it.each([
    ['{"toString":0,"valueOf":0}', { toString: 0, valueOf: 0 }],
    ['a cycle', cyclic],
    ['deep nesting', JSON.parse('['.repeat(20000) + ']'.repeat(20000))],
  ])('classifies %s as not an integer, without throwing', (_label, value) => {
    expect(releaseMsProblem(value)).toBe(ReleaseMsProblem.NotInteger);
  });

  it.each([
    ['1000', 1000],
    ['5000', 5000],
    ['120000', 120000],
    ['RELEASE_MS_DEFAULT', RELEASE_MS_DEFAULT],
  ])('accepts %s', (_label, value) => {
    expect(releaseMsProblem(value)).toBeNull();
  });
});

describe('findInvalidReleaseMs', () => {
  it('reports a bad channel by its code and position', () => {
    expect(findInvalidReleaseMs(domeWith(5000, 999, '5000'))).toEqual([
      at('dome', 0, 0, 1, ReleaseMsProblem.OutOfRange),
      at('dome', 0, 0, 2, ReleaseMsProblem.NotInteger),
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
      at('dome', 0, 0, 0, ReleaseMsProblem.OutOfRange),
      at('dome', 0, 0, 2, ReleaseMsProblem.OutOfRange),
      at('core', 0, 0, 2, ReleaseMsProblem.NotInteger),
      at('body', 0, 0, 0, ReleaseMsProblem.OutOfRange),
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
    ).toEqual([at('body', 0, 0, 0, ReleaseMsProblem.OutOfRange)]);
  });

  // A droid with a Kangaroo drive and a Maestro is a real setup. The module's
  // position counts every UART module, so Vue can index what it sent.
  it('checks a Maestro module that follows another UART module, at its own position', () => {
    const kangaroo = maestroModule('Kangaroo', [5000], { moduleSubType: 102 });

    expect(
      findInvalidReleaseMs(
        collection({
          domeModule: { uartModules: [kangaroo, maestroModule('Dome Maestro', [999])] },
        }),
      ),
    ).toEqual([at('dome', 1, 0, 0, ReleaseMsProblem.OutOfRange)]);
  });

  // A null or non-object entry keeps its place, so a position counts every
  // entry the client sent, at each of the three levels.
  it('counts a null entry before a bad one, at each level', () => {
    const nullFirst = maestroModule('Dome Maestro', [5000]);
    nullFirst.subModule.boards.unshift(null as unknown as ReturnType<typeof board>);
    nullFirst.subModule.boards[1].channels.unshift(null as never, 7 as never);
    nullFirst.subModule.boards[1].channels.push({ id: 'bad', channelNumber: 9, releaseMs: 999 });

    expect(
      findInvalidReleaseMs(collection({ domeModule: { uartModules: [null, 'x', nullFirst] } })),
    ).toEqual([at('dome', 2, 1, 3, ReleaseMsProblem.OutOfRange)]);
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
    ).toEqual([at('dome', 1, 0, 0, ReleaseMsProblem.OutOfRange)]);
  });

  it('checks a Maestro module that follows one without boards', () => {
    const noBoards = { ...maestroModule('Empty', []), subModule: null };

    expect(
      findInvalidReleaseMs(
        collection({
          domeModule: { uartModules: [noBoards, maestroModule('Dome Maestro', [999])] },
        }),
      ),
    ).toEqual([at('dome', 1, 0, 0, ReleaseMsProblem.OutOfRange)]);
  });

  it('checks the boards after one without channels', () => {
    const mod = maestroModule('Dome Maestro', [5000]);
    mod.subModule.boards.unshift({} as ReturnType<typeof board>);
    mod.subModule.boards.push(board([999], 3));

    expect(findInvalidReleaseMs(collection({ domeModule: { uartModules: [mod] } }))).toEqual([
      at('dome', 0, 2, 0, ReleaseMsProblem.OutOfRange),
    ]);
  });

  it('checks every board of a module', () => {
    const mod = maestroModule('Dome Maestro', [5000]);
    mod.subModule.boards.push(board([5000, 999], 3));

    expect(findInvalidReleaseMs(collection({ domeModule: { uartModules: [mod] } }))).toEqual([
      at('dome', 0, 1, 1, ReleaseMsProblem.OutOfRange),
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

  // Nothing from the request comes back: a long name repeated across many
  // channels made an 11 MB reply when problems quoted it (PR #141 review).
  it('echoes nothing from the request, so the reply has a fixed size per problem', () => {
    const problems = findInvalidReleaseMs(
      collection({
        domeModule: {
          uartModules: [maestroModule('x'.repeat(20000), Array(576).fill('y'.repeat(100)))],
        },
      }),
    );

    expect(problems).toHaveLength(576);
    expect(problems[575]).toEqual(at('dome', 0, 0, 575, ReleaseMsProblem.NotInteger));
    const text = JSON.stringify(problems);
    expect(text).not.toMatch(/xx|yy/);
    // The size depends only on the indexes, not on what the request held.
    const longest = JSON.stringify(problems[575]).length;
    expect(Math.max(...problems.map((p) => JSON.stringify(p).length))).toBe(longest);
    expect(longest).toBeLessThan(120);
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
