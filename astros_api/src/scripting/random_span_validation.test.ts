import { describe, expect, it } from 'vitest';
import { randomSpanProblems } from './random_span_validation.js';
import { RandomGpioEvent, RandomMaestroEvent } from '../models/index.js';

// Each case changes one field of a valid baseline, so a rejected case must
// report exactly the one broken rule.
const SPAN_MS = 14000;

function servo(overrides: Partial<RandomMaestroEvent> = {}): RandomMaestroEvent {
  return {
    channel: 2,
    isServo: true,
    minGapMs: 400,
    maxGapMs: 2000,
    minPos: 20,
    maxPos: 100,
    minMove: 15,
    maxMove: 60,
    speed: 0,
    acceleration: 0,
    ...overrides,
  };
}

function gpio(overrides: Partial<RandomGpioEvent> = {}): RandomGpioEvent {
  return { minGapMs: 50, maxGapMs: 400, ...overrides };
}

// Each message starts with the field it is about.
function oneProblemNaming(field: string) {
  return [expect.stringMatching(new RegExp(`^${field}`))];
}

describe('randomSpanProblems', () => {
  it('the baselines are valid', () => {
    expect(randomSpanProblems(SPAN_MS, servo(), true)).toEqual([]);
    expect(randomSpanProblems(SPAN_MS, gpio(), false)).toEqual([]);
  });

  it('minMove at exactly half the range is valid; one more is rejected', () => {
    expect(randomSpanProblems(SPAN_MS, servo({ minMove: 40 }), true)).toEqual([]);
    expect(randomSpanProblems(SPAN_MS, servo({ minMove: 41 }), true)).toEqual(
      oneProblemNaming('minMove'),
    );
  });

  it('minMove 1 is valid; 0 is rejected', () => {
    expect(randomSpanProblems(SPAN_MS, servo({ minMove: 1 }), true)).toEqual([]);
    expect(randomSpanProblems(SPAN_MS, servo({ minMove: 0 }), true)).toEqual(
      oneProblemNaming('minMove'),
    );
  });

  it('maxMove equal to the range is valid; one more is rejected', () => {
    expect(randomSpanProblems(SPAN_MS, servo({ maxMove: 80 }), true)).toEqual([]);
    expect(randomSpanProblems(SPAN_MS, servo({ maxMove: 81 }), true)).toEqual(
      oneProblemNaming('maxMove'),
    );
  });

  it('maxMove below minMove is rejected; null maxMove is valid', () => {
    expect(randomSpanProblems(SPAN_MS, servo({ maxMove: 14 }), true)).toEqual(
      oneProblemNaming('maxMove'),
    );
    expect(randomSpanProblems(SPAN_MS, servo({ maxMove: null }), true)).toEqual([]);
  });

  it('servo minGapMs 100 valid / 99 rejected', () => {
    expect(randomSpanProblems(SPAN_MS, servo({ minGapMs: 100 }), true)).toEqual([]);
    expect(randomSpanProblems(SPAN_MS, servo({ minGapMs: 99 }), true)).toEqual(
      oneProblemNaming('minGapMs'),
    );
  });

  it('gpio minGapMs 20 valid / 19 rejected', () => {
    expect(randomSpanProblems(SPAN_MS, gpio({ minGapMs: 20 }), false)).toEqual([]);
    expect(randomSpanProblems(SPAN_MS, gpio({ minGapMs: 19 }), false)).toEqual(
      oneProblemNaming('minGapMs'),
    );
  });

  it('spanMs equal to minGapMs is valid; one less is rejected', () => {
    expect(randomSpanProblems(50, gpio(), false)).toEqual([]);
    expect(randomSpanProblems(49, gpio(), false)).toEqual(oneProblemNaming('spanMs'));
  });

  it('maxGapMs equal to minGapMs is valid; below it is rejected', () => {
    expect(randomSpanProblems(SPAN_MS, gpio({ maxGapMs: 50 }), false)).toEqual([]);
    expect(randomSpanProblems(SPAN_MS, gpio({ maxGapMs: 49 }), false)).toEqual(
      oneProblemNaming('maxGapMs'),
    );
  });

  it('minPos equal to maxPos is rejected', () => {
    const problems = randomSpanProblems(
      SPAN_MS,
      servo({ minPos: 50, maxPos: 50, minMove: 0, maxMove: null }),
      true,
    );
    expect(problems).toContainEqual(expect.stringMatching(/minPos.*maxPos/));
  });

  it('minPos 0 is valid; -1 is rejected', () => {
    expect(randomSpanProblems(SPAN_MS, servo({ minPos: 0, maxPos: 80 }), true)).toEqual([]);
    expect(randomSpanProblems(SPAN_MS, servo({ minPos: -1, maxPos: 79 }), true)).toEqual(
      oneProblemNaming('minPos'),
    );
  });

  it('maxPos 100 is valid; 101 is rejected', () => {
    expect(randomSpanProblems(SPAN_MS, servo({ minPos: 20, maxPos: 100 }), true)).toEqual([]);
    expect(randomSpanProblems(SPAN_MS, servo({ minPos: 21, maxPos: 101 }), true)).toEqual(
      oneProblemNaming('minPos 21 and maxPos 101'),
    );
  });

  it('speed 256 is rejected', () => {
    expect(randomSpanProblems(SPAN_MS, servo({ speed: 255 }), true)).toEqual([]);
    expect(randomSpanProblems(SPAN_MS, servo({ speed: 256 }), true)).toEqual(
      oneProblemNaming('speed'),
    );
    expect(randomSpanProblems(SPAN_MS, servo({ speed: -1 }), true)).toEqual(
      oneProblemNaming('speed'),
    );
  });

  it('acceleration 256 is rejected', () => {
    expect(randomSpanProblems(SPAN_MS, servo({ acceleration: 255 }), true)).toEqual([]);
    expect(randomSpanProblems(SPAN_MS, servo({ acceleration: 256 }), true)).toEqual(
      oneProblemNaming('acceleration'),
    );
  });

  it('a non-integer minPos is rejected', () => {
    expect(randomSpanProblems(SPAN_MS, servo({ minPos: 20.5 }), true)).toContainEqual(
      expect.stringContaining('minPos 20.5'),
    );
  });

  it('a non-integer maxMove is rejected', () => {
    expect(randomSpanProblems(SPAN_MS, servo({ maxMove: 30.5 }), true)).toEqual(
      oneProblemNaming('maxMove 30.5'),
    );
  });

  it('a negative maestro channel is rejected', () => {
    expect(randomSpanProblems(SPAN_MS, servo({ channel: 0 }), true)).toEqual([]);
    expect(randomSpanProblems(SPAN_MS, servo({ channel: -1 }), true)).toEqual(
      oneProblemNaming('channel'),
    );
    expect(randomSpanProblems(SPAN_MS, servo({ channel: -1, isServo: false }), false)).toEqual(
      oneProblemNaming('channel'),
    );
  });

  it('a non-integer gap is rejected for gpio spans too', () => {
    expect(randomSpanProblems(SPAN_MS, gpio({ minGapMs: 50.5 }), false)).toEqual(
      oneProblemNaming('minGapMs 50.5'),
    );
    expect(randomSpanProblems(SPAN_MS, gpio({ maxGapMs: 400.5 }), false)).toEqual(
      oneProblemNaming('maxGapMs 400.5'),
    );
    expect(randomSpanProblems(14000.5, gpio(), false)).toEqual(oneProblemNaming('spanMs 14000.5'));
  });

  it('isServo with a payload lacking the maestro fields fails closed', () => {
    const problems = randomSpanProblems(SPAN_MS, gpio(), true);
    expect(problems).toContainEqual(expect.stringMatching(/^channel undefined/));
    expect(problems).toContainEqual(expect.stringMatching(/^minPos undefined/));
  });

  it('digital maestro (isServo false) ignores the servo fields', () => {
    // The six servo fields are sent as 0 for a digital channel, so the
    // payload's values are never checked; the gap floor is 20, not 100.
    const digital = servo({
      isServo: false,
      minGapMs: 20,
      minPos: 500,
      maxPos: 2.5,
      minMove: -3,
      maxMove: 999,
      speed: 300,
      acceleration: 0.5,
    });
    expect(randomSpanProblems(SPAN_MS, digital, false)).toEqual([]);
  });
});
