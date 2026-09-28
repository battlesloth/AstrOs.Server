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
} from './index.js';

const v7Migrations: Record<string, Migration> = {
  '0_initial': migration_0,
  '1_add_script_evt_id': migration_1,
  '2_add_script_duration': migration_2,
  '3_add_playlists': migration_3,
  '4_add_random_wait': migration_4,
  '5_fix_controller_locations_type': migration_5,
  '6_add_foreign_keys': migration_6,
  '7_rename_remote_config_key': migration_7,
};

const v7Provider: MigrationProvider = new (class implements MigrationProvider {
  async getMigrations(): Promise<Record<string, Migration>> {
    return v7Migrations;
  }
})();

const v8Provider: MigrationProvider = new (class implements MigrationProvider {
  async getMigrations(): Promise<Record<string, Migration>> {
    return { ...v7Migrations, '8_fix_script_duration_units': migration_8 };
  }
})();

describe('migration_8: recompute scripts.duration_ds in deciseconds', () => {
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

  // script_events.time is stored in deciseconds (x10 of the model's seconds).
  async function seedScript(id: string, durationDs: number, eventTimesDs: number[]) {
    await db
      .insertInto('scripts')
      .values({
        id,
        name: id,
        description: '',
        last_modified: 0,
        enabled: 1,
        duration_ds: durationDs,
      })
      .execute();
    if (eventTimesDs.length === 0) return;
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
    for (const [i, time] of eventTimesDs.entries()) {
      await db
        .insertInto('script_events')
        .values({
          id: `${id}-evt-${i}`,
          script_id: id,
          script_channel_id: `${id}-ch`,
          module_type: 1,
          module_sub_type: 1,
          time,
          data: 'd',
        })
        .execute();
    }
  }

  async function durationOf(id: string): Promise<number> {
    const row = await db
      .selectFrom('scripts')
      .select('duration_ds')
      .where('id', '=', id)
      .executeTakeFirstOrThrow();
    return row.duration_ds;
  }

  it('runs as part of the production migration list', async () => {
    await migrateWith(v7Provider);
    await seedScript('s-prod', 4.4, [44]);

    await migrateToLatest(db);

    expect(await durationOf('s-prod')).toBe(44);
  });

  it('replaces a seconds value with the latest event time in deciseconds', async () => {
    await migrateWith(v7Provider);
    // Pre-fix save of a script whose last event is at 4.4 s: events stored
    // 10 and 44 (ds), duration_ds stored 4.4 (seconds, the bug).
    await seedScript('s-seconds', 4.4, [10, 44]);

    await migrateWith(v8Provider);

    expect(await durationOf('s-seconds')).toBe(44);
  });

  it('recomputes a legacy -1 row from its events', async () => {
    await migrateWith(v7Provider);
    // migration_2 default for a script never re-saved since.
    await seedScript('s-legacy', -1, [450, 120]);

    await migrateWith(v8Provider);

    expect(await durationOf('s-legacy')).toBe(450);
  });

  it('sets 0 for a script with no events', async () => {
    await migrateWith(v7Provider);
    await seedScript('s-empty', 3, []);

    await migrateWith(v8Provider);

    expect(await durationOf('s-empty')).toBe(0);
  });

  it('gives each script its own latest event time, not the table-wide max', async () => {
    await migrateWith(v7Provider);
    await seedScript('s-short', 1.2, [12]);
    await seedScript('s-long', 36.2, [5, 362]);

    await migrateWith(v8Provider);

    expect(await durationOf('s-short')).toBe(12);
    expect(await durationOf('s-long')).toBe(362);
  });

  it('is idempotent — re-running up on corrected data changes nothing', async () => {
    await migrateWith(v7Provider);
    await seedScript('s-rerun', 45, [450]);
    await migrateWith(v8Provider);

    // up recomputes from script_events rather than scaling the stored value,
    // so applying it to already-correct data must leave that data alone.
    await migration_8.up(db);

    expect(await durationOf('s-rerun')).toBe(450);
  });

  it('down restores the pre-fix seconds values', async () => {
    await migrateWith(v7Provider);
    await seedScript('s-down', 4.4, [10, 44]);
    await migrateWith(v8Provider);

    const result = await new Migrator({ db, provider: v8Provider }).migrateDown();
    expect(result.error).toBeUndefined();
    expect(result.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          migrationName: '8_fix_script_duration_units',
          status: 'Success',
        }),
      ]),
    );

    expect(await durationOf('s-down')).toBe(4.4);
  });
});
