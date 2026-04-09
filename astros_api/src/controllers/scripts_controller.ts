import { PlaylistRepository } from '../dal/repositories/playlist_repository.js';
import { Kysely } from 'kysely';
import { Database } from '../dal/types.js';
import { ScriptRepository } from '../dal/repositories/script_repository.js';
import { logger } from '../logger.js';
import { Router } from 'express';

const getRoute = '/scripts/';
const putRoute = '/scripts/';
const deleteRoute = '/scripts/';
const copyRoute = '/scripts/copy';
const getAllRoute = '/scripts/all';
const getAllScriptNamesRoute = '/scripts/all-names';

export function registerScriptRoutes(router: Router, authHandler: any, db: Kysely<Database>) {
  router.get(getRoute, authHandler, (req: any, res: any, next: any) =>
    getScript(db, req, res, next),
  );
  router.get(getAllRoute, authHandler, (req: any, res: any, next: any) =>
    getAllScripts(db, req, res, next),
  );
  router.get(getAllScriptNamesRoute, authHandler, (req: any, res: any, next: any) =>
    getAllScriptNames(db, req, res, next),
  );
  router.put(putRoute, authHandler, (req: any, res: any, next: any) =>
    saveScript(db, req, res, next),
  );
  router.delete(deleteRoute, authHandler, (req: any, res: any, next: any) =>
    deleteScript(db, req, res, next),
  );
  router.post(copyRoute, authHandler, (req: any, res: any, next: any) =>
    copyScript(db, req, res, next),
  );
}

async function getAllScripts(db: Kysely<Database>, req: any, res: any, next: any) {
  try {
    const repo = new ScriptRepository(db);

    const scripts = await repo.getScripts();

    res.status(200);
    res.json(scripts);
  } catch (error) {
    logger.error(error);

    res.status(500);
    res.json({
      message: 'Internal server error',
    });
  }
}

async function getAllScriptNames(db: Kysely<Database>, req: any, res: any, next: any) {
  try {
    const repo = new ScriptRepository(db);

    const scripts = await repo.getScripts();
    const scriptNames = scripts.map((s) => ({
      id: s.id,
      scriptName: s.scriptName,
      description: s.description,
    }));

    res.status(200);
    res.json(scriptNames);
  } catch (error) {
    logger.error(error);

    res.status(500);
    res.json({
      message: 'Internal server error',
    });
  }
}

async function getScript(db: Kysely<Database>, req: any, res: any, next: any) {
  try {
    const repo = new ScriptRepository(db);

    const scripts = await repo.getScript(req.query.id);

    res.status(200);
    res.json(scripts);
  } catch (error) {
    logger.error(error);

    res.status(500);
    res.json({
      message: 'Internal server error',
    });
  }
}

async function saveScript(db: Kysely<Database>, req: any, res: any, next: any) {
  try {
    const repo = new ScriptRepository(db);

    if (await repo.upsertScript(req.body)) {
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

export async function deleteScript(db: Kysely<Database>, req: any, res: any, next: any) {
  try {
    const scriptRepo = new ScriptRepository(db);
    const playlistRepo = new PlaylistRepository(db);

    await scriptRepo.deleteScript(req.query.id);
    await playlistRepo.deleteTracksByScriptId(req.query.id);

    res.status(200);
    res.json({ message: 'success' });
  } catch (error) {
    logger.error(error);

    res.status(500);
    res.json({
      message: 'Internal server error',
    });
  }
}

async function copyScript(db: Kysely<Database>, req: any, res: any, next: any) {
  try {
    const repo = new ScriptRepository(db);

    const scripts = await repo.copyScript(req.query.id);

    res.status(200);
    res.json(scripts);
  } catch (error) {
    logger.error(error);

    res.status(500);
    res.json({
      message: 'Internal server error',
    });
  }
}
