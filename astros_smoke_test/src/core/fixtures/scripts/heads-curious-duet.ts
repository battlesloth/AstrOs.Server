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
