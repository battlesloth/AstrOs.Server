import { describe, expect, it } from 'vitest';
import appdata from 'appdata-path';
import SQLite from 'better-sqlite3';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  assertNoFkViolations,
  createKyselyConnection,
  PRODUCTION_MIGRATIONS,
  resolveDatabaseDir,
} from './database.js';
import { compareMigrationNames } from './backup.js';

describe('createKyselyConnection', () => {
  it('flushes every commit, even on a WAL-mode database', async () => {
    // Break: WAL mode's default (NORMAL) doesn't flush a commit, so a power cut
    // can undo part of a migration run whose sentinel is already gone (T-016).
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astros-sync-'));
    const file = path.join(dir, 'database.sqlite3');
    const setup = new SQLite(file);
    setup.exec('CREATE TABLE t (id INTEGER)');
    setup.pragma('journal_mode = WAL');
    setup.close();

    const { db, raw } = createKyselyConnection(file);
    try {
      raw.prepare('SELECT id FROM t').all(); // the WAL default applies at the first read
      expect(raw.pragma('journal_mode', { simple: true })).toBe('wal');
      expect(raw.pragma('synchronous', { simple: true })).toBe(2); // FULL
    } finally {
      await db.destroy();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

// The open file descriptors that point at `file` (Linux only).
function openOn(file: string): number {
  return fs.readdirSync('/proc/self/fd').filter((fd) => {
    try {
      return fs.readlinkSync(`/proc/self/fd/${fd}`) === file;
    } catch {
      return false; // the fd readdir itself used is gone by now
    }
  }).length;
}

describe('createKyselyConnection on a file it cannot read', () => {
  it.runIf(process.platform === 'linux')('throws without leaking the handle', () => {
    // Break: setting synchronous reads the file, so it can throw after the open.
    const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'astros-open-')));
    const file = path.join(dir, 'database.sqlite3');
    fs.writeFileSync(file, 'not a database at all '.repeat(200));
    try {
      expect(() => createKyselyConnection(file)).toThrow('file is not a database');
      expect(openOn(file)).toBe(0);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('assertNoFkViolations', () => {
  it('returns silently when no violations exist', () => {
    const raw = new SQLite(':memory:');
    raw.pragma('foreign_keys = ON');
    raw.prepare('CREATE TABLE parent (id INTEGER PRIMARY KEY)').run();
    raw
      .prepare(
        'CREATE TABLE child (id INTEGER PRIMARY KEY, parent_id INTEGER REFERENCES parent(id))',
      )
      .run();
    raw.prepare('INSERT INTO parent (id) VALUES (1)').run();
    raw.prepare('INSERT INTO child (id, parent_id) VALUES (1, 1)').run();

    expect(() => assertNoFkViolations(raw)).not.toThrow();
    raw.close();
  });

  it('throws with the violation table name when violators exist', () => {
    const raw = new SQLite(':memory:');
    raw.pragma('foreign_keys = ON');
    raw.prepare('CREATE TABLE parent (id INTEGER PRIMARY KEY)').run();
    raw
      .prepare(
        'CREATE TABLE child (id INTEGER PRIMARY KEY, parent_id INTEGER REFERENCES parent(id))',
      )
      .run();
    // Sneak in an orphan with FKs off.
    raw.pragma('foreign_keys = OFF');
    raw.prepare('INSERT INTO child (id, parent_id) VALUES (1, 999)').run();
    raw.pragma('foreign_keys = ON');

    expect(() => assertNoFkViolations(raw)).toThrow(/violator/);
    expect(() => assertNoFkViolations(raw)).toThrow(/child/);
    raw.close();
  });

  it('handles bigint rowids without TypeError when safeIntegers is enabled', () => {
    // Regression: rowid can come back as bigint when the connection has
    // safeIntegers enabled. Default JSON.stringify throws on bigints, which
    // would mask the real FK violation behind a serialization TypeError.
    const raw = new SQLite(':memory:');
    raw.defaultSafeIntegers(true);
    raw.pragma('foreign_keys = ON');
    raw.prepare('CREATE TABLE parent (id INTEGER PRIMARY KEY)').run();
    raw
      .prepare(
        'CREATE TABLE child (id INTEGER PRIMARY KEY, parent_id INTEGER REFERENCES parent(id))',
      )
      .run();
    raw.pragma('foreign_keys = OFF');
    raw.prepare('INSERT INTO child (id, parent_id) VALUES (1, 999)').run();
    raw.pragma('foreign_keys = ON');

    let caught: unknown = null;
    try {
      assertNoFkViolations(raw);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(Error);
    // Specifically NOT a TypeError from JSON.stringify on a bigint.
    expect((caught as Error).message).not.toMatch(/serialize a BigInt/i);
    expect((caught as Error).message).toMatch(/violator/);
    expect((caught as Error).message).toContain('child');
    raw.close();
  });
});

describe('resolveDatabaseDir', () => {
  const defaultDir = appdata('astrosserver');

  it('falls back to appdata when env is undefined', () => {
    expect(resolveDatabaseDir(undefined)).toBe(defaultDir);
  });

  it('falls back to appdata when env is empty string', () => {
    expect(resolveDatabaseDir('')).toBe(defaultDir);
  });

  it('falls back to appdata for %AppData% sentinel', () => {
    expect(resolveDatabaseDir('%AppData%')).toBe(defaultDir);
  });

  it('falls back to appdata for lowercase %appdata%', () => {
    expect(resolveDatabaseDir('%appdata%')).toBe(defaultDir);
  });

  it('falls back to appdata for uppercase %APPDATA%', () => {
    expect(resolveDatabaseDir('%APPDATA%')).toBe(defaultDir);
  });

  it('returns the env value verbatim for a custom path', () => {
    expect(resolveDatabaseDir('/var/lib/astros')).toBe('/var/lib/astros');
  });
});

// The naming rules for migrations (T-012). Kysely resolves migrations in plain
// .sort() order, and compareMigrationNames must agree with it on the registry.
// The guard also keeps localeCompare in step: it broke same-timestamp ties in
// Kysely's own order check, which migrateToLatest turns off (T-017; Migrators
// built by the migration tests still run it), and it costs nothing to keep.
// The legacy names are frozen; m numbers run 010..899 (m9NN is reserved for
// injected test migrations) and are each used once.
const FROZEN_LEGACY_NAMES = [
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
];

function migrationNameViolations(names: string[]): string[] {
  const problems: string[] = [];
  const mNumbers: number[] = [];
  for (const name of names) {
    if (/^\d_[a-z0-9_]+$/.test(name)) {
      if (!FROZEN_LEGACY_NAMES.includes(name)) problems.push(`${name}: legacy names are frozen`);
    } else if (/^m\d{3}_[a-z0-9_]+$/.test(name)) {
      const num = parseInt(name.slice(1, 4), 10);
      if (num < 10 || num >= 900) problems.push(`${name}: m numbers run 010..899`);
      if (mNumbers.includes(num)) problems.push(`${name}: m${name.slice(1, 4)} is already used`);
      mNumbers.push(num);
    } else {
      problems.push(`${name}: not in a naming scheme`);
    }
  }
  const plain = [...names].sort();
  if (JSON.stringify([...names].sort(compareMigrationNames)) !== JSON.stringify(plain)) {
    problems.push('compareMigrationNames order differs from plain .sort()');
  }
  if (JSON.stringify([...names].sort((a, b) => a.localeCompare(b))) !== JSON.stringify(plain)) {
    problems.push('localeCompare order differs from plain .sort()');
  }
  return problems;
}

describe('migrationNameViolations', () => {
  // Each fixture is a registry change that would break installs; the helper must
  // flag it now, before any real m-migration exists to exercise the rule.
  it.each([
    [['0_initial', '10_x'], /not in a naming scheme/], // plain .sort() runs it before '1_'
    [['0_initial', 'm10_x'], /not in a naming scheme/],
    [['0_initial', 'm1000_x'], /not in a naming scheme/],
    [['9_add_script_event_end_time', '9_add_new'], /legacy names are frozen/],
    [['0_initial', 'm009_x'], /m numbers run 010..899/],
    [['0_initial', 'm900_x'], /m numbers run 010..899/],
    [['m011_a1', 'm011_a_b'], /m011 is already used/],
    [['m011_a1', 'm011_a_b'], /localeCompare order differs/],
  ])('flags %j', (names, problem) => {
    expect(migrationNameViolations(names).join('\n')).toMatch(problem);
  });

  it('accepts the scheme as intended', () => {
    expect(migrationNameViolations([...FROZEN_LEGACY_NAMES, 'm010_a', 'm011_b', 'm899_c'])).toEqual(
      [],
    );
  });
});

describe('PRODUCTION_MIGRATIONS', () => {
  it('follows the migration naming rules', () => {
    expect(migrationNameViolations(Object.keys(PRODUCTION_MIGRATIONS))).toEqual([]);
  });

  it('keeps every frozen legacy migration', () => {
    expect(Object.keys(PRODUCTION_MIGRATIONS).filter((n) => /^\d_/.test(n))).toEqual(
      FROZEN_LEGACY_NAMES,
    );
  });
});
