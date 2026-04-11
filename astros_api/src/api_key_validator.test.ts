import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import SQLite from 'better-sqlite3';
import { Kysely, SqliteDialect } from 'kysely';
import { Database } from './dal/types.js';
import { migrateToLatest } from './dal/database.js';
import { SettingsRepository } from './dal/repositories/settings_repository.js';
import { ApiKeyValidator } from './api_key_validator.js';

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.sendStatus = vi.fn().mockReturnValue(res);
  return res;
}

describe('ApiKeyValidator', () => {
  let db: Kysely<Database>;

  beforeEach(async () => {
    db = new Kysely<Database>({
      dialect: new SqliteDialect({ database: new SQLite(':memory:') }),
    });
    await migrateToLatest(db);
  });

  afterEach(async () => {
    await db.destroy();
  });

  it('should call next() for valid token', async () => {
    const settings = new SettingsRepository(db);
    await settings.saveSetting('apikey', 'secret-token-123');

    const validator = ApiKeyValidator(db);
    const req: any = { headers: { 'x-token': 'secret-token-123' } };
    const res = mockRes();
    const next = vi.fn();

    await validator(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.sendStatus).not.toHaveBeenCalled();
  });

  it('should return 401 when x-token header is missing', async () => {
    const settings = new SettingsRepository(db);
    await settings.saveSetting('apikey', 'secret-token-123');

    const validator = ApiKeyValidator(db);
    const req: any = { headers: {} };
    const res = mockRes();
    const next = vi.fn();

    await validator(req, res, next);

    expect(res.sendStatus).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 401 when token does not match', async () => {
    const settings = new SettingsRepository(db);
    await settings.saveSetting('apikey', 'secret-token-123');

    const validator = ApiKeyValidator(db);
    const req: any = { headers: { 'x-token': 'wrong-token' } };
    const res = mockRes();
    const next = vi.fn();

    await validator(req, res, next);

    expect(res.sendStatus).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 500 when apikey setting does not exist', async () => {
    // No apikey saved — getSetting will throw
    const validator = ApiKeyValidator(db);
    const req: any = { headers: { 'x-token': 'anything' } };
    const res = mockRes();
    const next = vi.fn();

    await validator(req, res, next);

    expect(res.sendStatus).toHaveBeenCalledWith(500);
    expect(next).not.toHaveBeenCalled();
  });

  it('should cache the apikey between requests', async () => {
    const settings = new SettingsRepository(db);
    await settings.saveSetting('apikey', 'secret-token-123');

    const spy = vi.spyOn(SettingsRepository.prototype, 'getSetting');
    const validator = ApiKeyValidator(db);

    const req: any = { headers: { 'x-token': 'secret-token-123' } };

    // First call — should hit DB
    await validator(req, mockRes(), vi.fn());
    // Second call — should use cache
    await validator(req, mockRes(), vi.fn());
    // Third call — still cached
    await validator(req, mockRes(), vi.fn());

    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it('should retry DB lookup after a fetch failure clears the cache', async () => {
    // No apikey initially — first call will fail and reset cache
    const validator = ApiKeyValidator(db);
    const req: any = { headers: { 'x-token': 'secret-token-123' } };

    await validator(req, mockRes(), vi.fn()); // fails, cache cleared

    // Now save the key and verify the next call refetches
    const settings = new SettingsRepository(db);
    await settings.saveSetting('apikey', 'secret-token-123');

    const res = mockRes();
    const next = vi.fn();
    await validator(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.sendStatus).not.toHaveBeenCalled();
  });
});
