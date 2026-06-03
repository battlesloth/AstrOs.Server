import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Kysely } from 'kysely';
import { Database } from '../types.js';
import { createKyselyConnection, migrateToLatest } from '../database.js';
import { RemoteConfigRepository } from './remote_config_repository.js';

describe('RemoteConfigRepository', () => {
  let db: Kysely<Database>;

  beforeEach(async () => {
    db = createKyselyConnection().db;
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
    expect(result?.type).toBe('m5stick');
    expect(result?.value).toBe('{"buttons":[]}');
  });

  it('should update an existing config', async () => {
    const repo = new RemoteConfigRepository(db);

    await repo.saveConfig('m5stick', '{"buttons":[]}');
    await repo.saveConfig('m5stick', '{"buttons":["A"]}');
    const result = await repo.getConfig('m5stick');

    expect(result?.value).toBe('{"buttons":["A"]}');
  });

  it('should return undefined for missing config', async () => {
    const repo = new RemoteConfigRepository(db);

    const result = await repo.getConfig('nonexistent');

    expect(result).toBeUndefined();
  });

  it('seeds the remoteConfig row with an empty-array string on a fresh install', async () => {
    // migration_0 seeds value '[]' (a pages array), not the legacy '{}' object.
    // The editor's load path expects an array, so seeding '[]' keeps a fresh
    // install correct at the source rather than relying solely on the
    // read-time normalization in getRemoteConfig.
    const repo = new RemoteConfigRepository(db);

    const result = await repo.getConfig('remoteConfig');

    expect(result?.value).toBe('[]');
  });
});
