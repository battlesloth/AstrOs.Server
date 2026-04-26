import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Kysely, Migration, MigrationProvider, Migrator, sql } from 'kysely';
import { Database } from '../types.js';
import { createKyselyConnection } from '../database.js';
import {
  migration_0,
  migration_1,
  migration_2,
  migration_3,
  migration_4,
  migration_5,
} from './index.js';
import { migration_6 } from './migration_6.js';

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

describe('migration_6: foreign keys + orphan cleanup', () => {
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

  async function applyV5(): Promise<void> {
    const m = new Migrator({ db, provider: v5Provider });
    const result = await m.migrateToLatest();
    expect(result.error).toBeUndefined();
  }

  async function applyV6(): Promise<void> {
    const m = new Migrator({ db, provider: v6Provider });
    // Real production code toggles foreign_keys = OFF before migrate; the
    // helper sets it ON. Match production by toggling here.
    raw.pragma('foreign_keys = OFF');
    try {
      const result = await m.migrateToLatest();
      expect(result.error).toBeUndefined();
    } finally {
      raw.pragma('foreign_keys = ON');
    }
  }

  it('enforces RESTRICT on controller_locations.controller_id', async () => {
    await applyV6();

    // Insert a controller and a controller_locations row pointing at it
    await db
      .insertInto('controllers')
      .values({
        id: 'ctl-r1',
        name: 'restrict-test',
        description: '',
        address: 'AA:00:00:00:00:01',
      })
      .execute();
    await db
      .insertInto('locations')
      .values({ id: 'loc-r1', name: 'rl1', description: '', config_fingerprint: '' })
      .execute();
    await db
      .insertInto('controller_locations')
      .values({ location_id: 'loc-r1', controller_id: 'ctl-r1' })
      .execute();

    // Attempting to delete the controller should be rejected (RESTRICT)
    await expect(db.deleteFrom('controllers').where('id', '=', 'ctl-r1').execute()).rejects.toThrow(
      /FOREIGN KEY constraint failed/,
    );
  });

  it('CASCADEs script_channels and script_events when a script is deleted', async () => {
    await applyV6();

    await db
      .insertInto('scripts')
      .values({
        id: 's-1',
        name: 'cascade-test',
        description: '',
        last_modified: 0,
        enabled: 1,
        duration_ds: 0,
      })
      .execute();
    await db
      .insertInto('script_channels')
      .values({
        id: 'sc-1',
        script_id: 's-1',
        channel_type: 1,
        parent_module_id: 'pm-1',
        module_channel_id: 'mc-1',
        module_channel_type: 'mct',
      })
      .execute();
    await db
      .insertInto('script_events')
      .values({
        id: 'se-1',
        script_id: 's-1',
        script_channel_id: 'sc-1',
        module_type: 1,
        module_sub_type: 1,
        time: 0,
        data: 'd',
      })
      .execute();

    await db.deleteFrom('scripts').where('id', '=', 's-1').execute();

    const channels = await db
      .selectFrom('script_channels')
      .selectAll()
      .where('script_id', '=', 's-1')
      .execute();
    expect(channels).toHaveLength(0);

    const events = await db
      .selectFrom('script_events')
      .selectAll()
      .where('script_id', '=', 's-1')
      .execute();
    expect(events).toHaveLength(0);
  });

  it('rejects orphan inserts for each constrained child table', async () => {
    await applyV6();

    // gpio_channels.location_id → locations.id
    await expect(
      db
        .insertInto('gpio_channels')
        .values({
          id: 'g-orphan',
          location_id: 'nonexistent-loc',
          channel_number: 0,
          name: 'x',
          default_high: 0,
          enabled: 0,
        })
        .execute(),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/);

    // maestro_boards.parent_id → uart_modules.id
    await expect(
      db
        .insertInto('maestro_boards')
        .values({
          id: 'mb-orphan',
          parent_id: 'nonexistent-uart',
          board_id: 0,
          name: 'x',
          channel_count: 0,
        })
        .execute(),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/);

    // kangaroo_x2.parent_id → uart_modules.id
    await expect(
      db
        .insertInto('kangaroo_x2')
        .values({
          id: 'k-orphan',
          parent_id: 'nonexistent-uart-2',
          ch1_name: 'x',
          ch2_name: 'y',
        })
        .execute(),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/);
  });

  it('cleans pre-existing orphans on up', async () => {
    await applyV5();

    // Seed orphans at v5 (before FKs exist). FKs are still ON from the helper,
    // so we toggle them off briefly to insert violators.
    raw.pragma('foreign_keys = OFF');
    try {
      await db
        .insertInto('script_channels')
        .values({
          id: 'orphan-channel',
          script_id: 'no-such-script',
          channel_type: 1,
          parent_module_id: 'pm',
          module_channel_id: 'mc',
          module_channel_type: 'mct',
        })
        .execute();
      await db
        .insertInto('controller_locations')
        .values({ location_id: 'no-such-loc', controller_id: 'no-such-ctl' })
        .execute();
    } finally {
      raw.pragma('foreign_keys = ON');
    }

    await applyV6();

    const orphanChannel = await db
      .selectFrom('script_channels')
      .selectAll()
      .where('id', '=', 'orphan-channel')
      .execute();
    expect(orphanChannel).toHaveLength(0);

    const orphanLink = await db
      .selectFrom('controller_locations')
      .selectAll()
      .where('location_id', '=', 'no-such-loc')
      .execute();
    expect(orphanLink).toHaveLength(0);
  });

  it('preserves non-orphan rows across migration_6', async () => {
    await applyV5();

    await db
      .insertInto('scripts')
      .values({
        id: 's-keep',
        name: 'keep',
        description: '',
        last_modified: 0,
        enabled: 1,
        duration_ds: 0,
      })
      .execute();
    await db
      .insertInto('script_channels')
      .values({
        id: 'sc-keep',
        script_id: 's-keep',
        channel_type: 1,
        parent_module_id: 'pm',
        module_channel_id: 'mc',
        module_channel_type: 'mct',
      })
      .execute();

    await applyV6();

    const survivors = await db
      .selectFrom('script_channels')
      .selectAll()
      .where('id', '=', 'sc-keep')
      .execute();
    expect(survivors).toHaveLength(1);
    expect(survivors[0].script_id).toBe('s-keep');
  });

  it('down throws — recovery is via Phase 1 backup-restore', async () => {
    await applyV6();
    const m = new Migrator({ db, provider: v6Provider });

    await expect(m.migrateDown()).resolves.toMatchObject({
      results: expect.arrayContaining([
        expect.objectContaining({ status: 'Error', migrationName: '6_add_foreign_keys' }),
      ]),
    });
  });

  it('verifies sqlite_master records the FKs after up', async () => {
    await applyV6();

    // Quick sanity: ask sqlite for the FK list on a sample table.
    const fks = raw.prepare('PRAGMA foreign_key_list(controller_locations)').all() as Array<{
      from: string;
      table: string;
      on_delete: string;
    }>;
    const fromCols = fks.map((f) => f.from).sort();
    expect(fromCols).toEqual(['controller_id', 'location_id']);
    fks.forEach((f) => expect(f.on_delete.toUpperCase()).toBe('RESTRICT'));

    const cascadeFks = raw.prepare('PRAGMA foreign_key_list(script_channels)').all() as Array<{
      from: string;
      on_delete: string;
    }>;
    expect(cascadeFks[0].from).toBe('script_id');
    expect(cascadeFks[0].on_delete.toUpperCase()).toBe('CASCADE');

    // Probe the connection works (fresh handle, not destroyed)
    const probe = await sql<{ one: number }>`SELECT 1 AS one`.execute(db);
    expect(probe.rows).toEqual([{ one: 1 }]);
  });

  it('creates indexes on FK columns to avoid full table scans', async () => {
    // Without explicit indexes on FK columns, CASCADE deletes and RESTRICT
    // checks degrade to full child-table scans. Verify all expected indexes
    // exist after migration_6.
    await applyV6();

    const indexNames = (
      raw
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_%' ORDER BY name",
        )
        .all() as Array<{ name: string }>
    ).map((r) => r.name);

    expect(indexNames).toEqual([
      'idx_controller_locations_controller_id',
      'idx_controller_locations_location_id',
      'idx_gpio_channels_location_id',
      'idx_i2c_modules_location_id',
      'idx_maestro_boards_parent_id',
      'idx_maestro_channels_board_id',
      'idx_script_channels_script_id',
      'idx_script_deployments_location_id',
      'idx_script_events_script_channel_id',
      'idx_script_events_script_id',
      'idx_uart_modules_location_id',
    ]);

    // Confirm the planner actually uses one of the new indexes for a
    // representative FK-column lookup (the kind that runs during CASCADE).
    const plan = raw
      .prepare(
        'EXPLAIN QUERY PLAN SELECT 1 FROM script_channels WHERE script_id = ?',
      )
      .all('any') as Array<{ detail: string }>;
    const planText = plan.map((r) => r.detail).join(' ');
    expect(planText).toMatch(/USING (COVERING )?INDEX idx_script_channels_script_id/i);
  });
});
