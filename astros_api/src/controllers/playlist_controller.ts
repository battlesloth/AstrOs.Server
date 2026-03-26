import { db } from '../dal/database.js';
import { PlaylistRepository } from '../dal/repositories/playlist_repository.js';
import { logger } from '../logger.js';

const route = '/playlists/';
const getAllRoute = '/playlists/all';
const copyRoute = '/playlists/copy';
const getPlaylistNamesThatUseScriptRoute = '/playlists/usedByScript';

export function registerPlaylistRoutes(router: any, auth: any) {
  router.get(getAllRoute, auth, getAllPlaylists);
  router.get(route, auth, getPlaylist);
  router.put(route, auth, savePlaylist);
  router.delete(route, auth, deletePlaylist);
  router.post(copyRoute, auth, copyPlaylist);
  router.get(getPlaylistNamesThatUseScriptRoute, auth, getPlaylistNamesThatUseScript);
}

async function getAllPlaylists(req: any, res: any, next: any) {
  try {
    const repo = new PlaylistRepository(db);
    const playlists = await repo.getAllPlaylists();

    res.status(200);
    res.json(playlists);
  } catch (error) {
    logger.error(error);
    res.status(500);
    res.json({ error: 'Internal Server Error' });
  }
}

async function getPlaylist(req: any, res: any, next: any) {
  try {
    const repo = new PlaylistRepository(db);
    const playlist = await repo.getPlaylist(req.query.id);

    if (playlist) {
      res.status(200);
      res.json(playlist);
    } else {
      res.status(404);
      res.json({ error: 'Playlist not found' });
    }
  } catch (error) {
    logger.error(error);
    res.status(500);
    res.json({ error: 'Internal Server Error' });
  }
}

async function savePlaylist(req: any, res: any, next: any) {
  try {
    const repo = new PlaylistRepository(db);
    if (await repo.upsertPlaylist(req.body)) {
      res.status(200);
      res.json({ message: 'success' });
    } else {
      res.status(500);
      res.json({ message: 'failed' });
    }
  } catch (error) {
    logger.error(error);
    res.status(500);
    res.json({ error: 'Internal Server Error' });
  }
}

async function deletePlaylist(req: any, res: any, next: any) {
  try {
    const repo = new PlaylistRepository(db);
    if (await repo.deletePlaylist(req.query.id)) {
      res.status(200);
      res.json({ message: 'success' });
    } else {
      res.status(500);
      res.json({ message: 'failed' });
    }
  } catch (error) {
    logger.error(error);
    res.status(500);
    res.json({ error: 'Internal Server Error' });
  }
}

async function copyPlaylist(req: any, res: any, next: any) {
  try {
    const repo = new PlaylistRepository(db);
    const copiedPlaylist = await repo.copyPlaylist(req.body.id);

    if (copiedPlaylist) {
      res.status(200);
      res.json(copiedPlaylist);
    } else {
      res.status(404);
      res.json({ error: 'Playlist not found' });
    }
  } catch (error) {
    logger.error(error);
    res.status(500);
    res.json({ error: 'Internal Server Error' });
  }
}

async function getPlaylistNamesThatUseScript(req: any, res: any, next: any) {
  try {
    const repo = new PlaylistRepository(db);
    const names = await repo.getPlaylistNamesThatUseScript(req.query.scriptId);

    res.status(200);
    res.json(names);
  } catch (error) {
    logger.error(error);
    res.status(500);
    res.json({ error: 'Internal Server Error' });
  }
}
