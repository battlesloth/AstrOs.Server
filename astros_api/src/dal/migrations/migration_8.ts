import { Kysely, Migration, sql } from 'kysely';
import { Database } from 'src/dal/types.js';
import { logger } from 'src/logger.js';

// Recomputes `scripts.duration_ds` in deciseconds. `calculateLengthDS` used to
// store the latest event time in *seconds* (the model's `ScriptEvent.time`
// unit) while the playlist converter and runScript read the column as
// deciseconds, so the animation queue timed every script 10x short. Rows the
// old code never computed still hold migration_2's `-1` default.
//
// The recompute reads `script_events.time`, which is stored in deciseconds
// (the repository writes `Math.round(time * 10)`), rather than calling model
// code — a migration must produce the same result on every
// future boot. It rewrites every row from its events, so it fixes seconds
// values and `-1` rows alike, is idempotent, and gives a script without
// events 0. (Event rows saved before deb95a40, 2026-01-07, were never scaled;
// for those scripts MAX(time) still matches how they play, since the read
// path divides every stored time by 10.)
//
// Reversible: down divides by 10, restoring the seconds values the old code
// computed. Legacy `-1` rows are not restored (they come back as their real
// length in seconds), which the pre-fix code handles the same as any
// computed value.
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
  down: async (db: Kysely<Database>): Promise<void> => {
    const result = await sql`
      UPDATE scripts SET duration_ds = duration_ds / 10.0
    `.execute(db);
    const count = result.numAffectedRows ?? BigInt(0);
    if (count > 0) {
      logger.info(`migration_8: reverted duration_ds to seconds for ${count} script(s)`);
    }
  },
};
