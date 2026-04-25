# Heads Routines Implementation Plan (Phase B)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add four playful "robot heads" choreography routines plus a demo reel that plays them back-to-back like a Sequential Playlist, all driven through the firmware's DEPLOY_SCRIPT + RUN_SCRIPT pipeline.

**Architecture:** A `_heads-primitives.ts` library exports composable `Beat` building blocks (pose / named primitives / multi-phase / LED accents / `buildScript`). Each of the four routines is a fixture file (a `*Beats()` function returning `Beat[]`) plus a scenario file (`buildScript` + `runScript` + `waitStep`). The reel is a single scenario that deploys all four upfront then sequences `runScript` calls — exactly mirroring `astros_api`'s `AnimationQueue` Sequential `PlaylistType`.

**Tech Stack:** TypeScript (covered by the existing `tsc --noEmit` server pass), vitest for unit tests, the existing Phase 1 helpers (`makeServoPulse`, `makeGpioToggle`, `makeBuffer`, `joinEvents`, `buildScriptUpload`, `buildScriptRun`).

**Design reference:** `.docs/plans/20260425-0901-heads-routines-design.md`

**Bench geometry reference:** ch1 = right pan, ch4 = left pan (pan-min = both face left, pan-max = both face right); ch2 = right tilt, ch3 = left tilt (tilt-min = look up dramatically, tilt-max = look down — constrained by stand, only safe at ~30% of home→max).

---

## File Structure

**New files (8):**

| File | Responsibility |
|---|---|
| `astros_smoke_test/src/core/fixtures/scripts/_heads-primitives.ts` | `Beat` type; `pose()`, `settleHome()`, `bothPanLeft/Right/Forward()`, `bothLookUp/Level()`, `meetEyes()`, `lookOutward()`, `hold()`, `bothNodSubtle()`, `rightShakeNo()`, `leftNodYes()`, `withLedFlash()`, `withLedSolid()`, `tiltDownPos()`, `buildScript()`. Single source of truth for the choreography vocabulary. |
| `astros_smoke_test/src/core/fixtures/scripts/_heads-primitives.test.ts` | Vitest coverage for the primitives — channel emission, duration alignment, error throws. |
| `astros_smoke_test/src/core/fixtures/scripts/heads-curious-duet.ts` | `curiousDuetBeats(): Beat[]` — the synchronized "what's that?" routine. |
| `astros_smoke_test/src/core/fixtures/scripts/heads-disagreement.ts` | `disagreementBeats(): Beat[]` — yes/no shake + standoff + reluctant agreement. |
| `astros_smoke_test/src/core/fixtures/scripts/heads-hide-and-seek.ts` | `hideAndSeekBeats(): Beat[]` — R hides, L searches, "found you!" |
| `astros_smoke_test/src/core/fixtures/scripts/heads-sync-swim.ts` | `syncSwimBeats(): Beat[]` — pure choreography, every channel exercised. |
| `astros_smoke_test/src/core/scenarios/heads-curious-duet.ts` + `heads-disagreement.ts` + `heads-hide-and-seek.ts` + `heads-sync-swim.ts` + `heads-demo-reel.ts` | Five scenario factories. Single-routine scenarios deploy + run one script. The reel deploys 4 scripts + sequences runs. |
| `.docs/qa/heads-routines.md` | Manual bench QA checklist for the new routines + reel. |

**Modified files (2):**
- `astros_smoke_test/src/core/scenarios/index.ts` — register the five new scenarios.
- `astros_smoke_test/src/core/scenarios/scenarios.test.ts` — extend assertions for the new scenario ids and severity bucket.

---

## Task 1: Primitives library + tests

**Files:**
- Create: `astros_smoke_test/src/core/fixtures/scripts/_heads-primitives.ts`
- Create: `astros_smoke_test/src/core/fixtures/scripts/_heads-primitives.test.ts`

The whole library is one file (~180 lines). The test file (~150 lines) covers the contract every later task depends on.

- [ ] **Step 1: Create the primitives module**

Create `astros_smoke_test/src/core/fixtures/scripts/_heads-primitives.ts`:

