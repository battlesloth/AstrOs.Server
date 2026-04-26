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
  migration_5,
  migration_6,
} from './migrations/index.js';
import { SystemStatus } from '../system_status.js';
import {
  checkPendingMigrations,
  createBackup,
  getLastAppliedMigrationName,
  pruneOldBackups,
  restoreBackup,
} from './backup.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
Dotenv.config({ path: path.join(__dirname, '..', '.env') });

export function resolveDatabaseDir(envValue: string | undefined): string {
  if (!envValue || envValue.toLowerCase() === '%appdata%') {
    return appdata('astrosserver');
  }
  return envValue;
}

const defaultMigrationProvider: MigrationProvider = new (class implements MigrationProvider {
  async getMigrations(): Promise<Record<string, Migration>> {
    return {
      '0_initial': migration_0,
      '1_add_script_evt_id': migration_1,
      '2_add_script_duration': migration_2,
      '3_add_playlists': migration_3,
      '4_add_random_wait': migration_4,
      '5_fix_controller_locations_type': migration_5,
      '6_add_foreign_keys': migration_6,
    };
  }
})();

let activeMigrationProvider: MigrationProvider = defaultMigrationProvider;

let _db: Kysely<Database> | null = null;
let _rawSqlite: SQLite.Database | null = null;

export interface InitializeDatabaseOptions {
  dbPath?: string;
}

interface OpenConnection {
  db: Kysely<Database>;
  raw: SQLite.Database;
}

// Build a properly-configured Kysely + raw SQLite handle pair. Single source
// of truth for connection options (PRAGMA foreign_keys = ON) so tests and
// prod can never diverge. Exported so test setups don't roll their own.
export function createKyselyConnection(dbPath = ':memory:'): OpenConnection {
  const raw = new SQLite(dbPath);
  raw.pragma('foreign_keys = ON');
  const db = new Kysely<Database>({ dialect: new SqliteDialect({ database: raw }) });
  return { db, raw };
}

function openConnection(dbFile: string): OpenConnection {
  const conn = createKyselyConnection(dbFile);
  _db = conn.db;
  _rawSqlite = conn.raw;
  return conn;
}

async function closeConnection(): Promise<void> {
  if (_db) {
    try {
      await _db.destroy();
    } catch (err) {
      logger.warn(`Error destroying Kysely connection: ${(err as Error).message}`);
    }
  }
  if (_rawSqlite) {
    try {
      _rawSqlite.close();
    } catch (err) {
      logger.warn(`Error closing raw sqlite handle: ${(err as Error).message}`);
    }
  }
  _db = null;
  _rawSqlite = null;
}

export async function initializeDatabase(
  systemStatus: SystemStatus,
  options: InitializeDatabaseOptions = {},
): Promise<Kysely<Database>> {
  const explicitPath = options.dbPath;
  const useMemory = !explicitPath && process.env.NODE_ENV?.toLocaleLowerCase() === 'test';

  if (useMemory) {
    const conn = openConnection(':memory:');
    await migrateToLatest(conn.db);
    return conn.db;
  }

  const dbFile =
    explicitPath ?? path.join(resolveDatabaseDir(process.env.DATABASE_PATH), 'database.sqlite3');
  const dbDir = path.dirname(dbFile);
  fs.mkdirSync(dbDir, { recursive: true });
  logger.info(`Using database file at ${dbFile}`);

  let conn: OpenConnection;
  let pending: string[];
  let lastApplied: string | null;
  try {
    conn = openConnection(dbFile);
    pending = await checkPendingMigrations(conn.db, activeMigrationProvider);
    lastApplied = await getLastAppliedMigrationName(conn.db, activeMigrationProvider);
  } catch (err) {
    // Initial open or introspection failed (perms, directory-as-file,
    // corrupted DB, etc.). Degrade to a bare in-memory connection so the
    // process still comes up and /api/system/status is reachable.
    logger.error(`Could not open database at startup: ${(err as Error).message}`);
    systemStatus.enterReadOnly('STARTUP_OPEN_FAILED', err);
    return openConnection(':memory:').db;
  }

  if (pending.length === 0) {
    return conn.db;
  }

  let backupPath: string | null = null;
  if (lastApplied) {
    try {
      backupPath = await createBackup(conn.raw, dbFile, lastApplied);
      logger.info(`Created pre-migration backup at ${backupPath}`);
    } catch (err) {
      systemStatus.enterReadOnly('BACKUP_FAILED', err);
      return conn.db;
    }
  }

  try {
    // Toggle FKs OFF for the migrate window so rename-dance migrations can
    // drop/recreate referenced tables without RESTRICT/CASCADE side-effects.
    // The pragma cannot be changed inside a transaction, so it must wrap
    // migrateToLatest() — Kysely opens a transaction per migration internally.
    // The finally guarantees FKs are re-enabled even if migrate throws.
    conn.raw.pragma('foreign_keys = OFF');
    try {
      await migrateToLatest(conn.db);
    } finally {
      conn.raw.pragma('foreign_keys = ON');
    }
    pruneOldBackups(dbFile, 5);
    return conn.db;
  } catch (err) {
    logger.error(`Migration failed: ${(err as Error).message}`);

    if (!backupPath) {
      systemStatus.enterReadOnly('MIGRATION_FAILED_NO_BACKUP', err);
      return conn.db;
    }

    try {
      await closeConnection();
      restoreBackup(backupPath, dbFile);
      conn = openConnection(dbFile);
      logger.warn(`Restored database from backup ${backupPath} after failed migration`);
      return conn.db;
    } catch (restoreErr) {
      systemStatus.enterReadOnly('MIGRATION_FAILED_RESTORE_FAILED', restoreErr);
      // The original handles were destroyed by closeConnection(). Reopen the
      // file; if that also fails, fall back to a bare in-memory DB so the
      // process still comes up and the read-only status endpoint stays
      // reachable. (The fallback is unmigrated — DB-backed queries will fail,
      // but /api/system/status doesn't query the DB.)
      try {
        conn = openConnection(dbFile);
      } catch (reopenErr) {
        logger.error(
          `Could not reopen DB after failed restore: ${(reopenErr as Error).message}; falling back to in-memory`,
        );
        conn = openConnection(':memory:');
      }
      return conn.db;
    }
  }
}

export function getDb(): Kysely<Database> {
  if (!_db) {
    throw new Error('Database not initialized — call initializeDatabase() first');
  }
  return _db;
}

export async function closeDatabaseForTest(): Promise<void> {
  await closeConnection();
}

export function __setMigrationProviderForTest(provider: MigrationProvider): void {
  activeMigrationProvider = provider;
}

export function __resetMigrationProviderForTest(): void {
  activeMigrationProvider = defaultMigrationProvider;
}

export async function migrateToLatest(db: Kysely<Database>): Promise<void> {
  const migrator = new Migrator({
    db,
    provider: activeMigrationProvider,
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
    throw error instanceof Error ? error : new Error(String(error));
  }
}

export function inserted(val: InsertResult): boolean {
  return val.numInsertedOrUpdatedRows !== undefined && val.numInsertedOrUpdatedRows > 0;
}
