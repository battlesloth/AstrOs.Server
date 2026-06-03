import type { RouteLocationNormalized } from 'vue-router';
import { isMobileClient } from '@/utils/isMobileClient';

/**
 * Decide where an authenticated, non-`/auth` navigation should land based on
 * client form factor. Mobile clients are pinned to the chrome-less `/mobile`
 * view and confined to it; desktop clients are kept off it. Returns the path to
 * redirect to, or `null` to proceed as-is.
 *
 * Returning `/mobile` re-enters the guard where this returns `null` (mobile +
 * already on `/mobile`), so there is no redirect loop.
 */
export function mobileRouteRedirect(to: Pick<RouteLocationNormalized, 'path'>): string | null {
  const mobile = isMobileClient();
  if (mobile && to.path !== '/mobile') return '/mobile';
  if (!mobile && to.path === '/mobile') return '/';
  return null;
}
