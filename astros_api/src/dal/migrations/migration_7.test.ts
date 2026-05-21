import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Kysely, Migration, MigrationProvider, Migrator } from 'kysely';
import { Database } from '../types.js';
import { createKyselyConnection } from '../database.js';
import {
  migration_0,
  migration_1,
  migration_2,
  migration_3,
  migration_4,
  migration_5,
  migration_6,
  migration_7,
} from './index.js';

const v6Provider: MigrationProvider = new (class implements MigrationProvider {
  async getMigrations(): Promise<Record<string, Migration>> {
    return {
      '0_initial': migration_0,
      '1_add_script_evt_id': migration_1,
      '2_add_script_duration': migration_2,
      '3_add_playlists': migration_3,
      '4_add_random_wait': migration_4,
      '5_fix_controller_locations_type': migration_5,
      '6_add_foreign_keys': migration_6,
    };
  }
})();

const v7Provider: MigrationProvider = new (class implements MigrationProvider {
  async getMigrations(): Promise<Record<string, Migration>> {
    return {
      '0_initial': migration_0,
      '1_add_script_evt_id': migration_1,
      '2_add_script_duration': migration_2,
      '3_add_playlists': migration_3,
      '4_add_random_wait': migration_4,
      '5_fix_controller_locations_type': migration_5,
      '6_add_foreign_keys': migration_6,
      '7_rename_remote_config_key': migration_7,
    };
  }
})();

describe('migration_7: rename remote_config.type astrOsScreen → remoteConfig', () => {
  let db: Kysely<Database>;
  let raw: ReturnType<typeof createKyselyConnection>['raw'];

  beforeEach(() => {
    const conn = createKyselyConnection();
    db = conn.db;
    raw = conn.raw;
  });

  afterEach(async () => {
    await db.destroy();
  });

  async function applyV6(): Promise<void> {
    const m = new Migrator({ db, provider: v6Provider });
    raw.pragma('foreign_keys = OFF');
    try {
      const result = await m.migrateToLatest();
      expect(result.error).toBeUndefined();
    } finally {
      raw.pragma('foreign_keys = ON');
    }
  }

  async function applyV7(): Promise<void> {
    const m = new Migrator({ db, provider: v7Provider });
    raw.pragma('foreign_keys = OFF');
    try {
      const result = await m.migrateToLatest();
      expect(result.error).toBeUndefined();
    } finally {
      raw.pragma('foreign_keys = ON');
    }
  }

  // Mutate the seeded remoteConfig row back to astrOsScreen to simulate an
  // existing v6 install (whose original migration_0 seeded with the old key).
  async function simulateLegacySeed(value = '{}'): Promise<void> {
    await db
      .updateTable('remote_config')
      .set({ type: 'astrOsScreen', value })
      .where('type', '=', 'remoteConfig')
      .execute();
  }

  it('renames an existing astrOsScreen row to remoteConfig and preserves value', async () => {
    // Vacuous-fix guard: revert migration_7's WHERE clause to a typo
    // (e.g. `WHERE type = 'astroScreen'`) and re-run this test — it MUST
    // fail (the UPDATE would match nothing and the row remains astrOsScreen).
    // If it still passes, the assertion isn't actually exercising the rename.
    await applyV6();
    await simulateLegacySeed('{"pages":[{"id":"abc","name":"Test"}]}');

    await applyV7();

    const rows = await db.selectFrom('remote_config').selectAll().execute();
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe('remoteConfig');
    expect(rows[0].value).toBe('{"pages":[{"id":"abc","name":"Test"}]}');
  });

  it('is a no-op on a fresh install (migration_0 seeds remoteConfig directly)', async () => {
    await applyV6();
    // Skip simulateLegacySeed — fresh-install path: migration_0 has already
    // produced a `remoteConfig` row. Migration_7 should leave it alone.
    const before = await db.selectFrom('remote_config').selectAll().execute();
    expect(before).toHaveLength(1);
    expect(before[0].type).toBe('remoteConfig');

    await applyV7();

    const after = await db.selectFrom('remote_config').selectAll().execute();
    expect(after).toHaveLength(1);
    expect(after[0].type).toBe('remoteConfig');
    expect(after[0].value).toBe(before[0].value);
  });

  it('down reverses the rename back to astrOsScreen and preserves value', async () => {
    await applyV6();
    await simulateLegacySeed('{"k":"v"}');
    await applyV7();

    const m = new Migrator({ db, provider: v7Provider });
    const result = await m.migrateDown();
    expect(result.error).toBeUndefined();
    expect(result.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          migrationName: '7_rename_remote_config_key',
          status: 'Success',
        }),
      ]),
    );

    const rows = await db.selectFrom('remote_config').selectAll().execute();
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe('astrOsScreen');
    expect(rows[0].value).toBe('{"k":"v"}');
  });
});