```ts
import { v4 as uuidv4 } from 'uuid';
import type { ConfigSync } from '@api/models/config/config_sync.js';
import type { ScriptRun } from '@api/models/scripts/script_run.js';
import type { ScriptUpload } from '@api/models/scripts/script_upload.js';
import { BENCH, getServoConfig, type ServoConfig } from '../demo-location.js';
import {
  buildScriptRun,
  buildScriptUpload,
  joinEvents,
  makeBuffer,
  makeGpioToggle,
  makeServoPulse,
} from '../helpers.js';

const RIGHT_PAN = 1;
const RIGHT_TILT = 2;
const LEFT_TILT = 3;
const LEFT_PAN = 4;

const rPan: ServoConfig = getServoConfig(RIGHT_PAN);
const rTilt: ServoConfig = getServoConfig(RIGHT_TILT);
const lTilt: ServoConfig = getServoConfig(LEFT_TILT);
const lPan: ServoConfig = getServoConfig(LEFT_PAN);

// Tilt-max is mechanically constrained by the servo stand. Never tilt fully
// to maxPos; use this fraction of the home→max delta for "subtle nod down".
export const TILT_DOWN_SUBTLE = 0.3;

export function tiltDownPos(servo: ServoConfig): number {
  return Math.round(servo.homePos + (servo.maxPos - servo.homePos) * TILT_DOWN_SUBTLE);
}

export interface Beat {
  master: string[];
  padawan: string[];
  durMs: number;
}

export interface PoseOpts {
  rPan?: number;
  lPan?: number;
  rTilt?: number;
  lTilt?: number;
}

// Layer 1: pose() — emits a servo pulse for any specified channel at t=0,
// then a closing buffer of durMs. Channels not specified retain prior position.
// Padawan stays idle for the full duration.
export function pose(durMs: number, opts: PoseOpts = {}): Beat {
  const master: string[] = [];
  if (opts.rPan !== undefined) {
    master.push(makeServoPulse({ channel: RIGHT_PAN, position: opts.rPan, timeTillMs: 0 }));
  }
  if (opts.lPan !== undefined) {
    master.push(makeServoPulse({ channel: LEFT_PAN, position: opts.lPan, timeTillMs: 0 }));
  }
  if (opts.rTilt !== undefined) {
    master.push(makeServoPulse({ channel: RIGHT_TILT, position: opts.rTilt, timeTillMs: 0 }));
  }
  if (opts.lTilt !== undefined) {
    master.push(makeServoPulse({ channel: LEFT_TILT, position: opts.lTilt, timeTillMs: 0 }));
  }
  master.push(makeBuffer(durMs));
  return { master, padawan: [makeBuffer(durMs)], durMs };
}

// Layer 2: named single-pose primitives.

export function settleHome(durMs: number): Beat {
  return pose(durMs, {
    rPan: rPan.homePos,
    lPan: lPan.homePos,
    rTilt: rTilt.homePos,
    lTilt: lTilt.homePos,
  });
}

export function bothPanLeft(durMs: number): Beat {
  return pose(durMs, { rPan: rPan.minPos, lPan: lPan.minPos });
}

export function bothPanRight(durMs: number): Beat {
  return pose(durMs, { rPan: rPan.maxPos, lPan: lPan.maxPos });
}

export function bothPanForward(durMs: number): Beat {
  return pose(durMs, { rPan: rPan.homePos, lPan: lPan.homePos });
}

export function bothLookUp(durMs: number): Beat {
  return pose(durMs, { rTilt: rTilt.minPos, lTilt: lTilt.minPos });
}

export function bothLookLevel(durMs: number): Beat {
  return pose(durMs, { rTilt: rTilt.homePos, lTilt: lTilt.homePos });
}

export function meetEyes(durMs: number): Beat {
  // R-pan to min (R faces left, toward L); L-pan to max (L faces right, toward R)
  return pose(durMs, { rPan: rPan.minPos, lPan: lPan.maxPos });
}

export function lookOutward(durMs: number): Beat {
  // R-pan to max (R faces right, away); L-pan to min (L faces left, away)
  return pose(durMs, { rPan: rPan.maxPos, lPan: lPan.minPos });
}

export function hold(durMs: number): Beat {
  return { master: [makeBuffer(durMs)], padawan: [makeBuffer(durMs)], durMs };
}

// Layer 3: multi-phase primitives.

// Both heads dip 30% toward max + return to home, repeated count times.
// Each dip = down phase + up phase; both sized as floor(durMs / (count * 2)).
// Any rounding remainder lands as a trailing buffer so master sums to durMs.
export function bothNodSubtle(durMs: number, count = 1): Beat {
  if (count < 1) throw new Error('bothNodSubtle: count must be >= 1');
  const phaseMs = Math.floor(durMs / (count * 2));
  const trailingPad = durMs - phaseMs * count * 2;

  const master: string[] = [];
  const downR = tiltDownPos(rTilt);
  const downL = tiltDownPos(lTilt);

  for (let i = 0; i < count; i++) {
    master.push(makeServoPulse({ channel: RIGHT_TILT, position: downR, timeTillMs: 0 }));
    master.push(makeServoPulse({ channel: LEFT_TILT, position: downL, timeTillMs: 0 }));
    master.push(makeBuffer(phaseMs));
    master.push(makeServoPulse({ channel: RIGHT_TILT, position: rTilt.homePos, timeTillMs: 0 }));
    master.push(makeServoPulse({ channel: LEFT_TILT, position: lTilt.homePos, timeTillMs: 0 }));
    master.push(makeBuffer(phaseMs));
  }
  if (trailingPad > 0) master.push(makeBuffer(trailingPad));

  return { master, padawan: [makeBuffer(durMs)], durMs };
}

// R-pan oscillates min/max (count swings) then settles back to home.
// Total duration distributed evenly across (count + 1) phases.
export function rightShakeNo(durMs: number, count = 4): Beat {
  if (count < 1) throw new Error('rightShakeNo: count must be >= 1');
  const phaseMs = Math.floor(durMs / (count + 1));
  const trailingPad = durMs - phaseMs * (count + 1);

  const master: string[] = [];
  for (let i = 0; i < count; i++) {
    const pos = i % 2 === 0 ? rPan.minPos : rPan.maxPos;
    master.push(makeServoPulse({ channel: RIGHT_PAN, position: pos, timeTillMs: 0 }));
    master.push(makeBuffer(phaseMs));
  }
  master.push(makeServoPulse({ channel: RIGHT_PAN, position: rPan.homePos, timeTillMs: 0 }));
  master.push(makeBuffer(phaseMs));
  if (trailingPad > 0) master.push(makeBuffer(trailingPad));

  return { master, padawan: [makeBuffer(durMs)], durMs };
}

// L-tilt subtle nod (dip 30% toward max + return to home), count times.
export function leftNodYes(durMs: number, count = 4): Beat {
  if (count < 1) throw new Error('leftNodYes: count must be >= 1');
  const phaseMs = Math.floor(durMs / (count * 2));
  const trailingPad = durMs - phaseMs * count * 2;

  const downL = tiltDownPos(lTilt);
  const master: string[] = [];

  for (let i = 0; i < count; i++) {
    master.push(makeServoPulse({ channel: LEFT_TILT, position: downL, timeTillMs: 0 }));
    master.push(makeBuffer(phaseMs));
    master.push(makeServoPulse({ channel: LEFT_TILT, position: lTilt.homePos, timeTillMs: 0 }));
    master.push(makeBuffer(phaseMs));
  }
  if (trailingPad > 0) master.push(makeBuffer(trailingPad));

  return { master, padawan: [makeBuffer(durMs)], durMs };
}

export interface LedFlash {
  atMs: number;
  durMs: number;
}

// Replace the padawan timeline with a sequence of GPIO toggles at the
// specified offsets within the beat's duration. Throws if offsets overlap
// or extend past beat.durMs.
export function withLedFlash(beat: Beat, schedule: LedFlash[]): Beat {
  const padawan: string[] = [];
  let cursor = 0;
  for (const f of schedule) {
    if (f.atMs < cursor) {
      throw new Error(
        `withLedFlash: flash at ${f.atMs}ms overlaps prior flash ending at ${cursor}ms`,
      );
    }
    if (f.atMs + f.durMs > beat.durMs) {
      throw new Error(
        `withLedFlash: flash at ${f.atMs}+${f.durMs}ms exceeds beat duration ${beat.durMs}ms`,
      );
    }
    if (f.atMs > cursor) padawan.push(makeBuffer(f.atMs - cursor));
    padawan.push(makeGpioToggle({ channel: BENCH.padawanGpioRelayChannel, durMs: f.durMs }));
    cursor = f.atMs + f.durMs;
  }
  if (cursor < beat.durMs) padawan.push(makeBuffer(beat.durMs - cursor));
  return { master: beat.master, padawan, durMs: beat.durMs };
}

// Single LED-on segment within a beat.
export function withLedSolid(beat: Beat, atMs: number, durMs: number): Beat {
  return withLedFlash(beat, [{ atMs, durMs }]);
}

// Sum the timeTillMs / wait field (field index 1) across all events.
// makeServoPulse: '1|t|maestroIdx|ch|pos|speed|accel'
// makeBuffer:     '0|t|0'
// makeGpioToggle: '5|t|ch|1;5|0|ch|0'  — two events joined by ';'
function sumEventDurations(events: string[]): number {
  let total = 0;
  for (const ev of events) {
    for (const piece of ev.split(';')) {
      if (!piece) continue;
      const fields = piece.split('|');
      const t = Number.parseInt(fields[1] ?? '0', 10);
      if (Number.isFinite(t)) total += t;
    }
  }
  return total;
}

export interface BuiltScript {
  upload: ScriptUpload;
  run: ScriptRun;
  scriptId: string;
  durationMs: number;
}

// Stitch a beat list into a deployable + runnable ScriptUpload/ScriptRun pair.
// Validates that each beat's master and padawan event durations match the
// declared durMs — catches authoring drift at construction time rather than
// letting timing skew show up on the bench.
export function buildScript(
  sync: ConfigSync,
  beats: Beat[],
  scriptId: string = uuidv4(),
): BuiltScript {
  let totalMs = 0;
  for (let i = 0; i < beats.length; i++) {
    const b = beats[i];
    const masterMs = sumEventDurations(b.master);
    const padawanMs = sumEventDurations(b.padawan);
    if (masterMs !== b.durMs) {
      throw new Error(
        `buildScript: beat ${i} master events sum to ${masterMs}ms, expected ${b.durMs}ms`,
      );
    }
    if (padawanMs !== b.durMs) {
      throw new Error(
        `buildScript: beat ${i} padawan events sum to ${padawanMs}ms, expected ${b.durMs}ms`,
      );
    }
    totalMs += b.durMs;
  }

  const masterTimeline = joinEvents(beats.flatMap((b) => b.master).concat([makeBuffer(0)]));
  const padawanTimeline = joinEvents(beats.flatMap((b) => b.padawan).concat([makeBuffer(0)]));

  return {
    upload: buildScriptUpload(sync, { master: masterTimeline, padawan: padawanTimeline }, scriptId),
    run: buildScriptRun(sync, scriptId),
    scriptId,
    durationMs: totalMs,
  };
}
```

