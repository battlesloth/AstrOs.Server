import { Kysely } from "kysely";
import { Database } from "../types.js";
import { logger } from "../../logger.js";

export class SettingsRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async getSetting(type: string): Promise<string> {
    await this.db
      .selectFrom("settings")
      .selectAll()
      .where("key", "=", type)
      .executeTakeFirstOrThrow()
      .catch((err) => {
        logger.error(err);
        throw err;
      });

    return "error";
  }

  async saveSetting(key: string, value: string): Promise<boolean> {
    await this.db
      .insertInto("settings")
      .values({ key, value })
      .onConflict((c) =>
        c.columns(["key"]).doUpdateSet((eb) => ({
          value: eb.ref("excluded.value"),
        })),
      )
      .execute()
      .catch((err) => {
        logger.error(err);
        throw err;
      });

    return true;
  }
}
