import { getServoConfig } from '../demo-location.js';
import {
  POS_HOME,
  POS_MAX,
  POS_MIN,
  bothLookUp,
  bothNodSubtle,
  bothPanForward,
  hold,
  meetEyes,
  pose,
  settleHome,
  tiltDownPercent,
  withLedFlash,
  withLedSolid,
  type Beat,
} from './_heads-primitives.js';

// tiltDownPercent needs the per-channel home/max ratio; the rest of this
// fixture uses POS_* percent constants directly.
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
    pose(1200, { rPan: POS_MAX, rTilt: tiltDownPercent(rTilt) }),
    hold(800),
    pose(800, { lPan: POS_MIN }),
    hold(600),
    pose(1000, { lPan: POS_MAX }),
    withLedFlash(hold(600), [{ atMs: 200, durMs: 200 }]),
    pose(600, { lTilt: POS_MIN }),
    hold(600),
    withLedFlash(pose(600, { rTilt: POS_HOME, rPan: POS_HOME }), [{ atMs: 0, durMs: 200 }]),
    pose(100, { lTilt: tiltDownPercent(lTilt) }),
    pose(100, { lTilt: POS_MIN }),
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
