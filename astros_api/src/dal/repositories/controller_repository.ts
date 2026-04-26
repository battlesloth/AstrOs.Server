import { inserted } from 'src/dal/database.js';
import type { ControlModule } from 'src/models/index.js';
import { logger } from 'src/logger.js';
import { v4 as uuid } from 'uuid';
import { Kysely } from 'kysely';
import { Database } from 'src/dal/types.js';

export class ControllerRepository {
  constructor(private readonly db: Kysely<Database>) {}

  public async insertControllers(controllers: ControlModule[]): Promise<boolean> {
    let allWritten = true;

    for (const controller of controllers) {
      try {
        const written = await this.db.transaction().execute(async (tx) => {
          // Find rows matching by address OR name. Deterministic order so the
          // "keeper" choice is stable.
          const existing = await tx
            .selectFrom('controllers')
            .selectAll()
            .where((eb) =>
              eb.or([eb('address', '=', controller.address), eb('name', '=', controller.name)]),
            )
            .orderBy('id')
            .execute();

          if (existing.length === 0) {
            const result = await tx
              .insertInto('controllers')
              .values({
                id: uuid(),
                name: controller.name,
                description: '',
                address: controller.address,
              })
              .executeTakeFirst();
            return inserted(result);
          }

          // Keep the first match (preserves its id and any controller_locations
          // rows pointing at it). Re-point dependent rows from duplicates to
          // the keeper, then delete duplicates BEFORE updating the keeper —
          // otherwise the keeper's UPDATE could collide with a duplicate's
          // UNIQUE-constrained name/address, and the duplicate's DELETE would
          // be rejected by migration_6's RESTRICT FK on
          // controller_locations.controller_id.
          const keeper = existing[0];
          const duplicateIds = existing.slice(1).map((row) => row.id);

          if (duplicateIds.length > 0) {
            await tx
              .updateTable('controller_locations')
              .set({ controller_id: keeper.id })
              .where('controller_id', 'in', duplicateIds)
              .execute();

            await tx.deleteFrom('controllers').where('id', 'in', duplicateIds).execute();
          }

          await tx
            .updateTable('controllers')
            .set({ name: controller.name, address: controller.address })
            .where('id', '=', keeper.id)
            .execute();
          // The keeper exists (we just selected it), the transaction committed
          // (otherwise we'd have thrown), so the controller is correctly
          // persisted. Avoid making success depend on SQLite's change-count
          // semantics — a no-op UPDATE (identical values) shouldn't be a failure.
          return true;
        });

        if (!written) allWritten = false;
      } catch (err) {
        logger.error('ControllerRepository.insertControllers', err);
        throw err;
      }
    }

    return allWritten;
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
