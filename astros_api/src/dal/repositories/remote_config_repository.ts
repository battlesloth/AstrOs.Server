import { logger } from "../../logger.js";
import { db } from "../database.js";

export class RemoteConfigRepository {
  async getConfig(type: string) {
    const result = await db
      .selectFrom("remote_config")
      .selectAll()
      .where("type", "=", type)
      .executeTakeFirstOrThrow()
      .catch((err) => {
        logger.error(err);
        throw err;
      });

    return result.value;
  }

  async saveConfig(type: string, json: string): Promise<boolean> {
    const data = await db
      .updateTable("remote_config")
      .set("value", json)
      .where("type", "=", type)
      .executeTakeFirstOrThrow()
      .catch((err) => {
        logger.error(err);
        throw err;
      });

    return data.numUpdatedRows > 0;
  }
}
