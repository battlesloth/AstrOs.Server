import appdata from 'appdata-path';
import { AudioFileRepository } from 'src/dal/repositories/audio_file_repository.js';
import { v4 as uuid_v4 } from 'uuid';
import { UploadedFile } from 'express-fileupload';
import { logger } from 'src/logger.js';
import { Kysely } from 'kysely';
import { Database } from 'src/dal/types.js';
import { Router } from 'express';

// https://github.com/expressjs/multer/blob/master/StorageEngine.md
const audioUploadRoute = '/audio/savefile';

function StoragePath() {
  return `${appdata('astrosserver')}/files/`;
}

export function registerFileRoutes(router: Router, authHandler: any, db: Kysely<Database>) {
  router.post(audioUploadRoute, authHandler, (req: any, res: any) => HandleFile(db, req, res));
}

async function HandleFile(db: Kysely<Database>, req: any, res: any) {
  try {
    if (!req.files) {
      return res.status(400).send('No files uploaded');
    }

    const file = req.files.file as UploadedFile;
    let filename = 'error';

    logger.info('File Uploaded:');
    logger.info(`file: ${file.name}, mimetype: ${file.mimetype}`);

    const extensionMap = new Map<string, string>([
      ['audio/ogg', 'ogg'],
      ['audio/mpeg', 'mp3'],
      ['audio/wav', 'wav'],
    ]);

    filename = `${uuid_v4()}.${extensionMap.get(file.mimetype)}`;

    const path = `${StoragePath()}/${filename}`;

    file.mv(path, (err) => {
      if (err) {
        logger.error(err);
        return res.status(500).send('Internal server error');
      }
    });

    const repo = new AudioFileRepository(db);

    await repo.insertFile(filename, file.name);

    return res.status(200).send();
  } catch (err) {
    logger.error(err);
    return res.status(500).send('Internal server error');
  }
}
