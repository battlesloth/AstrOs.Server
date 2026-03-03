import { Kysely, Migration, sql } from 'kysely';
import { Database } from '../types.js';
import { v4 as uuidv4 } from 'uuid';
export const migration_1: Migration = {
  up: async (db: Kysely<Database>): Promise<void> => {
    // Read existing data
    const events = await db.selectFrom('script_events').selectAll().execute();

    // Create new table with id as primary key
    await db.schema
      .createTable('script_events_new')
      .addColumn('id', 'varchar(36)', (col) => col.primaryKey())
      .addColumn('script_id', 'varchar(36)', (col) => col.notNull())
      .addColumn('script_channel_id', 'varchar(36)', (col) => col.notNull())
      .addColumn('module_type', 'integer', (col) => col.notNull())
      .addColumn('module_sub_type', 'integer', (col) => col.notNull())
      .addColumn('time', 'integer', (col) => col.notNull())
      .addColumn('data', 'varchar(255)', (col) => col.notNull())
      .execute();

    // Insert data with new UUIDs
    for (const event of events) {
      await sql`
        INSERT INTO script_events_new (id, script_id, script_channel_id, module_type, module_sub_type, time, data)
        VALUES (${uuidv4()}, ${event.script_id}, ${event.script_channel_id}, ${event.module_type}, ${event.module_sub_type}, ${event.time}, ${event.data})
      `.execute(db);
    }

    // Drop old table and rename new one
    await db.schema.dropTable('script_events').execute();
    await sql`ALTER TABLE script_events_new RENAME TO script_events`.execute(db);
  },
  down: async (db: Kysely<Database>): Promise<void> => {
    // Read existing data
    const events = await db.selectFrom('script_events').selectAll().execute();

    // Create table without id column
    await db.schema
      .createTable('script_events_old')
      .addColumn('script_id', 'varchar(36)', (col) => col.notNull())
      .addColumn('script_channel_id', 'varchar(36)', (col) => col.notNull())
      .addColumn('module_type', 'integer', (col) => col.notNull())
      .addColumn('module_sub_type', 'integer', (col) => col.notNull())
      .addColumn('time', 'integer', (col) => col.notNull())
      .addColumn('data', 'varchar(255)', (col) => col.notNull())
      .execute();

    // Insert data without id
    for (const event of events) {
      await sql`
        INSERT INTO script_events_old (script_id, script_channel_id, module_type, module_sub_type, time, data)
        VALUES (${event.script_id}, ${event.script_channel_id}, ${event.module_type}, ${event.module_sub_type}, ${event.time}, ${event.data})
      `.execute(db);
    }

    // Drop new table and rename old one
    await db.schema.dropTable('script_events').execute();
    await sql`ALTER TABLE script_events_old RENAME TO script_events`.execute(db);
  },
};
