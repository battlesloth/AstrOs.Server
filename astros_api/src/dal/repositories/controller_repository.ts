import { inserted } from 'src/dal/database.js';
import type { ControlModule } from 'src/models/index.js';
import { logger } from 'src/logger.js';
import { v4 as uuid } from 'uuid';
import { Kysely } from 'kysely';
import { Database } from 'src/dal/types.js';

export class ControllerRepository {
  constructor(private readonly db: Kysely<Database>) {}

  public async insertControllers(controllers: ControlModule[]): Promise<boolean> {
    const wasInserted: boolean[] = [];

    for (let i = 0; i < controllers.length; i++) {
      const controller = controllers[i];

      // Remove any stale row whose address or name matches but not both,
      // then upsert cleanly.
      const existing = await this.db
        .selectFrom('controllers')
        .selectAll()
        .where((eb) =>
          eb.or([eb('address', '=', controller.address), eb('name', '=', controller.name)]),
        )
        .execute()
        .catch((err) => {
          logger.error('ControllerRepository.insertControllers', err);
          throw err;
        });

      if (existing.length > 0) {
        // Delete all rows matching either address or name
        await this.db
          .deleteFrom('controllers')
          .where((eb) =>
            eb.or([eb('address', '=', controller.address), eb('name', '=', controller.name)]),
          )
          .execute()
          .catch((err) => {
            logger.error('ControllerRepository.insertControllers', err);
            throw err;
          });
      }

      // Insert with the id from an existing match (if any) to preserve references
      const existingId = existing.find(
        (e) => e.address === controller.address || e.name === controller.name,
      )?.id;

      const result = await this.db
        .insertInto('controllers')
        .values({
          id: existingId ?? uuid(),
          name: controller.name,
          description: existing.length > 0 ? existing[0].description : '',
          address: controller.address,
        })
        .executeTakeFirst()
        .catch((err) => {
          logger.error('ControllerRepository.insertControllers', err);
          throw err;
        });

      if (inserted(result)) {
        wasInserted.push(true);
      }
    }

    return wasInserted.length === controllers.length;
  }

  public async insertController(controller: ControlModule): Promise<string> {
    const id = uuid();

    const result = await this.db
      .insertInto('controllers')
      .values({
        id: id,
        name: controller.name,
        description: '',
        address: controller.address,
      })
      .executeTakeFirst()
      .catch((err) => {
        logger.error('ControllerRepository.insertController', err);
        throw err;
      });

    return inserted(result) ? id : '';
  }

  public async updateController(controller: ControlModule): Promise<boolean> {
    const result = await this.db
      .updateTable('controllers')
      .set({
        name: controller.name,
        address: controller.address,
      })
      .where('id', '=', controller.id)
      .executeTakeFirst()
      .catch((err) => {
        logger.error('ControllerRepository.updateController', err);
        throw err;
      });

    return result.numUpdatedRows > 0;
  }

  public async getControllers(): Promise<Array<ControlModule>> {
    const result = new Array<ControlModule>();

    const data = await this.db
      .selectFrom('controllers')
      .selectAll()
      .execute()
      .catch((err) => {
        logger.error('ControllerRepository.getControllers', err);
        throw err;
      });

    for (const c of data) {
      result.push({ id: c.id, name: c.name, address: c.address });
    }

    return result;
  }

  public async getControllerById(id: string): Promise<ControlModule> {
    const data = await this.db
      .selectFrom('controllers')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirstOrThrow()
      .catch((err) => {
        logger.error('ControllerRepository.getControllerById', err);
        throw err;
      });

    return { id: data.id, name: data.name, address: data.address };
  }

  public async getControllerByAddress(address: string): Promise<ControlModule> {
    const data = await this.db
      .selectFrom('controllers')
      .selectAll()
      .where('address', '=', address)
      .executeTakeFirstOrThrow()
      .catch((err) => {
        logger.error('ControllerRepository.getControllerByAddress', err);
        throw err;
      });

    return { id: data.id, name: data.name, address: data.address };
  }

  public async getControllerByLocationId(locationId: string): Promise<ControlModule> {
    const data = await this.db
      .selectFrom('controllers')
      .leftJoin('controller_locations as cl', 'cl.controller_id', 'controllers.id')
      .selectAll()
      .where('cl.location_id', '=', locationId)
      .executeTakeFirstOrThrow()
      .catch((err) => {
        logger.error('ControllerRepository.getControllerByLocationId', err);
        throw err;
      });

    return { id: data.id, name: data.name, address: data.address };
  }
}
