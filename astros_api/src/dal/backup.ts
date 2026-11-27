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
//     unit, as .sort() does.
// migrateToLatest also checks the applied migrations against this order
// (migrationOrderProblem below), and turns off Kysely's own check, which
// orders applied migrations by their recorded timestamps (T-017).
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

// Null when this build's migrations can run safely: every applied migration is
// known, Kysely's plain-text run order matches name order, and the applied
// migrations are exactly the first ones in name order. Kysely's own check
// orders applied migrations by their recorded clock time instead, which a
// droid without a battery-backed clock can get wrong (T-017), so
// migrateToLatest turns it off and runs this first. `known` is the provider's
// names; both lists may come in any order.
export function migrationOrderProblem(
  known: readonly string[],
  applied: readonly string[],
): string | null {
  const unknown = unknownMigrations(applied, new Set(known));
  if (unknown.length > 0) {
    return `applied migration ${unknown[0]} is not in this build`;
  }

  // Kysely runs pending migrations in plain .sort() order, not this one. A
  // name outside T-012's scheme (a plain `10_x`) can sort differently there
  // and run out of turn, on a fresh install or on a droid that skipped a
  // release, so the two orders must agree whatever has been applied.
  const ordered = [...known].sort(compareMigrationNames);
  const runOrder = [...known].sort();
  const firstDiff = runOrder.findIndex((name, i) => name !== ordered[i]);
  if (firstDiff !== -1) {
    return (
      `Kysely would run migration ${runOrder[firstDiff]} before ${ordered[firstDiff]}: ` +
      'migration names must sort the same as plain text and by number (T-012)'
    );
  }

  const appliedSet = new Set(applied);
  let last = -1;
  for (let i = 0; i < ordered.length; i++) {
    if (appliedSet.has(ordered[i])) last = i;
  }
  for (let i = 0; i < last; i++) {
    if (!appliedSet.has(ordered[i])) {
      return (
        `pending migration ${ordered[i]} sorts before applied migration ${ordered[last]}; ` +
        'applied migrations must come first in name order'
      );
    }
  }
  return null;
}

export async function getProviderMigrationNames(provider: MigrationProvider): Promise<string[]> {
  const map = await provider.getMigrations();
  return Object.keys(map).sort(compareMigrationNames);
}

// The names in kysely_migration, in no particular order (no ORDER BY; sort by
// compareMigrationNames, never by position). A fresh database has no migration
// table yet; that reads the same as an empty one.
export async function getAppliedMigrationNames(db: Kysely<Database>): Promise<string[]> {
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
  return unknownMigrations(await getAppliedMigrationNames(db), known);
}

// The applied names `known` lacks, in compareMigrationNames order. Shared by
// the newer-database guard and the sentinel's backup check.
function unknownMigrations(applied: readonly string[], known: ReadonlySet<string>): string[] {
  return applied.filter((n) => !known.has(n)).sort(compareMigrationNames);
}

export async function getLastAppliedMigrationName(
  db: Kysely<Database>,
  provider: MigrationProvider,
): Promise<string | null> {
  const appliedNames = await getAppliedMigrationNames(db);
  if (appliedNames.length === 0) return null;

  // Provider order is canonical: stored timestamps tie at ms resolution when
  // migrations run in quick succession, and can be out of order on a droid
  // with a wrong clock (T-017).
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

// Atomic: copyFileSync truncates its target first, so the copy goes to a temp
// file, fsynced, then renamed over dbPath. A power cut or a full disk
// mid-restore leaves the old file whole, never a truncated one the next boot
// can't read. The caller must have closed its connection to dbPath.
//
// A hot -journal beside dbPath stops it: SQLite would replay the old file's
// journal onto the restored one, a silent mix of both that still passes
// quick_check. Callers read dbPath before closing it (initializeDatabase's
// newer-database check does), which rolls back and deletes a hot journal, so
// a refusal here means one survived that read. An inert journal (empty, or a
// zero first byte: SQLite's own "not hot" test) is left by a power cut before
// its first fsync and that read never clears it, so it is removed instead.
// A -wal always stops it: closing a WAL-mode database's last connection removes
// its -wal, so one still here may hold unmerged changes.
export function restoreBackup(backupPath: string, dbPath: string): void {
  if (fs.existsSync(`${dbPath}-wal`)) {
    throw new Error(`not restoring over ${dbPath} while ${dbPath}-wal exists`);
  }
  const journal = `${dbPath}-journal`;
  if (fs.existsSync(journal)) {
    if (isHotJournal(journal)) {
      throw new Error(`not restoring over ${dbPath} while a hot ${journal} exists`);
    }
    logger.warn(`Removing the inert journal ${journal} before restoring ${backupPath}`);
    fs.unlinkSync(journal);
  }
  const tmp = `${dbPath}.restore-tmp`;
  try {
    fs.copyFileSync(backupPath, tmp);
    fsyncFile(tmp);
    fs.renameSync(tmp, dbPath);
  } catch (err) {
    unlinkBestEffort(tmp);
    throw err;
  }
  fsyncDirectory(path.dirname(dbPath));
}

function isHotJournal(journal: string): boolean {
  const fd = fs.openSync(journal, 'r');
  try {
    const first = Buffer.alloc(1);
    return fs.readSync(fd, first, 0, 1, 0) === 1 && first[0] !== 0;
  } finally {
    fs.closeSync(fd);
  }
}

// Cleanup of a temp file after a failure: ENOENT (never created) is expected;
// anything else leaves it behind, so it is logged. The next write or copy
// overwrites a leftover file (not a directory: that keeps failing until removed).
function unlinkBestEffort(file: string): void {
  try {
    fs.unlinkSync(file);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      logger.warn(`Could not remove ${file}: ${(err as Error).message}`);
    }
  }
}

