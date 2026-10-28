import { Kysely, Migration } from 'kysely';
import { Database } from 'src/dal/types.js';

// Adds `script_events.end_time` for random span events: NULL for a point
// event, otherwise the span's end in deciseconds (scaled like `time`). Every
// existing row is a point event, so nothing is backfilled.
//
// Kysely runs SQLite migrations without a transaction, so the ALTER and the
// migration record commit separately. If the process dies between the two,
// the next boot runs up again on a table that already has the column; up
// skips the ALTER rather than failing on a duplicate column.
export const migration_9: Migration = {
  up: async (db: Kysely<Database>): Promise<void> => {
    const tables = await db.introspection.getTables();
    const scriptEvents = tables.find((t) => t.name === 'script_events');
    if (scriptEvents?.columns.some((c) => c.name === 'end_time')) {
      return;
    }
    await db.schema.alterTable('script_events').addColumn('end_time', 'integer').execute();
  },
  // down only drops the column (tests use it). Span payloads stay in `data`,
  // where a pre-migration-9 build would read them as point events, so it does
  // not make the database safe for an older build; T-006's guard does that.
  down: async (db: Kysely<Database>): Promise<void> => {
    await db.schema.alterTable('script_events').dropColumn('end_time').execute();
  },
};
