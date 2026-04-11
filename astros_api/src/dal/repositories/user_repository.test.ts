import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import SQLite from 'better-sqlite3';
import { Kysely, SqliteDialect } from 'kysely';
import { Database } from '../types.js';
import { migrateToLatest } from '../database.js';
import { UserRepository } from './user_repository.js';
import { User } from '../../models/users.js';

describe('UserRepository', () => {
  let db: Kysely<Database>;

  beforeEach(async () => {
    db = new Kysely<Database>({
      dialect: new SqliteDialect({ database: new SQLite(':memory:') }),
    });
    await migrateToLatest(db);
  });

  afterEach(async () => {
    await db.destroy();
  });

  async function seedUser(name: string, password: string) {
    const user = new User(name);
    user.setPassword(password);
    await db
      .insertInto('users')
      .values({ user: user.name, hash: user.hash, salt: user.salt })
      .execute();
    return user;
  }

  it('should return a user by username', async () => {
    const seeded = await seedUser('testuser', 'password123');
    const repo = new UserRepository(db);

    const result = await repo.getByUsername('testuser');

    expect(result.name).toBe('testuser');
    expect(result.hash).toBe(seeded.hash);
    expect(result.salt).toBe(seeded.salt);
    expect(result.validatePassword('password123')).toBe(true);
  });

  it('should throw when user not found', async () => {
    const repo = new UserRepository(db);

    await expect(repo.getByUsername('nonexistent')).rejects.toThrow();
  });
});
