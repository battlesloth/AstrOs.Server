import { Kysely } from 'kysely';
import { Database } from '../../types.js';
import { logger } from '../../../logger.js';
import {
    GpioModule,
    GpioChannel
} from 'astros-common';

export async function getGpioModule(
    db: Kysely<Database>,
    locationId: string):
    Promise<GpioModule> {

    const module = new GpioModule(locationId);

    const gpioData = await db
        .selectFrom("gpio_channels")
        .selectAll()
        .where("location_id", "=", locationId)
        .orderBy("channel_number")
        .execute()
        .catch((err) => {
            logger.error(err);
            throw err;
        });

    gpioData.map((m: any) => {
        module.channels[m.channel_number] =
            new GpioChannel(
                m.id,
                m.location_id,
                m.channel_number,
                m.enabled > 0,
                m.name,
                m.default_low > 0,
            );
    });

    return module;
}

export async function upsertGpioModule(
    db: Kysely<Database>,
    module: GpioModule) {

    for (const gpio of module.channels) {
        await db
            .insertInto("gpio_channels")
            .values({
                id: gpio.id,
                location_id: module.locationId,
                channel_number: gpio.channelNumber,
                name: gpio.channelName,
                default_low: gpio.defaultLow ? 1 : 0,
                enabled: gpio.enabled ? 1 : 0,
            })
            .onConflict((c) =>
                c.column("id").doUpdateSet((eb) => ({
                    location_id: eb.ref("excluded.location_id"),
                    channel_number: eb.ref("excluded.channel_number"),
                    name: eb.ref("excluded.name"),
                    default_low: eb.ref("excluded.default_low"),
                    enabled: eb.ref("excluded.enabled"),
                })),
            )
            .executeTakeFirstOrThrow()
            .catch((err) => {
                logger.error(err);
                throw err;
            });
    }
}