import { SettingsRepository } from '../dal/repositories/settings_repository.js';
import { logger } from '../logger.js';
import { ControllerRepository } from '../dal/repositories/controller_repository.js';
import { db } from '../dal/database.js';
import appdata from 'appdata-path';
import fs from 'fs';
import archiver from 'archiver';
import { Router } from 'express';

const getRoute = '/settings/';
const putRoute = '/settings/';
const controllersRoute = '/settings/controllers';
const logDownloadRoute = '/settings/logs';

export function registerSettingsRoutes(router: Router, auth: any) {
  router.get(getRoute, auth, getSetting);
  router.put(putRoute, auth, saveSetting);
  router.get(controllersRoute, auth, getControllers);
  router.get(logDownloadRoute, auth, downloadLogs);
}

async function getSetting(req: any, res: any, next: any) {
  try {
    const repo = new SettingsRepository(db);

    const setting = await repo.getSetting(req.query.key);

    res.status(200);
    res.json({ key: req.query.key, value: setting });
  } catch (error) {
    logger.error(error);

    res.status(500);
    res.json({
      message: 'Internal server error',
    });
  }
}

async function saveSetting(req: any, res: any, next: any) {
  try {
    const repo = new SettingsRepository(db);

    if (await repo.saveSetting(req.body.key, req.body.value)) {
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

async function getControllers(req: any, res: any, next: any) {
  try {
    const repo = new ControllerRepository(db);

    const controllers = await repo.getControllers();

    res.status(200);
    res.json(controllers);
  } catch (error) {
    logger.error(error);

    res.status(500);
    res.json({
      message: 'Internal server error',
    });
  }
}

async function downloadLogs(req: any, res: any, next: any) {
  try {
    const logDir = `${appdata('astrosserver')}/logs/`;
    const files = await fs.promises.readdir(logDir);

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="logs.zip"');

    const archive = archiver('zip', { zlib: { level: 1 } });
    archive.on('error', (err: Error) => {
      logger.error(err);
      res.status(500).json({ message: 'Internal server error' });
    });
    archive.pipe(res);

    for (const file of files) {
      archive.file(`${logDir}${file}`, { name: file });
    }

    await archive.finalize();
  } catch (error) {
    logger.error(error);
    res.status(500);
    res.json({
      message: 'Internal server error',
    });
  }
}
