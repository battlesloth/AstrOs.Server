import { DataAccess } from "../dal/data_access";
import { RemoteConfigRepository } from "../dal/repositories/remote_config_repository";
import { logger } from "../logger";

export class RemoteConfigController{
    public static getRoute = '/remoteConfig/'
    public static putRoute = '/remoteConfig/'

    public static async getRemoteConfig(req: any, res: any, next: any) {
        try {
            const dao = new DataAccess();
            const repo = new RemoteConfigRepository(dao);

            const scripts = await repo.getConfig('m5paper');

            res.status(200);
            res.json(scripts);

        } catch (error) {
            logger.error(error);

            res.status(500);
            res.json({
                message: 'Internal server error'
            });
        }
    }

    public static async saveRemoteConfig(req: any, res: any, next: any) {
        try {
            const dao = new DataAccess();
            const repo = new RemoteConfigRepository(dao);

            if (await repo.saveConfig('m5paper', req.body.config)) {
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