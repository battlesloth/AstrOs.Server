import { SettingsRepository } from '../dal/repositories/settings_repository.js';
import { logger } from '../logger.js';
import { ControllerRepository } from '../dal/repositories/controller_repository.js';
import { db } from '../dal/database.js';
import appdata from 'appdata-path';
import fs from 'fs';
import archiver from 'archiver';

export class SettingsController {
  public static getRoute = '/settings/';
  public static putRoute = '/settings/';
  public static formatSDRoute = '/settings/formatSD';
  public static controllersRoute = '/settings/controllers';
  public static logDownloadRoute = '/settings/logs';

  public static async getSetting(req: any, res: any, next: any) {
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

  public static async saveSetting(req: any, res: any, next: any) {
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

  public static async getControllers(req: any, res: any, next: any) {
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

  public static async downloadLogs(req: any, res: any, next: any) {
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
}
