import { AudioFile } from "astros-common";
import { logger } from "../../logger.js";
import { inserted } from "../database.js";
import { Kysely } from "kysely";
import { Database } from "../types.js";

export class AudioFileRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async getAudioFiles(): Promise<Array<AudioFile>> {
    const result = new Array<AudioFile>();

    const data = await this.db
      .selectFrom("audio_files")
      .selectAll()
      .execute()
      .catch((err) => {
        logger.error("AudioFileRepository.getAudioFiles", err);
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
    const data = await this.db
      .insertInto("audio_files")
      .values({
        id: id,
        file_name: fileName,
        description: "",
        duration: 0,
      })
      .executeTakeFirst()
      .catch((err) => {
        logger.error("AudioFileRepository.insertFile", err);
        throw err;
      });

    return inserted(data);
  }

  async filesNeedingDuration() {
    const result = new Array<string>();

    const data = await this.db
      .selectFrom("audio_files")
      .select("id")
      .where("duration", "=", 0)
      .execute()
      .catch((err) => {
        logger.error("AudioFileRepository.filesNeedingDuration", err);
        throw err;
      });

    for (const af of data) {
      result.push(af.id);
    }

    return result;
  }

  async updateFileDuration(id: string, duration: number) {
    const result = await this.db
      .updateTable("audio_files")
      .set({ duration: duration })
      .where("id", "=", id)
      .executeTakeFirst()
      .catch((err) => {
        logger.error("AudioFileRepository.updateFileDuration", err);
        throw err;
      });

    return result.numUpdatedRows > 0;
  }

  async deleteFile(id: string): Promise<boolean> {
    const result = await this.db
      .deleteFrom("audio_files")
      .where("id", "=", id)
      .executeTakeFirst()
      .catch((err) => {
        logger.error("AudioFileRepository.deleteFile", err);
        throw err;
      });

    return result.numDeletedRows > 0;
  }
}