- [ ] **Step 2: Create the primitives test file**

Create `astros_smoke_test/src/core/fixtures/scripts/_heads-primitives.test.ts`:

```ts
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
    expect(beat.padawan[1]).toBe(`5|100|${BENCH.padawanGpioRelayChannel}|1;5|0|${BENCH.padawanGpioRelayChannel}|0`);
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
    expect(() => buildScript(sync, [malformed])).toThrow(/master events sum to 100ms, expected 200/);
  });

  it('throws when a beat has padawan timeline shorter than declared', () => {
    const malformed: Beat = { master: ['0|200|0'], padawan: ['0|100|0'], durMs: 200 };
    expect(() => buildScript(sync, [malformed])).toThrow(/padawan events sum to 100ms, expected 200/);
  });
});
```

- [ ] **Step 3: Run the new test file**

Run: `cd astros_smoke_test && npm test -- --run src/core/fixtures/scripts/_heads-primitives.test.ts`

Expected: all primitives tests pass.

- [ ] **Step 4: Run lint, prettier, typecheck, full test suite**

Run:
```bash
cd astros_smoke_test
npm run lint:fix
npm run prettier:write
npm run typecheck
npm test -- --run
```

Expected: lint clean, prettier no changes (or only re-formatting trivial whitespace), typecheck clean, total tests = 53 (existing) + new primitives count, all green.

- [ ] **Step 5: Commit**

```bash
cd /home/jeff/Source/astros/AstrOs.Server
git add astros_smoke_test/src/core/fixtures/scripts/_heads-primitives.ts \
        astros_smoke_test/src/core/fixtures/scripts/_heads-primitives.test.ts
git commit -m "$(cat <<'EOF'
feat(smoke-test/heads): add choreography primitives library

_heads-primitives.ts exports composable Beat building blocks for the
upcoming heads routines. Three layers:

  - Layer 1 — pose(durMs, opts): foundation. Emits a servo pulse for
    any subset of the four bench head channels (rPan/lPan/rTilt/lTilt)
    plus a closing buffer.
  - Layer 2 — named primitives: settleHome, bothPanLeft/Right/Forward,
    bothLookUp/Level, meetEyes, lookOutward, hold.
  - Layer 3 — multi-phase: bothNodSubtle, rightShakeNo, leftNodYes,
    plus withLedFlash / withLedSolid for padawan LED accents.

buildScript(sync, beats[], scriptId?) stitches a beat list into a
{upload, run, scriptId, durationMs} bundle. Validates that each beat's
master and padawan event durations match the declared durMs — catches
authoring drift at construction time, not on the bench.

Refs: .docs/plans/20260425-0901-heads-routines-design.md
EOF
)"
```

---

## Task 2: heads-curious-duet routine

**Files:**
- Create: `astros_smoke_test/src/core/fixtures/scripts/heads-curious-duet.ts`
- Create: `astros_smoke_test/src/core/scenarios/heads-curious-duet.ts`
- Modify: `astros_smoke_test/src/core/scenarios/index.ts`
- Modify: `astros_smoke_test/src/core/scenarios/scenarios.test.ts`

The synchronized "what's that?" routine. ~13s total.

- [ ] **Step 1: Create the fixture (beats)**

Create `astros_smoke_test/src/core/fixtures/scripts/heads-curious-duet.ts`:

```ts
import { getServoConfig } from '../demo-location.js';
import {
  bothNodSubtle,
  bothPanForward,
  hold,
  meetEyes,
  pose,
  settleHome,
  tiltDownPos,
  withLedFlash,
  withLedSolid,
  type Beat,
} from './_heads-primitives.js';

const rPan = getServoConfig(1);
const lPan = getServoConfig(4);
const rTilt = getServoConfig(2);
const lTilt = getServoConfig(3);

// Beat-by-beat per the design doc (heads-curious-duet, ~11800ms):
//   t=0    settle home (500ms)
//   t=500  both pan left, slight glance down (1000ms travel)
//   t=1500 hold "what's that?" (800ms)
//   t=2300 both pan right, look up (1000ms)
//   t=3300 hold "ooh!" (800ms)
//   t=4100 both face forward, level (800ms)
//   t=4900 pause (500ms)
//   t=5400 make eye contact (800ms)
//   t=6200 hold eye contact + LED flash 200ms at +300ms (800ms)
//   t=7000 both nod once (1400ms)
//   t=8400 both face forward in unison (700ms)
//   t=9100 both look up triumphantly + LED solid 800ms (1400ms — combines look-up + hold)
//   t=10500 return all home (800ms)
//   t=11300 end buffer (500ms)
export function curiousDuetBeats(): Beat[] {
  return [
    settleHome(500),
    pose(1000, {
      rPan: rPan.minPos,
      lPan: lPan.minPos,
      rTilt: tiltDownPos(rTilt),
      lTilt: tiltDownPos(lTilt),
    }),
    hold(800),
    pose(1000, {
      rPan: rPan.maxPos,
      lPan: lPan.maxPos,
      rTilt: rTilt.minPos,
      lTilt: lTilt.minPos,
    }),
    hold(800),
    settleHome(800),
    hold(500),
    meetEyes(800),
    withLedFlash(hold(800), [{ atMs: 300, durMs: 200 }]),
    bothNodSubtle(1400, 1),
    bothPanForward(700),
    withLedSolid(pose(1400, { rTilt: rTilt.minPos, lTilt: lTilt.minPos }), 0, 800),
    settleHome(800),
    hold(500),
  ];
}
```

- [ ] **Step 2: Create the scenario factory**

Create `astros_smoke_test/src/core/scenarios/heads-curious-duet.ts`:

