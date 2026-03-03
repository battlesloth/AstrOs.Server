import { M5Page, M5ScriptList, M5Button } from 'astros-common';
import { RemoteConfigRepository } from '../dal/repositories/remote_config_repository.js';
import { logger } from '../logger.js';
import { db } from '../dal/database.js';

export class RemoteConfigController {
  public static getRoute = '/remoteConfig/';
  public static putRoute = '/remoteConfig/';

  public static async syncRemoteConfig(req: any, res: any, next: any) {
    logger.info('Syncing remote config to device');

    try {
      const repo = new RemoteConfigRepository(db);

      const scripts = await repo.getConfig('astrOsScreen');

      const val = JSON.parse(scripts?.value || '[]') as Array<M5Page>;

      if (!val || val.length === 0) {
        res.status(200);
        res.json(new M5ScriptList());
        return;
      }

      const response = new M5ScriptList();
      val.forEach((x) => {
        const list = new Array<M5Button>();
        list.push(new M5Button(x.button1.name, x.button1.id));
        list.push(new M5Button(x.button2.name, x.button2.id));
        list.push(new M5Button(x.button3.name, x.button3.id));
        list.push(new M5Button(x.button4.name, x.button4.id));
        list.push(new M5Button(x.button5.name, x.button5.id));
        list.push(new M5Button(x.button6.name, x.button6.id));
        list.push(new M5Button(x.button7.name, x.button7.id));
        list.push(new M5Button(x.button8.name, x.button8.id));
        list.push(new M5Button(x.button9.name, x.button9.id));
        response.pages.push(list);
      });

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

  public static async getRemoteConfig(req: any, res: any, next: any) {
    try {
      const repo = new RemoteConfigRepository(db);

      const scripts = await repo.getConfig('astrOsScreen');

      res.status(200);
      res.json(scripts?.value || { value: '[]' });
    } catch (error) {
      logger.error(error);

      res.status(500);
      res.json({
        message: 'Internal server error',
      });
    }
  }

  public static async saveRemoteConfig(req: any, res: any, next: any) {
    try {
      const repo = new RemoteConfigRepository(db);

      if (await repo.saveConfig('astrOsScreen', req.body.config)) {
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
}