// Node's fsync errors name no file; these name it.
function withPath(err: unknown, what: string): Error {
  return new Error(`${what} failed: ${(err as Error).message}`);
}

// Windows can only flush a handle opened for writing; elsewhere a read-only
// handle works, and a backup without owner-write still restores.
function fsyncFile(file: string): void {
  const fd = fs.openSync(file, process.platform === 'win32' ? 'r+' : 'r');
  try {
    fs.fsyncSync(fd);
  } catch (err) {
    throw withPath(err, `fsync ${file}`);
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

// A rename or unlink is durable only once its directory entry is: fsync the
// directory. A platform that can't open or fsync a directory skips it: expected
// on Windows dev machines (debug); anywhere else it means this filesystem (a
// FUSE or 9p mount, say) gives no durability, so it warns.
function fsyncDirectory(dir: string): void {
  let fd: number | undefined;
  try {
    fd = fs.openSync(dir, 'r');
    fs.fsyncSync(fd);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== 'EPERM' && code !== 'EISDIR' && code !== 'EINVAL') {
      throw withPath(err, `fsync ${dir}`);
    }
    const line = `Directory fsync not supported for ${dir} (${code}); skipped`;
    if (process.platform === 'win32') {
      logger.debug(line);
    } else {
      logger.warn(line);
    }
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
  entry: Omit<MigrationSentinel, 'startedAt'>,
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
    unlinkBestEffort(tmp);
    throw withPath(err, `writing migration sentinel ${target}`);
  }
  fsyncDirectory(path.dirname(target));
}

// null: no sentinel. 'unreadable': any read error but ENOENT, or content that
// isn't JSON with string backupPath / lastApplied / startedAt; the caller must
// not treat it as absent.
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

// The -wal with content, or the hot -journal, that SQLite would apply to `file`,
// so that a copy of the file alone isn't the same database; or null.
function pendingSidecar(file: string): string | null {
  // SQLite looks beside the file a symlink points at.
  const real = fs.realpathSync(file);
  const wal = `${real}-wal`;
  if ((fs.statSync(wal, { throwIfNoEntry: false })?.size ?? 0) > 0) {
    return wal;
  }
  const journal = `${real}-journal`;
  return fs.existsSync(journal) && isHotJournal(journal) ? journal : null;
}

// Why the backup a sentinel names can't be restored, or null if it can. It
// must exist, pass quick_check, and record the sentinel's last applied
// migration: quick_check answers ok for an empty file, and
// restoring one would look like a fresh install that migrates from scratch.
// It must also hold no migration outside `known` (this build's), so a backup a
// newer build wrote is refused before anything is restored (T-006).
// Nor may it have a pending sidecar: restoreBackup copies only the main file,
// while the checks read a -wal with it and refuse a hot -journal less clearly. An
// empty -wal is fine: the read-only open here leaves that beside a WAL-mode backup.
export function sentinelBackupProblem(
  sentinel: Pick<MigrationSentinel, 'backupPath' | 'lastApplied'>,
  known: ReadonlySet<string>,
): string | null {
  const { backupPath, lastApplied } = sentinel;
  let sidecar: string | null;
  try {
    fs.statSync(backupPath);
    sidecar = pendingSidecar(backupPath);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    return code === 'ENOENT'
      ? `its backup ${backupPath} is missing`
      : `its backup ${backupPath} can't be accessed (${code})`;
  }
  if (sidecar !== null) {
    return `its backup ${backupPath} can't be restored alone: ${sidecar} may be part of it`;
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
    const applied = (
      backup.prepare(`SELECT name FROM ${KYSELY_MIGRATION_TABLE}`).all() as { name: string }[]
    ).map((r) => r.name);
    const unknown = unknownMigrations(applied, known);
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
