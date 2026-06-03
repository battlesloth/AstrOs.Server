import { Kysely } from 'kysely';
import { logger } from 'src/logger.js';
import { User } from 'src/models/users.js';
import { Database } from 'src/dal/types.js';

export class UserRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async getByUsername(name: string) {
    const user = await this.db
      .selectFrom('users')
      .selectAll()
      .where('user', '=', name)
      .executeTakeFirstOrThrow()
      .catch((err) => {
        logger.error('UserRepository.getByUsername', err);
        throw err;
      });

    return new User(user.user, user.hash, user.salt);
  }

  async updatePassword(user: User) {
    try {
      const result = await this.db
        .updateTable('users')
        .set({ hash: user.hash, salt: user.salt })
        .where('user', '=', user.name)
        .executeTakeFirst();

      // A Kysely UPDATE resolves successfully even when no row matches, which
      // would silently no-op. Surface a missing user instead of reporting success.
      if (!result || Number(result.numUpdatedRows) === 0) {
        throw new Error(`No user found to update password for: ${user.name}`);
      }
    } catch (err) {
      logger.error('UserRepository.updatePassword', err);
      throw err;
    }
  }
}
