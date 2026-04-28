import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Kysely, Migration, MigrationProvider, Migrator } from 'kysely';
import { Database } from '../types.js';
import { createKyselyConnection } from '../database.js';
import { migration_0, migration_1, migration_2, migration_3, migration_4 } from './index.js';
import { migration_5 } from './migration_5.js';

// Provider that stops at v4 — used to bring the DB to a pre-migration_5 state.
const v4Provider: MigrationProvider = new (class implements MigrationProvider {
  async getMigrations(): Promise<Record<string, Migration>> {
    return {
      '0_initial': migration_0,
      '1_add_script_evt_id': migration_1,
      '2_add_script_duration': migration_2,
      '3_add_playlists': migration_3,
      '4_add_random_wait': migration_4,
    };
  }
})();

const v5Provider: MigrationProvider = new (class implements MigrationProvider {
  async getMigrations(): Promise<Record<string, Migration>> {
    return {
      '0_initial': migration_0,
      '1_add_script_evt_id': migration_1,
      '2_add_script_duration': migration_2,
      '3_add_playlists': migration_3,
      '4_add_random_wait': migration_4,
      '5_fix_controller_locations_type': migration_5,
    };
  }
})();

describe('migration_5: fix controller_locations.controller_id type', () => {
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

  it('preserves controller_locations rows across the type change', async () => {
    // Bring DB to v4
    const v4 = new Migrator({ db, provider: v4Provider });
    const v4Result = await v4.migrateToLatest();
    expect(v4Result.error).toBeUndefined();

    // Insert a controller + controller_locations row at v4
    await db
      .insertInto('controllers')
      .values({
        id: 'ctl-1',
        name: 'pre-v5',
        description: '',
        address: 'AA:BB:CC:DD:EE:99',
      })
      .execute();
    await db
      .insertInto('locations')
      .values({ id: 'loc-1', name: 'L1', description: '', config_fingerprint: '' })
      .execute();
    // Cast: at v4, controller_id is declared `integer`, but we store the UUID
    // string anyway thanks to SQLite's loose typing — the same shape that exists
    // in production today.
    await db
      .insertInto('controller_locations')
      .values({ location_id: 'loc-1', controller_id: 'ctl-1' as unknown as number })
      .execute();

    // Apply migration_5
    const v5 = new Migrator({ db, provider: v5Provider });
    const result = await v5.migrateToLatest();
    expect(result.error).toBeUndefined();

    // Row survives with the same values
    const rows = await db
      .selectFrom('controller_locations')
      .selectAll()
      .where('location_id', '=', 'loc-1')
      .execute();
    expect(rows).toHaveLength(1);
    expect(rows[0].controller_id).toBe('ctl-1');
  });

  it('declares controller_id as TEXT after up', async () => {
    const m = new Migrator({ db, provider: v5Provider });
    const result = await m.migrateToLatest();
    expect(result.error).toBeUndefined();

    const cols = raw.prepare('PRAGMA table_info(controller_locations)').all() as Array<{
      name: string;
      type: string;
    }>;
    const controllerIdCol = cols.find((c) => c.name === 'controller_id');
    expect(controllerIdCol?.type.toUpperCase()).toBe('TEXT');
  });

  it('down throws — recovery is via Phase 1 backup-restore', async () => {
    // Get to v5 first so down has something to revert
    const m = new Migrator({ db, provider: v5Provider });
    await m.migrateToLatest();

    await expect(m.migrateDown()).resolves.toMatchObject({
      results: expect.arrayContaining([
        expect.objectContaining({
          status: 'Error',
          migrationName: '5_fix_controller_locations_type',
        }),
      ]),
    });
  });
});
