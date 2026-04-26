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
  getLastAppliedMigrationName,
  createBackup,
  pruneOldBackups,
  restoreBackup,
} from './backup.js';

async function expectedMigrationNames(): Promise<string[]> {
  return Object.keys(await provider.getMigrations()).sort();
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
