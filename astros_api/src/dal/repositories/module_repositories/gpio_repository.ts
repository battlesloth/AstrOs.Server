import { Kysely } from "kysely";
import { Database } from "../../types.js";
import { logger } from "../../../logger.js";
import { GpioModule, GpioChannel } from "astros-common";

export async function getGpioModule(
  db: Kysely<Database>,
  locationId: string,
): Promise<GpioModule> {
  const module = new GpioModule(locationId);

  const gpioData = await db
    .selectFrom("gpio_channels")
    .selectAll()
    .where("location_id", "=", locationId)
    .orderBy("channel_number")
    .execute()
    .catch((err) => {
      logger.error("GpioRepository.getGpioModule", err);
      throw err;
    });

  gpioData.map((m: any) => {
    module.channels[m.channel_number] = new GpioChannel(
      m.id,
      m.location_id,
      m.channel_number,
      m.enabled > 0,
      m.name,
      m.default_high > 0,
    );
  });

  return module;
}

export async function upsertGpioModule(
  db: Kysely<Database>,
  module: GpioModule,
) {
  for (const gpio of module.channels) {
    await db
      .insertInto("gpio_channels")
      .values({
        id: gpio.id,
        location_id: module.locationId,
        channel_number: gpio.channelNumber,
        name: gpio.channelName,
        default_high: gpio.defaultHigh ? 1 : 0,
        enabled: gpio.enabled ? 1 : 0,
      })
      .onConflict((c) =>
        c.column("id").doUpdateSet((eb) => ({
          location_id: eb.ref("excluded.location_id"),
          channel_number: eb.ref("excluded.channel_number"),
          name: eb.ref("excluded.name"),
          default_high: eb.ref("excluded.default_high"),
          enabled: eb.ref("excluded.enabled"),
        })),
      )
      .executeTakeFirstOrThrow()
      .catch((err) => {
        logger.error("GpioRepository.upsertGpioModule", err);
        throw err;
      });
  }
}

export async function readGpioChannel(
  db: Kysely<Database>,
  id: string,
): Promise<GpioChannel> {
  const ch = await db
    .selectFrom("gpio_channels")
    .selectAll()
    .where("id", "=", id)
    .executeTakeFirstOrThrow()
    .catch((err) => {
      logger.error("GpioRepository.readGpioChannel", err);
      throw err;
    });

  return new GpioChannel(
    ch.id,
    ch.location_id,
    ch.channel_number,
    ch.enabled > 0,
    ch.name,
    ch.default_high > 0,
  );
}
