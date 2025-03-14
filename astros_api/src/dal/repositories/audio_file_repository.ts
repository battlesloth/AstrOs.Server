import { AudioFile } from "astros-common";
import { logger } from "../../logger.js";
import { db, inserted } from "../database.js";

export class AudioFileRepository {
  async getAudioFiles(): Promise<Array<AudioFile>> {
    const result = new Array<AudioFile>();

    const data = await db
      .selectFrom("audio_files")
      .selectAll()
      .execute()
      .catch((err) => {
        logger.error(err);
        throw err;
      });

    for (const af of data) {
      const file = new AudioFile(
        af.id,
        af.file_name,
        af.description,
        af.duration,
      );
      result.push(file);
    }

    return result;
  }

  async insertFile(id: string, fileName: string): Promise<boolean> {
    const data = await db
      .insertInto("audio_files")
      .values({
        id: id,
        file_name: fileName,
        description: "",
        duration: 0,
      })
      .executeTakeFirst()
      .catch((err) => {
        logger.error(err);
        throw err;
      });

    return inserted(data);
  }

  async filesNeedingDuration() {
    const result = new Array<string>();

    const data = await db
      .selectFrom("audio_files")
      .select("id")
      .where("duration", "=", 0)
      .execute()
      .catch((err) => {
        logger.error(err);
        throw err;
      });

    for (const af of data) {
      result.push(af.id);
    }

    return result;
  }

  async updateFileDuration(id: string, duration: number) {
    const result = await db
      .updateTable("audio_files")
      .set({ duration: duration })
      .where("id", "=", id)
      .executeTakeFirst()
      .catch((err) => {
        logger.error(err);
        throw err;
      });

    return result.numUpdatedRows > 0;
  }

  async deleteFile(id: string): Promise<boolean> {
    const result = await db
      .deleteFrom("audio_files")
      .where("id", "=", id)
      .executeTakeFirst()
      .catch((err) => {
        logger.error(err);
        throw err;
      });

    return result.numDeletedRows > 0;
  }
}
