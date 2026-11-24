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
  migration_7,
  migration_8,
  migration_9,
} from './migrations/index.js';
import { SystemStatus } from '../system_status.js';
import {
  checkPendingMigrations,
  createBackup,
  findUnknownAppliedMigrations,
  getLastAppliedMigrationName,
  pruneOldBackups,
  restoreBackup,
  migrationSentinelPath,
  readMigrationSentinel,
  removeMigrationSentinel,
  writeMigrationSentinel,
  sentinelBackupProblem,
  getProviderMigrationNames,
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

// Migration names (T-012): Kysely resolves migrations in plain-string .sort()
// order (nameComparator only breaks ties among executed migrations' timestamps),
// so a plain `10_…` would run before `1_…`, and a database at or past 1 would
// refuse it as "corrupted migrations". From 10 on, names are `m<NNN>_<snake_name>`
// (m010_…, m011_…, up to m899; m9NN is for injected test migrations), which sort
// after every legacy `<n>_` name as plain strings. Take the next number after
// develop's highest at merge time, and use each number once: Kysely breaks
// executed-timestamp ties with localeCompare, which disagrees with .sort() on
// same-number names. The legacy 0_–9_ names are frozen. database.test.ts pins
// these rules and the match with compareMigrationNames (dal/backup.ts).
export const PRODUCTION_MIGRATIONS: Readonly<Record<string, Migration>> = Object.freeze({
  '0_initial': migration_0,
  '1_add_script_evt_id': migration_1,
  '2_add_script_duration': migration_2,
  '3_add_playlists': migration_3,
  '4_add_random_wait': migration_4,
  '5_fix_controller_locations_type': migration_5,
  '6_add_foreign_keys': migration_6,
  '7_rename_remote_config_key': migration_7,
  '8_fix_script_duration_units': migration_8,
  '9_add_script_event_end_time': migration_9,
});

const defaultMigrationProvider: MigrationProvider = new (class implements MigrationProvider {
  async getMigrations(): Promise<Record<string, Migration>> {
    return { ...PRODUCTION_MIGRATIONS };
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

// Migrations apply with FKs off (rename dances need it). After turning FKs
// back on, SQLite does NOT retroactively re-validate existing rows — so any
// gap in a migration's orphan cleanup would leave dangling FK violators
// invisible to runtime checks. PRAGMA foreign_key_check scans every FK
// constraint and reports violators; we throw on any so the existing
// restore-from-backup path can revert to the pre-migration version.
//
// Exported for test use; no test-only-prefix because this is a generally
// useful FK-integrity check, not test scaffolding.
export function assertNoFkViolations(raw: SQLite.Database): void {
  const violations = raw.prepare('PRAGMA foreign_key_check').all() as Array<{
    table: string;
    rowid: number | bigint;
    parent: string;
    fkid: number;
  }>;
  if (violations.length > 0) {
    // rowid can be a bigint when the connection has safeIntegers enabled.
    // JSON.stringify throws TypeError on bigints by default, which would
    // mask the real violation details behind a serialization error.
    const detail = JSON.stringify(violations, (_, v) => (typeof v === 'bigint' ? v.toString() : v));
    throw new Error(
      `Post-migration foreign_key_check found ${violations.length} violator(s): ${detail}`,
    );
  }
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

// restoreBackup renames over dbFile, so the connection must be closed first.
async function closeAndRestore(backupPath: string, dbFile: string): Promise<void> {
  await closeConnection();
  restoreBackup(backupPath, dbFile);
}

// Ends every message about a sentinel that still needs its restore. None of them
// asks for a restore by hand, which can copy a bad backup, or leave a journal
// SQLite replays onto it: that is left to the next boot's checked restore.
const KEEP_FILES =
  'Do not delete the migration-in-progress file, the database or any backup. (Paths are as ' +
  'the server sees them: under Docker, look in the host folder mounted there.)';

// After a failed restore: reopen the file, or, if that also fails, a bare
// in-memory DB so the process still comes up and the read-only status endpoint
// stays reachable. (The fallback is unmigrated — DB-backed queries fail, but
// /api/system/status doesn't query the DB.)
function openConnectionOrMemory(dbFile: string): OpenConnection {
  try {
    return openConnection(dbFile);
  } catch (reopenErr) {
    logger.error(
      `Could not reopen DB after failed restore: ${(reopenErr as Error).message}; falling back to in-memory`,
    );
    return openConnection(':memory:');
  }
}

export async function initializeDatabase(
  systemStatus: SystemStatus,
  options: InitializeDatabaseOptions = {},
): Promise<Kysely<Database>> {
  const explicitPath = options.dbPath;
  const useMemory = !explicitPath && process.env.NODE_ENV?.toLocaleLowerCase() === 'test';

  if (useMemory) {
    const conn = openConnection(':memory:');
    // Mirror the file-backed path's pragma bracket so migration_6 (and any
    // future migration that needs FK enforcement off during apply) behaves
    // identically across paths.
    conn.raw.pragma('foreign_keys = OFF');
    try {
      await migrateToLatest(conn.db);
    } finally {
      conn.raw.pragma('foreign_keys = ON');
    }
    assertNoFkViolations(conn.raw);
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
    // Checked before pending: a newer database must get no backup, migrate or
    // prune, even when this build also has migrations the database lacks.
    // enterReadOnly is first-wins: a code entered before this one would leave
    // the server in plain read-only mode, where reads and login pass.
    const unknown = await findUnknownAppliedMigrations(conn.db, activeMigrationProvider);
    if (unknown.length > 0) {
      systemStatus.enterReadOnly(
        'DB_NEWER_THAN_SERVER',
        `database has migrations this build does not know: ${unknown.join(', ')}`,
      );
      // A connection setting, not a write: SQLite itself refuses any write
      // that slips past the HTTP guard, the serial skip and the WS drop.
      conn.raw.pragma('query_only = ON');
      return conn.db;
    }
    // T-016: a sentinel means the last migration run didn't finish cleanly
    // (e.g. a power cut mid-migration, a failed restore, a sentinel whose
    // removal failed, or one whose directory fsync failed), so the file may be
    // half-migrated. Restore the backup it names before anything else; taking
    // a new backup now would overwrite the only good copy. The newer-database
    // check above has already read the file, which rolls back any hot journal
    // a crash left; restoreBackup refuses to rename over one that remains.
    const sentinel = readMigrationSentinel(dbFile);
    if (sentinel !== null) {
      const sentinelFile = migrationSentinelPath(dbFile);
      const interrupted = (detail: string): Kysely<Database> => {
        systemStatus.enterReadOnly('MIGRATION_INTERRUPTED', detail);
        return conn.db;
      };
      const untouched = (problem: string, fix: string): Kysely<Database> =>
        interrupted(
          `a migration run did not finish cleanly (${sentinelFile}) and ${problem}; nothing was ` +
            `restored, backed up or migrated. ${fix}. ${KEEP_FILES}`,
        );
      if (sentinel === 'unreadable') {
        return untouched(
          'that file is unreadable',
          'If its permissions are the cause, fix them and restart: the next boot checks the ' +
            'backup it names before restoring it. If its contents are damaged, stop the server ' +
            'and copy the whole data folder somewhere safe before changing anything',
        );
      }
      const problem = sentinelBackupProblem(
        sentinel,
        new Set(await getProviderMigrationNames(activeMigrationProvider)),
      );
      if (problem !== null) {
        return untouched(
          problem,
          'If permissions or a lock are the cause, fix that; if a newer build wrote it, run that ' +
            'build; otherwise move any file at that path into a new folder and put a good copy of ' +
            'the backup there, never the database, even one you moved away (it may be ' +
            'half-migrated, and the check cannot tell). Then restart: the next boot tries the ' +
            'restore again',
        );
      }
      try {
        await closeAndRestore(sentinel.backupPath, dbFile);
      } catch (err) {
        // Read-only first, then the reopen: its fallback logs on its own.
        systemStatus.enterReadOnly(
          'MIGRATION_INTERRUPTED',
          `restoring ${sentinel.backupPath} after an interrupted migration failed: ` +
            `${(err as Error).message}. The database is unchanged, or already the backup if only ` +
            `the directory fsync after the rename failed, and ${sentinelFile} was kept. Fix the ` +
            `cause and restart: the next boot retries the restore. ${KEEP_FILES}`,
        );
        conn = openConnectionOrMemory(dbFile);
        return conn.db;
      }
      logger.warn(
        `Restored ${sentinel.backupPath} after an interrupted migration (started ${sentinel.startedAt})`,
      );
      conn = openConnection(dbFile);
      try {
        removeMigrationSentinel(dbFile);
      } catch (err) {
        // A sentinel left behind would restore this backup over newer data on
        // a later boot, so don't take writes until it's gone.
        return interrupted(
          `restored ${sentinel.backupPath} after an interrupted migration, but ${sentinelFile} ` +
            `could not be removed (or its removal made durable): ${(err as Error).message}; fix the ` +
            'cause and restart (if it is still there, the next boot restores that backup again, so ' +
            'keep it)',
        );
      }
    }

    pending = await checkPendingMigrations(conn.db, activeMigrationProvider);
    lastApplied = await getLastAppliedMigrationName(conn.db, activeMigrationProvider);
  } catch (err) {
    // The open, the introspection, or the reopen after a sentinel restore
    // failed (perms, directory-as-file, corrupted DB, etc.). Degrade to a bare
    // in-memory connection so the process still comes up and
    // /api/system/status is reachable.
    logger.error(`Could not open database at startup: ${(err as Error).message}`);
    // A torn half-migrated file fails here, before the sentinel check. existsSync
    // rather than a read: in a data dir this process can't enter, a read answers
    // 'unreadable', which would claim an interrupted run that never happened.
    const sentinelFile = migrationSentinelPath(dbFile);
    if (fs.existsSync(sentinelFile)) {
      logger.error(
        `A migration run did not finish cleanly (${sentinelFile}). Fix the startup error and ` +
          'restart: the next boot tries the recovery again. If the database file itself is ' +
          'damaged, first stop the server and move it, with any -journal or -wal beside it, ' +
          `into a new folder, names unchanged. ${KEEP_FILES}`,
      );
    }
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
      // Without the sentinel an interruption from here on would cost the backup
      // (T-016), so a failed write stops before migrating.
      writeMigrationSentinel(dbFile, { backupPath, lastApplied });
    } catch (err) {
      systemStatus.enterReadOnly('BACKUP_FAILED', err);
      return conn.db;
    }
  }

  try {
    // Toggle FKs OFF for the migrate window so rename-dance migrations can
    // drop/recreate referenced tables without RESTRICT/CASCADE side-effects.
    // Kysely's SQLite adapter runs migrations without a transaction
    // (supportsTransactionalDdl is false): each statement autocommits, so a
    // failed migration can leave partial writes and the backup restore below
    // is the rollback. The pragma is set here, around migrateToLatest(), so it
    // holds for the whole run (SQLite ignores it inside a transaction).
    // The finally guarantees FKs are re-enabled even if migrate throws.
    conn.raw.pragma('foreign_keys = OFF');
    try {
      await migrateToLatest(conn.db);
    } finally {
      conn.raw.pragma('foreign_keys = ON');
    }
    // Verify the migration left no FK violators (orphan-cleanup gap, etc.).
    // Throws into the catch below, where the restore-from-backup path runs.
    assertNoFkViolations(conn.raw);
    // A sentinel exists exactly when a backup was taken (a fresh install has neither).
    if (backupPath !== null) {
      try {
        removeMigrationSentinel(dbFile);
      } catch (err) {
        // A sentinel left behind would restore the pre-migration backup over
        // this migrated database (and anything written to it) on the next boot.
        // Read-only keeps this boot from writing, so that restore loses nothing.
        systemStatus.enterReadOnly(
          'MIGRATION_INTERRUPTED',
          `the migration succeeded, but ${migrationSentinelPath(dbFile)} could not be removed ` +
            `(or its removal made durable): ${(err as Error).message}; fix the cause and ` +
            `restart: if it is still there, the next boot restores ${backupPath} and ` +
            'migrates again, so keep that backup',
        );
        return conn.db;
      }
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
      await closeAndRestore(backupPath, dbFile);
      logger.warn(`Restored database from backup ${backupPath} after failed migration`);
      conn = openConnection(dbFile);
      try {
        removeMigrationSentinel(dbFile);
      } catch (removeErr) {
        // Kept: the next boot restores the same backup again, harmless while
        // read-only blocks writes.
        logger.error(
          `Could not remove the migration sentinel ${migrationSentinelPath(dbFile)}: ` +
            `${(removeErr as Error).message}; if it is still there, the next boot restores ${backupPath} ` +
            'again, so keep that backup',
        );
      }
      // Restore succeeded — DB is at a known-good prior version. Enter read-only
      // anyway: a migration failed, and silently coming back up "as if nothing
      // happened" hides that from operators and risks letting writes against the
      // older schema compound the underlying problem before a fix ships.
      // Recovery is still a container restart with a fixed migration.
      systemStatus.enterReadOnly('MIGRATION_FAILED_RESTORED', err);
      return conn.db;
    } catch (restoreErr) {
      systemStatus.enterReadOnly('MIGRATION_FAILED_RESTORE_FAILED', restoreErr);
      const sentinelFile = migrationSentinelPath(dbFile);
      if (fs.existsSync(sentinelFile)) {
        logger.error(
          `${sentinelFile} was kept: fix the cause and restart, and the next boot retries the ` +
            `restore of ${backupPath}. ${KEEP_FILES}`,
        );
      }
      // closeAndRestore() destroyed the handles: reopen, or fall back to memory.
      conn = openConnectionOrMemory(dbFile);
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
