import { M5Page } from "astros-common";
import { DataAccess } from "../../dal/data_access.js";
import { logger } from "../../logger.js";
import { RemoteConfigTable } from "../tables/remote_config_table.js";

export class RemoteConfigRepository {
  dao: DataAccess;

  constructor(dao: DataAccess) {
    this.dao = dao;
    this.dao.connect();
  }

  async getConfig(type: string) {
    const result = await this.dao
      .get(RemoteConfigTable.select, [type])
      .then((val: any) => {
        return val[0];
      })
      .catch((err) => {
        logger.error(err);
        return new Array<M5Page>();
      });

    return result;
  }

  async saveConfig(type: string, json: string): Promise<boolean> {
    await this.dao
      .get(RemoteConfigTable.insert, [type, json])
      .then((val: any) => {
        if (val) {
          logger.info(val);
        }
      })
      .catch((err) => {
        logger.error(err);
        return false;
      });

    return true;
  }
}
