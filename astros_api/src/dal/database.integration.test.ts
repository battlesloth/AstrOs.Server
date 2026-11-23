import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import SQLite from 'better-sqlite3';
import { Kysely, Migration, MigrationProvider, sql } from 'kysely';
import { SystemStatus } from '../system_status.js';
import { Database } from './types.js';
import { migrationSentinelPath, writeMigrationSentinel } from './backup.js';
import { logger as dbLogger } from 'src/logger.js';
import {
  initializeDatabase,
  closeDatabaseForTest,
  PRODUCTION_MIGRATIONS,
  __setMigrationProviderForTest,
  __resetMigrationProviderForTest,
} from './database.js';

// Layers injected test migrations on top of a real baseline (the production
// registry by default) rather than truncating it. Without the baseline, kysely
// sees migrations in kysely_migration but missing from the provider and throws
// "corrupted migrations" before any extra migration runs — which would short-
// circuit tests that intend to exercise post-migration paths.
function buildProvider(
  extra: Record<string, Migration> = {},
  base: Readonly<Record<string, Migration>> = PRODUCTION_MIGRATIONS,
): MigrationProvider {
  // Kysely orders migrations by plain string sort. An injected migration that
  // sorts before the baseline's latest is refused as "corrupted migrations",
  // which would let a failure-path test pass without running it.
  const latest = Object.keys(base).sort().at(-1) ?? '';
  for (const name of Object.keys(extra)) {
    if (name <= latest) {
      throw new Error(`test migration ${name} must sort after ${latest}`);
    }
  }
  return new (class implements MigrationProvider {
    async getMigrations(): Promise<Record<string, Migration>> {
      return { ...base, ...extra };
    }
  })();
}

// The last production migration, in the plain-string order Kysely runs them in.
const PRODUCTION_LATEST = Object.keys(PRODUCTION_MIGRATIONS).sort().at(-1) ?? '';

