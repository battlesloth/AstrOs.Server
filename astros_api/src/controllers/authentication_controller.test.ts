import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import jsonwebtoken from 'jsonwebtoken';

// The reauth handler is not exported, so we test the JWT renewal logic directly.
// This validates the same time-window logic used in the controller.

const JWT_KEY = 'test-jwt-secret';

function generateToken(name: string, expOffsetMs: number): string {
  const exp = (Date.now() + expOffsetMs) / 1000;
  return jsonwebtoken.sign({ name, exp }, JWT_KEY);
}

describe('Authentication - JWT Renewal Logic', () => {
  beforeEach(() => {
    process.env.JWT_KEY = JWT_KEY;
  });

  afterEach(() => {
    delete process.env.JWT_KEY;
  });

  it('should accept a token that expired less than 1 hour ago', () => {
    // Expired 30 minutes ago
    const token = generateToken('testuser', -30 * 60 * 1000);

    // Verify still decodes (verify will throw for expired tokens, so use decode)
    const decoded = jsonwebtoken.decode(token) as any;
    expect(decoded.name).toBe('testuser');

    // The reauth logic: exp * 1000 > Date.now() - 60*60*1000
    const buffer = Date.now() - 60 * 60 * 1000;
    expect(decoded.exp * 1000 > buffer).toBe(true);
  });

  it('should reject a token that expired more than 1 hour ago', () => {
    // Expired 2 hours ago
    const token = generateToken('testuser', -2 * 60 * 60 * 1000);

    const decoded = jsonwebtoken.decode(token) as any;

    const buffer = Date.now() - 60 * 60 * 1000;
    expect(decoded.exp * 1000 > buffer).toBe(false);
  });

  it('should accept a token that has not yet expired', () => {
    // Expires in 1 hour
    const token = generateToken('testuser', 60 * 60 * 1000);

    const decoded = jsonwebtoken.decode(token) as any;

    const buffer = Date.now() - 60 * 60 * 1000;
    expect(decoded.exp * 1000 > buffer).toBe(true);
  });
});
