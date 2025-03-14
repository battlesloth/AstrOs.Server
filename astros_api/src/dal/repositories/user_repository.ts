import { db } from "../database.js";
import { logger } from "../../logger.js";
import { User } from "../../models/users.js";

export class UserRepository {
  async getByUsername(name: string) {
    const user = await db
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
