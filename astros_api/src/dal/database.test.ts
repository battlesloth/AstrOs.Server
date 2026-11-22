import { describe, expect, it } from 'vitest';
import appdata from 'appdata-path';
import SQLite from 'better-sqlite3';
import { assertNoFkViolations, PRODUCTION_MIGRATIONS, resolveDatabaseDir } from './database.js';
import { compareMigrationNames } from './backup.js';

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

describe('PRODUCTION_MIGRATIONS', () => {
  const names = Object.keys(PRODUCTION_MIGRATIONS);
  const mNumbers = names.filter((n) => n.startsWith('m')).map((n) => parseInt(n.slice(1, 4), 10));

  // Break: a migration named outside the two schemes (e.g. a plain '10_x'),
  // which Kysely's plain .sort() would run before '1_…' and an existing
  // database would refuse as "corrupted migrations" (T-012).
  it('names every migration in a scheme that sorts like Kysely', () => {
    for (const name of names) {
      expect(name, name).toMatch(/^(\d_[a-z0-9_]+|m\d{3}_[a-z0-9_]+)$/);
    }
    expect([...names].sort(compareMigrationNames)).toEqual([...names].sort());
  });

  // Break: a new legacy-style name (e.g. '9_add_new') sorts before
  // '9_add_script_event_end_time', so every existing install refuses it.
  it('keeps the legacy names frozen', () => {
    expect(names.filter((n) => /^\d_/.test(n))).toEqual([
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
    ]);
  });

  it('numbers m-prefixed migrations from 010', () => {
    for (const num of mNumbers) {
      expect(num).toBeGreaterThanOrEqual(10);
    }
  });

  // Break: two branches both taking the next m0NN. Kysely resolves names with
  // plain .sort() but breaks ties among executed migrations with localeCompare;
  // with a shared number those disagree and a fresh install's next upgrade
  // fails as "corrupted migrations".
  it('gives every m-prefixed migration its own number', () => {
    expect(new Set(mNumbers).size).toBe(mNumbers.length);
  });
});
