import { Kysely } from "kysely";
import { logger } from "../../logger.js";
import { User } from "../../models/users.js";
import { Database } from "../types.js";

export class UserRepository {

    constructor(
      private readonly db: Kysely<Database>
    ) {}

  async getByUsername(name: string) {
    const user = await this.db
      .selectFrom("users")
      .selectAll()
      .where("user", "=", name)
      .executeTakeFirstOrThrow()
      .catch((err) => {
        logger.error(err);
        throw err;
      });

    return new User(user.user, user.hash, user.salt);
  }
}
