import { M5Page, M5ScriptList, M5Button } from '../models/index.js';
import { RemoteConfigRepository } from '../dal/repositories/remote_config_repository.js';
import { logger } from '../logger.js';
import { Kysely } from 'kysely';
import { Database } from '../dal/types.js';
import { Router } from 'express';

const getRoute = '/remoteConfig/';
const putRoute = '/remoteConfig/';
const syncRoute = '/remotecontrolsync';

export function registerRemoteConfigRoutes(
  router: Router,
  authHandler: any,
  tokenValidator: any,
  db: Kysely<Database>,
) {
  router.get(getRoute, authHandler, (req: any, res: any, next: any) =>
    getRemoteConfig(db, req, res, next),
  );
  router.put(putRoute, authHandler, (req: any, res: any, next: any) =>
    saveRemoteConfig(db, req, res, next),
  );
  router.get(syncRoute, tokenValidator, (req: any, res: any, next: any) =>
    syncRemoteConfig(db, req, res, next),
  );
}

async function syncRemoteConfig(db: Kysely<Database>, req: any, res: any, next: any) {
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

async function getRemoteConfig(db: Kysely<Database>, req: any, res: any, next: any) {
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

async function saveRemoteConfig(db: Kysely<Database>, req: any, res: any, next: any) {
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
