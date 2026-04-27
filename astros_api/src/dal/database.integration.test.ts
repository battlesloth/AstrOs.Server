import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import SQLite from 'better-sqlite3';
import { Migration, MigrationProvider, sql } from 'kysely';
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
  migration_5,
  migration_6,
} from './migrations/index.js';

// Mirrors the production provider so injected test migrations layer on top of
// the real baseline rather than truncating it. Without this, kysely sees
// migrations 5/6 in kysely_migration but missing from the provider and throws
// "corrupted migrations" before any extra migration runs — which would short-
// circuit tests that intend to exercise post-migration paths.
function buildProvider(extra: Record<string, Migration> = {}): MigrationProvider {
  return new (class implements MigrationProvider {
    async getMigrations(): Promise<Record<string, Migration>> {
      return {
        '0_initial': migration_0,
        '1_add_script_evt_id': migration_1,
        '2_add_script_duration': migration_2,
        '3_add_playlists': migration_3,
        '4_add_random_wait': migration_4,
        '5_fix_controller_locations_type': migration_5,
        '6_add_foreign_keys': migration_6,
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

    // Inject a new migration on top of the real v6 baseline.
    __setMigrationProviderForTest(
      buildProvider({
        '7_safe_addition': {
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

    // Backup file named after the previous last-applied migration (v6) should exist.
    const backupFiles = fs
      .readdirSync(tmpDir)
      .filter((f) => f.startsWith('database.sqlite3.backup-'));
    expect(backupFiles).toEqual(['database.sqlite3.backup-6_add_foreign_keys']);
    expect(status.isReadOnly()).toBe(false);
  });

  it('failed migration triggers restore from backup AND enters read-only with MIGRATION_FAILED_RESTORED', async () => {
    // Migrate baseline to v6 first
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

    // Inject a migration on top of the real v6 baseline that throws.
    __setMigrationProviderForTest(
      buildProvider({
        '7_will_fail': {
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

    // Restore brought the file back to v6, but a migration still failed —
    // the system enters read-only with MIGRATION_FAILED_RESTORED so operators
    // notice and investigate before redeploying. Writes against the rolled-
    // back schema while the migration is broken could compound the problem.
    expect(status.isReadOnly()).toBe(true);
    expect(status.getState().reasonCode).toBe('MIGRATION_FAILED_RESTORED');

    // Verify our marker survived (proves restore happened) — read-only does
    // not affect SELECTs.
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

    // Inject a pending migration on top of v6 so a backup attempt happens.
    __setMigrationProviderForTest(
      buildProvider({
        '7_pending': {
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
    expect(status.getState().reasonCode).toBe('BACKUP_FAILED');
  });

  it('failed migration + failed restore → enters read-only', async () => {
    // Migrate baseline to current latest (v6)
    let status = new SystemStatus();
    await initializeDatabase(status, { dbPath });
    await closeDatabaseForTest();

    // Inject a migration on top of v6 that throws
    __setMigrationProviderForTest(
      buildProvider({
        '7_will_fail': {
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
    let db;
    try {
      db = await initializeDatabase(status, { dbPath });
    } finally {
      spy.mockRestore();
    }

    expect(status.isReadOnly()).toBe(true);
    expect(status.getState().reasonCode).toBe('MIGRATION_FAILED_RESTORE_FAILED');

    // Returned connection must be a *fresh* one, not the destroyed handle.
    // A query against a destroyed Kysely throws; SELECT 1 is the simplest probe.
    const probe = await sql<{ one: number }>`SELECT 1 AS one`.execute(db);
    expect(probe.rows).toEqual([{ one: 1 }]);
  });

  it('post-migration foreign_key_check catches FK violators → restores from backup', async () => {
    // Regression for the orphan-cleanup-gap concern: migrations apply with
    // FKs off, so INSERT INTO _new SELECT * FROM old does not validate the
    // new constraints during the rename dance. If a future migration's
    // orphan cleanup misses a case, the migration would succeed silently
    // and leave dangling references invisible to runtime FK checks.
    //
    // Simulate that scenario: inject a migration that successfully inserts
    // a script_channels row whose script_id does not exist in `scripts`
    // (allowed because FKs are off during apply). The post-migrate
    // foreign_key_check must detect it, throw, and Phase 1's
    // restore-from-backup must revert to the pre-migration state.

    // Bring DB to v6 (current latest, with FKs on script_channels.script_id).
    let status = new SystemStatus();
    await initializeDatabase(status, { dbPath });
    await closeDatabaseForTest();

    __setMigrationProviderForTest(
      buildProvider({
        '7_introduces_orphan': {
          async up(db) {
            // Insert a script_channels row with a fabricated script_id —
            // valid SQL because FKs are off during the migration window.
            await sql`
              INSERT INTO script_channels
                (id, script_id, channel_type, parent_module_id, module_channel_id, module_channel_type)
              VALUES
                ('bad-orphan', 'no-such-script', 1, 'pm', 'mc', 'mct')
            `.execute(db);
          },
          async down() {
            return;
          },
        },
      }),
    );

    status = new SystemStatus();
    const db = await initializeDatabase(status, { dbPath });

    // Restore brought us back to v6 AND the system enters read-only with
    // MIGRATION_FAILED_RESTORED so operators notice — the same end-state as
    // any other migration failure that successfully recovered.
    expect(status.isReadOnly()).toBe(true);
    expect(status.getState().reasonCode).toBe('MIGRATION_FAILED_RESTORED');

    // The orphan is gone — the bad migration's INSERT was rolled back via the
    // file restore.
    const survivors = await db
      .selectFrom('script_channels')
      .selectAll()
      .where('id', '=', 'bad-orphan')
      .execute();
    expect(survivors).toHaveLength(0);

    // And the migration history shows v6 as the latest, not v7.
    const result = await sql<{ name: string }>`
      SELECT name FROM kysely_migration ORDER BY name DESC LIMIT 1
    `.execute(db);
    expect(result.rows[0]?.name).toBe('6_add_foreign_keys');
  });

  it('initial open failure → enters read-only with STARTUP_OPEN_FAILED and returns a usable in-memory db', async () => {
    // Create a directory at the dbPath so better-sqlite3 fails to open it
    // as a database file.
    const blockingDir = path.join(tmpDir, 'database.sqlite3');
    fs.mkdirSync(blockingDir);

    const status = new SystemStatus();
    const db = await initializeDatabase(status, { dbPath: blockingDir });

    expect(status.isReadOnly()).toBe(true);
    expect(status.getState().reasonCode).toBe('STARTUP_OPEN_FAILED');

    // The returned connection must be functional (an in-memory fallback).
    const probe = await sql<{ one: number }>`SELECT 1 AS one`.execute(db);
    expect(probe.rows).toEqual([{ one: 1 }]);
  });
});
