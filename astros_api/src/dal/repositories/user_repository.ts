import { DataAccess } from "../../dal/data_access.js";
import { UsersTable } from "../../dal/tables/users_table.js";
import { logger } from "../../logger.js";
import { User } from "../../models/users.js";

export class UserRepository {
  dao: DataAccess;

  constructor(dao: DataAccess) {
    this.dao = dao;
    this.dao.connect();
  }

  async getByUsername(name: string) {
    const result = await this.dao
      .get(UsersTable.select, [name])
      .then((val: any) => {
        return new User(val[0].user, val[0].hash, val[0].salt);
      })
      .catch((err) => {
        logger.error(err);
        return new User("", "", "");
      });

    return result;
  }
}
