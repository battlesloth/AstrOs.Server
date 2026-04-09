import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import SQLite from 'better-sqlite3';
import { Kysely, SqliteDialect } from 'kysely';
import { Database } from '../types.js';
import { migrateToLatest } from '../database.js';
import { RemoteConfigRepository } from './remote_config_repository.js';

describe('RemoteConfigRepository', () => {
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

  it('should save and retrieve a config', async () => {
    const repo = new RemoteConfigRepository(db);

    await repo.saveConfig('m5stick', '{"buttons":[]}');
    const result = await repo.getConfig('m5stick');

    expect(result).toBeDefined();
    expect(result!.type).toBe('m5stick');
    expect(result!.value).toBe('{"buttons":[]}');
  });

  it('should update an existing config', async () => {
    const repo = new RemoteConfigRepository(db);

    await repo.saveConfig('m5stick', '{"buttons":[]}');
    await repo.saveConfig('m5stick', '{"buttons":["A"]}');
    const result = await repo.getConfig('m5stick');

    expect(result!.value).toBe('{"buttons":["A"]}');
  });

  it('should return undefined for missing config', async () => {
    const repo = new RemoteConfigRepository(db);

    const result = await repo.getConfig('nonexistent');

    expect(result).toBeUndefined();
  });
});
