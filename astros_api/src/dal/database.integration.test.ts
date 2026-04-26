import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import SQLite from 'better-sqlite3';
import { Migration, MigrationProvider } from 'kysely';
import { SystemStatus } from '../system_status.js';
import {
  initializeDatabase,
  closeDatabaseForTest,
  __setMigrationProviderForTest,
  __resetMigrationProviderForTest,
} from './database.js';
import {
  migration_0,
  migration_1,
  migration_2,
  migration_3,
  migration_4,
} from './migrations/index.js';

function buildProvider(extra: Record<string, Migration> = {}): MigrationProvider {
  return new (class implements MigrationProvider {
    async getMigrations(): Promise<Record<string, Migration>> {
      return {
        '0_initial': migration_0,
        '1_add_script_evt_id': migration_1,
        '2_add_script_duration': migration_2,
        '3_add_playlists': migration_3,
        '4_add_random_wait': migration_4,
        ...extra,
      };
    }
  })();
}

describe('initializeDatabase safety flow', () => {
  let tmpDir: string;
  let dbPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astros-db-int-'));
    dbPath = path.join(tmpDir, 'database.sqlite3');
  });

  afterEach(async () => {
    await closeDatabaseForTest();
    __resetMigrationProviderForTest();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('happy path on a fresh DB: takes a backup only after migrations have run at least once', async () => {
    const status = new SystemStatus();
    const db = await initializeDatabase(status, { dbPath });
    expect(db).toBeDefined();
    expect(status.isReadOnly()).toBe(false);

    // Fresh DB has no last-applied migration before this run, so no backup file is created.
    const backupFiles = fs
      .readdirSync(tmpDir)
      .filter((f) => f.startsWith('database.sqlite3.backup-'));
    expect(backupFiles).toEqual([]);
  });

  it('happy path with no pending migrations: no backup taken', async () => {
    // First run gets it migrated
    let status = new SystemStatus();
    await initializeDatabase(status, { dbPath });
    await closeDatabaseForTest();

    // Second run — nothing pending
    status = new SystemStatus();
    await initializeDatabase(status, { dbPath });
    expect(status.isReadOnly()).toBe(false);

    const backupFiles = fs
      .readdirSync(tmpDir)
      .filter((f) => f.startsWith('database.sqlite3.backup-'));
    expect(backupFiles).toEqual([]);
  });

  it('takes a backup when there is a last-applied migration AND a pending migration', async () => {
    // First run: migrate to v4
    let status = new SystemStatus();
    await initializeDatabase(status, { dbPath });
    await closeDatabaseForTest();

    // Inject a 5th migration so we have something pending
    __setMigrationProviderForTest(
      buildProvider({
        '5_safe_addition': {
          async up(db) {
            await db.schema.createTable('safe_addition').addColumn('id', 'integer').execute();
          },
          async down() {
            return;
          },
        },
      }),
    );

    status = new SystemStatus();
    await initializeDatabase(status, { dbPath });

    // Backup file named after the previous last-applied migration should exist
    const backupFiles = fs
      .readdirSync(tmpDir)
      .filter((f) => f.startsWith('database.sqlite3.backup-'));
    expect(backupFiles).toEqual(['database.sqlite3.backup-4_add_random_wait']);
    expect(status.isReadOnly()).toBe(false);
  });

  it('failed migration triggers restore from backup; system continues at pre-migration state', async () => {
    // Migrate to v4 first
    let status = new SystemStatus();
    await initializeDatabase(status, { dbPath });
    await closeDatabaseForTest();

    // Mark something distinctive in the DB so we can verify restore preserved it.
    {
      const sqlite = new SQLite(dbPath);
      sqlite.prepare('CREATE TABLE marker (note TEXT)').run();
      sqlite.prepare('INSERT INTO marker VALUES (?)').run('preserve-me');
      sqlite.close();
    }

    // Inject a migration that throws
    __setMigrationProviderForTest(
      buildProvider({
        '5_will_fail': {
          async up() {
            throw new Error('intentional migration failure');
          },
          async down() {
            return;
          },
        },
      }),
    );

    status = new SystemStatus();
    const db = await initializeDatabase(status, { dbPath });

    // Restore should have rolled back to pre-migration state — system is usable, not read-only
    expect(status.isReadOnly()).toBe(false);

    // Verify our marker survived (proves restore happened)
    const marker = await db
      .selectFrom('marker' as never)
      .select('note' as never)
      .execute();
    expect(marker).toEqual([{ note: 'preserve-me' }]);
  });

  it('backup failure (read-only dir) → enters read-only and skips migrations', async () => {
    // Migrate baseline first so a last-applied migration exists
    let status = new SystemStatus();
    await initializeDatabase(status, { dbPath });
    await closeDatabaseForTest();

    // Inject a pending migration so a backup attempt happens
    __setMigrationProviderForTest(
      buildProvider({
        '5_pending': {
          async up(db) {
            await db.schema.createTable('pending_table').addColumn('id', 'integer').execute();
          },
          async down() {
            return;
          },
        },
      }),
    );

    // Make the directory read-only so backup write fails
    fs.chmodSync(tmpDir, 0o500);

    status = new SystemStatus();
    try {
      await initializeDatabase(status, { dbPath });
    } finally {
      // Restore perms so afterEach can clean up
      fs.chmodSync(tmpDir, 0o700);
    }

    expect(status.isReadOnly()).toBe(true);
    expect(status.getState().reason).toMatch(/backup failed/i);
  });

  it('failed migration + failed restore → enters read-only', async () => {
    // Migrate to v4
    let status = new SystemStatus();
    await initializeDatabase(status, { dbPath });
    await closeDatabaseForTest();

    // Inject a migration that throws
    __setMigrationProviderForTest(
      buildProvider({
        '5_will_fail': {
          async up() {
            throw new Error('intentional migration failure');
          },
          async down() {
            return;
          },
        },
      }),
    );

    // Spy on copyFileSync to make restore fail. The first copyFileSync call after
    // a failed migration is the restore attempt.
    const spy = vi.spyOn(fs, 'copyFileSync').mockImplementation(() => {
      throw new Error('intentional restore failure');
    });

    status = new SystemStatus();
    try {
      await initializeDatabase(status, { dbPath });
    } finally {
      spy.mockRestore();
    }

    expect(status.isReadOnly()).toBe(true);
    expect(status.getState().reason).toMatch(/migration failed.*restore failed/i);
  });
});