// Kysely's own record of what ran, in insertion (= run) order.
async function runOrder(db: Kysely<Database>): Promise<string[]> {
  const rows = await sql<{
    name: string;
  }>`SELECT name FROM kysely_migration ORDER BY rowid`.execute(db);
  return rows.rows.map((r) => r.name);
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function sha256(file: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

// Each test deliberately drives a real SQLite migration + backup/restore
// cycle, so ~1.6s isolated baseline is expected. The default 5s vitest
// timeout leaves only ~3.4s of headroom; under full-suite contention that
// margin disappears and these tests flake on CI. 15s is well above the
// observed worst case while still failing fast if a real hang regresses in.
describe('initializeDatabase safety flow', { timeout: 15_000 }, () => {
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
    // First run: migrate baseline to the current production latest.
    let status = new SystemStatus();
    await initializeDatabase(status, { dbPath });
    await closeDatabaseForTest();

    // Inject a new migration on top of the real production baseline.
    __setMigrationProviderForTest(
      buildProvider({
        m900_test_safe_addition: {
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

    // Backup file named after the previous last-applied (production-latest) migration should exist.
    const backupFiles = fs
      .readdirSync(tmpDir)
      .filter((f) => f.startsWith('database.sqlite3.backup-'));
    expect(backupFiles).toEqual([`database.sqlite3.backup-${PRODUCTION_LATEST}`]);
    expect(status.isReadOnly()).toBe(false);
  });

  it('failed migration triggers restore from backup AND enters read-only with MIGRATION_FAILED_RESTORED', async () => {
    // Migrate baseline to the current production latest first.
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

    // Inject a migration on top of the production baseline that damages the
    // marker, then throws. Kysely doesn't wrap it in a transaction, so only the
    // file restore can bring the marker back.
    let ran = false;
    __setMigrationProviderForTest(
      buildProvider({
        m901_test_will_fail: {
          async up(db) {
            ran = true;
            await sql`DELETE FROM marker`.execute(db);
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

    // Restore brought the file back to the production latest, but a migration still failed —
    // the system enters read-only with MIGRATION_FAILED_RESTORED so operators
    // notice and investigate before redeploying. Writes against the rolled-
    // back schema while the migration is broken could compound the problem.
    expect(ran).toBe(true);
    expect(status.isReadOnly()).toBe(true);
    expect(status.getState().reasonCode).toBe('MIGRATION_FAILED_RESTORED');

    // The migration deleted the marker, so finding it proves the restore
    // happened — read-only does not affect SELECTs.
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

    // Inject a pending migration on top of the production baseline so a backup attempt happens.
    __setMigrationProviderForTest(
      buildProvider({
        m902_test_pending: {
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
    // Migrate baseline to the current production latest
    let status = new SystemStatus();
    await initializeDatabase(status, { dbPath });
    await closeDatabaseForTest();

    // Inject a migration on top of the production baseline that throws
    let ran = false;
    __setMigrationProviderForTest(
      buildProvider({
        m901_test_will_fail: {
          async up() {
            ran = true;
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
    expect(ran).toBe(true);

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

    // Bring DB to the current production latest.
    let status = new SystemStatus();
    await initializeDatabase(status, { dbPath });
    await closeDatabaseForTest();

    let ran = false;
    __setMigrationProviderForTest(
      buildProvider({
        m903_test_introduces_orphan: {
          async up(db) {
            ran = true;
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

    // Restore brought us back to the production latest AND the system enters read-only with
    // MIGRATION_FAILED_RESTORED so operators notice — the same end-state as
    // any other migration failure that successfully recovered.
    expect(ran).toBe(true);
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

    // And the migration history shows the production latest, not the injected migration.
    // ORDER BY name is plain string order, which T-012's naming keeps equal to
    // the canonical compareMigrationNames order (pinned in database.test.ts).
    const result = await sql<{ name: string }>`
      SELECT name FROM kysely_migration ORDER BY name DESC LIMIT 1
    `.execute(db);
    expect(result.rows[0]?.name).toBe(PRODUCTION_LATEST);
  });

  describe('a database written by a newer server', () => {
    // Migrates a fresh file DB to this build's latest, then records a
    // migration this build has never heard of — what a newer server leaves
    // (since T-012 its names are m<NNN>_).
    async function seedNewerDatabase(): Promise<void> {
      await initializeDatabase(new SystemStatus(), { dbPath });
      await closeDatabaseForTest();

      const sqlite = new SQLite(dbPath);
      sqlite
        .prepare('INSERT INTO kysely_migration (name, timestamp) VALUES (?, ?)')
        .run('m099_future', '2026-10-22T00:00:00.000Z');
      sqlite.close();
    }

    it('a database with an unknown applied migration enters DB_NEWER_THAN_SERVER and is left untouched', async () => {
      await seedNewerDatabase();
      const hashBefore = sha256(dbPath);
      const filesBefore = fs.readdirSync(tmpDir).sort();

      const status = new SystemStatus();
      await initializeDatabase(status, { dbPath });
      await closeDatabaseForTest();

      expect(status.getState().reasonCode).toBe('DB_NEWER_THAN_SERVER');
      expect(sha256(dbPath)).toBe(hashBefore);
      // Exact listing: catches a backup file and any journal/WAL left behind.
      expect(fs.readdirSync(tmpDir).sort()).toEqual(filesBefore);
    });

    it('a newer database with a pending migration is incompatible and nothing is applied', async () => {
      // Branch switch: the DB has a sibling branch's migration AND this build
      // has one the DB lacks. The unknown check must win before any backup.
      await seedNewerDatabase();
      const hashBefore = sha256(dbPath);
      const filesBefore = fs.readdirSync(tmpDir).sort();

      __setMigrationProviderForTest(
        buildProvider({
          m902_test_pending: {
            async up(db) {
              await db.schema.createTable('pending_table').addColumn('id', 'integer').execute();
            },
            async down() {
              return;
            },
          },
        }),
      );

      const status = new SystemStatus();
      await initializeDatabase(status, { dbPath });
      await closeDatabaseForTest();

      expect(status.getState().reasonCode).toBe('DB_NEWER_THAN_SERVER');
      expect(sha256(dbPath)).toBe(hashBefore);
      expect(fs.readdirSync(tmpDir).sort()).toEqual(filesBefore);
    });

    it('a fresh database is not flagged', async () => {
      const status = new SystemStatus();
      await initializeDatabase(status, { dbPath });

      expect(status.getState().readOnly).toBe(false);
    });

    it("a database at exactly this build's migrations is not flagged", async () => {
      await initializeDatabase(new SystemStatus(), { dbPath });
      await closeDatabaseForTest();

      const status = new SystemStatus();
      await initializeDatabase(status, { dbPath });

      expect(status.getState().readOnly).toBe(false);
    });

    it('the incompatible connection refuses writes', async () => {
      // Defense in depth behind the HTTP guard, the serial skip and the WS
      // drop: SQLite itself rejects a write that reaches the connection.
      await seedNewerDatabase();
      const hashBefore = sha256(dbPath);

      const db = await initializeDatabase(new SystemStatus(), { dbPath });
      await expect(
        sql`INSERT INTO kysely_migration (name, timestamp) VALUES ('100_sneaky', 'x')`.execute(db),
      ).rejects.toThrow(/readonly/i);
      await closeDatabaseForTest();

      expect(sha256(dbPath)).toBe(hashBefore);
    });
  });

  it('a file that opens but fails inspection → STARTUP_OPEN_FAILED, left untouched', async () => {
    // Not a SQLite file: the open and pragma succeed, the first query (the
    // unknown-migration check) throws. Must degrade, not crash or migrate.
    fs.writeFileSync(dbPath, Buffer.alloc(4096, 'x'));
    const hashBefore = sha256(dbPath);

    const status = new SystemStatus();
    const db = await initializeDatabase(status, { dbPath });

    expect(status.getState().reasonCode).toBe('STARTUP_OPEN_FAILED');
    const probe = await sql<{ one: number }>`SELECT 1 AS one`.execute(db);
    expect(probe.rows).toEqual([{ one: 1 }]);
    expect(sha256(dbPath)).toBe(hashBefore);
    expect(fs.readdirSync(tmpDir)).toEqual(['database.sqlite3']);
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

// T-012: migrations from 10 on are named m<NNN>_…, and Kysely runs them in plain
// .sort() order, so an m<NNN>_ migration must run after every legacy 0_…9_ one.
// The sample (a test-range name, so a real m010_ can't collide with it) checks
// from inside its own up() that migration 9's column already exists, and adds a
// column to maestro_channels: migration 6 copies that table with SELECT *, so a
// sample that ran before 6 would break the run.
describe('the m<NNN>_ migration naming scheme', { timeout: 15_000 }, () => {
  let tmpDir: string;
  let dbPath: string;

  const sample: Record<string, Migration> = {
    m910_test_sample_addition: {
      async up(db) {
        const events = await sql<{ name: string }>`PRAGMA table_info(script_events)`.execute(db);
        if (!events.rows.some((r) => r.name === 'end_time')) {
          throw new Error('m910_test_sample_addition ran before 9_add_script_event_end_time');
        }
        await db.schema.alterTable('maestro_channels').addColumn('t012_probe', 'integer').execute();
      },
      async down() {
        return;
      },
    },
  };

  // The frozen legacy migrations alone (database.test.ts pins them), so the
  // legacy -> m<NNN>_ transition stays covered once real m-migrations exist.
  const legacyOnly = Object.fromEntries(
    Object.entries(PRODUCTION_MIGRATIONS).filter(([name]) => /^\d_/.test(name)),
  );

  const noopNext: Record<string, Migration> = {
    m911_test_next: {
      async up() {
        return;
      },
      async down() {
        return;
      },
    },
  };

  async function columnNames(db: Kysely<Database>): Promise<string[]> {
    const info = await sql<{ name: string }>`PRAGMA table_info(maestro_channels)`.execute(db);
    return info.rows.map((r) => r.name);
  }

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astros-db-naming-'));
    dbPath = path.join(tmpDir, 'database.sqlite3');
  });

  afterEach(async () => {
    await closeDatabaseForTest();
    __resetMigrationProviderForTest();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('refuses an injected test migration that sorts before the baseline latest', () => {
    // Break: a misordered injected migration that Kysely refuses as "corrupted
    // migrations", letting a failure-path test pass without running it.
    expect(() => buildProvider({ '0_zz': noopNext.m911_test_next })).toThrow(/must sort after/);
    expect(() => buildProvider({ m910_x: noopNext.m911_test_next }, legacyOnly)).not.toThrow();
  });

  it('runs the production registry in plain-string order with the default provider', async () => {
    // Break: the default provider serving anything other than PRODUCTION_MIGRATIONS,
    // or Kysely running it in an order other than plain .sort().
    const db = await initializeDatabase(new SystemStatus(), { dbPath });
    expect(await runOrder(db)).toEqual(Object.keys(PRODUCTION_MIGRATIONS).sort());
  });

  it('runs an m<NNN>_ migration last on a fresh database', async () => {
    const provider = buildProvider(sample);
    __setMigrationProviderForTest(provider);
    const status = new SystemStatus();
    const db = await initializeDatabase(status, { dbPath });

    expect(status.getState()).toEqual({ readOnly: false });
    expect(await columnNames(db)).toContain('t012_probe');
    // Kysely's own run order, not the comparator under test.
    const order = await runOrder(db);
    expect(order.at(-1)).toBe('m910_test_sample_addition');
    expect(order).toEqual(Object.keys(await provider.getMigrations()).sort());
  });

  it('applies only the m<NNN>_ migration to a database already at 9, after a backup named for 9', async () => {
    __setMigrationProviderForTest(buildProvider({}, legacyOnly));
    await initializeDatabase(new SystemStatus(), { dbPath });
    await closeDatabaseForTest();

    __setMigrationProviderForTest(buildProvider(sample, legacyOnly));
    const status = new SystemStatus();
    const db = await initializeDatabase(status, { dbPath });

    expect(status.getState()).toEqual({ readOnly: false });
    expect(await columnNames(db)).toContain('t012_probe');
    expect(await runOrder(db)).toEqual([
      ...Object.keys(legacyOnly).sort(),
      'm910_test_sample_addition',
    ]);
    const backupFiles = fs
      .readdirSync(tmpDir)
      .filter((f) => f.startsWith('database.sqlite3.backup-'));
    expect(backupFiles).toEqual(['database.sqlite3.backup-9_add_script_event_end_time']);
  });

  it('upgrades a fresh install whose migrations all share one timestamp', async () => {
    // A fresh install runs every migration within a few milliseconds, so their
    // kysely_migration timestamps tie, and Kysely then orders the executed rows
    // by localeCompare on the name. The next upgrade checks that order against
    // the plain-sorted provider; with unique numbers the two agree.
    __setMigrationProviderForTest(buildProvider(sample));
    await initializeDatabase(new SystemStatus(), { dbPath });
    await closeDatabaseForTest();
    {
      const sqlite = new SQLite(dbPath);
      sqlite.prepare('UPDATE kysely_migration SET timestamp = ?').run('2026-01-01T00:00:00.000Z');
      sqlite.close();
    }

    __setMigrationProviderForTest(buildProvider({ ...sample, ...noopNext }));
    const status = new SystemStatus();
    const db = await initializeDatabase(status, { dbPath });

    expect(status.getState()).toEqual({ readOnly: false });
    expect((await runOrder(db)).at(-1)).toBe('m911_test_next');
  });
});

// T-016: a migration-in-progress sentinel keeps the pre-migration backup safe
// across an interrupted run (a power cut mid-migration, or a failed restore).
describe('an interrupted migration', { timeout: 20_000 }, () => {
  let tmpDir: string;
  let dbPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astros-db-interrupted-'));
    dbPath = path.join(tmpDir, 'database.sqlite3');
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await closeDatabaseForTest();
    __resetMigrationProviderForTest();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const backupPath = () => `${dbPath}.backup-${PRODUCTION_LATEST}`;

  // Six older backups, so a prune (which keeps the five newest) shows in a
  // "touches nothing" directory listing.
  function seedOldBackups(): void {
    for (let i = 0; i < 6; i++) {
      const old = `${dbPath}.backup-${i}_old`;
      fs.writeFileSync(old, '');
      const t = new Date(Date.UTC(2020, 0, 1 + i));
      fs.utimesSync(old, t, t);
    }
  }
  const sentinel = () => migrationSentinelPath(dbPath);

  function tables(file: string): string[] {
    const db = new SQLite(file, { readonly: true });
    try {
      return db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
        .all()
        .map((r) => (r as { name: string }).name);
    } finally {
      db.close();
    }
  }

  // Creates a table, then throws while `failing.value` is true: a migration
  // that leaves partial writes behind, as a power cut mid-run does.
  function partialMigration(failing: { value: boolean }): Record<string, Migration> {
    return {
      m950_test_partial: {
        async up(db) {
          await db.schema.createTable('partial').addColumn('id', 'integer').execute();
          if (failing.value) {
            throw new Error('intentional mid-migration failure');
          }
        },
        async down() {
          return;
        },
      },
    };
  }

  async function migrateToProductionLatest(): Promise<void> {
    await initializeDatabase(new SystemStatus(), { dbPath });
    await closeDatabaseForTest();
  }

  it('keeps the good backup across a failed migration whose restore also failed', async () => {
    // Break: the next boot's createBackup overwriting the only pre-migration
    // copy with the half-migrated database.
    await migrateToProductionLatest();
    const failing = { value: true };
    __setMigrationProviderForTest(buildProvider(partialMigration(failing)));

    // Boot 1: the migration leaves a partial table and the restore fails.
    const spy = vi.spyOn(fs, 'copyFileSync').mockImplementation(() => {
      throw new Error('intentional restore failure');
    });
    let status = new SystemStatus();
    try {
      await initializeDatabase(status, { dbPath });
    } finally {
      spy.mockRestore();
    }
    await closeDatabaseForTest();
    expect(status.getState().reasonCode).toBe('MIGRATION_FAILED_RESTORE_FAILED');
    expect(fs.existsSync(sentinel())).toBe(true);
    expect(tables(dbPath)).toContain('partial');
    expect(tables(backupPath())).not.toContain('partial');

    // Boot 2: the cause is gone; the good backup must be restored first.
    failing.value = false;
    status = new SystemStatus();
    const warn = vi.spyOn(dbLogger, 'warn');
    const db = await initializeDatabase(status, { dbPath });
    expect(warn).toHaveBeenCalledWith(
      expect.stringMatching(
        new RegExp(
          `^Restored ${escapeRegExp(backupPath())} after an interrupted migration \\(started .+\\)$`,
        ),
      ),
    );
    expect(status.getState()).toEqual({ readOnly: false });
    expect(fs.existsSync(sentinel())).toBe(false);
    expect(tables(backupPath())).not.toContain('partial');
    expect((await runOrder(db)).at(-1)).toBe('m950_test_partial');
  });

  it('leaves no sentinel after a migration run succeeds', async () => {
    await migrateToProductionLatest();
    __setMigrationProviderForTest(buildProvider(partialMigration({ value: false })));
    const status = new SystemStatus();
    await initializeDatabase(status, { dbPath });
    expect(status.getState()).toEqual({ readOnly: false });
    expect(fs.existsSync(sentinel())).toBe(false);
  });

  it('leaves no sentinel after a failed migration is restored', async () => {
    await migrateToProductionLatest();
    __setMigrationProviderForTest(buildProvider(partialMigration({ value: true })));
    const status = new SystemStatus();
    await initializeDatabase(status, { dbPath });
    expect(status.getState().reasonCode).toBe('MIGRATION_FAILED_RESTORED');
    expect(fs.existsSync(sentinel())).toBe(false);
  });

  it('enters MIGRATION_INTERRUPTED and touches nothing when the recorded backup is missing', async () => {
    await migrateToProductionLatest();
    seedOldBackups();
    writeMigrationSentinel(dbPath, {
      backupPath: `${dbPath}.backup-gone`,
      lastApplied: PRODUCTION_LATEST,
    });
    const before = { sha: sha256(dbPath), files: fs.readdirSync(tmpDir).sort() };

    __setMigrationProviderForTest(buildProvider(partialMigration({ value: false })));
    const status = new SystemStatus();
    const entered = vi.spyOn(status, 'enterReadOnly');
    await initializeDatabase(status, { dbPath });
    await closeDatabaseForTest();

    expect(status.getState().reasonCode).toBe('MIGRATION_INTERRUPTED');
    expect(sha256(dbPath)).toBe(before.sha);
    expect(fs.readdirSync(tmpDir).sort()).toEqual(before.files);
    // The detail is the operator's only pointer to the files, and to the safe
    // order: restore first, then delete the sentinel.
    const detail = String(entered.mock.calls[0]?.[1]);
    expect(detail).toContain(sentinel());
    expect(detail).toContain(`its backup ${dbPath}.backup-gone is missing`);
    expect(detail).toMatch(/copy a known-good backup .* over .*, then delete/);
  });

  it('enters MIGRATION_INTERRUPTED and touches nothing when the sentinel is corrupt', async () => {
    await migrateToProductionLatest();
    seedOldBackups();
    fs.copyFileSync(dbPath, backupPath()); // a candidate the detail can list
    fs.writeFileSync(sentinel(), '{');
    const before = { sha: sha256(dbPath), files: fs.readdirSync(tmpDir).sort() };

    // A pending migration, so "touches nothing" means no backup or migrate ran.
    __setMigrationProviderForTest(buildProvider(partialMigration({ value: false })));
    const status = new SystemStatus();
    const entered = vi.spyOn(status, 'enterReadOnly');
    await initializeDatabase(status, { dbPath });
    await closeDatabaseForTest();

    expect(status.getState().reasonCode).toBe('MIGRATION_INTERRUPTED');
    expect(sha256(dbPath)).toBe(before.sha);
    expect(fs.readdirSync(tmpDir).sort()).toEqual(before.files);
    // Its backup path is inside the unreadable file, so the candidates are listed.
    const detail = String(entered.mock.calls[0]?.[1]);
    expect(detail).toContain(sentinel());
    expect(detail).toContain('the sentinel is unreadable');
    expect(detail).toContain(backupPath());
  });

  it('restores and re-migrates when a sentinel outlived a successful run', async () => {
    // A crash after the migration succeeded but before the sentinel was removed.
    // Break: deleting the sentinel without restoring, so the migration never
    // re-runs (the up() count stays at 1).
    await migrateToProductionLatest();
    let ups = 0;
    const provider = buildProvider({
      m950_test_partial: {
        async up(db) {
          ups++;
          await db.schema.createTable('partial').addColumn('id', 'integer').execute();
        },
        async down() {
          return;
        },
      },
    });
    __setMigrationProviderForTest(provider);
    await initializeDatabase(new SystemStatus(), { dbPath });
    await closeDatabaseForTest();
    writeMigrationSentinel(dbPath, { backupPath: backupPath(), lastApplied: PRODUCTION_LATEST });

    const status = new SystemStatus();
    const db = await initializeDatabase(status, { dbPath });
    expect(status.getState()).toEqual({ readOnly: false });
    expect(fs.existsSync(sentinel())).toBe(false);
    expect((await runOrder(db)).at(-1)).toBe('m950_test_partial');
    expect(ups).toBe(2);
  });

  it('does not migrate when the sentinel cannot be written', async () => {
    // Break: migrating without a sentinel, so an interruption would cost the backup.
    await migrateToProductionLatest();
    fs.mkdirSync(`${sentinel()}.tmp`); // writing the temp file fails (EISDIR)
    let ran = false;
    __setMigrationProviderForTest(
      buildProvider({
        m950_test_partial: {
          async up() {
            ran = true;
          },
          async down() {
            return;
          },
        },
      }),
    );
    const status = new SystemStatus();
    await initializeDatabase(status, { dbPath });
    expect(status.getState().reasonCode).toBe('BACKUP_FAILED');
    expect(ran).toBe(false);
  });

  // Migrates to production latest, lets write() create the file at
  // backupPath(), and stages a sentinel naming it plus one pending migration.
  // Returns the database's sha256 and the directory listing.
  async function stageSentinel(
    write: (backup: string) => void,
  ): Promise<{ sha: string; files: string[] }> {
    await migrateToProductionLatest();
    seedOldBackups();
    write(backupPath());
    writeMigrationSentinel(dbPath, { backupPath: backupPath(), lastApplied: PRODUCTION_LATEST });
    __setMigrationProviderForTest(buildProvider(partialMigration({ value: false })));
    return { sha: sha256(dbPath), files: fs.readdirSync(tmpDir).sort() };
  }

  it.each([
    ['not a database', (b: string) => fs.writeFileSync(b, 'not a database at all '.repeat(200))],
    ['empty, which quick_check alone accepts', (b: string) => fs.writeFileSync(b, '')],
    [
      'missing the last applied migration',
      (b: string) => {
        fs.copyFileSync(dbPath, b);
        const db = new SQLite(b);
        db.prepare('DELETE FROM kysely_migration WHERE name = ?').run(PRODUCTION_LATEST);
        db.close();
      },
    ],
  ])(
    'enters MIGRATION_INTERRUPTED and touches nothing when the backup is %s',
    async (_label, write) => {
      // Break: restoring a backup that only exists, e.g. an empty file the
      // server would treat as a fresh install and come up empty.
      const before = await stageSentinel(write);
      const status = new SystemStatus();
      await initializeDatabase(status, { dbPath });
      await closeDatabaseForTest();
      expect(status.getState().reasonCode).toBe('MIGRATION_INTERRUPTED');
      expect(sha256(dbPath)).toBe(before.sha);
      expect(fs.readdirSync(tmpDir).sort()).toEqual(before.files);
    },
  );

  it('keeps the database and the sentinel when the restore copy fails part-way', async () => {
    const before = await stageSentinel((b) => fs.copyFileSync(dbPath, b));
    const spy = vi.spyOn(fs, 'copyFileSync').mockImplementation((_src, dest) => {
      fs.writeFileSync(dest as string, 'torn');
      throw new Error('intentional mid-copy failure');
    });
    const status = new SystemStatus();
    const entered = vi.spyOn(status, 'enterReadOnly');
    let db: Kysely<Database>;
    try {
      db = await initializeDatabase(status, { dbPath });
    } finally {
      spy.mockRestore();
    }
    // Reopened on the file, not the in-memory fallback.
    expect((await runOrder(db)).at(-1)).toBe(PRODUCTION_LATEST);
    await closeDatabaseForTest();
    expect(status.getState().reasonCode).toBe('MIGRATION_INTERRUPTED');
    expect(entered).toHaveBeenCalledWith(
      'MIGRATION_INTERRUPTED',
      expect.stringMatching(
        /^restoring .+ failed \(the database is unchanged, or already the backup/,
      ),
    );
    expect(entered).toHaveBeenCalledWith(
      'MIGRATION_INTERRUPTED',
      expect.stringContaining(sentinel()),
    );
    expect(sha256(dbPath)).toBe(before.sha);
    expect(fs.readdirSync(tmpDir).sort()).toEqual(before.files);
  });

  // Fails only the sentinel's unlink, with EACCES.
  function failSentinelUnlink(): { mockRestore(): void } {
    const unlink = fs.unlinkSync;
    return vi.spyOn(fs, 'unlinkSync').mockImplementation((p) => {
      if (p === sentinel()) {
        throw Object.assign(new Error('intentional EACCES'), { code: 'EACCES' });
      }
      unlink(p);
    });
  }

  it('enters MIGRATION_INTERRUPTED when the sentinel cannot be removed after its restore', async () => {
    await stageSentinel((b) => fs.copyFileSync(dbPath, b));
    const spy = failSentinelUnlink();
    const status = new SystemStatus();
    const entered = vi.spyOn(status, 'enterReadOnly');
    try {
      await initializeDatabase(status, { dbPath });
    } finally {
      spy.mockRestore();
    }
    expect(status.getState().reasonCode).toBe('MIGRATION_INTERRUPTED');
    expect(entered).toHaveBeenCalledWith(
      'MIGRATION_INTERRUPTED',
      expect.stringContaining(`restored ${backupPath()}`),
    );
    expect(fs.existsSync(sentinel())).toBe(true);
    // Stopped there: the pending migration didn't run on the restored file.
    expect(tables(dbPath)).not.toContain('partial');
  });

  it('enters MIGRATION_INTERRUPTED when the sentinel cannot be removed after a successful migration', async () => {
    // Break: coming up writable with a sentinel that would restore the
    // pre-migration backup over this boot's writes on the next one.
    await migrateToProductionLatest();
    __setMigrationProviderForTest(buildProvider(partialMigration({ value: false })));
    const spy = failSentinelUnlink();
    const status = new SystemStatus();
    const entered = vi.spyOn(status, 'enterReadOnly');
    try {
      await initializeDatabase(status, { dbPath });
    } finally {
      spy.mockRestore();
    }
    expect(status.getState().reasonCode).toBe('MIGRATION_INTERRUPTED');
    expect(entered).toHaveBeenCalledWith(
      'MIGRATION_INTERRUPTED',
      expect.stringMatching(/the migration succeeded.*fix the cause and restart/),
    );
    expect(fs.existsSync(sentinel())).toBe(true);
  });

  it('stays MIGRATION_FAILED_RESTORED when the sentinel cannot be removed after a failed migration', async () => {
    await migrateToProductionLatest();
    __setMigrationProviderForTest(buildProvider(partialMigration({ value: true })));
    const spy = failSentinelUnlink();
    const error = vi.spyOn(dbLogger, 'error');
    const status = new SystemStatus();
    try {
      await initializeDatabase(status, { dbPath });
    } finally {
      spy.mockRestore();
    }
    expect(status.getState().reasonCode).toBe('MIGRATION_FAILED_RESTORED');
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining(`Could not remove the migration sentinel ${sentinel()}`),
    );
    expect(fs.existsSync(sentinel())).toBe(true);
  });

  it('refuses a newer database before looking at the sentinel', async () => {
    // Break: restoring over a database this build must not touch (T-006).
    await stageSentinel((b) => fs.copyFileSync(dbPath, b));
    const db = new SQLite(dbPath);
    db.prepare('INSERT INTO kysely_migration (name, timestamp) VALUES (?, ?)').run(
      'm099_future',
      '2026-11-22T00:00:00.000Z',
    );
    db.close();
    const before = { sha: sha256(dbPath), files: fs.readdirSync(tmpDir).sort() };
    const status = new SystemStatus();
    await initializeDatabase(status, { dbPath });
    await closeDatabaseForTest();
    expect(status.getState().reasonCode).toBe('DB_NEWER_THAN_SERVER');
    expect(sha256(dbPath)).toBe(before.sha);
    expect(fs.readdirSync(tmpDir).sort()).toEqual(before.files);
  });

  it('refuses a backup a newer build wrote, touching nothing', async () => {
    // Break: restoring it. The newer database is backed up, Kysely refuses to
    // migrate it, and it is served as MIGRATION_FAILED_RESTORED.
    const before = await stageSentinel((b) => {
      fs.copyFileSync(dbPath, b);
      const db = new SQLite(b);
      db.prepare('INSERT INTO kysely_migration (name, timestamp) VALUES (?, ?)').run(
        'm099_future',
        '2026-11-22T00:00:00.000Z',
      );
      db.close();
    });
    let ran = false;
    __setMigrationProviderForTest(
      buildProvider({
        m950_test_partial: {
          async up() {
            ran = true;
          },
          async down() {
            return;
          },
        },
      }),
    );
    const status = new SystemStatus();
    await initializeDatabase(status, { dbPath });
    await closeDatabaseForTest();
    expect(status.getState().reasonCode).toBe('MIGRATION_INTERRUPTED');
    expect(ran).toBe(false);
    expect(sha256(dbPath)).toBe(before.sha);
    expect(fs.readdirSync(tmpDir).sort()).toEqual(before.files);
  });

  it('keeps the sentinel when an FK-violating migration cannot be restored', async () => {
    // Break: removing the sentinel before assertNoFkViolations, so a migration
    // that commits orphans and then can't be restored costs the backup.
    await migrateToProductionLatest();
    __setMigrationProviderForTest(
      buildProvider({
        m950_test_orphan: {
          async up(db) {
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
    const spy = vi.spyOn(fs, 'copyFileSync').mockImplementation(() => {
      throw new Error('intentional restore failure');
    });
    const error = vi.spyOn(dbLogger, 'error');
    const status = new SystemStatus();
    try {
      await initializeDatabase(status, { dbPath });
    } finally {
      spy.mockRestore();
    }
    // The FK check, not the migration itself, is what failed.
    expect(error).toHaveBeenCalledWith(
      expect.stringMatching(/^Migration failed: .*foreign_key_check/),
    );
    expect(status.getState().reasonCode).toBe('MIGRATION_FAILED_RESTORE_FAILED');
    expect(fs.existsSync(sentinel())).toBe(true);
  });

  it('rolls back a hot journal, then restores and migrates', async () => {
    // A power cut mid-statement: the half-migrated file plus a hot -journal.
    // Break: restoring before anything reads the file, so the journal is never
    // rolled back and the restore refuses it.
    await migrateToProductionLatest();
    fs.copyFileSync(dbPath, backupPath());
    const stage = path.join(tmpDir, 'stage.sqlite3');
    fs.copyFileSync(dbPath, stage);
    const writer = new SQLite(stage);
    writer.pragma('cache_size = 2'); // spill pages to the file mid-transaction
    writer.exec('BEGIN');
    writer.exec('CREATE TABLE partial (id INTEGER, body TEXT)');
    const insert = writer.prepare('INSERT INTO partial VALUES (?, ?)');
    for (let i = 0; i < 3000; i++) {
      insert.run(i, 'x'.repeat(400));
    }
    fs.copyFileSync(stage, dbPath);
    fs.copyFileSync(`${stage}-journal`, `${dbPath}-journal`);
    // Precondition: the staged journal is hot (non-zero first byte), or the
    // restore would just remove it as inert and this test would prove nothing.
    expect(fs.readFileSync(`${dbPath}-journal`)[0]).not.toBe(0);
    writer.exec('ROLLBACK');
    writer.close();
    fs.rmSync(stage, { force: true });
    writeMigrationSentinel(dbPath, { backupPath: backupPath(), lastApplied: PRODUCTION_LATEST });
    let ups = 0;
    __setMigrationProviderForTest(
      buildProvider({
        m950_test_partial: {
          async up(db) {
            ups++;
            await db.schema.createTable('partial').addColumn('id', 'integer').execute();
          },
          async down() {
            return;
          },
        },
      }),
    );

    const status = new SystemStatus();
    await initializeDatabase(status, { dbPath });
    await closeDatabaseForTest();
    expect(status.getState()).toEqual({ readOnly: false });
    expect(ups).toBe(1);
    expect(fs.existsSync(`${dbPath}-journal`)).toBe(false);
    expect(fs.existsSync(sentinel())).toBe(false);
    expect(tables(backupPath())).not.toContain('partial');
  });

  it('names the sentinel and its backup when the half-migrated file cannot be read', async () => {
    // A torn page from a power cut makes the first read throw before the
    // sentinel check, so STARTUP_OPEN_FAILED must point at the recovery.
    await stageSentinel((b) => fs.copyFileSync(dbPath, b));
    const fd = fs.openSync(dbPath, 'r+');
    fs.writeSync(fd, Buffer.alloc(100, 0xff), 0, 100, 0); // tear the header
    fs.closeSync(fd);
    const error = vi.spyOn(dbLogger, 'error');
    const status = new SystemStatus();
    await initializeDatabase(status, { dbPath });
    expect(status.getState().reasonCode).toBe('STARTUP_OPEN_FAILED');
    expect(error).toHaveBeenCalledWith(
      expect.stringMatching(
        new RegExp(
          `did not finish \\(${escapeRegExp(sentinel())}\\).*${escapeRegExp(backupPath())}`,
        ),
      ),
    );
    expect(fs.existsSync(sentinel())).toBe(true);
  });

  it('says when the sentinel is unreadable as well as the file', async () => {
    await migrateToProductionLatest();
    fs.copyFileSync(dbPath, backupPath());
    fs.writeFileSync(sentinel(), '{');
    const fd = fs.openSync(dbPath, 'r+');
    fs.writeSync(fd, Buffer.alloc(100, 0xff), 0, 100, 0);
    fs.closeSync(fd);
    const error = vi.spyOn(dbLogger, 'error');
    const status = new SystemStatus();
    await initializeDatabase(status, { dbPath });
    expect(status.getState().reasonCode).toBe('STARTUP_OPEN_FAILED');
    expect(error).toHaveBeenCalledWith(
      expect.stringMatching(
        new RegExp(
          `did not finish \\(${escapeRegExp(sentinel())}\\), and the sentinel is unreadable`,
        ),
      ),
    );
  });
});
