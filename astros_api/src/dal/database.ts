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

function openConnection(dbFile: string): OpenConnection {
  const raw = new SQLite(dbFile);
  raw.pragma('foreign_keys = ON');
  const db = new Kysely<Database>({ dialect: new SqliteDialect({ database: raw }) });
  _db = db;
  _rawSqlite = raw;
  return { db, raw };
}

function closeConnection(): void {
  try {
    _db?.destroy();
  } catch {
    // ignore
  }
  try {
    _rawSqlite?.close();
  } catch {
    // ignore
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
    const raw = new SQLite(':memory:');
    const db = new Kysely<Database>({ dialect: new SqliteDialect({ database: raw }) });
    _db = db;
    _rawSqlite = raw;
    await migrateToLatest(db);
    return db;
  }

  const dbFile =
    explicitPath ?? path.join(resolveDatabaseDir(process.env.DATABASE_PATH), 'database.sqlite3');
  const dbDir = path.dirname(dbFile);
  fs.mkdirSync(dbDir, { recursive: true });
  logger.info(`Using database file at ${dbFile}`);

  let conn = openConnection(dbFile);

  const pending = await checkPendingMigrations(conn.db, activeMigrationProvider);
  const lastApplied = await getLastAppliedMigrationName(conn.db, activeMigrationProvider);

  if (pending.length === 0) {
    return conn.db;
  }

  let backupPath: string | null = null;
  if (lastApplied) {
    try {
      backupPath = await createBackup(conn.raw, dbFile, lastApplied);
      logger.info(`Created pre-migration backup at ${backupPath}`);
    } catch (err) {
      systemStatus.enterReadOnly(`backup failed: ${(err as Error).message}`);
      return conn.db;
    }
  }

  try {
    await migrateToLatest(conn.db);
    pruneOldBackups(dbDir, 5);
    return conn.db;
  } catch (err) {
    logger.error(`Migration failed: ${(err as Error).message}`);

    if (!backupPath) {
      systemStatus.enterReadOnly(
        `migration failed and no backup available: ${(err as Error).message}`,
      );
      return conn.db;
    }

    try {
      closeConnection();
      restoreBackup(backupPath, dbFile);
      conn = openConnection(dbFile);
      logger.warn(`Restored database from backup ${backupPath} after failed migration`);
      return conn.db;
    } catch (restoreErr) {
      systemStatus.enterReadOnly(
        `migration failed and restore failed: ${(restoreErr as Error).message}`,
      );
      // Restore failed; the original connection was already closed.
      // Best-effort reopen so read-only endpoints still respond.
      try {
        conn = openConnection(dbFile);
      } catch {
        // If even reopening fails, fall through with the (now-null) module connection.
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
  if (_db) {
    await _db.destroy();
  }
  if (_rawSqlite) {
    _rawSqlite.close();
  }
  _db = null;
  _rawSqlite = null;
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
