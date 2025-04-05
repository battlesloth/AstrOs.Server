import { logger } from "../../logger.js";
import { Kysely } from "kysely";
import { Database } from "../types.js";

export class RemoteConfigRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async getConfig(type: string) {
    const result = await this.db
      .selectFrom("remote_config")
      .selectAll()
      .where("type", "=", type)
      .executeTakeFirstOrThrow()
      .catch((err) => {
        logger.error('RemoteConfigRepository.getConfig', err);
        throw err;
      });

    return result.value;
  }

  async saveConfig(type: string, json: string): Promise<boolean> {
    const data = await this.db
      .updateTable("remote_config")
      .set("value", json)
      .where("type", "=", type)
      .executeTakeFirstOrThrow()
      .catch((err) => {
        logger.error('RemoteConfigRepository.saveConfig', err);
        throw err;
      });

    return data.numUpdatedRows > 0;
  }
}
