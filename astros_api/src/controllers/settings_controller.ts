import { SettingsRepository } from  "../dal/repositories/settings_repository";
import { DataAccess } from "../dal/data_access";
import { logger } from "../logger";

export class SettingsController{
    public static getRoute = '/settings/'
    public static putRoute = '/settings/'
    public static formatSDRoute = '/settings/formatSD'
   
    public static async getSetting(req: any, res: any, next: any) {
        try {
            const dao = new DataAccess();
            const repo = new SettingsRepository(dao);

            const setting = await repo.getSetting(req.query.key);

            res.status(200);
            res.json({key: req.query.key, value: setting});

        } catch (error) {
            logger.error(error);

            res.status(500);
            res.json({
                message: 'Internal server error'
            });
        }
    }

    public static async saveSetting(req: any, res: any, next: any) {
        try {
            const dao = new DataAccess();
            const repo = new SettingsRepository(dao);

            if (await repo.saveSetting(req.body.key, req.body.value)) {
                res.status(200);
                res.json({ message: 'success' });
            } else {
                res.status(500);
                res.json({
                    message: 'failed'
                });
            }
        } catch (error) {
            logger.error(error);

            res.status(500);
            res.json({
                message: 'Internal server error'
            });
        }
    }
}