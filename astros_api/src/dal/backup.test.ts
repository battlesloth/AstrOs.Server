import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import SQLite from 'better-sqlite3';
import { Migration, MigrationProvider } from 'kysely';
import {
  migration_0,
  migration_1,
  migration_2,
  migration_3,
  migration_4,
} from './migrations/index.js';
import fs from 'fs';
import { logger as backupLogger } from '../logger.js';
import os from 'os';
import path from 'path';
import { createKyselyConnection, migrateToLatest } from './database.js';
import {
  checkPendingMigrations,
  compareMigrationNames,
  findUnknownAppliedMigrations,
  migrationOrderProblem,
  getLastAppliedMigrationName,
  createBackup,
  pruneOldBackups,
  restoreBackup,
  migrationSentinelPath,
  writeMigrationSentinel,
  readMigrationSentinel,
  removeMigrationSentinel,
  sentinelBackupProblem,
} from './backup.js';

// chmod only restricts a non-root POSIX process.
const CHMOD_RESTRICTS = process.platform !== 'win32' && process.getuid?.() !== 0;

async function expectedMigrationNames(): Promise<string[]> {
  return Object.keys(await provider.getMigrations()).sort(compareMigrationNames);
}

const provider: MigrationProvider = new (class implements MigrationProvider {
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

describe('backup module', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astros-backup-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('checkPendingMigrations', () => {
    it('returns all migrations on a fresh DB with no kysely_migration table', async () => {
      const { db } = createKyselyConnection();

      const pending = await checkPendingMigrations(db, provider);
      expect(pending).toEqual(await expectedMigrationNames());

      await db.destroy();
    });

    it('returns [] on a fully migrated DB', async () => {
      const { db } = createKyselyConnection();
      await migrateToLatest(db);

      const pending = await checkPendingMigrations(db, provider);
      expect(pending).toEqual([]);

      await db.destroy();
    });
  });

  describe('findUnknownAppliedMigrations', () => {
    const noop: Migration = {
      async up() {
        return;
      },
    };
    const knownProvider: MigrationProvider = new (class implements MigrationProvider {
      async getMigrations(): Promise<Record<string, Migration>> {
        return { '0_initial': noop, '2_second': noop, '10_late_addition': noop };
      }
    })();

    // Seeds kysely_migration by hand so the applied set is exactly `names`.
    // migrateToLatest would apply the full production provider instead.
    function connectionWithApplied(names: string[]) {
      const conn = createKyselyConnection();
      conn.raw
        .prepare('CREATE TABLE kysely_migration (name TEXT PRIMARY KEY, timestamp TEXT NOT NULL)')
        .run();
      const insertMig = conn.raw.prepare('INSERT INTO kysely_migration VALUES (?, ?)');
      for (const name of names) insertMig.run(name, '2026-10-22T00:00:00.000Z');
      return conn;
    }

    it('orders unknown m<NNN>_ names by number, after unknown legacy names (a downgrade after T-013)', async () => {
      // Break: the guard listing a newer server's m-migrations out of the
      // canonical order (slug order here runs opposite to number order), or
      // before an old sibling branch's legacy name.
      const { db } = connectionWithApplied(['0_initial', 'm012_a', 'm011_z', '99_future']);
      expect(await findUnknownAppliedMigrations(db, knownProvider)).toEqual([
        '99_future',
        'm011_z',
        'm012_a',
      ]);
      await db.destroy();
    });

    it('findUnknownAppliedMigrations returns [] when there is no migration table', async () => {
      const { db } = createKyselyConnection();

      expect(await findUnknownAppliedMigrations(db, knownProvider)).toEqual([]);

      await db.destroy();
    });

    it('returns [] when every applied migration is known', async () => {
      const { db } = connectionWithApplied(['0_initial', '2_second', '10_late_addition']);

      expect(await findUnknownAppliedMigrations(db, knownProvider)).toEqual([]);

      await db.destroy();
    });

    it("returns ['99_future'] when the database has an extra applied migration", async () => {
      const { db } = connectionWithApplied([
        '0_initial',
        '2_second',
        '10_late_addition',
        '99_future',
      ]);

      expect(await findUnknownAppliedMigrations(db, knownProvider)).toEqual(['99_future']);

      await db.destroy();
    });

    it('returns several unknown names in numeric-prefix order', async () => {
      // Inserted out of order; plain .sort() would put '100_' before '99_'.
      const { db } = connectionWithApplied(['0_initial', '100_later', '99_future']);

      expect(await findUnknownAppliedMigrations(db, knownProvider)).toEqual([
        '99_future',
        '100_later',
      ]);

      await db.destroy();
    });

    it('flags a sibling branch migration that shares a known number', async () => {
      // The real branch switch: both branches added their own `2_*`. Detection
      // must compare names, not numeric prefixes.
      const { db } = connectionWithApplied(['0_initial', '2_second', '2_sibling_branch']);

      expect(await findUnknownAppliedMigrations(db, knownProvider)).toEqual(['2_sibling_branch']);

      await db.destroy();
    });

    it('returns [] when the migration table exists but is empty', async () => {
      // Kysely creates the table before running 0_initial, so a failed first
      // migration leaves it empty.
      const { db } = connectionWithApplied([]);

      expect(await findUnknownAppliedMigrations(db, knownProvider)).toEqual([]);

      await db.destroy();
    });

    it('ignores pending (known, unapplied) migrations', async () => {
      const { db } = connectionWithApplied(['0_initial']);

      expect(await findUnknownAppliedMigrations(db, knownProvider)).toEqual([]);

      await db.destroy();
    });
  });

  describe('getLastAppliedMigrationName', () => {
    it('returns null on a DB with no kysely_migration table', async () => {
      const { db } = createKyselyConnection();

      const last = await getLastAppliedMigrationName(db, provider);
      expect(last).toBeNull();

      await db.destroy();
    });

    it('returns the latest applied migration in provider order', async () => {
      const { db } = createKyselyConnection();
      await migrateToLatest(db);

      const last = await getLastAppliedMigrationName(db, provider);
      const all = await expectedMigrationNames();
      expect(last).toBe(all[all.length - 1]);

      await db.destroy();
    });

    it('orders multi-digit legacy names by number', async () => {
      // Multi-digit legacy names can't be in the production registry
      // (database.test.ts rejects them: Kysely's plain .sort() would run '10_'
      // before '2_'), but one can reach a provider or database from an old
      // sibling branch, and compareMigrationNames still orders them by number.
      // This provider is one Kysely itself would refuse; it pins the comparator,
      // not a registry Kysely accepts.
      const numericProvider: MigrationProvider = new (class implements MigrationProvider {
        async getMigrations(): Promise<Record<string, Migration>> {
          const noop: Migration = {
            async up() {
              return;
            },
          };
          return {
            '0_initial': noop,
            '2_second': noop,
            '10_late_addition': noop,
          };
        }
      })();

      const { db, raw } = createKyselyConnection();
      raw
        .prepare('CREATE TABLE kysely_migration (name TEXT PRIMARY KEY, timestamp TEXT NOT NULL)')
        .run();
      const insertMig = raw.prepare('INSERT INTO kysely_migration VALUES (?, ?)');
      insertMig.run('0_initial', '2026-01-01T00:00:00.000Z');
      insertMig.run('2_second', '2026-01-02T00:00:00.000Z');
      insertMig.run('10_late_addition', '2026-01-03T00:00:00.000Z');

      const last = await getLastAppliedMigrationName(db, numericProvider);
      expect(last).toBe('10_late_addition');

      const pending = await checkPendingMigrations(db, numericProvider);
      expect(pending).toEqual([]);

      await db.destroy();
    });
  });

  describe('createBackup', () => {
    it('writes a backup file with the expected name and matching contents', async () => {
      const dbPath = path.join(tmpDir, 'database.sqlite3');
      const sqlite = new SQLite(dbPath);
      sqlite.prepare('CREATE TABLE t (id INTEGER)').run();
      const insert = sqlite.prepare('INSERT INTO t VALUES (?)');
      insert.run(1);
      insert.run(2);
      insert.run(3);

      const backupPath = await createBackup(sqlite, dbPath, '4_add_random_wait');

      expect(backupPath).toBe(`${dbPath}.backup-4_add_random_wait`);
      expect(fs.existsSync(backupPath)).toBe(true);

      const backupSqlite = new SQLite(backupPath, { readonly: true });
      const rows = backupSqlite.prepare('SELECT id FROM t ORDER BY id').all();
      expect(rows).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
      backupSqlite.close();
      sqlite.close();
    });

    it('overwrites a same-version backup file', async () => {
      const dbPath = path.join(tmpDir, 'database.sqlite3');
      const sqlite = new SQLite(dbPath);
      sqlite.prepare('CREATE TABLE t (id INTEGER)').run();

      sqlite.prepare('INSERT INTO t VALUES (?)').run(1);
      await createBackup(sqlite, dbPath, '4_add_random_wait');

      sqlite.prepare('INSERT INTO t VALUES (?)').run(2);
      const backupPath = await createBackup(sqlite, dbPath, '4_add_random_wait');

      const backupSqlite = new SQLite(backupPath, { readonly: true });
      const rows = backupSqlite.prepare('SELECT id FROM t ORDER BY id').all();
      expect(rows).toEqual([{ id: 1 }, { id: 2 }]);

      const files = fs.readdirSync(tmpDir).filter((f) => f.startsWith('database.sqlite3.backup-'));
      expect(files).toEqual(['database.sqlite3.backup-4_add_random_wait']);

      backupSqlite.close();
      sqlite.close();
    });
  });

  describe('pruneOldBackups', () => {
    it('keeps the 5 newest backups by mtime, deletes older', () => {
      const dbPath = path.join(tmpDir, 'database.sqlite3');
      const names = ['v1', 'v2', 'v3', 'v4', 'v5', 'v6', 'v7'];
      const baseTime = Date.now() - 60_000;
      names.forEach((n, i) => {
        const p = `${dbPath}.backup-${n}`;
        fs.writeFileSync(p, `data-${n}`);
        const t = (baseTime + i * 1000) / 1000;
        fs.utimesSync(p, t, t);
      });

      // Decoy: a non-backup file should not be touched
      fs.writeFileSync(path.join(tmpDir, 'not-a-backup.txt'), 'keep me');

      pruneOldBackups(dbPath, 5);

      const remaining = fs
        .readdirSync(tmpDir)
        .filter((f) => f.startsWith('database.sqlite3.backup-'))
        .sort();
      expect(remaining).toEqual([
        'database.sqlite3.backup-v3',
        'database.sqlite3.backup-v4',
        'database.sqlite3.backup-v5',
        'database.sqlite3.backup-v6',
        'database.sqlite3.backup-v7',
      ]);

      expect(fs.existsSync(path.join(tmpDir, 'not-a-backup.txt'))).toBe(true);
    });

    it('is a no-op when there are fewer backups than the keep count', () => {
      const dbPath = path.join(tmpDir, 'database.sqlite3');
      fs.writeFileSync(`${dbPath}.backup-a`, 'a');
      fs.writeFileSync(`${dbPath}.backup-b`, 'b');

      pruneOldBackups(dbPath, 5);

      const remaining = fs
        .readdirSync(tmpDir)
        .filter((f) => f.startsWith('database.sqlite3.backup-'));
      expect(remaining.length).toBe(2);
    });

    it('prunes correctly with a custom dbPath basename (regression: prefix derived from dbPath)', () => {
      const dbPath = path.join(tmpDir, 'custom.sqlite3');
      const names = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
      const baseTime = Date.now() - 60_000;
      names.forEach((n, i) => {
        const p = `${dbPath}.backup-${n}`;
        fs.writeFileSync(p, `data-${n}`);
        const t = (baseTime + i * 1000) / 1000;
        fs.utimesSync(p, t, t);
      });

      // Unrelated backup file from a different db basename in the same dir
      // must be left alone.
      fs.writeFileSync(path.join(tmpDir, 'database.sqlite3.backup-x'), 'untouched');

      pruneOldBackups(dbPath, 5);

      const customRemaining = fs
        .readdirSync(tmpDir)
        .filter((f) => f.startsWith('custom.sqlite3.backup-'))
        .sort();
      expect(customRemaining).toEqual([
        'custom.sqlite3.backup-c',
        'custom.sqlite3.backup-d',
        'custom.sqlite3.backup-e',
        'custom.sqlite3.backup-f',
        'custom.sqlite3.backup-g',
      ]);

      // Different-basename backup is not pruned
      expect(fs.existsSync(path.join(tmpDir, 'database.sqlite3.backup-x'))).toBe(true);
    });
  });

  describe('restoreBackup', () => {
    it('copies the backup file over the db path', () => {
      const dbPath = path.join(tmpDir, 'database.sqlite3');
      const backupPath = path.join(tmpDir, 'database.sqlite3.backup-x');

      fs.writeFileSync(dbPath, 'corrupt');
      fs.writeFileSync(backupPath, 'good-data');

      restoreBackup(backupPath, dbPath);

      expect(fs.readFileSync(dbPath, 'utf8')).toBe('good-data');
      expect(fs.readdirSync(tmpDir).sort()).toEqual([
        'database.sqlite3',
        'database.sqlite3.backup-x',
      ]);
    });

    it.each([
      ['a hot -journal', '-journal'],
      ['a -wal', '-wal'],
    ])('refuses to rename over a database with %s beside it', (_label, suffix) => {
      // Break: SQLite replaying the old file's hot journal onto the restored
      // one, a silent mix of both that still passes quick_check.
      const dbPath = path.join(tmpDir, 'database.sqlite3');
      const backupPath = path.join(tmpDir, 'database.sqlite3.backup-x');
      fs.writeFileSync(dbPath, 'half-migrated');
      fs.writeFileSync(`${dbPath}${suffix}`, 'hot');
      fs.writeFileSync(backupPath, 'good-data');
      expect(() => restoreBackup(backupPath, dbPath)).toThrow(suffix);
      expect(fs.readFileSync(dbPath, 'utf8')).toBe('half-migrated');
      expect(fs.readdirSync(tmpDir).sort()).toEqual(
        ['database.sqlite3', `database.sqlite3${suffix}`, 'database.sqlite3.backup-x'].sort(),
      );
    });

    it.each([
      ['empty', Buffer.alloc(0)],
      ['zero-header', Buffer.alloc(512)],
    ])('clears an inert (%s) -journal and restores', (_label, bytes) => {
      // Break: refusing a journal SQLite itself ignores (left by a power cut
      // before its first fsync), which no read clears, so every boot fails
      // the restore and recovery never happens.
      const dbPath = path.join(tmpDir, 'database.sqlite3');
      const backupPath = path.join(tmpDir, 'database.sqlite3.backup-x');
      fs.writeFileSync(dbPath, 'half-migrated');
      fs.writeFileSync(`${dbPath}-journal`, bytes);
      fs.writeFileSync(backupPath, 'good-data');
      const warn = vi.spyOn(backupLogger, 'warn');
      try {
        restoreBackup(backupPath, dbPath);
        expect(warn).toHaveBeenCalledWith(
          expect.stringContaining(`Removing the inert journal ${dbPath}-journal`),
        );
      } finally {
        warn.mockRestore();
      }
      expect(fs.readFileSync(dbPath, 'utf8')).toBe('good-data');
      expect(fs.readdirSync(tmpDir).sort()).toEqual([
        'database.sqlite3',
        'database.sqlite3.backup-x',
      ]);
    });

    it('checks for a -wal before it touches an inert -journal', () => {
      // Break: deleting the journal and then refusing anyway.
      const dbPath = path.join(tmpDir, 'database.sqlite3');
      const backupPath = path.join(tmpDir, 'database.sqlite3.backup-x');
      fs.writeFileSync(dbPath, 'half-migrated');
      fs.writeFileSync(`${dbPath}-journal`, '');
      fs.writeFileSync(`${dbPath}-wal`, 'wal');
      fs.writeFileSync(backupPath, 'good-data');
      expect(() => restoreBackup(backupPath, dbPath)).toThrow('-wal');
      expect(fs.existsSync(`${dbPath}-journal`)).toBe(true);
    });

    it('logs a temp copy it could not clean up', () => {
      // Break: swallowing the cleanup error, so what was left behind goes unlogged.
      const dbPath = path.join(tmpDir, 'database.sqlite3');
      const backupPath = path.join(tmpDir, 'database.sqlite3.backup-x');
      fs.writeFileSync(dbPath, 'half-migrated');
      fs.writeFileSync(backupPath, 'good-data');
      fs.mkdirSync(`${dbPath}.restore-tmp`);
      const warn = vi.spyOn(backupLogger, 'warn');
      try {
        expect(() => restoreBackup(backupPath, dbPath)).toThrow();
        expect(warn).toHaveBeenCalledWith(
          expect.stringContaining(`Could not remove ${dbPath}.restore-tmp`),
        );
      } finally {
        warn.mockRestore();
      }
    });

    it('overwrites a temp copy a crash left behind', () => {
      const dbPath = path.join(tmpDir, 'database.sqlite3');
      const backupPath = path.join(tmpDir, 'database.sqlite3.backup-x');
      fs.writeFileSync(dbPath, 'half-migrated');
      fs.writeFileSync(`${dbPath}.restore-tmp`, 'a much longer torn copy from an earlier crash');
      fs.writeFileSync(backupPath, 'good-data');
      restoreBackup(backupPath, dbPath);
      expect(fs.readFileSync(dbPath, 'utf8')).toBe('good-data');
      expect(fs.readdirSync(tmpDir).sort()).toEqual([
        'database.sqlite3',
        'database.sqlite3.backup-x',
      ]);
    });

    it('leaves the database whole when the copy fails part-way', () => {
      // Break: copying straight over the database, which a power cut or a
      // full disk mid-copy leaves truncated, so the next boot can't read it
      // and never reaches the migration sentinel.
      const dbPath = path.join(tmpDir, 'database.sqlite3');
      const backupPath = path.join(tmpDir, 'database.sqlite3.backup-x');
      fs.writeFileSync(dbPath, 'half-migrated');
      fs.writeFileSync(backupPath, 'good-data');
      const spy = vi.spyOn(fs, 'copyFileSync').mockImplementation((_src, dest) => {
        fs.writeFileSync(dest as string, 'go');
        throw Object.assign(new Error('intentional ENOSPC'), { code: 'ENOSPC' });
      });
      try {
        expect(() => restoreBackup(backupPath, dbPath)).toThrow('intentional ENOSPC');
      } finally {
        spy.mockRestore();
      }
      expect(fs.readFileSync(dbPath, 'utf8')).toBe('half-migrated');
      expect(fs.readdirSync(tmpDir).sort()).toEqual([
        'database.sqlite3',
        'database.sqlite3.backup-x',
      ]);
    });

    it('throws with the database already restored when only the directory fsync fails', () => {
      // Pins the restore-failed detail's "or already the backup": the rename
      // happened, so the sentinel is kept and the next boot restores again.
      const dbPath = path.join(tmpDir, 'database.sqlite3');
      const backupPath = path.join(tmpDir, 'database.sqlite3.backup-x');
      fs.writeFileSync(dbPath, 'half-migrated');
      fs.writeFileSync(backupPath, 'good-data');
      const fail = failDirectoryFsync(tmpDir);
      try {
        expect(() => restoreBackup(backupPath, dbPath)).toThrow(`fsync ${tmpDir}`);
      } finally {
        fail.restore();
      }
      expect(fs.readFileSync(dbPath, 'utf8')).toBe('good-data');
    });

    it.runIf(CHMOD_RESTRICTS)('restores a backup without owner-write', () => {
      // Break: fsyncing the temp copy (which keeps the backup's mode) through a
      // write handle, which EACCES fails for a non-root process.
      const dbPath = path.join(tmpDir, 'database.sqlite3');
      const backupPath = path.join(tmpDir, 'database.sqlite3.backup-x');
      fs.writeFileSync(dbPath, 'half-migrated');
      fs.writeFileSync(backupPath, 'good-data');
      fs.chmodSync(backupPath, 0o444);
      restoreBackup(backupPath, dbPath);
      expect(fs.readFileSync(dbPath, 'utf8')).toBe('good-data');
    });
  });
});

// Records fsync / rename / unlink in call order, by basename (the directory as
// '<dir>'), passing every call through.
function recordDurability(dir: string): { events: string[]; restore(): void } {
  const fdPath = new Map<number, string>();
  const events: string[] = [];
  const name = (p: string) => (p === dir ? '<dir>' : path.basename(p));
  const realOpen = fs.openSync;
  const realFsync = fs.fsyncSync;
  const realRename = fs.renameSync;
  const realUnlink = fs.unlinkSync;
  const spies = [
    vi.spyOn(fs, 'openSync').mockImplementation(((p: string, ...rest: never[]) => {
      const fd = (realOpen as (...a: unknown[]) => number)(p, ...rest);
      fdPath.set(fd, String(p));
      return fd;
    }) as never),
    vi.spyOn(fs, 'fsyncSync').mockImplementation((fd) => {
      events.push(`fsync ${name(fdPath.get(fd as number) ?? '?')}`);
      realFsync(fd);
    }),
    vi.spyOn(fs, 'renameSync').mockImplementation((a, b) => {
      events.push(`rename ${name(String(a))} -> ${name(String(b))}`);
      realRename(a, b);
    }),
    vi.spyOn(fs, 'unlinkSync').mockImplementation((p) => {
      events.push(`unlink ${name(String(p))}`);
      realUnlink(p);
    }),
  ];
  return { events, restore: () => spies.forEach((s) => s.mockRestore()) };
}

// Fails fsync of `dir` only (EIO by default, or the given code at its open).
function failDirectoryFsync(dir: string, openCode?: string): { restore(): void } {
  const realOpen = fs.openSync;
  const realFsync = fs.fsyncSync;
  let dirFd = -1;
  const spies = [
    vi.spyOn(fs, 'openSync').mockImplementation(((p: string, ...rest: never[]) => {
      if (p === dir && openCode) {
        throw Object.assign(new Error(`intentional ${openCode}`), { code: openCode });
      }
      const fd = (realOpen as (...a: unknown[]) => number)(p, ...rest);
      if (p === dir) {
        dirFd = fd;
      }
      return fd;
    }) as never),
    vi.spyOn(fs, 'fsyncSync').mockImplementation((fd) => {
      if (fd === dirFd) {
        throw Object.assign(new Error('intentional EIO'), { code: 'EIO' });
      }
      realFsync(fd);
    }),
  ];
  return { restore: () => spies.forEach((s) => s.mockRestore()) };
}

// T-016: every durable step fsyncs in order, so a power cut can't undo it.
describe('durability order', () => {
  let dir: string;
  let dbFile: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astros-durability-'));
    dbFile = path.join(dir, 'database.sqlite3');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('restoreBackup fsyncs the temp copy, renames it, then fsyncs the directory', () => {
    // Break: a rename a power cut undoes, or one that lands before the copy's
    // data does, leaving a torn database.
    fs.writeFileSync(dbFile, 'half');
    fs.writeFileSync(`${dbFile}.backup-x`, 'good');
    const rec = recordDurability(dir);
    try {
      restoreBackup(`${dbFile}.backup-x`, dbFile);
    } finally {
      rec.restore();
    }
    expect(rec.events).toEqual([
      'fsync database.sqlite3.restore-tmp',
      'rename database.sqlite3.restore-tmp -> database.sqlite3',
      'fsync <dir>',
    ]);
  });

  it('writeMigrationSentinel fsyncs the temp file, renames it, then fsyncs the directory', () => {
    // Break: a sentinel a power cut loses, so the next boot backs up over the
    // only good copy.
    const rec = recordDurability(dir);
    try {
      writeMigrationSentinel(dbFile, { backupPath: 'b', lastApplied: 'l' });
    } finally {
      rec.restore();
    }
    expect(rec.events).toEqual([
      'fsync database.sqlite3.migration-in-progress.tmp',
      'rename database.sqlite3.migration-in-progress.tmp -> database.sqlite3.migration-in-progress',
      'fsync <dir>',
    ]);
  });

  it('removeMigrationSentinel unlinks, then fsyncs the directory', () => {
    // Break: an unlink a power cut undoes, bringing the sentinel back to
    // restore the pre-migration backup over everything written since.
    writeMigrationSentinel(dbFile, { backupPath: 'b', lastApplied: 'l' });
    const rec = recordDurability(dir);
    try {
      removeMigrationSentinel(dbFile);
    } finally {
      rec.restore();
    }
    expect(rec.events).toEqual(['unlink database.sqlite3.migration-in-progress', 'fsync <dir>']);
  });

  it('propagates a directory fsync EIO, naming the directory', () => {
    // Break: swallowing every directory fsync error, so a removal that may not
    // be durable lets the server come up writable.
    writeMigrationSentinel(dbFile, { backupPath: 'b', lastApplied: 'l' });
    const fail = failDirectoryFsync(dir);
    try {
      expect(() => removeMigrationSentinel(dbFile)).toThrow(`fsync ${dir} failed: intentional EIO`);
    } finally {
      fail.restore();
    }
  });

  it('leaves a complete sentinel when only the directory fsync after its rename fails', () => {
    // Pins writeMigrationSentinel's comment: the next boot restores it
    // harmlessly (its backup is identical to the unmigrated database).
    const fail = failDirectoryFsync(dir);
    try {
      expect(() => writeMigrationSentinel(dbFile, { backupPath: 'b', lastApplied: 'l' })).toThrow(
        'intentional EIO',
      );
    } finally {
      fail.restore();
    }
    expect(readMigrationSentinel(dbFile)).toMatchObject({ backupPath: 'b', lastApplied: 'l' });
  });

  it.each(['EPERM', 'EISDIR', 'EINVAL'])(
    'skips a directory fsync the platform refuses (%s), with a log line',
    (code) => {
      // Break: failing the write on a filesystem that can't fsync a directory,
      // or skipping with nothing visible off Windows.
      const level = process.platform === 'win32' ? 'debug' : 'warn';
      const log = vi.spyOn(backupLogger, level);
      const fail = failDirectoryFsync(dir, code);
      try {
        writeMigrationSentinel(dbFile, { backupPath: 'b', lastApplied: 'l' });
      } finally {
        fail.restore();
      }
      expect(readMigrationSentinel(dbFile)).toMatchObject({ backupPath: 'b' });
      expect(log).toHaveBeenCalledWith(expect.stringContaining(`fsync not supported for ${dir}`));
    },
  );
});

// Kysely runs migrations in plain .sort() order (Migrator#resolveMigrations
// ignores nameComparator in 0.27.6, installed, and in 0.29.9), so
// compareMigrationNames must order every valid name exactly as plain .sort()
// does (T-012).
describe('compareMigrationNames', () => {
  const sorted = (names: string[]) => [...names].sort(compareMigrationNames);

  it('orders legacy names by their number', () => {
    // Break: comparing legacy names as plain strings puts '10_b' before '2_a'
    // (multi-digit names can still arrive from an old sibling branch's database).
    expect(sorted(['10_b', '2_a'])).toEqual(['2_a', '10_b']);
  });

  it('sorts m-prefixed names after every legacy name', () => {
    // Break: an m<NNN>_ name ordered before a legacy one would make the
    // newer-database guard and backup naming disagree with Kysely's run order.
    expect(sorted(['m010_a', '9_z', '10_x'])).toEqual(['9_z', '10_x', 'm010_a']);
  });

  it('orders m-prefixed names by their number', () => {
    expect(sorted(['m011_a', 'm010_z'])).toEqual(['m010_z', 'm011_a']);
  });

  it("breaks a tie on the number in code-unit order, as Kysely's resolver does", () => {
    // Break: a locale-aware suffix compare collates '_' before digits, while
    // plain .sort() puts digits ('1', 0x31) before '_' (0x5f).
    expect(sorted(['9_a_b', '9_a1'])).toEqual(['9_a1', '9_a_b']);
    expect(sorted(['m010_a_b', 'm010_a1'])).toEqual(['m010_a1', 'm010_a_b']);
  });

  it('sorts names matching neither scheme after every valid name', () => {
    // Break: an unrecognized name (e.g. from a tampered row) interleaved with
    // valid ones in the newer-database guard's message.
    expect(sorted(['foo', 'm010_x', '9_x'])).toEqual(['9_x', 'm010_x', 'foo']);
  });

  it('never calls two different names equal', () => {
    // Break: returning 0 when number and slug match ('09_x' vs '9_x'), which
    // leaves their order to the input order (e.g. kysely_migration row order).
    expect(compareMigrationNames('09_x', '9_x')).toBeLessThan(0);
    expect(compareMigrationNames('9_x', '09_x')).toBeGreaterThan(0);
    expect(compareMigrationNames('9_x', '9_x')).toBe(0);
  });

  it('gives the order Kysely runs migrations in, for the production names and the new scheme', () => {
    const want = [
      '0_initial',
      '1_add_script_evt_id',
      '2_add_script_duration',
      '3_add_playlists',
      '4_add_random_wait',
      '5_fix_controller_locations_type',
      '6_add_foreign_keys',
      '7_rename_remote_config_key',
      '8_fix_script_duration_units',
      '9_add_script_event_end_time',
      'm010_add_maestro_release_ms',
      'm011_next',
      'm900_test_safe_addition',
    ];
    const shuffled = [
      want[11],
      want[3],
      want[12],
      want[0],
      want[10],
      want[9],
      want[5],
      want[1],
      want[8],
      want[2],
      want[7],
      want[4],
      want[6],
    ];
    expect(sorted(shuffled)).toEqual(want);
    // The upstream assumption this rests on: plain .sort() gives the same order.
    expect([...shuffled].sort()).toEqual(want);
  });
});

// T-016: a migration-in-progress sentinel records the backup a migration run
// started from, so a boot after an interrupted run restores it instead of
// overwriting it.
describe('migration sentinel', () => {
  let dir: string;
  let dbFile: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astros-sentinel-'));
    dbFile = path.join(dir, 'database.sqlite3');
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('is named after the database file', () => {
    expect(migrationSentinelPath(dbFile)).toBe(`${dbFile}.migration-in-progress`);
  });

  it('round-trips the backup path and last applied migration, with a start time', () => {
    // Break: a sentinel that loses the backup path can't drive a restore.
    writeMigrationSentinel(dbFile, { backupPath: `${dbFile}.backup-9_x`, lastApplied: '9_x' });
    const read = readMigrationSentinel(dbFile);
    expect(read).toMatchObject({ backupPath: `${dbFile}.backup-9_x`, lastApplied: '9_x' });
    expect(typeof (read as { startedAt: string }).startedAt).toBe('string');
    expect(Number.isNaN(Date.parse((read as { startedAt: string }).startedAt))).toBe(false);
  });

  it('leaves no temp file behind after a successful write', () => {
    // Break: leaving <sentinel>.tmp beside the database (e.g. copying it
    // instead of renaming).
    writeMigrationSentinel(dbFile, { backupPath: 'b', lastApplied: 'l' });
    expect(fs.readdirSync(dir).sort()).toEqual(['database.sqlite3.migration-in-progress']);
  });

  it('removes the temp file when the write fails, naming the sentinel', () => {
    // Break: the temp file left behind after a failed fsync, or an error that
    // doesn't say which file.
    const spy = vi.spyOn(fs, 'fsyncSync').mockImplementationOnce(() => {
      throw Object.assign(new Error('intentional EIO'), { code: 'EIO' });
    });
    try {
      expect(() => writeMigrationSentinel(dbFile, { backupPath: 'b', lastApplied: 'l' })).toThrow(
        `writing migration sentinel ${migrationSentinelPath(dbFile)} failed: intentional EIO`,
      );
    } finally {
      spy.mockRestore();
    }
    expect(fs.readdirSync(dir)).toEqual([]);
  });

  it('reads as null when there is none', () => {
    expect(readMigrationSentinel(dbFile)).toBeNull();
  });

  it.each([
    ['not JSON', '{'],
    [
      'missing backupPath',
      JSON.stringify({ lastApplied: 'l', startedAt: '2026-11-22T00:00:00.000Z' }),
    ],
    [
      'missing lastApplied',
      JSON.stringify({ backupPath: 'b', startedAt: '2026-11-22T00:00:00.000Z' }),
    ],
    ['missing startedAt', JSON.stringify({ backupPath: 'b', lastApplied: 'l' })],
    [
      'a non-string field',
      JSON.stringify({ backupPath: 1, lastApplied: 'l', startedAt: '2026-11-22T00:00:00.000Z' }),
    ],
  ])('reads as unreadable when it is %s', (_label, content) => {
    // Break: a damaged sentinel treated as absent, so the next boot backs up
    // over the only good copy.
    fs.writeFileSync(migrationSentinelPath(dbFile), content);
    expect(readMigrationSentinel(dbFile)).toBe('unreadable');
  });

  it('reads as unreadable when the path is a directory', () => {
    fs.mkdirSync(migrationSentinelPath(dbFile));
    expect(readMigrationSentinel(dbFile)).toBe('unreadable');
  });

  it('removes the sentinel, and ignores one that is already gone', () => {
    writeMigrationSentinel(dbFile, { backupPath: 'b', lastApplied: 'l' });
    removeMigrationSentinel(dbFile);
    expect(fs.existsSync(migrationSentinelPath(dbFile))).toBe(false);
    expect(() => removeMigrationSentinel(dbFile)).not.toThrow();
  });
});

// T-016: the backup a sentinel names is restored only when it has no pending
// -wal or -journal, opens, passes quick_check, records the sentinel's last
// applied migration, and holds no migration this build doesn't know.
describe('sentinelBackupProblem', () => {
  const KNOWN: ReadonlySet<string> = new Set(['8_x', '9_x']);
  let dir: string;
  let backupPath: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astros-sentinel-backup-'));
    backupPath = path.join(dir, 'database.sqlite3.backup-9_x');
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  function writeBackup(applied: string[]): void {
    const db = new SQLite(backupPath);
    db.prepare('CREATE TABLE kysely_migration (name TEXT PRIMARY KEY, timestamp TEXT)').run();
    for (const name of applied) {
      db.prepare('INSERT INTO kysely_migration VALUES (?, ?)').run(
        name,
        '2026-11-22T00:00:00.000Z',
      );
    }
    db.close();
  }

  it('accepts a backup that records the last applied migration', () => {
    writeBackup(['8_x', '9_x']);
    expect(sentinelBackupProblem({ backupPath, lastApplied: '9_x' }, KNOWN)).toBeNull();
  });

  it('rejects a missing backup', () => {
    expect(sentinelBackupProblem({ backupPath, lastApplied: '9_x' }, KNOWN)).toBe(
      `its backup ${backupPath} is missing`,
    );
  });

  it('rejects a backup that is not a database', () => {
    // Break: checking existence only, so garbage is restored over the database.
    fs.writeFileSync(backupPath, 'not a database at all, just bytes '.repeat(200));
    expect(sentinelBackupProblem({ backupPath, lastApplied: '9_x' }, KNOWN)).toMatch(
      /can't be read|can't be opened|quick_check/,
    );
    expect(fs.readdirSync(dir)).toEqual(['database.sqlite3.backup-9_x']);
  });

  it('rejects an empty backup, which quick_check alone accepts', () => {
    // Break: an empty file restored looks like a fresh install, so the server
    // migrates from scratch and comes up empty with no banner.
    fs.writeFileSync(backupPath, '');
    expect(sentinelBackupProblem({ backupPath, lastApplied: '9_x' }, KNOWN)).toMatch(
      /no record of migration 9_x/,
    );
  });

  it('rejects a backup whose changes are still in its -wal, touching nothing', () => {
    // Break: checking the view SQLite merges from both files, when restoreBackup
    // copies only the main one. Here the row the check needs is in the -wal.
    writeBackup(['8_x']);
    const stage = path.join(dir, 'stage');
    fs.copyFileSync(backupPath, stage);
    const db = new SQLite(stage);
    db.pragma('journal_mode = WAL');
    db.pragma('wal_checkpoint(TRUNCATE)');
    db.prepare("INSERT INTO kysely_migration VALUES ('9_x', '2026-11-22T00:00:00.000Z')").run();
    // As a program killed on the copy leaves them: no close, so no checkpoint.
    fs.copyFileSync(stage, backupPath);
    fs.copyFileSync(`${stage}-wal`, `${backupPath}-wal`);
    db.close();
    fs.rmSync(stage);
    const before = fs.readdirSync(dir);

    expect(sentinelBackupProblem({ backupPath, lastApplied: '9_x' }, KNOWN)).toBe(
      `its backup ${backupPath} can't be restored alone: ${fs.realpathSync(backupPath)}-wal may be part of it`,
    );
    expect(fs.readdirSync(dir)).toEqual(before);
  });

  it('rejects a backup with a hot -journal, touching nothing; an inert one is fine', () => {
    // Break: leaving it to SQLite, whose "attempt to write a readonly database"
    // sends the operator after permissions.
    writeBackup(['8_x', '9_x']);
    fs.writeFileSync(`${backupPath}-journal`, 'a hot journal');
    const before = fs.readdirSync(dir);
    expect(sentinelBackupProblem({ backupPath, lastApplied: '9_x' }, KNOWN)).toBe(
      `its backup ${backupPath} can't be restored alone: ${fs.realpathSync(backupPath)}-journal may be part of it`,
    );
    expect(fs.readdirSync(dir)).toEqual(before);
    for (const inert of [Buffer.alloc(0), Buffer.alloc(512)]) {
      fs.writeFileSync(`${backupPath}-journal`, inert);
      expect(sentinelBackupProblem({ backupPath, lastApplied: '9_x' }, KNOWN)).toBeNull();
    }
  });

  it.runIf(process.platform !== 'win32')(
    'looks for the -wal or -journal beside the file a symlinked backup points at',
    () => {
      // Break: looking beside the link. SQLite resolves it first, so it reads the
      // target's -wal and ignores one beside the link.
      writeBackup(['8_x', '9_x']);
      const target = path.join(dir, 'target.sqlite3');
      fs.renameSync(backupPath, target);
      fs.symlinkSync(target, backupPath);
      fs.writeFileSync(`${backupPath}-wal`, 'ignored by SQLite');
      expect(sentinelBackupProblem({ backupPath, lastApplied: '9_x' }, KNOWN)).toBeNull();
      for (const suffix of ['-wal', '-journal']) {
        fs.writeFileSync(`${target}${suffix}`, 'read by SQLite');
        expect(sentinelBackupProblem({ backupPath, lastApplied: '9_x' }, KNOWN)).toBe(
          `its backup ${backupPath} can't be restored alone: ${fs.realpathSync(target)}${suffix} may be part of it`,
        );
        fs.rmSync(`${target}${suffix}`);
      }
    },
  );

  it('accepts a WAL-mode backup again after its own check left an empty -wal', () => {
    // Break: refusing any -wal, so a restore that failed once could never be retried.
    writeBackup(['8_x', '9_x']);
    const db = new SQLite(backupPath);
    db.pragma('journal_mode = WAL');
    db.close();
    expect(sentinelBackupProblem({ backupPath, lastApplied: '9_x' }, KNOWN)).toBeNull();
    expect(fs.statSync(`${backupPath}-wal`).size).toBe(0);
    expect(sentinelBackupProblem({ backupPath, lastApplied: '9_x' }, KNOWN)).toBeNull();
  });

  it('rejects a backup with a damaged page, which the migration lookup alone accepts', () => {
    // Break: dropping quick_check. The kysely_migration row still reads, but
    // restoring this would serve a database with corrupt table data.
    writeBackup(['9_x']);
    const db = new SQLite(backupPath);
    db.prepare('CREATE TABLE filler (id INTEGER PRIMARY KEY, body TEXT)').run();
    const insert = db.prepare('INSERT INTO filler (body) VALUES (?)');
    db.transaction(() => {
      for (let i = 0; i < 400; i++) {
        insert.run('x'.repeat(200));
      }
    })();
    const pageSize = db.pragma('page_size', { simple: true }) as number;
    const pages = db.pragma('page_count', { simple: true }) as number;
    db.close();
    const fd = fs.openSync(backupPath, 'r+');
    fs.writeSync(fd, Buffer.alloc(64, 0xff), 0, 64, (pages - 1) * pageSize + 8);
    fs.closeSync(fd);

    expect(sentinelBackupProblem({ backupPath, lastApplied: '9_x' }, KNOWN)).toMatch(
      /fails quick_check/,
    );
  });

  it('rejects a backup a newer build wrote, before anything is restored', () => {
    // Break: restoring it. Nothing re-checks after a restore, so this build
    // would back up and serve a newer database.
    writeBackup(['8_x', '9_x', 'm099_future']);
    expect(sentinelBackupProblem({ backupPath, lastApplied: '9_x' }, KNOWN)).toMatch(
      /written by a newer build \(migrations this build does not know: m099_future\)/,
    );
  });

  it.runIf(CHMOD_RESTRICTS)('reports a backup it cannot access as such, not as missing', () => {
    // Break: existsSync reading EACCES as absent, which sends the operator
    // looking for a file that is there.
    writeBackup(['9_x']);
    fs.chmodSync(dir, 0o000);
    try {
      expect(sentinelBackupProblem({ backupPath, lastApplied: '9_x' }, KNOWN)).toMatch(
        /can't be accessed \(EACCES\)/,
      );
    } finally {
      fs.chmodSync(dir, 0o700);
    }
  });

  it('rejects a backup without the last applied migration', () => {
    writeBackup(['8_x']);
    expect(sentinelBackupProblem({ backupPath, lastApplied: '9_x' }, KNOWN)).toMatch(
      /no record of migration 9_x/,
    );
  });
});

// Kysely's own check orders applied migrations by their recorded clock time,
// which a droid without a battery-backed clock can get wrong (T-017). This
// check compares names only.
describe('migrationOrderProblem', () => {
  const KNOWN = ['0_a', '1_b', '2_c', '9_d', 'm010_e', 'm011_f'];

  it.each([
    ['nothing applied', []],
    ['an exact prefix', ['0_a', '1_b', '2_c']],
    ['an exact prefix out of order', ['2_c', '0_a', 'm010_e', '9_d', '1_b']],
    ['everything applied', ['m011_f', '0_a', '1_b', '2_c', '9_d', 'm010_e']],
  ])('accepts %s', (_label, applied) => {
    expect(migrationOrderProblem(KNOWN, applied)).toBeNull();
  });

  it('names an applied migration this build lacks', () => {
    expect(migrationOrderProblem(KNOWN, ['0_a', '1_b', 'm099_zz'])).toBe(
      'applied migration m099_zz is not in this build',
    );
  });

  it('names the first unknown applied migration in name order', () => {
    expect(migrationOrderProblem(KNOWN, ['0_a', 'm099_zz', 'm098_yy'])).toBe(
      'applied migration m098_yy is not in this build',
    );
  });

  it('names a gap at the very first migration', () => {
    expect(migrationOrderProblem(KNOWN, ['1_b'])).toBe(
      'pending migration 0_a sorts before applied migration 1_b; applied migrations must come first in name order',
    );
  });

  it('names a pending legacy migration that sorts before an applied one', () => {
    expect(migrationOrderProblem(KNOWN, ['0_a', '1_b', '9_d'])).toBe(
      'pending migration 2_c sorts before applied migration 9_d; applied migrations must come first in name order',
    );
  });

  // The last applied migration in name order, not in the order given.
  it('names the last applied migration by name, and the first pending one', () => {
    expect(migrationOrderProblem(KNOWN, ['m011_f', '0_a', '1_b'])).toBe(
      'pending migration 2_c sorts before applied migration m011_f; applied migrations must come first in name order',
    );
  });

  // Kysely runs pending migrations in plain text order. A name outside T-012's
  // scheme can sort differently there, and would run out of turn on a fresh
  // install or on a droid that skipped a release.
  it.each([
    ['nothing applied (a fresh install)', []],
    ['a droid that skipped a release', ['0_initial', '1_b', '2_c']],
  ])('names a misnamed migration Kysely would run out of turn: %s', (_label, applied) => {
    expect(migrationOrderProblem(['0_initial', '1_b', '2_c', '9_d', '10_x'], applied)).toBe(
      'Kysely would run migration 10_x before 1_b: migration names must sort the same as plain text and by number (T-012)',
    );
  });

  it('names an unknown applied migration before a run-order problem', () => {
    expect(migrationOrderProblem(['0_initial', '1_b', '10_x'], ['0_initial', 'm099_zz'])).toBe(
      'applied migration m099_zz is not in this build',
    );
  });

  it('checks the run order before a gap', () => {
    expect(migrationOrderProblem(['0_initial', '1_b', '10_x'], ['0_initial', '10_x'])).toBe(
      'Kysely would run migration 10_x before 1_b: migration names must sort the same as plain text and by number (T-012)',
    );
  });

  // `known` may arrive in any order (a provider's key order); the gap check
  // sorts it by name first.
  it('accepts an exact prefix when known arrives unsorted', () => {
    expect(migrationOrderProblem(['2_c', '0_a', '1_b'], ['1_b', '0_a'])).toBeNull();
  });
});
