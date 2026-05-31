import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/utils/isMobileClient', () => ({
  isMobileClient: vi.fn(),
}));

import { mobileRouteRedirect } from '../mobileRouteRedirect';
import { isMobileClient } from '@/utils/isMobileClient';

const mockIsMobile = isMobileClient as ReturnType<typeof vi.fn>;

describe('mobileRouteRedirect', () => {
  beforeEach(() => mockIsMobile.mockReset());

  it('sends a mobile client off a desktop route to /mobile', () => {
    mockIsMobile.mockReturnValue(true);
    expect(mobileRouteRedirect({ path: '/scripts' })).toBe('/mobile');
    expect(mobileRouteRedirect({ path: '/' })).toBe('/mobile');
  });

  it('leaves a mobile client already on /mobile alone (no redirect loop)', () => {
    mockIsMobile.mockReturnValue(true);
    expect(mobileRouteRedirect({ path: '/mobile' })).toBeNull();
  });

  it('lets a desktop client proceed on desktop routes', () => {
    mockIsMobile.mockReturnValue(false);
    expect(mobileRouteRedirect({ path: '/scripts' })).toBeNull();
    expect(mobileRouteRedirect({ path: '/' })).toBeNull();
  });

  it('redirects a desktop client off /mobile to /', () => {
    mockIsMobile.mockReturnValue(false);
    expect(mobileRouteRedirect({ path: '/mobile' })).toBe('/');
  });
});
