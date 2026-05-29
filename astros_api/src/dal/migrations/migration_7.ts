import { Kysely, Migration, sql } from 'kysely';
import { Database } from 'src/dal/types.js';
import { logger } from 'src/logger.js';

// Renames the single `remote_config` row whose `type` was the M5Stack-era key
// `astrOsScreen` to the generic key `remoteConfig`. M5Stack is no longer
// assumed to be the only consumer of the remote-config endpoint — Phase 4 of
// the Remote Control Redesign introduces a mobile web remote that will hit
// the same endpoint — so the `astrOsScreen` key was a leftover from when
// M5Stack was the only target.
//
// The `type` column is UNIQUE NOT NULL (migration_0), so the rename is a
// single atomic UPDATE. On a fresh install, migration_0's seed already uses
// `remoteConfig`, so the WHERE clause matches nothing and this is a no-op.
//
// Reversible: down restores the row back to `astrOsScreen`. Different policy
// from migration_6 (which throws on down) — migration_6's rename-dance with
// FK swaps is structurally hard to undo; this is a one-row UPDATE.
export const migration_7: Migration = {
  up: async (db: Kysely<Database>): Promise<void> => {
    const result = await sql`
      UPDATE remote_config SET type = 'remoteConfig' WHERE type = 'astrOsScreen'
    `.execute(db);
    const count = result.numAffectedRows ?? BigInt(0);
    if (count > 0) {
      logger.info(`migration_7: renamed ${count} remote_config row(s) astrOsScreen → remoteConfig`);
    }
  },
  down: async (db: Kysely<Database>): Promise<void> => {
    const result = await sql`
      UPDATE remote_config SET type = 'astrOsScreen' WHERE type = 'remoteConfig'
    `.execute(db);
    const count = result.numAffectedRows ?? BigInt(0);
    if (count > 0) {
      logger.info(
        `migration_7: reverted ${count} remote_config row(s) remoteConfig → astrOsScreen`,
      );
    }
  },
};
