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

// Naming schemes in run order; compareMigrationNames subtracts them.
type MigrationRank = { scheme: 0 /* legacy <n>_ */ | 1 /* m<NNN>_ */; num: number; slug: string };

function migrationRank(name: string): MigrationRank | null {
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
//     unit, as .sort() does. (Kysely orders *executed* migrations by timestamp
//     and breaks same-millisecond ties, common on a fresh install, with
//     localeCompare on the whole name. That agrees with .sort() for every valid
//     name only while numbers are unique, which database.test.ts pins for the
//     production registry.)
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

export async function getProviderMigrationNames(provider: MigrationProvider): Promise<string[]> {
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

// Atomic (T-016 amendment): copyFileSync truncates its target first, so the
// copy goes to a temp file, fsynced, then renamed over dbPath. A power cut or
// a full disk mid-restore leaves the old file whole, never a truncated one the
// next boot can't read. The caller must have closed its connection to dbPath.
// It refuses while a -journal or -wal sits beside dbPath: SQLite would replay
// the old file's journal onto the restored one, a silent mix of both that
// still passes quick_check. A read of dbPath rolls a hot journal back first.
export function restoreBackup(backupPath: string, dbPath: string): void {
  for (const suffix of ['-journal', '-wal']) {
    if (fs.existsSync(`${dbPath}${suffix}`)) {
      throw new Error(`not restoring over ${dbPath} while ${dbPath}${suffix} exists`);
    }
  }
  const tmp = `${dbPath}.restore-tmp`;
  try {
    fs.copyFileSync(backupPath, tmp);
    fsyncFile(tmp);
    fs.renameSync(tmp, dbPath);
  } catch (err) {
    try {
      fs.unlinkSync(tmp);
    } catch {
      // best effort: the copy may never have created it
    }
    throw err;
  }
  fsyncDirectory(path.dirname(dbPath));
}

// Windows can only flush a handle opened for writing; elsewhere a read-only
// handle works, and a backup without owner-write still restores.
function fsyncFile(file: string): void {
  const fd = fs.openSync(file, process.platform === 'win32' ? 'r+' : 'r');
  try {
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

// T-016: a migration-in-progress sentinel names the backup a migration run
// started from. A boot that finds one must restore that backup instead of
// taking a new one: createBackup replaces the file of the same name, which
// would overwrite the only good copy with a half-migrated database.
export interface MigrationSentinel {
  backupPath: string;
  lastApplied: string;
  startedAt: string;
}

export function migrationSentinelPath(dbFile: string): string {
  return `${dbFile}.migration-in-progress`;
}

// The rename is only durable once the directory entry is: fsync the directory
// too. Platforms that can't open a directory for fsync (Windows dev machines)
// skip it.
function fsyncDirectory(dir: string): void {
  let fd: number | undefined;
  try {
    fd = fs.openSync(dir, 'r');
    fs.fsyncSync(fd);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== 'EPERM' && code !== 'EISDIR' && code !== 'EINVAL') {
      throw err;
    }
    logger.debug(`Directory fsync not supported for ${dir} (${code}); skipped`);
  } finally {
    if (fd !== undefined) {
      fs.closeSync(fd);
    }
  }
}

// Written atomically: a temp file, fsynced, renamed into place. A failure
// throws and never leaves a partial sentinel. One before the rename leaves
// none; only the directory fsync after it can throw with the complete
// sentinel in place, which the next boot restores harmlessly (its backup is
// identical to the unmigrated database).
export function writeMigrationSentinel(
  dbFile: string,
  entry: { backupPath: string; lastApplied: string },
): void {
  const target = migrationSentinelPath(dbFile);
  const tmp = `${target}.tmp`;
  const body: MigrationSentinel = { ...entry, startedAt: new Date().toISOString() };
  try {
    const fd = fs.openSync(tmp, 'w');
    try {
      fs.writeFileSync(fd, JSON.stringify(body)); // loops on a short write
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(tmp, target);
  } catch (err) {
    try {
      fs.unlinkSync(tmp);
    } catch {
      // best effort: the tmp file may never have been created
    }
    throw err;
  }
  fsyncDirectory(path.dirname(target));
}

// null: no sentinel. 'unreadable': one exists but can't be trusted (not JSON,
// missing fields, not a file); the caller must not treat that as absent.
export function readMigrationSentinel(dbFile: string): MigrationSentinel | 'unreadable' | null {
  let text: string;
  try {
    text = fs.readFileSync(migrationSentinelPath(dbFile), 'utf8');
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'ENOENT' ? null : 'unreadable';
  }
  try {
    const value = JSON.parse(text) as Partial<MigrationSentinel> | null;
    if (
      typeof value?.backupPath === 'string' &&
      typeof value.lastApplied === 'string' &&
      typeof value.startedAt === 'string'
    ) {
      return {
        backupPath: value.backupPath,
        lastApplied: value.lastApplied,
        startedAt: value.startedAt,
      };
    }
  } catch {
    // not JSON: unreadable below
  }
  return 'unreadable';
}

// The unlink is fsynced like the write: a sentinel a power cut brings back
// would restore the pre-migration backup over everything written since.
export function removeMigrationSentinel(dbFile: string): void {
  const target = migrationSentinelPath(dbFile);
  try {
    fs.unlinkSync(target);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return;
    }
    throw err;
  }
  fsyncDirectory(path.dirname(target));
}

// Why the backup a sentinel names can't be restored, or null if it can. It
// must exist, pass quick_check, and record the sentinel's last applied
// migration (T-016 amendment): quick_check answers ok for an empty file, and
// restoring one would look like a fresh install that migrates from scratch.
// It must also hold no migration outside `known` (this build's), so a backup a
// newer build wrote is refused before anything is restored (T-006).
// Opened read-only, so nothing is created beside it.
export function sentinelBackupProblem(
  sentinel: Pick<MigrationSentinel, 'backupPath' | 'lastApplied'>,
  known: ReadonlySet<string>,
): string | null {
  const { backupPath, lastApplied } = sentinel;
  if (!fs.existsSync(backupPath)) {
    return `its backup ${backupPath} is missing`;
  }
  let backup: SQLite.Database;
  try {
    backup = new SQLite(backupPath, { readonly: true, fileMustExist: true });
  } catch (err) {
    return `its backup ${backupPath} can't be opened (${(err as Error).message})`;
  }
  try {
    const result = backup.pragma('quick_check', { simple: true });
    if (result !== 'ok') {
      return `its backup ${backupPath} fails quick_check (${String(result)})`;
    }
    const hasTable = backup
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(KYSELY_MIGRATION_TABLE);
    const hasRow =
      hasTable &&
      backup.prepare(`SELECT 1 FROM ${KYSELY_MIGRATION_TABLE} WHERE name = ?`).get(lastApplied);
    if (!hasRow) {
      return `its backup ${backupPath} has no record of migration ${lastApplied}`;
    }
    const unknown = (
      backup.prepare(`SELECT name FROM ${KYSELY_MIGRATION_TABLE}`).all() as { name: string }[]
    )
      .map((r) => r.name)
      .filter((n) => !known.has(n))
      .sort(compareMigrationNames);
    if (unknown.length > 0) {
      return (
        `its backup ${backupPath} was written by a newer build ` +
        `(migrations this build does not know: ${unknown.join(', ')})`
      );
    }
    return null;
  } catch (err) {
    return `its backup ${backupPath} can't be read (${(err as Error).message})`;
  } finally {
    backup.close();
  }
}