```ts
import type { Scenario } from '../runner.js';
import { registrationSync } from '../operations/registrationSync.js';
import { deployConfig } from '../operations/deployConfig.js';
import { deployScript } from '../operations/deployScript.js';
import { runScript } from '../operations/runScript.js';
import { buildScript } from '../fixtures/scripts/_heads-primitives.js';
import { curiousDuetBeats } from '../fixtures/scripts/heads-curious-duet.js';
import { waitStep, type ScenarioFactory, type SessionContext } from './_shared.js';

export const headsCuriousDuet: ScenarioFactory = (session: SessionContext): Scenario => {
  const built = buildScript(session.configSync, curiousDuetBeats());
  return {
    id: 'heads-curious-duet',
    description: 'Two heads look around together, make eye contact, nod, and look up triumphantly.',
    severity: 'caution',
    arrange: [
      registrationSync(),
      deployConfig(session.configSync),
      deployScript(built.upload),
    ],
    act: [runScript(built.run), waitStep(built.durationMs + 200, 'let-script-play')],
  };
};
```

- [ ] **Step 3: Register the scenario**

Edit `astros_smoke_test/src/core/scenarios/index.ts`. Add the import + registry entry:

```ts
import type { ScenarioFactory } from './_shared.js';
import { syncOnly } from './sync-only.js';
import { formatAndSync } from './format-and-sync.js';
import { configOnly } from './config-only.js';
import { fullHappyPath } from './full-happy-path.js';
import { directCommandSweep } from './direct-command-sweep.js';
import { servoTestSweep } from './servo-test-sweep.js';
import { panicDrill } from './panic-drill.js';
import { headsCuriousDuet } from './heads-curious-duet.js';

export * from './_shared.js';
export {
  syncOnly,
  formatAndSync,
  configOnly,
  fullHappyPath,
  directCommandSweep,
  servoTestSweep,
  panicDrill,
  headsCuriousDuet,
};

export const scenarios: Record<string, ScenarioFactory> = {
  'sync-only': syncOnly,
  'format-and-sync': formatAndSync,
  'config-only': configOnly,
  'full-happy-path': fullHappyPath,
  'direct-command-sweep': directCommandSweep,
  'servo-test-sweep': servoTestSweep,
  'panic-drill': panicDrill,
  'heads-curious-duet': headsCuriousDuet,
};

export function listScenarioIds(): string[] {
  return Object.keys(scenarios);
}

export function getScenarioFactory(id: string): ScenarioFactory {
  const factory = scenarios[id];
  if (!factory) {
    throw new Error(`Unknown scenario: ${id}. Available: ${listScenarioIds().join(', ')}`);
  }
  return factory;
}
```

- [ ] **Step 4: Update the registry id assertion**

Edit `astros_smoke_test/src/core/scenarios/scenarios.test.ts`. The first `it(...)` block (around line 22) lists the seven MVP scenario ids. Update the array to include `'heads-curious-duet'`:

```ts
it('exposes all eight scenarios by id', () => {
  expect(listScenarioIds().sort()).toEqual(
    [
      'sync-only',
      'format-and-sync',
      'config-only',
      'full-happy-path',
      'direct-command-sweep',
      'servo-test-sweep',
      'panic-drill',
      'heads-curious-duet',
    ].sort(),
  );
});
```

Also update the severity-buckets test (around line 40, the `'tags scenarios with the right severity'` block) so the `caution` bucket includes `heads-curious-duet`:

```ts
expect(bySeverity('caution')).toEqual(
  ['panic-drill', 'servo-test-sweep', 'heads-curious-duet'].sort(),
);
```

(Leave `destructive` and `safe` buckets unchanged.)

- [ ] **Step 5: Add a composition assertion for the new scenario**

Append to the `describe('scenario composition', ...)` block in `scenarios.test.ts`:

```ts
it('heads-curious-duet has the standard single-script shape', () => {
  const s = scenarios['heads-curious-duet'](session);
  expect(s.arrange?.map((x) => x.name)).toEqual([
    'registrationSync',
    'deployConfig',
    'deployScript',
  ]);
  expect(s.act?.map((x) => x.name)).toEqual(['runScript', 'let-script-play']);
});
```

- [ ] **Step 6: Run lint, prettier, typecheck, full test suite**

Run:
```bash
cd astros_smoke_test
npm run lint:fix
npm run prettier:write
npm run typecheck
npm test -- --run
```

Expected: clean, all tests pass.

- [ ] **Step 7: Commit**

```bash
cd /home/jeff/Source/astros/AstrOs.Server
git add astros_smoke_test/src/core/fixtures/scripts/heads-curious-duet.ts \
        astros_smoke_test/src/core/scenarios/heads-curious-duet.ts \
        astros_smoke_test/src/core/scenarios/index.ts \
        astros_smoke_test/src/core/scenarios/scenarios.test.ts
git commit -m "$(cat <<'EOF'
feat(smoke-test/heads): add curious-duet routine

Synchronized "what's that?" choreography (~11.8s): both heads pan
left and glance down, then right and look up, settle, make eye
contact (with LED flash), nod once together, and finally look up
triumphantly under a solid LED.

Adds the fixture (curiousDuetBeats) and scenario (headsCuriousDuet,
severity: 'caution'). Wires the registry and extends scenarios.test
assertions for the new id, severity bucket, and standard single-
script shape.

Refs: .docs/plans/20260425-0901-heads-routines-design.md
EOF
)"
```

---

## Task 3: heads-disagreement routine

**Files:**
- Create: `astros_smoke_test/src/core/fixtures/scripts/heads-disagreement.ts`
- Create: `astros_smoke_test/src/core/scenarios/heads-disagreement.ts`
- Modify: `astros_smoke_test/src/core/scenarios/index.ts`
- Modify: `astros_smoke_test/src/core/scenarios/scenarios.test.ts`

R shakes "no", L nods "yes", they argue, R wins. ~13.2s.

- [ ] **Step 1: Create the fixture**

Create `astros_smoke_test/src/core/fixtures/scripts/heads-disagreement.ts`:

```ts
import { getServoConfig } from '../demo-location.js';
import {
  bothPanForward,
  bothPanLeft,
  hold,
  leftNodYes,
  pose,
  rightShakeNo,
  settleHome,
  withLedFlash,
  withLedSolid,
  type Beat,
} from './_heads-primitives.js';

const rPan = getServoConfig(1);
const lPan = getServoConfig(4);

// Beat-by-beat per the design doc (heads-disagreement, ~13200ms):
//   t=0     settle home (500ms)
//   t=500   R shakes "no" — 4 swings (2000ms)
//   t=2500  pause (500ms)
//   t=3000  L nods "yes" — 4 subtle dips (2000ms)
//   t=5000  pause (500ms)
//   t=5500  both turn left (800ms)
//   t=6300  hold (600ms)
//   t=6900  R-pan→max (insists "right!"), L stays at min, LED 4× 100ms (1000ms)
//   t=7900  standoff (800ms)
//   t=8700  L reluctantly turns to max, slow (1500ms)
//   t=10200 both right, satisfied + LED solid 600ms (600ms)
//   t=10800 both face forward (800ms)
//   t=11600 pause (500ms)
//   t=12100 return home (600ms)
//   t=12700 end (500ms)
export function disagreementBeats(): Beat[] {
  return [
    settleHome(500),
    rightShakeNo(2000, 4),
    hold(500),
    leftNodYes(2000, 4),
    hold(500),
    bothPanLeft(800),
    hold(600),
    withLedFlash(pose(1000, { rPan: rPan.maxPos }), [
      { atMs: 0, durMs: 100 },
      { atMs: 200, durMs: 100 },
      { atMs: 400, durMs: 100 },
      { atMs: 600, durMs: 100 },
    ]),
    hold(800),
    pose(1500, { lPan: lPan.maxPos }),
    withLedSolid(hold(600), 0, 600),
    bothPanForward(800),
    hold(500),
    settleHome(600),
    hold(500),
  ];
}
```

