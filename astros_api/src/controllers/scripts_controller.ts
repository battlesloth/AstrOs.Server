import { PlaylistRepository } from '../dal/repositories/playlist_repository.js';
import { db } from '../dal/database.js';
import { ScriptRepository } from '../dal/repositories/script_repository.js';
import { logger } from '../logger.js';
import { Router } from 'express';

const getRoute = '/scripts/';
const putRoute = '/scripts/';
const deleteRoute = '/scripts/';
const copyRoute = '/scripts/copy';
const getAllRoute = '/scripts/all';
const getAllScriptNamesRoute = '/scripts/all-names';

export function registerScriptRoutes(router: Router, authHandler: any) {
  router.get(getRoute, authHandler, getScript);
  router.get(getAllRoute, authHandler, getAllScripts);
  router.get(getAllScriptNamesRoute, authHandler, getAllScriptNames);
  router.put(putRoute, authHandler, saveScript);
  router.delete(deleteRoute, authHandler, deleteScript);
  router.post(copyRoute, authHandler, copyScript);
}

async function getAllScripts(req: any, res: any, next: any) {
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

async function getAllScriptNames(req: any, res: any, next: any) {
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

async function getScript(req: any, res: any, next: any) {
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

async function saveScript(req: any, res: any, next: any) {
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

async function deleteScript(req: any, res: any, next: any) {
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

async function copyScript(req: any, res: any, next: any) {
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
