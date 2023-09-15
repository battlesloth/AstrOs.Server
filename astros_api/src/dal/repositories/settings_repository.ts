import { DataAccess } from "../data_access";
import { logger } from "../../logger";
import { SettingsTable } from "../tables/settings_table";

export class SettingsRepository {

    dao: DataAccess;

    constructor(dao: DataAccess) {
        this.dao = dao;
        this.dao.connect();
    }

    async getSetting(type: string) : Promise<string> {

        const result = await this.dao.get(SettingsTable.select, [type])
        .then((val: any) => {
            return val[0].value;
        })
        .catch((err) => {
            logger.error(err);
            return '';
        });

        return result;
    }

    async saveSetting(key: string, value: string) : Promise<boolean> {

        await this.dao.get(SettingsTable.insert, [key, value])
        .then((val: any) => {
            if (val) { logger.info(val); }
        })
        .catch((err) => {
            logger.error(err);
            return false;
        });

        return true;
    }

    
}