- [ ] **Step 2: Create the scenario**

Create `astros_smoke_test/src/core/scenarios/heads-disagreement.ts`:

```ts
import type { Scenario } from '../runner.js';
import { registrationSync } from '../operations/registrationSync.js';
import { deployConfig } from '../operations/deployConfig.js';
import { deployScript } from '../operations/deployScript.js';
import { runScript } from '../operations/runScript.js';
import { buildScript } from '../fixtures/scripts/_heads-primitives.js';
import { disagreementBeats } from '../fixtures/scripts/heads-disagreement.js';
import { waitStep, type ScenarioFactory, type SessionContext } from './_shared.js';

export const headsDisagreement: ScenarioFactory = (session: SessionContext): Scenario => {
  const built = buildScript(session.configSync, disagreementBeats());
  return {
    id: 'heads-disagreement',
    description: 'R shakes no, L nods yes, both argue with the LED, R wins and L reluctantly agrees.',
    severity: 'caution',
    arrange: [
      registrationSync(),
      deployConfig(session.configSync),
      deployScript(built.upload),
    ],
    act: [runScript(built.run), waitStep(built.durationMs + 200, 'let-script-play')],
  };
};
```

- [ ] **Step 3: Register + extend tests**

Edit `astros_smoke_test/src/core/scenarios/index.ts`. Add the import and registry entry — same shape as Task 2 Step 3:
- Import: `import { headsDisagreement } from './heads-disagreement.js';`
- Add `headsDisagreement` to the `export {}` block
- Add `'heads-disagreement': headsDisagreement,` to the `scenarios` object

Edit `astros_smoke_test/src/core/scenarios/scenarios.test.ts`:
- Add `'heads-disagreement'` to the `listScenarioIds().sort()` assertion array
- Update the test description from `'exposes all eight scenarios by id'` to `'exposes all nine scenarios by id'`
- Add `'heads-disagreement'` to the `bySeverity('caution')` array
- Append a composition assertion:
  ```ts
  it('heads-disagreement has the standard single-script shape', () => {
    const s = scenarios['heads-disagreement'](session);
    expect(s.arrange?.map((x) => x.name)).toEqual(['registrationSync', 'deployConfig', 'deployScript']);
    expect(s.act?.map((x) => x.name)).toEqual(['runScript', 'let-script-play']);
  });
  ```

- [ ] **Step 4: Run lint, prettier, typecheck, full tests**

```bash
cd astros_smoke_test
npm run lint:fix
npm run prettier:write
npm run typecheck
npm test -- --run
```

Expected: all green.

- [ ] **Step 5: Commit**

```bash
cd /home/jeff/Source/astros/AstrOs.Server
git add astros_smoke_test/src/core/fixtures/scripts/heads-disagreement.ts \
        astros_smoke_test/src/core/scenarios/heads-disagreement.ts \
        astros_smoke_test/src/core/scenarios/index.ts \
        astros_smoke_test/src/core/scenarios/scenarios.test.ts
git commit -m "$(cat <<'EOF'
feat(smoke-test/heads): add disagreement routine

R shakes "no", L nods "yes", both turn left, R insists right and the
two end up in opposing pan positions with a 4-beat LED flash protest,
finally L reluctantly turns to match and they settle satisfied under
a steady LED. ~13.2s.

Refs: .docs/plans/20260425-0901-heads-routines-design.md
EOF
)"
```

---

## Task 4: heads-hide-and-seek routine

**Files:**
- Create: `astros_smoke_test/src/core/fixtures/scripts/heads-hide-and-seek.ts`
- Create: `astros_smoke_test/src/core/scenarios/heads-hide-and-seek.ts`
- Modify: `astros_smoke_test/src/core/scenarios/index.ts`
- Modify: `astros_smoke_test/src/core/scenarios/scenarios.test.ts`

R hides, L searches, surprise reunion. ~13.6s.

- [ ] **Step 1: Create the fixture**

Create `astros_smoke_test/src/core/fixtures/scripts/heads-hide-and-seek.ts`:

```ts
import { getServoConfig } from '../demo-location.js';
import {
  bothLookUp,
  bothNodSubtle,
  bothPanForward,
  hold,
  meetEyes,
  pose,
  settleHome,
  tiltDownPos,
  withLedFlash,
  withLedSolid,
  type Beat,
} from './_heads-primitives.js';

const rPan = getServoConfig(1);
const lPan = getServoConfig(4);
const rTilt = getServoConfig(2);
const lTilt = getServoConfig(3);

// Beat-by-beat per the design doc (heads-hide-and-seek, ~13600ms):
//   t=0     settle home (500ms)
//   t=500   R hides — pan→max + tilt-down 30% (1200ms)
//   t=1700  hidden hold (800ms)
//   t=2500  L pans left to search (800ms)
//   t=3300  "where'd they go?" (600ms)
//   t=3900  L pans right (1000ms)
//   t=4900  "checking under things" — LED 200ms flash at +200 (600ms)
//   t=5500  L looks up at sky (600ms)
//   t=6100  scanning above (600ms)
//   t=6700  R pops up — R-tilt→home, R-pan→home + LED flash 200ms (600ms)
//   t=7300  L startled jolt — tilt slightly down then back to min (200ms total)
//   t=7500  surprise hold (800ms)
//   t=8300  both face each other (800ms)
//   t=9100  both nod laughing + LED twinkles 4× 200ms (1500ms)
//   t=10600 both face forward + LED solid 400ms (800ms)
//   t=11400 both look up triumphant (800ms)
//   t=12200 hold (600ms)
//   t=12800 return home (800ms)
//
// L startled jolt: L is already at tilt-min (look up at sky). To express
// "startled" we briefly dip 30% toward max then snap back to min — two
// 100ms beats yields a visible pulse without a custom primitive.
export function hideAndSeekBeats(): Beat[] {
  return [
    settleHome(500),
    pose(1200, { rPan: rPan.maxPos, rTilt: tiltDownPos(rTilt) }),
    hold(800),
    pose(800, { lPan: lPan.minPos }),
    hold(600),
    pose(1000, { lPan: lPan.maxPos }),
    withLedFlash(hold(600), [{ atMs: 200, durMs: 200 }]),
    pose(600, { lTilt: lTilt.minPos }),
    hold(600),
    withLedFlash(pose(600, { rTilt: rTilt.homePos, rPan: rPan.homePos }), [
      { atMs: 0, durMs: 200 },
    ]),
    pose(100, { lTilt: tiltDownPos(lTilt) }),
    pose(100, { lTilt: lTilt.minPos }),
    hold(800),
    meetEyes(800),
    withLedFlash(bothNodSubtle(1500, 2), [
      { atMs: 0, durMs: 200 },
      { atMs: 400, durMs: 200 },
      { atMs: 800, durMs: 200 },
      { atMs: 1200, durMs: 200 },
    ]),
    withLedSolid(bothPanForward(800), 0, 400),
    bothLookUp(800),
    hold(600),
    settleHome(800),
  ];
}
```

