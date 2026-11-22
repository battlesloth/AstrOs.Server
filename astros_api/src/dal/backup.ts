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

const LEGACY_NAME = /^(\d+)_(.*)$/;
const M_SCHEME_NAME = /^m(\d{3})_(.*)$/;

function migrationRank(name: string): { scheme: number; num: number; slug: string } | null {
  const legacy = LEGACY_NAME.exec(name);
  if (legacy) return { scheme: 0, num: parseInt(legacy[1], 10), slug: legacy[2] };
  const mScheme = M_SCHEME_NAME.exec(name);
  if (mScheme) return { scheme: 1, num: parseInt(mScheme[1], 10), slug: mScheme[2] };
  return null;
}

function compareCodeUnits(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

// The canonical migration order. Kysely's resolver runs migrations in plain
// .sort() order (Migrator#resolveMigrations ignores nameComparator), so for every
// name the registry may hold this must agree with plain .sort():
//   - legacy `<n>_<slug>` (0_initial … 9_add_script_event_end_time), by number;
//   - from 10 on, `m<NNN>_<slug>` (m010_…), after every legacy name, by number
//     (a plain `10_` would sort before `1_`, see T-012);
//   - a tie on the number compares the slug, then the whole name, by UTF-16 code
//     unit, as .sort() does. (Kysely breaks ties among *executed* migrations with
//     localeCompare instead; the two agree only while numbers are unique, which
//     database.test.ts pins for the production registry.)
// Multi-digit legacy names only arrive from an old sibling branch's database and
// keep numeric order. Names matching neither pattern sort last, by localeCompare.
// Exported so tests can derive expected ordering without duplicating the rule.
export function compareMigrationNames(a: string, b: string): number {
  const rankA = migrationRank(a);
  const rankB = migrationRank(b);
  if (rankA && rankB) {
    if (rankA.scheme !== rankB.scheme) return rankA.scheme - rankB.scheme;
    if (rankA.num !== rankB.num) return rankA.num - rankB.num;
    return compareCodeUnits(rankA.slug, rankB.slug) || compareCodeUnits(a, b);
  }
  if (rankA) return -1;
  if (rankB) return 1;
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
// written by a newer server (or a sibling branch). Performs no writes; names
// come back in compareMigrationNames order.
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
