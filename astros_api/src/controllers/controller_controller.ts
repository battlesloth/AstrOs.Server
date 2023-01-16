import { DataAccess } from "src/dal/data_access";
import { ControllerRepository } from "src/dal/repositories/controller_repository";
import { logger } from "src/logger";

export class ControllerController {

    public static route = '/controllers/';
    public static syncRoute = '/controllers/sync'

    public static async getControllers(req: any, res: any, next: any) {
        try {
            const dao = new DataAccess();
            const repo = new ControllerRepository(dao);

            const modules = await repo.getControllers();

            res.status(200);
            res.json(modules);

        } catch (error) {
            logger.error(error);

            res.status(500);
            res.json({
                message: 'Internal server error'
            });
        }
    }

    public static async saveControllers(req: any, res: any, next: any) {
        try {
            const dao = new DataAccess();
            const repo = new ControllerRepository(dao);

            if (await repo.saveControllers(req.body)) {
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