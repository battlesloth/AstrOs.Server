import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Kysely, Migration, MigrationProvider, Migrator } from 'kysely';
import { Database } from '../types.js';
import { createKyselyConnection, migrateToLatest } from '../database.js';
import {
  migration_0,
  migration_1,
  migration_2,
  migration_3,
  migration_4,
  migration_5,
  migration_6,
  migration_7,
  migration_8,
  migration_9,
} from './index.js';

const v8Migrations: Record<string, Migration> = {
  '0_initial': migration_0,
  '1_add_script_evt_id': migration_1,
  '2_add_script_duration': migration_2,
  '3_add_playlists': migration_3,
  '4_add_random_wait': migration_4,
  '5_fix_controller_locations_type': migration_5,
  '6_add_foreign_keys': migration_6,
  '7_rename_remote_config_key': migration_7,
  '8_fix_script_duration_units': migration_8,
};

const v8Provider: MigrationProvider = new (class implements MigrationProvider {
  async getMigrations(): Promise<Record<string, Migration>> {
    return v8Migrations;
  }
})();

const v9Provider: MigrationProvider = new (class implements MigrationProvider {
  async getMigrations(): Promise<Record<string, Migration>> {
    return { ...v8Migrations, '9_add_script_event_end_time': migration_9 };
  }
})();

interface ColumnInfo {
  name: string;
  type: string;
  notnull: number;
  dflt_value: unknown;
}

describe('migration_9: add script_events.end_time', () => {
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

  async function migrateWith(provider: MigrationProvider): Promise<void> {
    const m = new Migrator({ db, provider });
    raw.pragma('foreign_keys = OFF');
    try {
      const result = await m.migrateToLatest();
      expect(result.error).toBeUndefined();
    } finally {
      raw.pragma('foreign_keys = ON');
    }
  }

  function endTimeColumn(): ColumnInfo | undefined {
    const columns = raw.pragma("table_info('script_events')") as ColumnInfo[];
    return columns.find((c) => c.name === 'end_time');
  }

  // A v8 point event: script_events.time is stored in deciseconds.
  async function seedPointEvent(id: string, timeDs: number): Promise<void> {
    await db
      .insertInto('scripts')
      .values({
        id,
        name: id,
        description: '',
        last_modified: 0,
        enabled: 1,
        duration_ds: timeDs,
      })
      .execute();
    await db
      .insertInto('script_channels')
      .values({
        id: `${id}-ch`,
        script_id: id,
        channel_type: 1,
        parent_module_id: 'pm-1',
        module_channel_id: 'mc-1',
        module_channel_type: 'mct',
      })
      .execute();
    // Raw SQL, so the insert names exactly the v8 columns.
    raw
      .prepare(
        `INSERT INTO script_events
           (id, script_id, script_channel_id, module_type, module_sub_type, time, data)
         VALUES (?, ?, ?, 3, 301, ?, '{"setHigh":true}')`,
      )
      .run(`${id}-evt`, id, `${id}-ch`, timeDs);
  }

  it('runs as part of the production migration list', async () => {
    await migrateToLatest(db);

    expect(endTimeColumn()).toBeDefined();
  });

  it('adds a nullable end_time column', async () => {
    await migrateWith(v8Provider);
    expect(endTimeColumn()).toBeUndefined();

    await migrateWith(v9Provider);

    expect(endTimeColumn()).toMatchObject({ type: 'INTEGER', notnull: 0, dflt_value: null });
  });

  it('existing rows read end_time NULL', async () => {
    await migrateWith(v8Provider);
    await seedPointEvent('s-point', 55);

    await migrateWith(v9Provider);

    const row = await db
      .selectFrom('script_events')
      .select(['time', 'end_time', 'data'])
      .where('id', '=', 's-point-evt')
      .executeTakeFirstOrThrow();
    expect(row).toEqual({ time: 55, end_time: null, data: '{"setHigh":true}' });
  });

  // Kysely runs SQLite migrations without a transaction, so a crash can land
  // between the ALTER and the migration record. The next boot runs up again.
  it('up is a no-op when end_time already exists but the migration is unrecorded', async () => {
    await migrateWith(v8Provider);
    await seedPointEvent('s-crash', 40);
    raw.exec('ALTER TABLE script_events ADD COLUMN end_time integer');

    await migrateWith(v9Provider);

    expect(endTimeColumn()).toMatchObject({ type: 'INTEGER', notnull: 0 });
    const applied = raw.prepare('SELECT name FROM kysely_migration').all() as { name: string }[];
    expect(applied.map((r) => r.name)).toContain('9_add_script_event_end_time');
  });

  it('down drops end_time', async () => {
    await migrateWith(v8Provider);
    await seedPointEvent('s-down', 30);
    await migrateWith(v9Provider);
    expect(endTimeColumn()).toBeDefined();

    const result = await new Migrator({ db, provider: v9Provider }).migrateDown();
    expect(result.error).toBeUndefined();
    expect(result.results).toEqual([
      expect.objectContaining({ migrationName: '9_add_script_event_end_time', status: 'Success' }),
    ]);

    expect(endTimeColumn()).toBeUndefined();
    // The rest of the row survives the column drop.
    expect(
      raw.prepare('SELECT time, data FROM script_events WHERE id = ?').get('s-down-evt'),
    ).toEqual({ time: 30, data: '{"setHigh":true}' });
  });
});
