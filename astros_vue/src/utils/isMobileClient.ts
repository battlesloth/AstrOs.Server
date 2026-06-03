// Tailwind's `md` breakpoint — below this the desktop layout is too cramped,
// so we treat the client as mobile and route it to the dedicated mobile view.
const MOBILE_MAX_WIDTH = 768;

// Common mobile/tablet UA tokens. The `Mobile` token catches most modern
// phones; the device names cover the rest. This is intentionally a coarse
// signal — the width check below is the robust fallback for anything missed.
const MOBILE_UA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i;

/**
 * True when the client should get the mobile remote view: either the browser
 * reports a mobile/tablet user-agent OR the viewport is narrower than the
 * desktop breakpoint. Args default to the live `navigator`/`window` values and
 * are injectable for testing.
 */
export function isMobileClient(
  userAgent: string = navigator.userAgent,
  innerWidth: number = window.innerWidth,
): boolean {
  return MOBILE_UA.test(userAgent) || innerWidth < MOBILE_MAX_WIDTH;
}
