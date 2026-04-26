import SQLite from 'better-sqlite3';
import { Kysely, MigrationProvider, sql } from 'kysely';
import fs from 'fs';
import path from 'path';
import { Database } from './types.js';
import { logger } from '../logger.js';

const KYSELY_MIGRATION_TABLE = 'kysely_migration';

async function migrationTableExists(db: Kysely<Database>): Promise<boolean> {
  const result = await sql<{ name: string }>`
    SELECT name FROM sqlite_master
    WHERE type = 'table' AND name = ${KYSELY_MIGRATION_TABLE}
  `.execute(db);
  return result.rows.length > 0;
}

// Compare migration names by their leading numeric prefix (`<n>_<slug>`),
// falling back to lexicographic order on the slug or for non-conforming names.
// Plain .sort() would put '10_foo' before '2_foo' because '1' < '2'.
function compareMigrationNames(a: string, b: string): number {
  const matchA = a.match(/^(\d+)_(.*)$/);
  const matchB = b.match(/^(\d+)_(.*)$/);
  if (matchA && matchB) {
    const numA = parseInt(matchA[1], 10);
    const numB = parseInt(matchB[1], 10);
    if (numA !== numB) return numA - numB;
    return matchA[2].localeCompare(matchB[2]);
  }
  return a.localeCompare(b);
}

async function getProviderMigrationNames(provider: MigrationProvider): Promise<string[]> {
  const map = await provider.getMigrations();
  return Object.keys(map).sort(compareMigrationNames);
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

  // Provider order is canonical. Kysely's stored timestamp ties at ms resolution
  // when migrations run in quick succession (e.g. fresh DBs in tests).
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

export function pruneOldBackups(dbPath: string, keep = 5): void {
  const dir = path.dirname(dbPath);
  const prefix = `${path.basename(dbPath)}.backup-`;
  if (!fs.existsSync(dir)) return;

  const entries = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith(prefix))
    .map((name) => {
      const full = path.join(dir, name);
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
