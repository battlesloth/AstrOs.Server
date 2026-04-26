import SQLite from 'better-sqlite3';
import { Kysely, MigrationProvider, sql } from 'kysely';
import fs from 'fs';
import path from 'path';
import { Database } from './types.js';
import { logger } from '../logger.js';

export const ALL_MIGRATION_NAMES = [
  '0_initial',
  '1_add_script_evt_id',
  '2_add_script_duration',
  '3_add_playlists',
  '4_add_random_wait',
];

const KYSELY_MIGRATION_TABLE = 'kysely_migration';
const BACKUP_PREFIX = 'database.sqlite3.backup-';

async function migrationTableExists(db: Kysely<Database>): Promise<boolean> {
  const result = await sql<{ name: string }>`
    SELECT name FROM sqlite_master
    WHERE type = 'table' AND name = ${KYSELY_MIGRATION_TABLE}
  `.execute(db);
  return result.rows.length > 0;
}

async function getProviderMigrationNames(provider: MigrationProvider): Promise<string[]> {
  const map = await provider.getMigrations();
  return Object.keys(map).sort();
}

export async function checkPendingMigrations(
  db: Kysely<Database>,
  provider: MigrationProvider,
): Promise<string[]> {
  const all = await getProviderMigrationNames(provider);

  if (!(await migrationTableExists(db))) {
    return all;
  }

  const result = await sql<{ name: string }>`
    SELECT name FROM ${sql.raw(KYSELY_MIGRATION_TABLE)}
  `.execute(db);
  const applied = new Set(result.rows.map((r) => r.name));
  return all.filter((n) => !applied.has(n));
}

export async function getLastAppliedMigrationName(
  db: Kysely<Database>,
  provider: MigrationProvider,
): Promise<string | null> {
  if (!(await migrationTableExists(db))) {
    return null;
  }

  const result = await sql<{ name: string }>`
    SELECT name FROM ${sql.raw(KYSELY_MIGRATION_TABLE)}
  `.execute(db);
  if (result.rows.length === 0) return null;

  const all = await getProviderMigrationNames(provider);
  const applied = new Set(result.rows.map((r) => r.name));
  for (let i = all.length - 1; i >= 0; i--) {
    if (applied.has(all[i])) return all[i];
  }
  return null;
}

export async function createBackup(
  rawSqlite: SQLite.Database,
  dbPath: string,
  lastMigrationName: string,
): Promise<string> {
  const destPath = `${dbPath}.backup-${lastMigrationName}`;

  if (fs.existsSync(destPath)) {
    fs.unlinkSync(destPath);
  }
  await rawSqlite.backup(destPath);
  return destPath;
}

export function pruneOldBackups(appdataDir: string, keep = 5): void {
  if (!fs.existsSync(appdataDir)) return;

  const entries = fs
    .readdirSync(appdataDir)
    .filter((f) => f.startsWith(BACKUP_PREFIX))
    .map((name) => {
      const full = path.join(appdataDir, name);
      const mtimeMs = fs.statSync(full).mtimeMs;
      return { name, full, mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  for (const stale of entries.slice(keep)) {
    try {
      fs.unlinkSync(stale.full);
    } catch (err) {
      logger.warn(`Failed to prune backup ${stale.full}: ${err}`);
    }
  }
}

export function restoreBackup(backupPath: string, dbPath: string): void {
  fs.copyFileSync(backupPath, dbPath);
}
