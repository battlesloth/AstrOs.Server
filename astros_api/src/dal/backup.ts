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
// Exported so tests can derive expected ordering without duplicating the rule.
export function compareMigrationNames(a: string, b: string): number {
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

// A fresh database has no migration table yet; that reads the same as an
// empty one for every caller below.
async function getAppliedMigrationNames(db: Kysely<Database>): Promise<string[]> {
  if (!(await migrationTableExists(db))) {
    return [];
  }

  const result = await sql<{ name: string }>`
    SELECT name FROM ${sql.raw(KYSELY_MIGRATION_TABLE)}
  `.execute(db);
  return result.rows.map((r) => r.name);
}

export async function checkPendingMigrations(
  db: Kysely<Database>,
  provider: MigrationProvider,
): Promise<string[]> {
  const all = await getProviderMigrationNames(provider);
  const applied = new Set(await getAppliedMigrationNames(db));
  return all.filter((n) => !applied.has(n));
}

// Applied migrations this build's provider doesn't know: the database was
// written by a newer server (or a sibling branch). Read-only.
export async function findUnknownAppliedMigrations(
  db: Kysely<Database>,
  provider: MigrationProvider,
): Promise<string[]> {
  const known = new Set(await getProviderMigrationNames(provider));
  const applied = await getAppliedMigrationNames(db);
  return applied.filter((n) => !known.has(n)).sort(compareMigrationNames);
}

export async function getLastAppliedMigrationName(
  db: Kysely<Database>,
  provider: MigrationProvider,
): Promise<string | null> {
  const appliedNames = await getAppliedMigrationNames(db);
  if (appliedNames.length === 0) return null;

  // Provider order is canonical. Kysely's stored timestamp ties at ms resolution
  // when migrations run in quick succession (e.g. fresh DBs in tests).
  const all = await getProviderMigrationNames(provider);
  const applied = new Set(appliedNames);
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
