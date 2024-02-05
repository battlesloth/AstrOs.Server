
import { ControlModule, AstrOsModuleCollection } from "astros-common";
import { DataAccess } from "../dal/data_access";
import { ControllerRepository } from "../dal/repositories/controller_repository";
import { logger } from "../logger";

export class ControllerController {

    public static route = '/controllers/';
    public static syncRoute = '/controllers/sync'

    public static async getControllers(req: any, res: any, next: any) {
        try {
            const dao = new DataAccess();
            const repo = new ControllerRepository(dao);

            const response = new AstrOsModuleCollection();

            const modules = await repo.getControllers();

            for (const mod of modules) {
                switch (mod.location) {
                    case "core":
                        response.coreModule = mod;
                        break;
                    case "dome":
                        response.domeModule = mod;
                        break;
                    case "body":
                        response.bodyModule = mod;
                        break;
                    default:
                        logger.error("invalid module type");
                        break;
                }
            }

            res.status(200);
            res.json(response);

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

            const controllers = new Array<ControlModule>();

            const modules = req.body as AstrOsModuleCollection;

            if (modules.domeModule) {
                controllers.push(modules.domeModule);
            }

            if (modules.coreModule) {
                controllers.push(modules.coreModule);
            }

            if (modules.bodyModule) {
                controllers.push(modules.bodyModule);
            }

            const success = await repo.saveControllers(controllers);

            if (success) {
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