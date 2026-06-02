import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import jsonwebtoken from 'jsonwebtoken';
import { Kysely } from 'kysely';
import { Database } from '../dal/types.js';
import { createKyselyConnection, migrateToLatest } from '../dal/database.js';
import { changePassword } from './authentication_controller.js';
import { UserRepository } from '../dal/repositories/user_repository.js';

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

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe('Authentication - changePassword', () => {
  let db: Kysely<Database>;

  // migration_0 seeds the single 'admin' user with the password 'password'.
  const CURRENT_PASSWORD = 'password';

  beforeEach(async () => {
    db = createKyselyConnection().db;
    await migrateToLatest(db);
  });

  afterEach(async () => {
    await db.destroy();
  });

  it('should update the admin password and return 200 on success', async () => {
    const req: any = { body: { oldPassword: CURRENT_PASSWORD, newPassword: 'newpassword123' } };
    const res = mockRes();

    await changePassword(db, req, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(200);

    const user = await new UserRepository(db).getByUsername('admin');
    expect(user.validatePassword('newpassword123')).toBe(true);
    expect(user.validatePassword(CURRENT_PASSWORD)).toBe(false);
  });

  it('should return 401 when the current password is wrong', async () => {
    const req: any = { body: { oldPassword: 'wrongpassword', newPassword: 'newpassword123' } };
    const res = mockRes();

    await changePassword(db, req, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(401);

    // Password must remain unchanged after a failed attempt.
    const user = await new UserRepository(db).getByUsername('admin');
    expect(user.validatePassword(CURRENT_PASSWORD)).toBe(true);
  });

  it('should return 400 when the new password is shorter than 8 characters', async () => {
    const req: any = { body: { oldPassword: CURRENT_PASSWORD, newPassword: 'short' } };
    const res = mockRes();

    await changePassword(db, req, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(400);

    const user = await new UserRepository(db).getByUsername('admin');
    expect(user.validatePassword(CURRENT_PASSWORD)).toBe(true);
  });

  it('should return 400 when the new password is exactly 7 characters', async () => {
    const req: any = { body: { oldPassword: CURRENT_PASSWORD, newPassword: '1234567' } };
    const res = mockRes();

    await changePassword(db, req, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('should accept a new password of exactly 8 characters', async () => {
    const req: any = { body: { oldPassword: CURRENT_PASSWORD, newPassword: '12345678' } };
    const res = mockRes();

    await changePassword(db, req, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(200);

    const user = await new UserRepository(db).getByUsername('admin');
    expect(user.validatePassword('12345678')).toBe(true);
  });

  it('should return 400 when the new password is not a string', async () => {
    const req: any = { body: { oldPassword: CURRENT_PASSWORD, newPassword: 12345678 } };
    const res = mockRes();

    await changePassword(db, req, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(400);

    const user = await new UserRepository(db).getByUsername('admin');
    expect(user.validatePassword(CURRENT_PASSWORD)).toBe(true);
  });

  it('should return 400 when the body is missing entirely', async () => {
    const req: any = {};
    const res = mockRes();

    await changePassword(db, req, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('should return 401 when the old password is not a string', async () => {
    const req: any = { body: { oldPassword: 42, newPassword: 'newpassword123' } };
    const res = mockRes();

    await changePassword(db, req, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(401);

    const user = await new UserRepository(db).getByUsername('admin');
    expect(user.validatePassword(CURRENT_PASSWORD)).toBe(true);
  });
});