- [ ] **Step 2: Create the scenario**

Create `astros_smoke_test/src/core/scenarios/heads-hide-and-seek.ts`:

```ts
import type { Scenario } from '../runner.js';
import { registrationSync } from '../operations/registrationSync.js';
import { deployConfig } from '../operations/deployConfig.js';
import { deployScript } from '../operations/deployScript.js';
import { runScript } from '../operations/runScript.js';
import { buildScript } from '../fixtures/scripts/_heads-primitives.js';
import { hideAndSeekBeats } from '../fixtures/scripts/heads-hide-and-seek.js';
import { waitStep, type ScenarioFactory, type SessionContext } from './_shared.js';

export const headsHideAndSeek: ScenarioFactory = (session: SessionContext): Scenario => {
  const built = buildScript(session.configSync, hideAndSeekBeats());
  return {
    id: 'heads-hide-and-seek',
    description: 'R hides; L searches the room and the sky; R pops up; both laugh-nod and pose triumphantly.',
    severity: 'caution',
    arrange: [
      registrationSync(),
      deployConfig(session.configSync),
      deployScript(built.upload),
    ],
    act: [runScript(built.run), waitStep(built.durationMs + 200, 'let-script-play')],
  };
};
```

- [ ] **Step 3: Register + extend tests**

Same pattern as Task 2 Step 3 / Task 3 Step 3:
- `index.ts`: import `headsHideAndSeek`, add to `export {}`, add `'heads-hide-and-seek': headsHideAndSeek` to registry
- `scenarios.test.ts`:
  - Add `'heads-hide-and-seek'` to the `listScenarioIds().sort()` assertion array
  - Update the test description from `'exposes all nine scenarios by id'` to `'exposes all ten scenarios by id'`
  - Add `'heads-hide-and-seek'` to the `bySeverity('caution')` array
  - Append a composition assertion:
    ```ts
    it('heads-hide-and-seek has the standard single-script shape', () => {
      const s = scenarios['heads-hide-and-seek'](session);
      expect(s.arrange?.map((x) => x.name)).toEqual(['registrationSync', 'deployConfig', 'deployScript']);
      expect(s.act?.map((x) => x.name)).toEqual(['runScript', 'let-script-play']);
    });
    ```

- [ ] **Step 4: Run lint, prettier, typecheck, full tests**

```bash
cd astros_smoke_test
npm run lint:fix
npm run prettier:write
npm run typecheck
npm test -- --run
```

- [ ] **Step 5: Commit**

```bash
cd /home/jeff/Source/astros/AstrOs.Server
git add astros_smoke_test/src/core/fixtures/scripts/heads-hide-and-seek.ts \
        astros_smoke_test/src/core/scenarios/heads-hide-and-seek.ts \
        astros_smoke_test/src/core/scenarios/index.ts \
        astros_smoke_test/src/core/scenarios/scenarios.test.ts
git commit -m "$(cat <<'EOF'
feat(smoke-test/heads): add hide-and-seek routine

R hides (pan away + slight tilt-down). L searches — left, right,
checks under things (LED blip), scans the sky. R pops up with a
"found you!" LED flash. L does a startled jolt. Both face each
other and laugh-nod under twinkling LED, then settle forward and
look up triumphantly. ~13.6s.

Refs: .docs/plans/20260425-0901-heads-routines-design.md
EOF
)"
```

---

## Task 5: heads-sync-swim routine

**Files:**
- Create: `astros_smoke_test/src/core/fixtures/scripts/heads-sync-swim.ts`
- Create: `astros_smoke_test/src/core/scenarios/heads-sync-swim.ts`
- Modify: `astros_smoke_test/src/core/scenarios/index.ts`
- Modify: `astros_smoke_test/src/core/scenarios/scenarios.test.ts`

Pure choreography: every channel exercised in both directions, both synchronized and counter motion. ~13s.

- [ ] **Step 1: Create the fixture**

Create `astros_smoke_test/src/core/fixtures/scripts/heads-sync-swim.ts`:

```ts
import {
  bothLookUp,
  bothPanForward,
  bothPanLeft,
  bothPanRight,
  hold,
  lookOutward,
  meetEyes,
  settleHome,
  withLedFlash,
  withLedSolid,
  type Beat,
} from './_heads-primitives.js';

// Beat-by-beat per the design doc (heads-sync-swim, ~13000ms):
//   t=0     settle home (500ms)
//   t=500   sync pan left (1500ms — slow for elegance)
//   t=2000  hold (500ms)
//   t=2500  sync pan right (1500ms)
//   t=4000  hold (500ms)
//   t=4500  both forward (800ms)
//   t=5300  pause (300ms)
//   t=5600  counter-sweep outward (1000ms)
//   t=6600  hold (500ms)
//   t=7100  counter-sweep inward (eye contact) — LED 200ms flash at +1100 (1500ms)
//   t=8600  hold (800ms)
//   t=9400  both face forward (800ms)
//   t=10200 both look up in unison + LED solid 800ms (1000ms)
//   t=11200 hold (800ms)
//   t=12000 return all home (1000ms)
export function syncSwimBeats(): Beat[] {
  return [
    settleHome(500),
    bothPanLeft(1500),
    hold(500),
    bothPanRight(1500),
    hold(500),
    bothPanForward(800),
    hold(300),
    lookOutward(1000),
    hold(500),
    withLedFlash(meetEyes(1500), [{ atMs: 1100, durMs: 200 }]),
    hold(800),
    bothPanForward(800),
    withLedSolid(bothLookUp(1000), 0, 800),
    hold(800),
    settleHome(1000),
  ];
}
```

- [ ] **Step 2: Create the scenario**

Create `astros_smoke_test/src/core/scenarios/heads-sync-swim.ts`:

```ts
import type { Scenario } from '../runner.js';
import { registrationSync } from '../operations/registrationSync.js';
import { deployConfig } from '../operations/deployConfig.js';
import { deployScript } from '../operations/deployScript.js';
import { runScript } from '../operations/runScript.js';
import { buildScript } from '../fixtures/scripts/_heads-primitives.js';
import { syncSwimBeats } from '../fixtures/scripts/heads-sync-swim.js';
import { waitStep, type ScenarioFactory, type SessionContext } from './_shared.js';

export const headsSyncSwim: ScenarioFactory = (session: SessionContext): Scenario => {
  const built = buildScript(session.configSync, syncSwimBeats());
  return {
    id: 'heads-sync-swim',
    description: 'Pure choreography — sync pans, opposing sweeps, eye-contact converge, look up.',
    severity: 'caution',
    arrange: [
      registrationSync(),
      deployConfig(session.configSync),
      deployScript(built.upload),
    ],
    act: [runScript(built.run), waitStep(built.durationMs + 200, 'let-script-play')],
  };
};
```

