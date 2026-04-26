import { Kysely, Migration, sql } from 'kysely';
import { Database } from 'src/dal/types.js';
import { logger } from 'src/logger.js';

// Adds foreign-key constraints across the schema. Per-table procedure:
//   1. Delete orphans (already done in a single up-front block below)
//   2. CREATE TABLE <table>_new with FK constraints
//   3. INSERT INTO <table>_new SELECT * FROM <table>
//   4. DROP TABLE <table>
//   5. ALTER TABLE <table>_new RENAME TO <table>
//
// FK enforcement is OFF during this migration (set by initializeDatabase
// in dal/database.ts) so the DROP/RENAME doesn't trip the existing playlist
// FK from migration_3 or RESTRICT-itself when controllers are dropped.
//
// `down` throws — recovery is via Phase 1 backup-restore. See plan
// `.docs/plans/20260410-0807-db-safety-phase2-schema-migrations.md`.

async function logOrphanDeletion(
  db: Kysely<Database>,
  description: string,
  query: ReturnType<typeof sql>,
): Promise<void> {
  const result = await query.execute(db);
  // SQLite returns the affected row count via the driver; better-sqlite3 wraps
  // it as `numAffectedRows` on the Kysely raw-sql result.
  const count = result.numAffectedRows ?? BigInt(0);
  if (count > 0) {
    logger.warn(`migration_6: deleted ${count} orphan rows from ${description}`);
  }
}

async function renameDanceCopyAndSwap(db: Kysely<Database>, tableName: string): Promise<void> {
  await sql`INSERT INTO ${sql.raw(`${tableName}_new`)} SELECT * FROM ${sql.raw(tableName)}`.execute(
    db,
  );
  await sql`DROP TABLE ${sql.raw(tableName)}`.execute(db);
  await sql`ALTER TABLE ${sql.raw(`${tableName}_new`)} RENAME TO ${sql.raw(tableName)}`.execute(db);
}

