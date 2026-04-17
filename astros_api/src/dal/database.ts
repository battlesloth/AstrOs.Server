import appdata from 'appdata-path';
import SQLite from 'better-sqlite3';
import {
  InsertResult,
  Kysely,
  Migration,
  MigrationProvider,
  Migrator,
  SqliteDialect,
} from 'kysely';
import Dotenv from 'dotenv';
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { logger } from 'src/logger.js';
import { Database } from './types.js';
import {
  migration_0,
  migration_1,
  migration_2,
  migration_3,
  migration_4,
} from './migrations/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
Dotenv.config({ path: path.join(__dirname, '..', '.env') });

export function resolveDatabaseDir(envValue: string | undefined): string {
  if (!envValue || envValue.toLowerCase() === '%appdata%') {
    return appdata('astrosserver');
  }
  return envValue;
}

const databaseDir = resolveDatabaseDir(process.env.DATABASE_PATH);
const databaseFile = path.join(databaseDir, 'database.sqlite3');

let dialect = null;

console.log(`NODE_ENV is set to: ${process.env.NODE_ENV}`);

if (process.env.NODE_ENV?.toLocaleLowerCase() === 'test') {
  console.warn('Using in-memory database for tests');
  dialect = new SqliteDialect({
    database: new SQLite(':memory:'),
  });
} else {
  fs.mkdirSync(databaseDir, { recursive: true });
  console.log(`Using database file at ${databaseFile}`);
  dialect = new SqliteDialect({
    database: new SQLite(databaseFile),
  });
}

export const db = new Kysely<Database>({
  dialect,
});

const migrationProvider = new (class implements MigrationProvider {
  async getMigrations(): Promise<Record<string, Migration>> {
    return {
      '0_initial': migration_0,
      '1_add_script_evt_id': migration_1,
      '2_add_script_duration': migration_2,
      '3_add_playlists': migration_3,
      '4_add_random_wait': migration_4,
    };
  }
})();

export async function migrateToLatest(db: Kysely<Database>): Promise<void> {
  const migrator = new Migrator({
    db,
    provider: migrationProvider,
  });

  const { error, results } = await migrator.migrateToLatest();

  results?.forEach((it) => {
    if (it.status === 'Success') {
      logger.info(`migration "${it.migrationName}" was executed successfully`);
    } else if (it.status === 'Error') {
      logger.error(`failed to execute migration "${it.migrationName}"`);
    }
  });

  if (error) {
    logger.error('failed to migrate');
    logger.error(error);
  }
}

export function inserted(val: InsertResult): boolean {
  return val.numInsertedOrUpdatedRows !== undefined && val.numInsertedOrUpdatedRows > 0;
}
