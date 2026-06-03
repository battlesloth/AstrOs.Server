import { describe, expect, it } from 'vitest';
import { generateShortId } from './short_id.js';

describe('generateShortId', () => {
  it('generates an ID with the expected prefix + timestamp + 3 alpha chars', () => {
    const prefix = 's';
    const shortId = generateShortId(prefix);
    expect(shortId).toMatch(/^s[0-9]{7}[A-Za-z]{3}$/);
  });
});
