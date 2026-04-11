import { AudioFileRepository } from 'src/dal/repositories/audio_file_repository.js';
import { unlink } from 'fs/promises';
import appdata from 'appdata-path';
import path from 'path';
import { logger } from 'src/logger.js';
import { Kysely } from 'kysely';
import { Database } from 'src/dal/types.js';
import { Router } from 'express';

const getAll = '/audio/all';
const deleteRoute = '/audio/delete';

export function registerAudioRoutes(router: Router, auth: any, db: Kysely<Database>) {
  router.get(getAll, auth, (req: any, res: any, next: any) => getAllAudioFiles(db, req, res, next));
  router.delete(deleteRoute, auth, (req: any, res: any, next: any) =>
    deleteAudioFile(db, req, res, next),
  );
}

export async function getAllAudioFiles(db: Kysely<Database>, req: any, res: any, next: any) {
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

export async function deleteAudioFile(db: Kysely<Database>, req: any, res: any, next: any) {
  try {
    const repo = new AudioFileRepository(db);

    const result = await repo.deleteFile(req.query.id);

    if (result) {
      const storageDir = `${appdata('astrosserver')}/files`;
      const filePath = path.resolve(storageDir, req.query.id);
      if (!filePath.startsWith(path.resolve(storageDir))) {
        logger.error(`Path traversal attempt blocked: ${req.query.id}`);
      } else {
        await unlink(filePath);
      }
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
