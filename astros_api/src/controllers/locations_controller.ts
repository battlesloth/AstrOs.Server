import { AstrOsConstants, AstrOsLocationCollection } from "astros-common";
import { logger } from "../logger.js";
import { LocationsRepository } from "../dal/repositories/locations_repository.js";

export class LocationsController {
  public static route = "/locations/";
  public static syncConfigRoute = "/locations/syncconfig";
  public static syncControllersRoute = "/locations/synccontrollers";
  public static loadRoute = "/locations/load";

  public static async getLocations(req: any, res: any, next: any) {
    try {
      const repo = new LocationsRepository();

      const response = new AstrOsLocationCollection();

      const modules = await repo.getLocations();

      for (const mod of modules) {
        switch (mod.locationName) {
          case AstrOsConstants.BODY:
            response.bodyModule = mod;
            break;
          case AstrOsConstants.CORE:
            response.coreModule = mod;
            break;
          case AstrOsConstants.DOME:
            response.domeModule = mod;
            break;
          default:
            logger.error(`invalid module type: ${mod.locationName}`);
            break;
        }
      }

      res.status(200);
      res.json(response);
    } catch (error) {
      logger.error(error);

      res.status(500);
      res.json({
        message: "Internal server error",
      });
    }
  }

  public static async saveLocations(req: any, res: any, next: any) {
    try {
      const repo = new LocationsRepository();

      const modules = req.body as AstrOsLocationCollection;

      let success = true;

      if (modules.domeModule) {
        success = (await repo.updateLocation(modules.domeModule)) && success;
      }

      if (modules.coreModule) {
        success = (await repo.updateLocation(modules.coreModule)) && success;
      }

      if (modules.bodyModule) {
        success = (await repo.updateLocation(modules.bodyModule)) && success;
      }

      if (success) {
        res.status(200);
        res.json({ message: "success" });
      } else {
        res.status(500);
        res.json({
          message: "failed",
        });
      }
    } catch (error) {
      logger.error(error);

      res.status(500);
      res.json({
        message: "Internal server error",
      });
    }
  }

  public static async loadLocations(req: any, res: any, next: any) {
    try {
      const repo = new LocationsRepository();

      const locations = await repo.loadLocations();

      const response = new AstrOsLocationCollection();

      logger.info(`loaded locations: ${locations.length}`);

      for (const location of locations) {
        switch (location.locationName) {
          case AstrOsConstants.BODY:
            response.bodyModule = location;
            break;
          case AstrOsConstants.CORE:
            response.coreModule = location;
            break;
          case AstrOsConstants.DOME:
            response.domeModule = location;
            break;
          default:
            logger.error(`invalid module type: ${location.locationName}`);
            break;
        }
      }

      res.status(200);
      res.json(response);
    } catch (error) {
      logger.error(error);

      res.status(500);
      res.json({
        message: "Internal server error",
      });
    }
  }
}
