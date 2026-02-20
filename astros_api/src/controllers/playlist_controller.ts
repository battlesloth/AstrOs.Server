import { db } from '../dal/database.js';
import { PlaylistRepository } from 'src/dal/repositories/playlist_repository';
import { logger } from '../logger.js';

export class PlaylistController {
  public static getRoute = '/playlists/';
  public static putRoute = '/playlists/';
  public static deleteRoute = '/playlists/';
  public static getAllRoute = '/playlists/all';
  public static copyRoute = '/playlists/copy';
  public static getPlaylistNamesThatUseScriptRoute = '/playlists/usedByScript';

  public static async getAllPlaylists(req: any, res: any, next: any) {
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

  public static async getPlaylist(req: any, res: any, next: any) {
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

  public static async savePlaylist(req: any, res: any, next: any) {
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

  public static async deletePlaylist(req: any, res: any, next: any) {
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

  public static async copyPlaylist(req: any, res: any, next: any) {
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

  public static async getPlaylistNamesThatUseScript(req: any, res: any, next: any) {
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
}