export const migration_6: Migration = {
  up: async (db: Kysely<Database>): Promise<void> => {
    // ---- 1. Orphan cleanup (parent → child order so dependent orphans get caught) ----

    await logOrphanDeletion(
      db,
      'script_channels (script_id missing)',
      sql`DELETE FROM script_channels WHERE script_id NOT IN (SELECT id FROM scripts)`,
    );
    await logOrphanDeletion(
      db,
      'script_events (script_id missing)',
      sql`DELETE FROM script_events WHERE script_id NOT IN (SELECT id FROM scripts)`,
    );
    await logOrphanDeletion(
      db,
      'script_events (script_channel_id missing)',
      sql`DELETE FROM script_events WHERE script_channel_id NOT IN (SELECT id FROM script_channels)`,
    );
    await logOrphanDeletion(
      db,
      'script_deployments (script_id missing)',
      sql`DELETE FROM script_deployments WHERE script_id NOT IN (SELECT id FROM scripts)`,
    );
    await logOrphanDeletion(
      db,
      'script_deployments (location_id missing)',
      sql`DELETE FROM script_deployments WHERE location_id NOT IN (SELECT id FROM locations)`,
    );
    await logOrphanDeletion(
      db,
      'controller_locations (location_id missing)',
      sql`DELETE FROM controller_locations WHERE location_id NOT IN (SELECT id FROM locations)`,
    );
    await logOrphanDeletion(
      db,
      'controller_locations (controller_id missing)',
      sql`DELETE FROM controller_locations WHERE controller_id NOT IN (SELECT id FROM controllers)`,
    );
    await logOrphanDeletion(
      db,
      'gpio_channels (location_id missing)',
      sql`DELETE FROM gpio_channels WHERE location_id NOT IN (SELECT id FROM locations)`,
    );
    await logOrphanDeletion(
      db,
      'i2c_modules (location_id missing)',
      sql`DELETE FROM i2c_modules WHERE location_id NOT IN (SELECT id FROM locations)`,
    );
    await logOrphanDeletion(
      db,
      'uart_modules (location_id missing)',
      sql`DELETE FROM uart_modules WHERE location_id NOT IN (SELECT id FROM locations)`,
    );
    await logOrphanDeletion(
      db,
      'maestro_boards (parent_id missing)',
      sql`DELETE FROM maestro_boards WHERE parent_id NOT IN (SELECT id FROM uart_modules)`,
    );
    await logOrphanDeletion(
      db,
      'maestro_channels (board_id missing)',
      sql`DELETE FROM maestro_channels WHERE board_id NOT IN (SELECT id FROM maestro_boards)`,
    );
    await logOrphanDeletion(
      db,
      'kangaroo_x2 (parent_id missing)',
      sql`DELETE FROM kangaroo_x2 WHERE parent_id NOT IN (SELECT id FROM uart_modules)`,
    );

    // ---- 2. Rename-dance per table, adding FK constraints ----

    // controller_locations: location_id RESTRICT, controller_id RESTRICT
    await db.schema
      .createTable('controller_locations_new')
      .addColumn('location_id', 'text', (col) => col.notNull())
      .addColumn('controller_id', 'text', (col) => col.notNull())
      .addForeignKeyConstraint(
        'fk_controller_locations_location_id',
        ['location_id'],
        'locations',
        ['id'],
        (b) => b.onDelete('restrict'),
      )
      .addForeignKeyConstraint(
        'fk_controller_locations_controller_id',
        ['controller_id'],
        'controllers',
        ['id'],
        (b) => b.onDelete('restrict'),
      )
      .execute();
    await renameDanceCopyAndSwap(db, 'controller_locations');

    // script_channels: script_id CASCADE
    await db.schema
      .createTable('script_channels_new')
      .addColumn('id', 'text', (col) => col.primaryKey())
      .addColumn('script_id', 'text', (col) => col.notNull())
      .addColumn('channel_type', 'integer', (col) => col.notNull())
      .addColumn('parent_module_id', 'text', (col) => col.notNull())
      .addColumn('module_channel_id', 'text', (col) => col.notNull())
      .addColumn('module_channel_type', 'text', (col) => col.notNull())
      .addForeignKeyConstraint(
        'fk_script_channels_script_id',
        ['script_id'],
        'scripts',
        ['id'],
        (b) => b.onDelete('cascade'),
      )
      .execute();
    await renameDanceCopyAndSwap(db, 'script_channels');

    // script_events: script_id CASCADE, script_channel_id CASCADE
    // (post-migration_1 shape: id varchar(36) PK, data varchar(255))
    await db.schema
      .createTable('script_events_new')
      .addColumn('id', 'varchar(36)', (col) => col.primaryKey())
      .addColumn('script_id', 'varchar(36)', (col) => col.notNull())
      .addColumn('script_channel_id', 'varchar(36)', (col) => col.notNull())
      .addColumn('module_type', 'integer', (col) => col.notNull())
      .addColumn('module_sub_type', 'integer', (col) => col.notNull())
      .addColumn('time', 'integer', (col) => col.notNull())
      .addColumn('data', 'varchar(255)', (col) => col.notNull())
      .addForeignKeyConstraint(
        'fk_script_events_script_id',
        ['script_id'],
        'scripts',
        ['id'],
        (b) => b.onDelete('cascade'),
      )
      .addForeignKeyConstraint(
        'fk_script_events_script_channel_id',
        ['script_channel_id'],
        'script_channels',
        ['id'],
        (b) => b.onDelete('cascade'),
      )
      .execute();
    await renameDanceCopyAndSwap(db, 'script_events');

    // script_deployments: script_id CASCADE, location_id CASCADE
    await db.schema
      .createTable('script_deployments_new')
      .addColumn('script_id', 'text', (col) => col.notNull())
      .addColumn('location_id', 'text', (col) => col.notNull())
      .addColumn('last_deployed', 'integer', (col) => col.notNull())
      .addPrimaryKeyConstraint('script_deployments_pk', ['script_id', 'location_id'])
      .addForeignKeyConstraint(
        'fk_script_deployments_script_id',
        ['script_id'],
        'scripts',
        ['id'],
        (b) => b.onDelete('cascade'),
      )
      .addForeignKeyConstraint(
        'fk_script_deployments_location_id',
        ['location_id'],
        'locations',
        ['id'],
        (b) => b.onDelete('cascade'),
      )
      .execute();
    await renameDanceCopyAndSwap(db, 'script_deployments');

    // gpio_channels: location_id CASCADE
    await db.schema
      .createTable('gpio_channels_new')
      .addColumn('id', 'text', (col) => col.primaryKey())
      .addColumn('location_id', 'text', (col) => col.notNull())
      .addColumn('channel_number', 'integer', (col) => col.notNull())
      .addColumn('name', 'text', (col) => col.notNull())
      .addColumn('default_high', 'integer', (col) => col.notNull())
      .addColumn('enabled', 'integer', (col) => col.notNull())
      .addForeignKeyConstraint(
        'fk_gpio_channels_location_id',
        ['location_id'],
        'locations',
        ['id'],
        (b) => b.onDelete('cascade'),
      )
      .execute();
    await renameDanceCopyAndSwap(db, 'gpio_channels');

    // i2c_modules: location_id CASCADE
    await db.schema
      .createTable('i2c_modules_new')
      .addColumn('idx', 'integer', (col) => col.primaryKey().autoIncrement())
      .addColumn('id', 'text', (col) => col.notNull().unique())
      .addColumn('location_id', 'text', (col) => col.notNull())
      .addColumn('name', 'text', (col) => col.notNull())
      .addColumn('i2c_address', 'integer', (col) => col.notNull())
      .addColumn('i2c_type', 'integer', (col) => col.notNull())
      .addForeignKeyConstraint(
        'fk_i2c_modules_location_id',
        ['location_id'],
        'locations',
        ['id'],
        (b) => b.onDelete('cascade'),
      )
      .execute();
    await renameDanceCopyAndSwap(db, 'i2c_modules');

    // uart_modules: location_id CASCADE
    await db.schema
      .createTable('uart_modules_new')
      .addColumn('idx', 'integer', (col) => col.primaryKey().autoIncrement())
      .addColumn('id', 'text', (col) => col.notNull().unique())
      .addColumn('location_id', 'text', (col) => col.notNull())
      .addColumn('name', 'text', (col) => col.notNull())
      .addColumn('uart_type', 'integer', (col) => col.notNull())
      .addColumn('uart_channel', 'integer', (col) => col.notNull())
      .addColumn('baud_rate', 'integer', (col) => col.notNull())
      .addForeignKeyConstraint(
        'fk_uart_modules_location_id',
        ['location_id'],
        'locations',
        ['id'],
        (b) => b.onDelete('cascade'),
      )
      .execute();
    await renameDanceCopyAndSwap(db, 'uart_modules');

    // kangaroo_x2: parent_id CASCADE
    await db.schema
      .createTable('kangaroo_x2_new')
      .addColumn('id', 'text', (col) => col.primaryKey())
      .addColumn('parent_id', 'text', (col) => col.notNull().unique())
      .addColumn('ch1_name', 'text', (col) => col.notNull())
      .addColumn('ch2_name', 'text', (col) => col.notNull())
      .addForeignKeyConstraint(
        'fk_kangaroo_x2_parent_id',
        ['parent_id'],
        'uart_modules',
        ['id'],
        (b) => b.onDelete('cascade'),
      )
      .execute();
    await renameDanceCopyAndSwap(db, 'kangaroo_x2');

    // maestro_boards: parent_id CASCADE
    await db.schema
      .createTable('maestro_boards_new')
      .addColumn('id', 'text', (col) => col.primaryKey())
      .addColumn('parent_id', 'text', (col) => col.notNull())
      .addColumn('board_id', 'integer', (col) => col.notNull())
      .addColumn('name', 'text', (col) => col.notNull())
      .addColumn('channel_count', 'integer', (col) => col.notNull())
      .addForeignKeyConstraint(
        'fk_maestro_boards_parent_id',
        ['parent_id'],
        'uart_modules',
        ['id'],
        (b) => b.onDelete('cascade'),
      )
      .execute();
    await renameDanceCopyAndSwap(db, 'maestro_boards');

    // maestro_channels: board_id CASCADE
    await db.schema
      .createTable('maestro_channels_new')
      .addColumn('id', 'text', (col) => col.primaryKey())
      .addColumn('board_id', 'text', (col) => col.notNull())
      .addColumn('channel_number', 'integer', (col) => col.notNull())
      .addColumn('name', 'text', (col) => col.notNull())
      .addColumn('enabled', 'integer', (col) => col.notNull().defaultTo(0))
      .addColumn('is_servo', 'integer', (col) => col.notNull().defaultTo(1))
      .addColumn('min_pos', 'integer', (col) => col.notNull().defaultTo(500))
      .addColumn('max_pos', 'integer', (col) => col.notNull().defaultTo(2500))
      .addColumn('home_pos', 'integer', (col) => col.notNull().defaultTo(1250))
      .addColumn('inverted', 'integer', (col) => col.notNull().defaultTo(0))
      .addForeignKeyConstraint(
        'fk_maestro_channels_board_id',
        ['board_id'],
        'maestro_boards',
        ['id'],
        (b) => b.onDelete('cascade'),
      )
      .execute();
    await renameDanceCopyAndSwap(db, 'maestro_channels');
  },
  down: async (): Promise<void> => {
    throw new Error('Recovery is via Phase 1 backup-restore; no manual down');
  },
};
