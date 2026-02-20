import { Kysely, Migration } from 'kysely';
import { Database } from '../types.js';

export const migration_2: Migration = {
  up: async (db: Kysely<Database>): Promise<void> => {
    await db.schema
      .createTable('playlists')
      .addColumn('id', 'varchar(36)', (col) => col.primaryKey())
      .addColumn('playlist_name', 'varchar(255)', (col) => col.notNull())
      .addColumn('description', 'varchar(255)', (col) => col.notNull())
      .addColumn('last_modified', 'integer', (col) => col.notNull())
      .addColumn('enabled', 'integer', (col) => col.notNull().defaultTo(1))
      .execute();

    await db.schema
      .createTable('playlist_tracks')
      .addColumn('id', 'varchar(36)', (col) => col.primaryKey())
      .addColumn('playlist_id', 'varchar(36)', (col) => col.notNull())
      .addColumn('idx', 'integer', (col) => col.notNull())
      .addColumn('duration_ds', 'integer', (col) => col.notNull())
      .addColumn('track_type', 'varchar(50)', (col) => col.notNull())
      .addColumn('track_id', 'varchar(255)', (col) => col.notNull())
      .addColumn('track_name', 'varchar(255)', (col) => col.notNull())
      .addForeignKeyConstraint('playlist_id', ['playlist_id'], 'playlists', ['id'])
      .execute();

    await db.schema
      .alterTable('scripts')
      .addColumn('duration_ds', 'integer', (col) => col.notNull().defaultTo(-1))
      .execute();
  },
  down: async (db: Kysely<Database>): Promise<void> => {
    await db.schema.dropTable('playlist_tracks').execute();
    await db.schema.dropTable('playlists').execute();
    await db.schema.alterTable('scripts').dropColumn('duration_ds').execute();
  },
};
