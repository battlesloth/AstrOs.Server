import { Kysely, Migration, sql } from 'kysely';
import { Database } from 'src/dal/types.js';
import { logger } from 'src/logger.js';

// Recomputes `scripts.duration_ds` in deciseconds. `calculateLengthDS` used to
// return the latest event time in *seconds* (the model's `ScriptEvent.time`
// unit), which `upsertScript` stored, while the playlist converter and
// runScript read the column as deciseconds — so the animation queue timed
// every script 10x short. Rows never saved since migration_2 still hold its
// `-1` default.
//
// The recompute reads `script_events.time`, which is stored in deciseconds
// (the repository writes `Math.round(time * 10)`), rather than calling model
// code: a migration must give the same result whenever a DB first runs it, so
// it cannot depend on model code that later changes. It rewrites every row
// from its events, so it fixes seconds values and `-1` rows alike and gives a
// script without events 0. (Event rows the Vue scripter saved before
// deb95a40, 2026-01-07, were never scaled; for those scripts MAX(time) still
// matches how they play, since the read path divides every stored time by 10.)
//
// Kysely runs SQLite migrations without a transaction, so up's UPDATE and
// Kysely's migration record commit separately. up is a single (atomic)
// statement and must stay a recompute, never a scale: if the process dies
// between the two, the next boot runs it again and must land on the same
// values.
//
// down is a no-op: pre-T-004 builds already read duration_ds as deciseconds
// (only the old producer was wrong), so they time the corrected values
// correctly. Restoring the seconds values would bring back the 10x-short
// timing.
export const migration_8: Migration = {
  up: async (db: Kysely<Database>): Promise<void> => {
    const result = await sql`
      UPDATE scripts SET duration_ds = COALESCE(
        (SELECT MAX(time) FROM script_events WHERE script_events.script_id = scripts.id),
        0
      )
    `.execute(db);
    const count = result.numAffectedRows ?? BigInt(0);
    if (count > 0) {
      logger.info(`migration_8: recomputed duration_ds (deciseconds) for ${count} script(s)`);
    }
  },
  down: async (): Promise<void> => {
    logger.info('migration_8: down leaves duration_ds in deciseconds (no data change)');
  },
};
