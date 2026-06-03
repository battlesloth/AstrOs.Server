import { Kysely, Migration } from 'kysely';
import { Database } from 'src/dal/types.js';

export const migration_2: Migration = {
  up: async (db: Kysely<Database>): Promise<void> => {
    await db.schema
      .alterTable('scripts')
      .addColumn('duration_ds', 'integer', (col) => col.notNull().defaultTo(-1))
      .execute();
  },
  down: async (db: Kysely<Database>): Promise<void> => {
    await db.schema.alterTable('scripts').dropColumn('duration_ds').execute();
  },
};
