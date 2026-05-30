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

    // Defensive: existing installs can hold value '{}' — an object, not an
    // array (the pre-fix migration_0 seed; fresh installs now seed '[]').
    // Until such a row is overwritten by a save, val is the parsed object and
    // val.forEach below would throw, so treat any non-array as empty.
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

export async function getRemoteConfig(db: Kysely<Database>, req: any, res: any, next: any) {
  try {
    const repo = new RemoteConfigRepository(db);

    const stored = (await repo.getConfig('remoteConfig'))?.value;

    // The editor store JSON.parses this response and hard-fails unless the
    // result is a pages array, so normalize anything that is not an array to
    // the empty-array string '[]'. The column is free-form JSON; existing
    // installs can still hold the legacy '{}' object seed (fresh installs now
    // seed '[]'). This applies the same non-array→empty intent as
    // syncRemoteConfig, but unlike that path — which lets a JSON.parse failure
    // reach the outer catch and 500 — the editor must not hard-fail on a
    // corrupt value (a thrown load collapses the whole 3-pane view to an error
    // banner), so it degrades to '[]'.
    let value = '[]';
    if (stored) {
      try {
        if (Array.isArray(JSON.parse(stored))) {
          value = stored;
        }
        // A parsed-but-non-array value (e.g. the legacy '{}' object seed) is a
        // known-benign state — normalize silently to '[]'.
      } catch (error) {
        // A non-JSON value is unreachable by any legitimate write (every save
        // is JSON.stringify of a pages array), so it signals real corruption
        // or external tampering. Leave a breadcrumb before serving '[]': the
        // user's first Save would otherwise overwrite the bad row with the
        // empty default and erase the evidence permanently.
        logger.warn(
          { err: error, type: 'remoteConfig' },
          'Corrupt remote_config value; serving empty array',
        );
      }
    }

    res.status(200);
    res.json(value);
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
