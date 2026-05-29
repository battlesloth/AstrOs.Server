import { describe, it, expect } from 'vitest';
import { RemotePage, PageButton } from './RemotePage.js';

describe('RemotePage', () => {
  describe('constructor', () => {
    it('assigns a UUID-shaped id when none is supplied', () => {
      const page = new RemotePage();
      expect(page.id).toMatch(/^[0-9a-f-]{8,}$/i);
    });

    it('respects an explicit id and name', () => {
      const page = new RemotePage('explicit-id', 'Quick Actions');
      expect(page.id).toBe('explicit-id');
      expect(page.name).toBe('Quick Actions');
    });

    it('defaults name to empty string when none is supplied', () => {
      const page = new RemotePage();
      expect(page.name).toBe('');
    });

    it('assigns distinct ids to back-to-back default-constructed pages', () => {
      const a = new RemotePage();
      const b = new RemotePage();
      expect(a.id).not.toBe(b.id);
    });

    it('defaults all 9 buttons to id "0"', () => {
      const page = new RemotePage();
      for (let n = 1; n <= 9; n++) {
        const btn = page[`button${n}` as keyof RemotePage] as PageButton;
        expect(btn.id).toBe('0');
      }
    });
  });

  describe('hasSettings()', () => {
    it('returns false for a default page even when id and name are populated strings', () => {
      // Guards against regressing hasSettings() to the old `for (const key in this)`
      // form, which enumerated id/name alongside the 9 buttons and short-circuited
      // true on the very first iteration (string.id is undefined, undefined != '0'
      // is true). The fixed form iterates an explicit BUTTON_KEYS list.
      // Verified mechanically: reverting the loop to `for...in this` makes this
      // test fail (returns true instead of false).
      const page = new RemotePage('populated-uuid-string', 'Quick Actions');
      expect(page.hasSettings()).toBe(false);
    });

    it('returns true when any one button is assigned', () => {
      const page = new RemotePage();
      page.button5 = new PageButton('script-id-3', 'Wave');
      expect(page.hasSettings()).toBe(true);
    });

    it('returns true for button1 alone (first slot)', () => {
      const page = new RemotePage();
      page.button1 = new PageButton('script-id-1', 'Beep');
      expect(page.hasSettings()).toBe(true);
    });

    it('returns true for button9 alone (last slot)', () => {
      const page = new RemotePage();
      page.button9 = new PageButton('playlist-id-2', 'Songs');
      expect(page.hasSettings()).toBe(true);
    });
  });
});
