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
