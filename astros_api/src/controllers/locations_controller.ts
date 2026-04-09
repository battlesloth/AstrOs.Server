import { Constants, LocationCollection } from '../models/index.js';
import { logger } from '../logger.js';
import { LocationsRepository } from '../dal/repositories/locations_repository.js';
import { Router } from 'express';
import { Kysely } from 'kysely';
import { Database } from '../dal/types.js';

const route = '/locations/';
const loadRoute = '/locations/load';

export function registerLocationRoutes(router: Router, authHandler: any, db: Kysely<Database>) {
  router.get(route, authHandler, (req: any, res: any, next: any) => getLocations(db, req, res, next));
  router.post(route, authHandler, (req: any, res: any, next: any) => saveLocations(db, req, res, next));
  router.get(loadRoute, authHandler, (req: any, res: any, next: any) => loadLocations(db, req, res, next));
}

export async function getLocations(db: Kysely<Database>, req: any, res: any, next: any) {
  try {
    const repo = new LocationsRepository(db);

    const response = new LocationCollection();

    const modules = await repo.getLocations();

    for (const mod of modules) {
      switch (mod.locationName) {
        case Constants.BODY:
          response.bodyModule = mod;
          break;
        case Constants.CORE:
          response.coreModule = mod;
          break;
        case Constants.DOME:
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
      message: 'Internal server error',
    });
  }
}

async function saveLocations(db: Kysely<Database>, req: any, res: any, next: any) {
  try {
    const repo = new LocationsRepository(db);

    const modules = req.body as LocationCollection;

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
      res.json({ message: 'success' });
    } else {
      res.status(500);
      res.json({
        message: 'failed',
      });
    }
  } catch (error) {
    logger.error(error);

    res.status(500);
    res.json({
      message: 'Internal server error',
    });
  }
}

async function loadLocations(db: Kysely<Database>, req: any, res: any, next: any) {
  try {
    const repo = new LocationsRepository(db);

    const locations = await repo.loadLocations();

    const response = new LocationCollection();

    logger.info(`loaded locations: ${locations.length}`);

    for (const location of locations) {
      switch (location.locationName) {
        case Constants.BODY:
          response.bodyModule = location;
          break;
        case Constants.CORE:
          response.coreModule = location;
          break;
        case Constants.DOME:
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
      message: 'Internal server error',
    });
  }
}
