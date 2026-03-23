import { describe, expect, it } from 'vitest';
import { generateShortId } from '@/utils/shortId';

describe('Utility functions', () => {
  it('should generate a short ID with the correct format', () => {
    const prefix = 's';
    const shortId = generateShortId(prefix);
    expect(shortId).toMatch(/^s[0-9]{7}[A-Za-z]{3}$/);
  });
});
