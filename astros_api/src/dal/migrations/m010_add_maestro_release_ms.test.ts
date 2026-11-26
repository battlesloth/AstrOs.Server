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
  migration_m010,
} from './index.js';

const v9Migrations: Record<string, Migration> = {
  '0_initial': migration_0,
  '1_add_script_evt_id': migration_1,
  '2_add_script_duration': migration_2,
  '3_add_playlists': migration_3,
  '4_add_random_wait': migration_4,
  '5_fix_controller_locations_type': migration_5,
  '6_add_foreign_keys': migration_6,
  '7_rename_remote_config_key': migration_7,
  '8_fix_script_duration_units': migration_8,
  '9_add_script_event_end_time': migration_9,
};

const v9Provider: MigrationProvider = new (class implements MigrationProvider {
  async getMigrations(): Promise<Record<string, Migration>> {
    return v9Migrations;
  }
})();

const m010Provider: MigrationProvider = new (class implements MigrationProvider {
  async getMigrations(): Promise<Record<string, Migration>> {
    return { ...v9Migrations, m010_add_maestro_release_ms: migration_m010 };
  }
})();

interface ColumnInfo {
  name: string;
  type: string;
  notnull: number;
  dflt_value: unknown;
}

describe('m010_add_maestro_release_ms: add maestro_channels.release_ms', () => {
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

  function releaseMsColumn(): ColumnInfo | undefined {
    const columns = raw.pragma("table_info('maestro_channels')") as ColumnInfo[];
    return columns.find((c) => c.name === 'release_ms');
  }

  // A board on the seeded body location, so the channel rows satisfy the
  // maestro_channels → maestro_boards → uart_modules → locations FKs.
  function seedBoard(): string {
    const location = raw.prepare("SELECT id FROM locations WHERE name = 'body'").get() as {
      id: string;
    };
    raw
      .prepare(
        `INSERT INTO uart_modules (id, location_id, name, uart_type, uart_channel, baud_rate)
         VALUES ('uart-1', ?, 'Maestro', 4, 1, 115200)`,
      )
      .run(location.id);
    raw
      .prepare(
        `INSERT INTO maestro_boards (id, parent_id, board_id, name, channel_count)
         VALUES ('board-1', 'uart-1', 0, 'Board 1', 24)`,
      )
      .run();
    return 'board-1';
  }

  // Raw SQL, so the insert names exactly the v9 columns.
  function insertV9Channel(id: string, channelNumber: number): void {
    raw
      .prepare(
        `INSERT INTO maestro_channels
           (id, board_id, channel_number, name, enabled, is_servo, min_pos, max_pos, home_pos, inverted)
         VALUES (?, 'board-1', ?, ?, 1, 1, 600, 2400, 1500, 0)`,
      )
      .run(id, channelNumber, `ch ${channelNumber}`);
  }

  it('runs right after 9_add_script_event_end_time on a fresh database', async () => {
    await migrateToLatest(db);

    expect(releaseMsColumn()).toBeDefined();
    // kysely_migration's rowid order is the order Kysely ran them in.
    const ran = (
      raw.prepare('SELECT name FROM kysely_migration ORDER BY rowid').all() as { name: string }[]
    ).map((r) => r.name);
    expect(ran.indexOf('m010_add_maestro_release_ms')).toBe(
      ran.indexOf('9_add_script_event_end_time') + 1,
    );
  });

  it('adds release_ms as INTEGER NOT NULL DEFAULT 5000', async () => {
    await migrateWith(v9Provider);
    expect(releaseMsColumn()).toBeUndefined();

    await migrateWith(m010Provider);

    expect(releaseMsColumn()).toMatchObject({ type: 'INTEGER', notnull: 1, dflt_value: '5000' });
  });

  it('existing rows read 5000, with their other columns unchanged', async () => {
    await migrateWith(v9Provider);
    seedBoard();
    insertV9Channel('ch-old', 3);

    await migrateWith(m010Provider);

    expect(raw.prepare('SELECT * FROM maestro_channels WHERE id = ?').get('ch-old')).toEqual({
      id: 'ch-old',
      board_id: 'board-1',
      channel_number: 3,
      name: 'ch 3',
      enabled: 1,
      is_servo: 1,
      min_pos: 600,
      max_pos: 2400,
      home_pos: 1500,
      inverted: 0,
      release_ms: 5000,
    });
  });

  it('an insert that leaves out release_ms gets 5000', async () => {
    await migrateWith(m010Provider);
    seedBoard();

    insertV9Channel('ch-new', 7);

    expect(
      raw.prepare('SELECT release_ms FROM maestro_channels WHERE id = ?').get('ch-new'),
    ).toEqual({ release_ms: 5000 });
  });

  // Kysely runs SQLite migrations without a transaction, so a crash can land
  // between the ALTER and the migration record. An upgrade's next boot
  // restores the backup first (T-016), but a fresh install has none, so its
  // next boot runs up again on a table that already has the column.
  it('up is a no-op when release_ms already exists but the migration is unrecorded', async () => {
    await migrateWith(v9Provider);
    seedBoard();
    insertV9Channel('ch-crash', 1);
    raw.exec('ALTER TABLE maestro_channels ADD COLUMN release_ms integer not null default 5000');
    raw.prepare("UPDATE maestro_channels SET release_ms = 7000 WHERE id = 'ch-crash'").run();

    await migrateWith(m010Provider);

    expect(
      raw.prepare('SELECT release_ms FROM maestro_channels WHERE id = ?').get('ch-crash'),
    ).toEqual({ release_ms: 7000 });
    const applied = raw.prepare('SELECT name FROM kysely_migration').all() as { name: string }[];
    expect(applied.map((r) => r.name)).toContain('m010_add_maestro_release_ms');
  });

  it('down drops release_ms and keeps the rest of the row', async () => {
    await migrateWith(v9Provider);
    seedBoard();
    insertV9Channel('ch-down', 2);
    await migrateWith(m010Provider);
    expect(releaseMsColumn()).toBeDefined();

    const result = await new Migrator({ db, provider: m010Provider }).migrateDown();
    expect(result.error).toBeUndefined();
    expect(result.results).toEqual([
      expect.objectContaining({ migrationName: 'm010_add_maestro_release_ms', status: 'Success' }),
    ]);

    expect(releaseMsColumn()).toBeUndefined();
    expect(
      raw
        .prepare('SELECT channel_number, min_pos, home_pos FROM maestro_channels WHERE id = ?')
        .get('ch-down'),
    ).toEqual({ channel_number: 2, min_pos: 600, home_pos: 1500 });
  });
});
