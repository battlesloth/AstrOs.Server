import { describe, expect, it } from 'vitest';
import { isMobileClient } from '@/utils/isMobileClient';

const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const DESKTOP_UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

describe('isMobileClient', () => {
  it('is mobile for a phone user-agent even on a wide viewport', () => {
    expect(isMobileClient(IPHONE_UA, 1440)).toBe(true);
  });

  it('is mobile for a desktop user-agent on a narrow viewport', () => {
    expect(isMobileClient(DESKTOP_UA, 500)).toBe(true);
  });

  it('is not mobile for a desktop user-agent on a wide viewport', () => {
    expect(isMobileClient(DESKTOP_UA, 1024)).toBe(false);
  });

  it('uses < 768 as the width breakpoint (768 is desktop, 767 is mobile)', () => {
    expect(isMobileClient(DESKTOP_UA, 768)).toBe(false);
    expect(isMobileClient(DESKTOP_UA, 767)).toBe(true);
  });
});
