import { describe, expect, it } from 'vitest';
import { buildBenchConfigSync, getServoConfig, BENCH } from '../demo-location.js';
import {
  TILT_DOWN_SUBTLE,
  bothLookUp,
  bothNodSubtle,
  bothPanLeft,
  buildScript,
  hold,
  meetEyes,
  pose,
  settleHome,
  tiltDownPos,
  withLedFlash,
  withLedSolid,
  type Beat,
} from './_heads-primitives.js';

describe('tiltDownPos', () => {
  it('returns home + 30% of home→max delta', () => {
    const ch2 = getServoConfig(2);
    const expected = Math.round(ch2.homePos + (ch2.maxPos - ch2.homePos) * TILT_DOWN_SUBTLE);
    expect(tiltDownPos(ch2)).toBe(expected);
  });
});

describe('pose', () => {
  it('emits one servo pulse per specified channel + closing buffer', () => {
    const beat = pose(1000, { rPan: 1500, lTilt: 2000 });
    // Two pulses (rPan, lTilt) + buffer(1000)
    expect(beat.master).toHaveLength(3);
    expect(beat.master[0]).toMatch(/^1\|0\|0\|1\|1500\|/);
    expect(beat.master[1]).toMatch(/^1\|0\|0\|3\|2000\|/);
    expect(beat.master[2]).toBe('0|1000|0');
    expect(beat.padawan).toEqual(['0|1000|0']);
    expect(beat.durMs).toBe(1000);
  });

  it('emits only the closing buffer when no channels specified', () => {
    const beat = pose(500, {});
    expect(beat.master).toEqual(['0|500|0']);
    expect(beat.padawan).toEqual(['0|500|0']);
  });
});

describe('named primitives', () => {
  it('bothPanLeft puts R-pan and L-pan at minPos', () => {
    const beat = bothPanLeft(800);
    const r = getServoConfig(1);
    const l = getServoConfig(4);
    expect(beat.master[0]).toBe(`1|0|0|1|${r.minPos}|0|0`);
    expect(beat.master[1]).toBe(`1|0|0|4|${l.minPos}|0|0`);
  });

  it('meetEyes puts R-pan at minPos AND L-pan at maxPos (cross-direction)', () => {
    const beat = meetEyes(800);
    const r = getServoConfig(1);
    const l = getServoConfig(4);
    expect(beat.master[0]).toBe(`1|0|0|1|${r.minPos}|0|0`);
    expect(beat.master[1]).toBe(`1|0|0|4|${l.maxPos}|0|0`);
  });

  it('bothLookUp puts both tilts at minPos (the dramatic up direction)', () => {
    const beat = bothLookUp(600);
    const r = getServoConfig(2);
    const l = getServoConfig(3);
    // pose() ordering: rPan, lPan, rTilt, lTilt — only the tilt entries are emitted
    expect(beat.master[0]).toBe(`1|0|0|2|${r.minPos}|0|0`);
    expect(beat.master[1]).toBe(`1|0|0|3|${l.minPos}|0|0`);
  });

  it('settleHome touches all four channels', () => {
    const beat = settleHome(500);
    // 4 pulses + 1 buffer
    expect(beat.master).toHaveLength(5);
  });

  it('hold emits only buffers', () => {
    const beat = hold(300);
    expect(beat.master).toEqual(['0|300|0']);
    expect(beat.padawan).toEqual(['0|300|0']);
  });
});

describe('multi-phase primitives', () => {
  it('bothNodSubtle(1200, 2) emits 8 pulses (down/up × 2 channels × 2 nods)', () => {
    const beat = bothNodSubtle(1200, 2);
    const pulses = beat.master.filter((e) => e.startsWith('1|'));
    expect(pulses).toHaveLength(8);
  });

  it('bothNodSubtle: master timeline sums to durMs even when not evenly divisible', () => {
    const beat = bothNodSubtle(1001, 2); // 1001 / 4 = 250.25 → phaseMs=250, trailingPad=1
    let total = 0;
    for (const ev of beat.master) {
      const fields = ev.split('|');
      total += Number.parseInt(fields[1] ?? '0', 10);
    }
    expect(total).toBe(1001);
  });
});

describe('LED accents', () => {
  it('withLedFlash schedules toggles + padding buffers', () => {
    const beat = withLedFlash(pose(1000, {}), [{ atMs: 200, durMs: 100 }]);
    // padawan: buffer(200) + gpio_toggle(100ms ON, 0ms OFF) + buffer(700)
    expect(beat.padawan).toHaveLength(3);
    expect(beat.padawan[0]).toBe('0|200|0');
    expect(beat.padawan[1]).toBe(
      `5|100|${BENCH.padawanGpioRelayChannel}|1;5|0|${BENCH.padawanGpioRelayChannel}|0`,
    );
    expect(beat.padawan[2]).toBe('0|700|0');
  });

  it('withLedSolid is sugar for a single-segment withLedFlash', () => {
    const a = withLedSolid(pose(1000, {}), 100, 500);
    const b = withLedFlash(pose(1000, {}), [{ atMs: 100, durMs: 500 }]);
    expect(a.padawan).toEqual(b.padawan);
  });

  it('withLedFlash throws when a flash exceeds beat duration', () => {
    expect(() => withLedFlash(pose(500, {}), [{ atMs: 400, durMs: 200 }])).toThrow(
      /exceeds beat duration/,
    );
  });

  it('withLedFlash throws when flashes overlap', () => {
    expect(() =>
      withLedFlash(pose(1000, {}), [
        { atMs: 100, durMs: 300 },
        { atMs: 200, durMs: 100 },
      ]),
    ).toThrow(/overlaps/);
  });
});

describe('buildScript', () => {
  const sync = buildBenchConfigSync({ padawanAddress: 'aa:bb:cc:dd:ee:ff' });

  it('returns durationMs equal to sum of beat durations', () => {
    const beats: Beat[] = [hold(100), hold(200), hold(300)];
    const built = buildScript(sync, beats);
    expect(built.durationMs).toBe(600);
  });

  it('returns the supplied scriptId', () => {
    const built = buildScript(sync, [hold(100)], 'fixed-id');
    expect(built.scriptId).toBe('fixed-id');
    expect(built.upload.scriptId).toBe('fixed-id');
    expect(built.run.scriptId).toBe('fixed-id');
  });

  it('generates a uuid when no scriptId is provided', () => {
    const a = buildScript(sync, [hold(100)]);
    const b = buildScript(sync, [hold(100)]);
    expect(a.scriptId).not.toBe(b.scriptId);
    expect(a.scriptId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('throws when a beat has master timeline shorter than declared', () => {
    const malformed: Beat = { master: ['0|100|0'], padawan: ['0|200|0'], durMs: 200 };
    expect(() => buildScript(sync, [malformed])).toThrow(
      /master events sum to 100ms, expected 200/,
    );
  });

  it('throws when a beat has padawan timeline shorter than declared', () => {
    const malformed: Beat = { master: ['0|200|0'], padawan: ['0|100|0'], durMs: 200 };
    expect(() => buildScript(sync, [malformed])).toThrow(
      /padawan events sum to 100ms, expected 200/,
    );
  });
});
