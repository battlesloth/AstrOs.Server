import { logger } from '../../logger.js';
import { Kysely } from 'kysely';
import { Database } from '../types.js';

export class RemoteConfigRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async getConfig(type: string) {
    const result = await this.db
      .selectFrom('remote_config')
      .selectAll()
      .where('type', '=', type)
      .executeTakeFirst()
      .catch((err) => {
        logger.error('RemoteConfigRepository.getConfig', err);
        throw err;
      });

    return result;
  }

  async saveConfig(type: string, json: string): Promise<boolean> {
    await this.db
      .insertInto('remote_config')
      .values({ type, value: json })
      .onConflict((c) =>
        c.column('type').doUpdateSet({
          value: json,
        }),
      )
      .execute()
      .catch((err) => {
        logger.error('RemoteConfigRepository.saveConfig', err);
        throw err;
      });

    return true;
  }
}
