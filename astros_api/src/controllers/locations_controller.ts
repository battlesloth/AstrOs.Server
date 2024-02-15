
import { ControlModule, AstrOsLocationCollection } from "astros-common";
import { DataAccess } from "../dal/data_access";
import { logger } from "../logger";
import { LocationsRepository } from "../dal/repositories/locations_repository";

export class LocationsController {

    public static route = '/locations/';
    public static syncRoute = '/locations/sync'

    public static async getLocations(req: any, res: any, next: any) {
        try {
            const dao = new DataAccess();
            const repo = new LocationsRepository(dao);

            const response = new AstrOsLocationCollection();

            const modules = await repo.getLocations();

            for (const mod of modules) {
                switch (mod.locationName) {
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

    public static async saveLocations(req: any, res: any, next: any) {
        try {
            const dao = new DataAccess();
            const repo = new LocationsRepository(dao);

            const controllers = new Array<ControlModule>();

            const modules = req.body as AstrOsLocationCollection;

            let success = false;

            if (modules.domeModule) {
                success = await repo.updateLocation(modules.domeModule) && success;
            }

            if (modules.coreModule) {
                success = await repo.updateLocation(modules.coreModule) && success;
            }

            if (modules.bodyModule) {
                success = await repo.updateLocation(modules.bodyModule) && success;
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