- [ ] **Step 3: Register + extend tests**

Same pattern as previous tasks:
- `index.ts`: import `headsSyncSwim`, add to `export {}`, add `'heads-sync-swim': headsSyncSwim` to registry
- `scenarios.test.ts`:
  - Add `'heads-sync-swim'` to the `listScenarioIds().sort()` assertion array
  - Update the test description from `'exposes all ten scenarios by id'` to `'exposes all eleven scenarios by id'`
  - Add `'heads-sync-swim'` to the `bySeverity('caution')` array
  - Append:
    ```ts
    it('heads-sync-swim has the standard single-script shape', () => {
      const s = scenarios['heads-sync-swim'](session);
      expect(s.arrange?.map((x) => x.name)).toEqual(['registrationSync', 'deployConfig', 'deployScript']);
      expect(s.act?.map((x) => x.name)).toEqual(['runScript', 'let-script-play']);
    });
    ```

- [ ] **Step 4: Run lint, prettier, typecheck, full tests**

```bash
cd astros_smoke_test
npm run lint:fix
npm run prettier:write
npm run typecheck
npm test -- --run
```

- [ ] **Step 5: Commit**

```bash
cd /home/jeff/Source/astros/AstrOs.Server
git add astros_smoke_test/src/core/fixtures/scripts/heads-sync-swim.ts \
        astros_smoke_test/src/core/scenarios/heads-sync-swim.ts \
        astros_smoke_test/src/core/scenarios/index.ts \
        astros_smoke_test/src/core/scenarios/scenarios.test.ts
git commit -m "$(cat <<'EOF'
feat(smoke-test/heads): add sync-swim routine

Most "smoke-test-like" of the four — every channel exercised in both
directions, both synchronized and counter motion. Sync-pan left/right,
forward, opposing outward sweep, then converge eye-to-eye with an LED
flash on the meet, finally face forward and look up under a solid LED.
~13s.

Refs: .docs/plans/20260425-0901-heads-routines-design.md
EOF
)"
```

---

## Task 6: heads-demo-reel scenario (playlist-mimicking)

**Files:**
- Create: `astros_smoke_test/src/core/scenarios/heads-demo-reel.ts`
- Modify: `astros_smoke_test/src/core/scenarios/index.ts`
- Modify: `astros_smoke_test/src/core/scenarios/scenarios.test.ts`

Plays all four routines back-to-back by deploying all four scripts upfront then sequencing `runScript` calls. Mirrors how the API's `AnimationQueue` plays a Sequential `PlaylistType`.

- [ ] **Step 1: Create the reel scenario**

Create `astros_smoke_test/src/core/scenarios/heads-demo-reel.ts`:

```ts
import type { Scenario } from '../runner.js';
import { registrationSync } from '../operations/registrationSync.js';
import { deployConfig } from '../operations/deployConfig.js';
import { deployScript } from '../operations/deployScript.js';
import { runScript } from '../operations/runScript.js';
import { buildScript } from '../fixtures/scripts/_heads-primitives.js';
import { curiousDuetBeats } from '../fixtures/scripts/heads-curious-duet.js';
import { disagreementBeats } from '../fixtures/scripts/heads-disagreement.js';
import { hideAndSeekBeats } from '../fixtures/scripts/heads-hide-and-seek.js';
import { syncSwimBeats } from '../fixtures/scripts/heads-sync-swim.js';
import { waitStep, type ScenarioFactory, type SessionContext } from './_shared.js';

export const headsDemoReel: ScenarioFactory = (session: SessionContext): Scenario => {
  // Each buildScript call uses uuidv4 by default, so the four scripts get
  // distinct ids — no collision when all four are deployed simultaneously.
  const a = buildScript(session.configSync, curiousDuetBeats());
  const b = buildScript(session.configSync, disagreementBeats());
  const c = buildScript(session.configSync, hideAndSeekBeats());
  const d = buildScript(session.configSync, syncSwimBeats());

  return {
    id: 'heads-demo-reel',
    description:
      'Plays curious-duet → disagreement → hide-and-seek → sync-swim back-to-back, mimicking a Sequential Playlist.',
    severity: 'caution',
    arrange: [
      registrationSync(),
      deployConfig(session.configSync),
      deployScript(a.upload),
      deployScript(b.upload),
      deployScript(c.upload),
      deployScript(d.upload),
    ],
    act: [
      runScript(a.run),
      waitStep(a.durationMs + 200, 'curious-duet'),
      runScript(b.run),
      waitStep(b.durationMs + 200, 'disagreement'),
      runScript(c.run),
      waitStep(c.durationMs + 200, 'hide-and-seek'),
      runScript(d.run),
      waitStep(d.durationMs + 200, 'sync-swim'),
    ],
  };
};
```

- [ ] **Step 2: Register the reel**

Edit `astros_smoke_test/src/core/scenarios/index.ts`:
- Import: `import { headsDemoReel } from './heads-demo-reel.js';`
- Add `headsDemoReel` to the `export {}` block
- Add `'heads-demo-reel': headsDemoReel,` to the `scenarios` object

- [ ] **Step 3: Extend the test assertions**

Edit `astros_smoke_test/src/core/scenarios/scenarios.test.ts`:

- Add `'heads-demo-reel'` to the `listScenarioIds().sort()` assertion array
- Update the test description from `'exposes all eleven scenarios by id'` to `'exposes all twelve scenarios by id'`
- Add `'heads-demo-reel'` to the `bySeverity('caution')` array.
- Append a composition assertion that captures the playlist-mimicking shape:
  ```ts
  it('heads-demo-reel deploys 4 scripts and runs them in sequence', () => {
    const s = scenarios['heads-demo-reel'](session);
    expect(s.arrange?.map((x) => x.name)).toEqual([
      'registrationSync',
      'deployConfig',
      'deployScript',
      'deployScript',
      'deployScript',
      'deployScript',
    ]);
    const actNames = s.act?.map((x) => x.name) ?? [];
    expect(actNames.filter((n) => n === 'runScript')).toHaveLength(4);
    expect(actNames.filter((n) =>
      ['curious-duet', 'disagreement', 'hide-and-seek', 'sync-swim'].includes(n),
    )).toHaveLength(4);
  });
  ```

- [ ] **Step 4: Run lint, prettier, typecheck, full tests**

```bash
cd astros_smoke_test
npm run lint:fix
npm run prettier:write
npm run typecheck
npm test -- --run
```

- [ ] **Step 5: Commit**

```bash
cd /home/jeff/Source/astros/AstrOs.Server
git add astros_smoke_test/src/core/scenarios/heads-demo-reel.ts \
        astros_smoke_test/src/core/scenarios/index.ts \
        astros_smoke_test/src/core/scenarios/scenarios.test.ts
git commit -m "$(cat <<'EOF'
feat(smoke-test/heads): add demo reel — playlist-mimicking sequence

heads-demo-reel deploys all four routines up front (curious-duet,
disagreement, hide-and-seek, sync-swim) and then sequences
runScript + waitStep pairs across them. Mirrors how astros_api's
AnimationQueue plays a Sequential PlaylistType: deploy once, run
each track in order, wait its known duration before dispatching the
next.

Total runtime ~52s. Each track's wait uses the script's
durationMs + 200ms padding to absorb scheduler/wall-clock skew.

Refs: .docs/plans/20260425-0901-heads-routines-design.md
EOF
)"
```

