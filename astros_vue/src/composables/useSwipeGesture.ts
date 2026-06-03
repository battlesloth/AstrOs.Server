export interface UseSwipeGestureOptions {
  /**
   * Minimum horizontal distance (px) the finger must travel for a swipe to
   * register. Below this threshold the touch is treated as a tap and no
   * callback fires. Default 60.
   */
  horizontalThresholdPx?: number;
  /**
   * Maximum vertical distance (px) the finger may drift during a swipe. Above
   * this the touch is treated as a diagonal scroll attempt and no callback
   * fires. Default 40.
   */
  verticalMaxPx?: number;
  /** Called when a leftward swipe crosses the horizontal threshold. */
  onSwipeLeft?: () => void;
  /** Called when a rightward swipe crosses the horizontal threshold. */
  onSwipeRight?: () => void;
}

export interface UseSwipeGestureReturn {
  onTouchStart: (event: TouchEvent) => void;
  onTouchEnd: (event: TouchEvent) => void;
  onTouchCancel: () => void;
}

// Detects horizontal swipe gestures on a touch surface. The composable
// tracks the start coordinates on touchstart and computes the delta on
// touchend; anything beyond `horizontalThresholdPx` AND under
// `verticalMaxPx` counts as a swipe.
//
// Multi-touch guard: if a second finger lands while a single-finger gesture
// is in progress, the start coords are cleared so the eventual touchend
// doesn't evaluate a delta from the first-finger start to the second-finger
// end (which would fire spurious swipes on two-handed grips).
//
// preventDefault on swipe-detected touchend suppresses the synthesized click
// that follows on mobile browsers, so a drag that crosses an interactive
// child element doesn't also trigger that child's click handler.
export function useSwipeGesture(options: UseSwipeGestureOptions = {}): UseSwipeGestureReturn {
  const { horizontalThresholdPx = 60, verticalMaxPx = 40, onSwipeLeft, onSwipeRight } = options;

  let startX: number | null = null;
  let startY: number | null = null;

  function onTouchStart(event: TouchEvent) {
    if (event.touches.length !== 1) {
      // A second finger landed mid-gesture — abort any in-progress swipe so
      // the eventual touchend doesn't evaluate a delta from the first-finger
      // start to the second-finger end.
      startX = null;
      startY = null;
      return;
    }
    const touch = event.touches[0];
    if (!touch) return;
    startX = touch.clientX;
    startY = touch.clientY;
  }

  function onTouchEnd(event: TouchEvent) {
    if (startX === null || startY === null) return;
    const touch = event.changedTouches[0];
    if (!touch) return;
    const deltaX = touch.clientX - startX;
    const deltaY = touch.clientY - startY;
    startX = null;
    startY = null;

    if (Math.abs(deltaX) < horizontalThresholdPx) return;
    if (Math.abs(deltaY) > verticalMaxPx) return;

    event.preventDefault();
    if (deltaX < 0) onSwipeLeft?.();
    else onSwipeRight?.();
  }

  function onTouchCancel() {
    startX = null;
    startY = null;
  }

  return { onTouchStart, onTouchEnd, onTouchCancel };
}
