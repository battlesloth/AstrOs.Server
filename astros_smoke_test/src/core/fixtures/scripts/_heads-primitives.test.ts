import { describe, expect, it } from 'vitest';
import { buildBenchConfigSync, getServoConfig, BENCH } from '../demo-location.js';
import {
  POS_HOME,
  POS_MAX,
  POS_MIN,
  TILT_DOWN_SUBTLE,
  bothLookUp,
  bothNodSubtle,
  bothPanLeft,
  buildScript,
  hold,
  meetEyes,
  pose,
  settleHome,
  tiltDownPercent,
  withLedFlash,
  withLedSolid,
  type Beat,
} from './_heads-primitives.js';

describe('position constants', () => {
  it('match the firmware percent convention (0=min, 100=max, -1=home)', () => {
    expect(POS_MIN).toBe(0);
    expect(POS_MAX).toBe(100);
    expect(POS_HOME).toBe(-1);
  });
});

describe('tiltDownPercent', () => {
  it('returns home% + 30% of (100% - home%) for the given servo', () => {
    const ch2 = getServoConfig(2);
    const homePct = ((ch2.homePos - ch2.minPos) / (ch2.maxPos - ch2.minPos)) * 100;
    const expected = Math.round(homePct + (100 - homePct) * TILT_DOWN_SUBTLE);
    expect(tiltDownPercent(ch2)).toBe(expected);
    // Sanity: should land between home% and 100%.
    expect(tiltDownPercent(ch2)).toBeGreaterThan(homePct);
    expect(tiltDownPercent(ch2)).toBeLessThan(100);
  });
});

describe('pose', () => {
  it('emits one servo pulse per specified channel + closing buffer', () => {
    const beat = pose(1000, { rPan: 50, lTilt: 75 });
    // Two pulses (rPan, lTilt) + buffer(1000)
    expect(beat.master).toHaveLength(3);
    expect(beat.master[0]).toBe('1|0|0|1|50|0|0');
    expect(beat.master[1]).toBe('1|0|0|3|75|0|0');
    expect(beat.master[2]).toBe('0|1000|0');
    expect(beat.padawan).toEqual(['0|1000|0']);
    expect(beat.durMs).toBe(1000);
  });

  it('emits only the closing buffer when no channels specified', () => {
    const beat = pose(500, {});
    expect(beat.master).toEqual(['0|500|0']);
    expect(beat.padawan).toEqual(['0|500|0']);
  });

  it('accepts POS_HOME (-1) for home position', () => {
    const beat = pose(200, { rPan: POS_HOME });
    expect(beat.master[0]).toBe('1|0|0|1|-1|0|0');
  });
});

describe('named primitives', () => {
  it('bothPanLeft puts R-pan and L-pan at percent 0 (POS_MIN)', () => {
    const beat = bothPanLeft(800);
    expect(beat.master[0]).toBe('1|0|0|1|0|0|0');
    expect(beat.master[1]).toBe('1|0|0|4|0|0|0');
  });

  it('meetEyes puts R-pan at POS_MIN AND L-pan at POS_MAX (cross-direction)', () => {
    const beat = meetEyes(800);
    expect(beat.master[0]).toBe('1|0|0|1|0|0|0');
    expect(beat.master[1]).toBe('1|0|0|4|100|0|0');
  });

  it('bothLookUp puts both tilts at POS_MIN (the dramatic up direction)', () => {
    const beat = bothLookUp(600);
    expect(beat.master[0]).toBe('1|0|0|2|0|0|0');
    expect(beat.master[1]).toBe('1|0|0|3|0|0|0');
  });

  it('settleHome touches all four channels at POS_HOME (-1)', () => {
    const beat = settleHome(500);
    // 4 pulses + 1 buffer
    expect(beat.master).toHaveLength(5);
    for (let i = 0; i < 4; i++) {
      expect(beat.master[i]).toMatch(/^1\|0\|0\|\d\|-1\|0\|0$/);
    }
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

  it('bothNodSubtle dips use tiltDownPercent and returns use POS_HOME', () => {
    const beat = bothNodSubtle(1200, 1);
    const ch2 = getServoConfig(2);
    const ch3 = getServoConfig(3);
    // First two pulses: tilts down to tiltDownPercent
    expect(beat.master[0]).toBe(`1|0|0|2|${tiltDownPercent(ch2)}|0|0`);
    expect(beat.master[1]).toBe(`1|0|0|3|${tiltDownPercent(ch3)}|0|0`);
    // After phase buffer, return-to-home pulses use POS_HOME
    expect(beat.master[3]).toBe('1|0|0|2|-1|0|0');
    expect(beat.master[4]).toBe('1|0|0|3|-1|0|0');
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

  it('throws when an event has a malformed duration field', () => {
    const malformed: Beat = {
      master: ['0|100abc|0'],
      padawan: ['0|100|0'],
      durMs: 100,
    };
    expect(() => buildScript(sync, [malformed])).toThrow(/malformed duration field "100abc"/);
  });

  it('stitches beat lists into the master/padawan timelines with closing buffer', () => {
    const built = buildScript(sync, [hold(100), hold(200)]);
    const expected = '0|100|0;0|200|0;0|0|0';
    const masterCfg = built.upload.configs.find((c) => c.address === '00:00:00:00:00:00');
    const padawanCfg = built.upload.configs.find((c) => c.address === 'aa:bb:cc:dd:ee:ff');
    expect(masterCfg?.script).toBe(expected);
    expect(padawanCfg?.script).toBe(expected);
  });
});