---

## Task 7: Manual QA documentation

**Files:**
- Create: `.docs/qa/heads-routines.md`

Bench checklist for the new routines + reel.

- [ ] **Step 1: Create the QA doc**

Create `.docs/qa/heads-routines.md`:

```markdown
# Heads routines manual QA

Bench tests for the four head choreographies and the demo reel. Run after merging Phase B and before any droid-con demo.

## Preconditions

- Bench rig connected: master ESP32 with two-head rig (4 servos on the master maestro), padawan ESP32 reachable via ESP-NOW with the relay LED wired to GPIO ch0.
- AstrOs.Server stopped (so the serial port is free for the smoke-test cockpit).
- Smoke-test cockpit running: `cd astros_smoke_test && npm run web:dev`
- Browser at `http://localhost:5174`, port connected, padawan discovered (status pill shows the address).
- Optional: `SMOKE_LOG=server,state` for server-side debug visibility.

## Per-routine tests

For each of the four routines, click run from the cockpit. Verify:

1. **`heads-curious-duet`** (~12s)
   - Both heads pan left + glance slightly down, hold.
   - Both heads pan right + look fully up, hold.
   - Both heads return forward and level.
   - Heads turn to face each other (R looks left, L looks right). LED briefly flashes during eye contact.
   - Both heads dip and return (subtle nod).
   - Both face forward, then both look up; LED stays on solid for the look-up + hold.
   - All return home.
   - Cockpit transcript shows `runScript` ack, `let-script-play` wait, `scenario OK`.

2. **`heads-disagreement`** (~13s)
   - R-pan oscillates 4 times (no shake), L stays.
   - L-tilt does 4 small downward dips (yes nod), R stays.
   - Both pan left, hold.
   - R-pan whips back to right while L stays at left; LED flashes 4× rapidly.
   - Standoff hold (R-right, L-left).
   - L-pan slowly travels to right (~1.5s travel — visibly slower than other moves).
   - Both at right, LED solid for ~600ms.
   - Both face forward, settle home.

3. **`heads-hide-and-seek`** (~14s)
   - R hides — pans away (right) and dips slightly down.
   - L pans left, holds, pans right, holds (LED briefly flashes during the right pan as if checking under things).
   - L looks up at the sky.
   - R pops back up to forward + level; LED flashes ("found!").
   - L does a small startled jolt (tilts down then back up — fast).
   - Both face each other, then nod-laugh together with 4 LED twinkles.
   - Both face forward (LED solid 400ms), look up, settle home.

4. **`heads-sync-swim`** (~13s)
   - Both pan slowly left, hold, slowly right, hold, return forward.
   - Brief pause, then opposing sweep (R faces right, L faces left).
   - Counter-sweep inward — heads converge to face each other; LED flashes on convergence.
   - Both face forward, both look up under solid LED (~800ms), settle home.

## Reel test

5. **`heads-demo-reel`** (~52s total)
   - Click run; verify deploy phase shows 4 `deployScript` ack lines in transcript without errors.
   - All four routines play back-to-back. The handoff between routines should have a brief pause (~200ms scheduler skew padding) but nothing visibly stuck.
   - Cockpit transcript shows 4 `runScript` invocations interleaved with named waits (`curious-duet`, `disagreement`, `hide-and-seek`, `sync-swim`).
   - `scenario OK` at the end; total runtime should match the sum of routine durations + ~800ms padding.

## Edge cases

- **Determinism.** Run any routine twice in a row. Motion should be identical — no drift from prior state. (Each routine starts with `settleHome` to neutralize prior position.)
- **Panic mid-routine.** Start `heads-demo-reel`, click cockpit PANIC during track 2 (around the 18-20s mark). All four servos hold position immediately; the remaining tracks do not dispatch. Subsequent runs require a re-deploy (PANIC clears active state but doesn't redeploy scripts — they're still on SD).
- **Re-run after `format-and-sync`.** Run `format-and-sync`, then `heads-curious-duet`. The scenario's own `deployScript` step should redeploy the script (FORMAT_SD wiped firmware storage); confirm the deploy step succeeds rather than returning a stale-script error.
- **Disconnect mid-arrange.** Pull the master USB cable during a routine's deploy phase. Cockpit should surface a transport error and mark the run failed without crashing the server.

## Server-side log spot-checks

With `SMOKE_LOG=server`:
- A successful single routine produces one `scenario started` and one `scenario finished` log line.
- A successful reel produces one `scenario started` and one `scenario finished` for the reel itself (the inner `runScript` calls are step events, not scenario events).
- A panic mid-run produces `panic stop fired` plus `scenario threw` (the runner's panic-stop interrupts the awaited wait step).
```

- [ ] **Step 2: Commit**

```bash
cd /home/jeff/Source/astros/AstrOs.Server
git add .docs/qa/heads-routines.md
git commit -m "$(cat <<'EOF'
docs(qa): heads routines manual QA checklist

Bench tests for the four new head choreographies and the demo reel.
Covers per-routine choreography expectations, the playlist-mimicking
reel handoff, edge cases (determinism, panic mid-run, post-format
redeploy, disconnect mid-arrange), and server-side log spot-checks.

Refs: .docs/plans/20260425-0901-heads-routines-design.md
EOF
)"
```

---

## Plan progress tracking

Update this checklist as tasks complete; commit the update each time.

- [ ] Task 1 — Primitives library + tests
- [ ] Task 2 — heads-curious-duet routine
- [ ] Task 3 — heads-disagreement routine
- [ ] Task 4 — heads-hide-and-seek routine
- [ ] Task 5 — heads-sync-swim routine
- [ ] Task 6 — heads-demo-reel scenario
- [ ] Task 7 — Manual QA documentation

---

## Self-review notes

- **Spec coverage:** every section of the design doc maps to a task. Choreography → Tasks 2–5 (one per routine, beat lists translated from the design's tables). Primitives library → Task 1. Reel mechanics → Task 6. Tests → covered per-task (primitives in Task 1, scenario assertions in Tasks 2–6). Manual QA → Task 7.
- **No placeholders:** every code block is concrete; every command is exact. Only the registry/test extension steps in Tasks 3–6 reference "same pattern as Task 2" in their descriptions, but each step explicitly names the file and lists what to add (no implicit copy-paste).
- **Type consistency:** `Beat` shape and `BuiltScript` shape used in Task 1 match every later task's usage. `tabId`-style helpers and beat-builder primitives carry the same names from Task 1 through Task 6. The scenario `'let-script-play'` wait step name is consistent across all four single-routine scenarios; the reel uses scenario-specific names (`'curious-duet'` etc.) for transcript clarity.
- **Verification:** every task ends with `lint + prettier + typecheck + npm test -- --run` before commit. Test counts grow by ~14 (Task 1 primitives) + 4 × 1 (one composition assertion per single-routine task) + 1 (reel composition assertion) = ~19 new tests; final count should be 53 + 19 = 72.
