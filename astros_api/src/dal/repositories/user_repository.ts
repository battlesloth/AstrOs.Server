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
}
