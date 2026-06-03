import { Kysely } from 'kysely';
import { Database } from 'src/dal/types.js';
import { PlaylistRepository } from 'src/dal/repositories/playlist_repository.js';
import { PlaylistCycleError } from 'src/models/playlists/playlist_cycle_error.js';
import { logger } from 'src/logger.js';

const route = '/playlists/';
const getAllRoute = '/playlists/all';
const copyRoute = '/playlists/copy';
const getPlaylistNamesThatUseScriptRoute = '/playlists/usedByScript';

export function registerPlaylistRoutes(router: any, auth: any, db: Kysely<Database>) {
  router.get(getAllRoute, auth, (req: any, res: any, next: any) =>
    getAllPlaylists(db, req, res, next),
  );
  router.get(route, auth, (req: any, res: any, next: any) => getPlaylist(db, req, res, next));
  router.put(route, auth, (req: any, res: any, next: any) => savePlaylist(db, req, res, next));
  router.delete(route, auth, (req: any, res: any, next: any) => deletePlaylist(db, req, res, next));
  router.post(copyRoute, auth, (req: any, res: any, next: any) => copyPlaylist(db, req, res, next));
  router.get(getPlaylistNamesThatUseScriptRoute, auth, (req: any, res: any, next: any) =>
    getPlaylistNamesThatUseScript(db, req, res, next),
  );
}

async function getAllPlaylists(db: Kysely<Database>, req: any, res: any, next: any) {
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

export async function getPlaylist(db: Kysely<Database>, req: any, res: any, next: any) {
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

export async function savePlaylist(db: Kysely<Database>, req: any, res: any, next: any) {
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
    if (error instanceof PlaylistCycleError) {
      logger.warn(
        `Rejected cyclic playlist save: ${error.playlistId} via track ${error.offendingTrack.id}`,
      );
      res.status(400);
      res.json({
        error: 'playlist_cycle',
        message: error.message,
        offendingTrack: error.offendingTrack,
      });
      return;
    }
    logger.error(error);
    res.status(500);
    res.json({ error: 'Internal Server Error' });
  }
}

async function deletePlaylist(db: Kysely<Database>, req: any, res: any, next: any) {
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

async function copyPlaylist(db: Kysely<Database>, req: any, res: any, next: any) {
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

async function getPlaylistNamesThatUseScript(db: Kysely<Database>, req: any, res: any, next: any) {
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
