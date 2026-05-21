import { describe, it, expect, vi } from 'vitest';
import { useSwipeGesture } from '../useSwipeGesture';

// Build a synthetic TouchEvent compatible with what the composable reads
// (touches list + changedTouches list with clientX/clientY). jsdom doesn't
// implement TouchEvent natively, so we provide just enough surface area.
type TouchInit = { clientX: number; clientY: number };

function touchEvent(
  type: 'touchstart' | 'touchend' | 'touchcancel',
  active: TouchInit[],
  changed: TouchInit[] = [],
): TouchEvent {
  const event = {
    type,
    touches: active as unknown as TouchList,
    changedTouches: changed as unknown as TouchList,
    preventDefault: vi.fn(),
  } as unknown as TouchEvent;
  return event;
}

describe('useSwipeGesture', () => {
  it('fires onSwipeLeft when horizontal delta exceeds threshold in the negative direction', () => {
    const onSwipeLeft = vi.fn();
    const onSwipeRight = vi.fn();
    const { onTouchStart, onTouchEnd } = useSwipeGesture({
      horizontalThresholdPx: 60,
      verticalMaxPx: 40,
      onSwipeLeft,
      onSwipeRight,
    });

    onTouchStart(touchEvent('touchstart', [{ clientX: 200, clientY: 200 }]));
    onTouchEnd(touchEvent('touchend', [], [{ clientX: 100, clientY: 210 }]));

    expect(onSwipeLeft).toHaveBeenCalledTimes(1);
    expect(onSwipeRight).not.toHaveBeenCalled();
  });

  it('fires onSwipeRight when horizontal delta exceeds threshold in the positive direction', () => {
    const onSwipeLeft = vi.fn();
    const onSwipeRight = vi.fn();
    const { onTouchStart, onTouchEnd } = useSwipeGesture({
      horizontalThresholdPx: 60,
      verticalMaxPx: 40,
      onSwipeLeft,
      onSwipeRight,
    });

    onTouchStart(touchEvent('touchstart', [{ clientX: 100, clientY: 200 }]));
    onTouchEnd(touchEvent('touchend', [], [{ clientX: 200, clientY: 210 }]));

    expect(onSwipeRight).toHaveBeenCalledTimes(1);
    expect(onSwipeLeft).not.toHaveBeenCalled();
  });

  it('does NOT fire when horizontal delta is below threshold (tap)', () => {
    // Vacuous-fix guard: catches a refactor that drops the
    // `Math.abs(deltaX) < threshold` early return. Without it, a tap with
    // tiny delta would fire onSwipeLeft (deltaX = -2 < 0).
    const onSwipeLeft = vi.fn();
    const onSwipeRight = vi.fn();
    const { onTouchStart, onTouchEnd } = useSwipeGesture({
      horizontalThresholdPx: 60,
      verticalMaxPx: 40,
      onSwipeLeft,
      onSwipeRight,
    });

    onTouchStart(touchEvent('touchstart', [{ clientX: 100, clientY: 200 }]));
    onTouchEnd(touchEvent('touchend', [], [{ clientX: 98, clientY: 200 }]));

    expect(onSwipeLeft).not.toHaveBeenCalled();
    expect(onSwipeRight).not.toHaveBeenCalled();
  });

  it('does NOT fire when vertical delta exceeds the max (diagonal scroll)', () => {
    // Vacuous-fix guard: catches a refactor that drops the
    // `Math.abs(deltaY) > verticalMax` early return. Without it, a scroll
    // gesture with significant vertical movement would still fire a swipe
    // if it had ANY horizontal component over threshold.
    const onSwipeLeft = vi.fn();
    const { onTouchStart, onTouchEnd } = useSwipeGesture({
      horizontalThresholdPx: 60,
      verticalMaxPx: 40,
      onSwipeLeft,
    });

    onTouchStart(touchEvent('touchstart', [{ clientX: 200, clientY: 200 }]));
    onTouchEnd(touchEvent('touchend', [], [{ clientX: 100, clientY: 300 }]));

    expect(onSwipeLeft).not.toHaveBeenCalled();
  });

  it('multi-touch start aborts the in-progress gesture (two-handed grip)', () => {
    // Vacuous-fix guard for the multi-touch guard. Per memory rule for
    // defensive features: revert the `event.touches.length !== 1` guard
    // (let the second touchstart fall through without clearing start
    // coords) and this test fails — the eventual touchend computes delta
    // from first-finger start to second-finger end and fires a spurious
    // swipe. Verified mechanically: removing the guard makes this test
    // fail.
    const onSwipeLeft = vi.fn();
    const onSwipeRight = vi.fn();
    const { onTouchStart, onTouchEnd } = useSwipeGesture({
      horizontalThresholdPx: 60,
      verticalMaxPx: 40,
      onSwipeLeft,
      onSwipeRight,
    });

    // First finger lands at x=200.
    onTouchStart(touchEvent('touchstart', [{ clientX: 200, clientY: 200 }]));
    // Second finger lands at x=50 — should clear start coords.
    onTouchStart(
      touchEvent('touchstart', [
        { clientX: 200, clientY: 200 },
        { clientX: 50, clientY: 200 },
      ]),
    );
    // Second finger lifts at x=50; this used to compute delta = 50 - 200 =
    // -150 (a far-left swipe) and fire onSwipeLeft. After the fix, start
    // coords are null and the touchend exits early.
    onTouchEnd(
      touchEvent('touchend', [{ clientX: 200, clientY: 200 }], [{ clientX: 50, clientY: 200 }]),
    );

    expect(onSwipeLeft).not.toHaveBeenCalled();
    expect(onSwipeRight).not.toHaveBeenCalled();
  });

  it('touchend without a preceding touchstart is a safe no-op', () => {
    const onSwipeLeft = vi.fn();
    const { onTouchEnd } = useSwipeGesture({ onSwipeLeft });

    onTouchEnd(touchEvent('touchend', [], [{ clientX: 100, clientY: 200 }]));

    expect(onSwipeLeft).not.toHaveBeenCalled();
  });

  it('touchcancel clears in-progress state so the next touchend is a no-op', () => {
    const onSwipeLeft = vi.fn();
    const { onTouchStart, onTouchEnd, onTouchCancel } = useSwipeGesture({
      horizontalThresholdPx: 60,
      onSwipeLeft,
    });

    onTouchStart(touchEvent('touchstart', [{ clientX: 200, clientY: 200 }]));
    onTouchCancel();
    onTouchEnd(touchEvent('touchend', [], [{ clientX: 50, clientY: 200 }]));

    expect(onSwipeLeft).not.toHaveBeenCalled();
  });

  it('calls preventDefault on the touchend when a swipe is detected', () => {
    // Suppresses the synthesized click so a drag crossing an interactive
    // child doesn't also fire that child's click handler.
    const { onTouchStart, onTouchEnd } = useSwipeGesture({
      horizontalThresholdPx: 60,
      onSwipeLeft: () => {},
    });

    onTouchStart(touchEvent('touchstart', [{ clientX: 200, clientY: 200 }]));
    const endEvent = touchEvent('touchend', [], [{ clientX: 100, clientY: 200 }]);
    onTouchEnd(endEvent);

    expect(endEvent.preventDefault).toHaveBeenCalledTimes(1);
  });

  it('does NOT call preventDefault when the touch ends below threshold (tap path stays clickable)', () => {
    const { onTouchStart, onTouchEnd } = useSwipeGesture({ horizontalThresholdPx: 60 });

    onTouchStart(touchEvent('touchstart', [{ clientX: 100, clientY: 200 }]));
    const endEvent = touchEvent('touchend', [], [{ clientX: 105, clientY: 200 }]);
    onTouchEnd(endEvent);

    expect(endEvent.preventDefault).not.toHaveBeenCalled();
  });

  it('can detect multiple swipes in sequence without state leaking', () => {
    const onSwipeLeft = vi.fn();
    const onSwipeRight = vi.fn();
    const { onTouchStart, onTouchEnd } = useSwipeGesture({
      horizontalThresholdPx: 60,
      onSwipeLeft,
      onSwipeRight,
    });

    onTouchStart(touchEvent('touchstart', [{ clientX: 200, clientY: 200 }]));
    onTouchEnd(touchEvent('touchend', [], [{ clientX: 100, clientY: 200 }]));
    expect(onSwipeLeft).toHaveBeenCalledTimes(1);

    onTouchStart(touchEvent('touchstart', [{ clientX: 100, clientY: 200 }]));
    onTouchEnd(touchEvent('touchend', [], [{ clientX: 200, clientY: 200 }]));
    expect(onSwipeRight).toHaveBeenCalledTimes(1);

    // Sequence didn't leak state — total counts are exactly 1 each.
    expect(onSwipeLeft).toHaveBeenCalledTimes(1);
    expect(onSwipeRight).toHaveBeenCalledTimes(1);
  });

  it('fires when horizontal delta is exactly at the threshold (canonical off-by-one)', () => {
    // The production code uses `Math.abs(deltaX) < threshold` to skip, so a
    // delta of exactly `threshold` DOES fire. Mutating `<` to `<=` would
    // make this case stop firing. Catches that off-by-one in both
    // directions.
    const onSwipeLeft = vi.fn();
    const onSwipeRight = vi.fn();
    const { onTouchStart, onTouchEnd } = useSwipeGesture({
      horizontalThresholdPx: 60,
      verticalMaxPx: 40,
      onSwipeLeft,
      onSwipeRight,
    });

    // Exactly +60 → onSwipeRight.
    onTouchStart(touchEvent('touchstart', [{ clientX: 100, clientY: 200 }]));
    onTouchEnd(touchEvent('touchend', [], [{ clientX: 160, clientY: 200 }]));
    expect(onSwipeRight).toHaveBeenCalledTimes(1);

    // Exactly -60 → onSwipeLeft.
    onTouchStart(touchEvent('touchstart', [{ clientX: 200, clientY: 200 }]));
    onTouchEnd(touchEvent('touchend', [], [{ clientX: 140, clientY: 200 }]));
    expect(onSwipeLeft).toHaveBeenCalledTimes(1);
  });

  it('fires when vertical delta is exactly at the verticalMax (still considered horizontal)', () => {
    // The production code uses `Math.abs(deltaY) > verticalMax` to skip, so
    // a vertical drift of exactly `verticalMax` is still treated as a clean
    // horizontal swipe. Mutating `>` to `>=` would make exact-40 reject and
    // the swipe never fire.
    const onSwipeLeft = vi.fn();
    const { onTouchStart, onTouchEnd } = useSwipeGesture({
      horizontalThresholdPx: 60,
      verticalMaxPx: 40,
      onSwipeLeft,
    });

    onTouchStart(touchEvent('touchstart', [{ clientX: 200, clientY: 200 }]));
    onTouchEnd(touchEvent('touchend', [], [{ clientX: 100, clientY: 240 }]));
    expect(onSwipeLeft).toHaveBeenCalledTimes(1);
  });

  it('respects custom horizontalThresholdPx and verticalMaxPx', () => {
    const onSwipeLeft = vi.fn();
    const { onTouchStart, onTouchEnd } = useSwipeGesture({
      horizontalThresholdPx: 100,
      verticalMaxPx: 10,
      onSwipeLeft,
    });

    // Delta 80 with the default would fire; with threshold 100 it should not.
    onTouchStart(touchEvent('touchstart', [{ clientX: 200, clientY: 200 }]));
    onTouchEnd(touchEvent('touchend', [], [{ clientX: 120, clientY: 200 }]));
    expect(onSwipeLeft).not.toHaveBeenCalled();

    // Delta -150 with vertical 20 should NOT fire (vertical exceeds custom max of 10).
    onTouchStart(touchEvent('touchstart', [{ clientX: 200, clientY: 200 }]));
    onTouchEnd(touchEvent('touchend', [], [{ clientX: 50, clientY: 220 }]));
    expect(onSwipeLeft).not.toHaveBeenCalled();
  });
});
