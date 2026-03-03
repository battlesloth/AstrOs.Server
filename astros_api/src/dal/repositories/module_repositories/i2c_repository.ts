import { Kysely, Transaction } from 'kysely';
import { Database, I2CModule as I2CModuleRow } from '../../types.js';
import { logger } from '../../../logger.js';
import { I2cModule } from 'astros-common';
import { I2cChannel } from 'astros-common';

//#region I2C Modules

export async function upsertI2cModules(trx: Transaction<Database>, modules: I2cModule[]) {
  for (const i2c of modules) {
    logger.info(`Updating i2c module ${i2c.name}, id: ${i2c.id}, type: ${i2c.moduleSubType}`);

    switch (i2c.moduleSubType) {
      default:
        break;
    }

    await trx
      .insertInto('i2c_modules')
      .values({
        id: i2c.id,
        name: i2c.name,
        location_id: i2c.locationId,
        i2c_address: i2c.i2cAddress,
        i2c_type: i2c.moduleSubType,
      })
      .onConflict((c) =>
        c.column('id').doUpdateSet((eb) => ({
          name: eb.ref('excluded.name'),
          location_id: eb.ref('excluded.location_id'),
          i2c_address: eb.ref('excluded.i2c_address'),
          i2c_type: eb.ref('excluded.i2c_type'),
        })),
      )
      .executeTakeFirstOrThrow()
      .catch((err) => {
        logger.error('I2cRepository.upsertI2cModules', err);
        throw err;
      });
  }
}

export async function getI2cModules(
  db: Kysely<Database>,
  locationId: string,
): Promise<I2cModule[]> {
  const modules = new Array<I2cModule>();

  const i2cData = await db
    .selectFrom('i2c_modules')
    .selectAll()
    .where('location_id', '=', locationId)
    .orderBy('i2c_address')
    .execute()
    .catch((err) => {
      logger.error('I2cRepository.getI2cModules', err);
      throw err;
    });

  i2cData.map((m: I2CModuleRow) => {
    modules.push(new I2cModule(m.idx, m.id, m.name, m.location_id, m.i2c_address, m.i2c_type));
  });

  return modules;
}

export async function removeStaleI2CModules(
  trx: Transaction<Database>,
  locationId: string,
  currentMods: Array<string>,
) {
  const i2cMods = await trx
    .selectFrom('i2c_modules')
    .selectAll()
    .where('location_id', '=', locationId)
    .execute()
    .catch((err) => {
      logger.error('I2cRepository.removeStaleI2CModules', err);
      throw err;
    });

  for (const i2cMod of i2cMods) {
    if (currentMods.includes(i2cMod.id)) {
      continue;
    }

    logger.info(
      `Removing stale i2c module ${i2cMod.name}, id: ${i2cMod.id}, type: ${i2cMod.i2c_type}`,
    );

    switch (i2cMod.i2c_type) {
      default:
        break;
    }

    await trx
      .deleteFrom('i2c_modules')
      .where('id', '=', i2cMod.id)
      .execute()
      .catch((err) => {
        logger.error('I2cRepository.removeStaleI2CModules', err);
        throw err;
      });
  }
}

export async function readI2cChannel(db: Kysely<Database>, id: string): Promise<I2cChannel> {
  const channel = await db
    .selectFrom('i2c_modules')
    .selectAll()
    .where('id', '=', id)
    .executeTakeFirstOrThrow()
    .catch((err) => {
      logger.error('I2cRepository.readI2cChannel', err);
      throw err;
    });

  return new I2cChannel(channel.id, channel.id, channel.name, true);
}

//#endregion
