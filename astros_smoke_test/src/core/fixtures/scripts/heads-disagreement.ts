import {
  POS_MAX,
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
    withLedFlash(pose(1000, { rPan: POS_MAX }), [
      { atMs: 0, durMs: 100 },
      { atMs: 200, durMs: 100 },
      { atMs: 400, durMs: 100 },
      { atMs: 600, durMs: 100 },
    ]),
    hold(800),
    pose(1500, { lPan: POS_MAX }),
    withLedSolid(hold(600), 0, 600),
    bothPanForward(800),
    hold(500),
    settleHome(600),
    hold(500),
  ];
}
