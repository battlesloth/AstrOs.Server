import { Kysely, Migration, sql } from 'kysely';
import { Database } from 'src/dal/types.js';

// Fixes controller_locations.controller_id's declared type. Migration 0 declared
// it as `integer`, but `controllers.id` is `text` (UUID). SQLite's loose typing
// means runtime behavior is fine, but the declared type mismatch blocks adding
// a foreign-key constraint in migration_6. No FKs added here — that's migration_6.
export const migration_5: Migration = {
  up: async (db: Kysely<Database>): Promise<void> => {
    await db.schema
      .createTable('controller_locations_new')
      .addColumn('location_id', 'text', (col) => col.notNull())
      .addColumn('controller_id', 'text', (col) => col.notNull())
      .execute();

    // Bulk copy in a single statement. Column lists are explicit so the
    // migration is robust to any future reordering on either table.
    await sql`
      INSERT INTO controller_locations_new (location_id, controller_id)
      SELECT location_id, controller_id FROM controller_locations
    `.execute(db);

    await db.schema.dropTable('controller_locations').execute();
    await sql`ALTER TABLE controller_locations_new RENAME TO controller_locations`.execute(db);
  },
  down: async (): Promise<void> => {
    throw new Error('Recovery is via Phase 1 backup-restore; no manual down');
  },
};
