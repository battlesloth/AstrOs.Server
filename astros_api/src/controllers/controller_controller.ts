
import { AudioModule, ControlModule, ControllerType, ModuleCollection } from "astros-common";
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

            const response =  new ModuleCollection();

            const modules = await repo.getControllers();

            for (const mod of modules)
            {
                switch (mod.id){
                    case ControllerType.core:
                        response.coreModule = mod;
                        break;
                    case ControllerType.dome:
                        response.domeModule = mod;
                        break;
                    case ControllerType.body:
                        response.bodyModule = mod;
                        break;
                    default:
                        logger.error("invalid module type");
                        break;
                }
            }

            const audioModule = await repo.getAudioModule();

            response.audioModule = audioModule ?? new AudioModule();

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
            
            const modules = req.body as ModuleCollection;

            if (modules.domeModule){
                controllers.push(modules.domeModule);
            }
            
            if (modules.coreModule){
                controllers.push(modules.coreModule);
            }
            
            if (modules.bodyModule){
                controllers.push(modules.bodyModule);
            }
            
            let success = await repo.saveControllers(controllers);
            
            if (success && modules.audioModule){
                success = await repo.saveAudioModule(modules.audioModule);
            }

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