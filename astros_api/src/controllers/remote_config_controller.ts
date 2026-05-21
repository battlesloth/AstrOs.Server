import type { RemotePage, RemoteScriptList, RemoteButton } from 'src/models/index.js';
import { RemoteConfigRepository } from 'src/dal/repositories/remote_config_repository.js';
import { logger } from 'src/logger.js';
import { Kysely } from 'kysely';
import { Database } from 'src/dal/types.js';
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

export async function syncRemoteConfig(db: Kysely<Database>, req: any, res: any, next: any) {
  logger.info('Syncing remote config to device');

  try {
    const repo = new RemoteConfigRepository(db);

    const scripts = await repo.getConfig('remoteConfig');

    const val = JSON.parse(scripts?.value || '[]') as Array<RemotePage>;

    // Defensive: migration_0 seeds the row with value '{}' (an object, not
    // an array) on fresh installs. Until a user saves their first config,
    // val is the parsed object and val.forEach below would throw.
    if (!Array.isArray(val) || val.length === 0) {
      res.status(200);
      res.json({ pages: [] } as RemoteScriptList);
      return;
    }

    const response: RemoteScriptList = { pages: [] };
    val.forEach((x) => {
      const list = new Array<RemoteButton>();
      list.push({ name: x.button1.name, command: x.button1.id });
      list.push({ name: x.button2.name, command: x.button2.id });
      list.push({ name: x.button3.name, command: x.button3.id });
      list.push({ name: x.button4.name, command: x.button4.id });
      list.push({ name: x.button5.name, command: x.button5.id });
      list.push({ name: x.button6.name, command: x.button6.id });
      list.push({ name: x.button7.name, command: x.button7.id });
      list.push({ name: x.button8.name, command: x.button8.id });
      list.push({ name: x.button9.name, command: x.button9.id });
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

    const scripts = await repo.getConfig('remoteConfig');

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

    if (await repo.saveConfig('remoteConfig', req.body.config)) {
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
