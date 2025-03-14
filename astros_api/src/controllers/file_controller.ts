import appdata from "appdata-path";
import { AudioFileRepository } from "../dal/repositories/audio_file_repository.js";
import { v4 as uuid_v4 } from "uuid";
import { UploadedFile } from "express-fileupload";
import { logger } from "../logger.js";

// https://github.com/expressjs/multer/blob/master/StorageEngine.md
export class FileController {
  public static audioUploadRoute = "/audio/savefile";

  public static StoragePath() {
    return `${appdata("astrosserver")}/files/`;
  }

  public static async HandleFile(req: any, res: any) {
    try {
      if (!req.files) {
        return res.status(400).send("No files uploaded");
      }

      const file = req.files.file as UploadedFile;
      let filename = "error";

      logger.info("File Uploaded:");
      logger.info(`file: ${file.name}, mimetype: ${file.mimetype}`);

      const extensionMap = new Map<string, string>([
        ["audio/ogg", "ogg"],
        ["audio/mpeg", "mp3"],
        ["audio/wav", "wav"],
      ]);

      filename = `${uuid_v4()}.${extensionMap.get(file.mimetype)}`;

      const path = `${FileController.StoragePath()}/${filename}`;

      file.mv(path, (err) => {
        if (err) {
          logger.error(err);
          return res.status(500).send("Internal server error");
        }
      });

      const repo = new AudioFileRepository();

      await repo.insertFile(filename, file.name);

      return res.status(200).send();
    } catch (err) {
      logger.error(err);
      return res.status(500).send("Internal server error");
    }
  }

  public static async UpdateFileDurations() {
    const repo = new AudioFileRepository();

    const files = await repo.filesNeedingDuration();

    logger.info(`Testing: ${JSON.stringify(files)}`);
  }
}
