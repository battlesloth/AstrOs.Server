import { AudioFileRepository } from '../dal/repositories/audio_file_repository.js';
import { unlink } from 'fs';
import appdata from 'appdata-path';
import { logger } from '../logger.js';
import { db } from '../dal/database.js';

export class AudioController {
  public static getAll = '/audio/all';
  public static deleteRoute = '/audio/delete';

  public static async getAllAudioFiles(req: any, res: any, next: any) {
    try {
      const repo = new AudioFileRepository(db);

      const files = await repo.getAudioFiles();

      res.status(200);
      res.json(files);
    } catch (error) {
      logger.error(error);

      res.status(500);
      res.json({
        message: 'Internal server error',
      });
    }
  }

  public static async deleteAudioFile(req: any, res: any, next: any) {
    try {
      const repo = new AudioFileRepository(db);

      const result = await repo.deleteFile(req.query.id);

      if (result) {
        await unlink(`${appdata('astrosserver')}/files/${req.query.id}`, (err) => {
          if (err) {
            console.error(err);
          }
        });
      }

      res.status(200);
      res.json({ success: true });
    } catch (error) {
      logger.error(error);

      res.status(500);
      res.json({
        message: 'Internal server error',
      });
    }
  }
}
