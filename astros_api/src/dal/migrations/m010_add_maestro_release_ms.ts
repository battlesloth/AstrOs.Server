import { Kysely, Migration } from 'kysely';
import { Database } from 'src/dal/types.js';

// Adds `maestro_channels.release_ms`: the minimum time, in ms, a Maestro
// channel stays powered after a move. Existing rows get 5000, the 5 s floor
// firmware 1.2.1–1.2.2 uses for every channel (ESP T-005), so nothing changes
// until someone edits a channel. The literal is frozen here rather than read
// from RELEASE_MS_DEFAULT: a later change to that constant must not give
// fresh installs a different schema from upgraded ones.
//
// Kysely runs SQLite migrations without a transaction, so the ALTER and the
// migration record commit separately, and the process can die between them.
// On an upgrade the next boot restores the pre-migration backup (T-016) and
// up runs on the old table. A fresh install takes no backup, so its next boot
// runs up on a table that already has the column: without the skip below,
// that boot and every later one would fail on the duplicate column.
export const migration_m010: Migration = {
  up: async (db: Kysely<Database>): Promise<void> => {
    const tables = await db.introspection.getTables();
    const channels = tables.find((t) => t.name === 'maestro_channels');
    if (channels?.columns.some((c) => c.name === 'release_ms')) {
      return;
    }
    await db.schema
      .alterTable('maestro_channels')
      .addColumn('release_ms', 'integer', (col) => col.notNull().defaultTo(5000))
      .execute();
  },
  // down only drops the column (tests use it); T-006's guard is what keeps an
  // older build off a migrated database.
  down: async (db: Kysely<Database>): Promise<void> => {
    await db.schema.alterTable('maestro_channels').dropColumn('release_ms').execute();
  },
};
