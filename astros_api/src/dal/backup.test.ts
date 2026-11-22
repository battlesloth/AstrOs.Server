import { describe, it, expect, beforeEach, afterEach } from 'vitest';
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
import os from 'os';
import path from 'path';
import { createKyselyConnection, migrateToLatest } from './database.js';
import {
  checkPendingMigrations,
  compareMigrationNames,
  findUnknownAppliedMigrations,
  getLastAppliedMigrationName,
  createBackup,
  pruneOldBackups,
  restoreBackup,
} from './backup.js';

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
    });
  });
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
