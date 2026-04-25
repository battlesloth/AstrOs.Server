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
