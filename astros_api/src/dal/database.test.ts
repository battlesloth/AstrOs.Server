import { describe, expect, it } from 'vitest';
import appdata from 'appdata-path';
import SQLite from 'better-sqlite3';
import { assertNoFkViolations, resolveDatabaseDir } from './database.js';

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
