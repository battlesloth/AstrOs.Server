import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import SQLite from 'better-sqlite3';
import { Kysely, SqliteDialect } from 'kysely';
import { Database } from '../types.js';
import { migrateToLatest } from '../database.js';
import { SettingsRepository } from './settings_repository.js';

describe('SettingsRepository', () => {
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

  it('should save and retrieve a setting', async () => {
    const repo = new SettingsRepository(db);

    await repo.saveSetting('theme', 'dark');
    const result = await repo.getSetting('theme');

    expect(result).toBe('dark');
  });

  it('should update an existing setting', async () => {
    const repo = new SettingsRepository(db);

    await repo.saveSetting('theme', 'dark');
    await repo.saveSetting('theme', 'light');
    const result = await repo.getSetting('theme');

    expect(result).toBe('light');
  });

  it('should throw when getting a missing setting', async () => {
    const repo = new SettingsRepository(db);

    await expect(repo.getSetting('nonexistent')).rejects.toThrow();
  });
});
