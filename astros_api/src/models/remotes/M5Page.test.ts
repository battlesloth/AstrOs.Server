import { describe, it, expect } from 'vitest';
import { M5Page, PageButton } from './M5Page.js';

describe('M5Page', () => {
  describe('constructor', () => {
    it('assigns a UUID-shaped id when none is supplied', () => {
      const page = new M5Page();
      expect(page.id).toMatch(/^[0-9a-f-]{8,}$/i);
    });

    it('respects an explicit id and name', () => {
      const page = new M5Page('explicit-id', 'Quick Actions');
      expect(page.id).toBe('explicit-id');
      expect(page.name).toBe('Quick Actions');
    });

    it('defaults all 9 buttons to id "0"', () => {
      const page = new M5Page();
      for (let n = 1; n <= 9; n++) {
        const btn = page[`button${n}` as keyof M5Page] as PageButton;
        expect(btn.id).toBe('0');
      }
    });
  });

  describe('hasSettings()', () => {
    it('returns false for a default page even when id and name are populated strings — vacuous-fix guard for the old `for...in this` reflection bug, which would treat id/name as PageButtons and report true', () => {
      const page = new M5Page('populated-uuid-string', 'Quick Actions');
      expect(page.hasSettings()).toBe(false);
    });

    it('returns true when any one button is assigned', () => {
      const page = new M5Page();
      page.button5 = new PageButton('script-id-3', 'Wave');
      expect(page.hasSettings()).toBe(true);
    });

    it('returns true for button1 alone (first slot)', () => {
      const page = new M5Page();
      page.button1 = new PageButton('script-id-1', 'Beep');
      expect(page.hasSettings()).toBe(true);
    });

    it('returns true for button9 alone (last slot)', () => {
      const page = new M5Page();
      page.button9 = new PageButton('playlist-id-2', 'Songs');
      expect(page.hasSettings()).toBe(true);
    });
  });
});
