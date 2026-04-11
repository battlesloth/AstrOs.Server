import { Kysely, Migration } from 'kysely';
import { Database } from 'src/dal/types.js';

export const migration_4: Migration = {
  up: async (db: Kysely<Database>): Promise<void> => {
    await db.schema
      .alterTable('playlist_tracks')
      .addColumn('random_wait', 'integer', (col) => col.notNull().defaultTo(0))
      .execute();

    await db.schema
      .alterTable('playlist_tracks')
      .addColumn('duration_max_ds', 'integer', (col) => col.notNull().defaultTo(0))
      .execute();
  },
  down: async (db: Kysely<Database>): Promise<void> => {
    await db.schema.alterTable('playlist_tracks').dropColumn('random_wait').execute();
    await db.schema.alterTable('playlist_tracks').dropColumn('duration_max_ds').execute();
  },
};
