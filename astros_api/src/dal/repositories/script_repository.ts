import { db } from "../database.js";
import {
  Script,
  ScriptChannel,
  ScriptEvent,
  UploadStatus,
  DeploymentStatus,
  GpioChannel,
  MaestroChannel,
  KangarooX2Channel,
  BaseChannel,
  ModuleChannelTypes,
  I2cChannel,
  ModuleType,
  ModuleSubType,
  moduleSubTypeToScriptEventTypes,
  UartChannel,
} from "astros-common";
import { logger } from "../../logger.js";
import { Guid } from "guid-typescript";
import { ScriptsTable } from "../types.js";

export class ScriptRepository {
  private characters =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

  /// <summary>
  /// Get all scripts
  /// </summary>
  /// <returns>All scripts</returns>
  async getScripts(): Promise<Array<Script>> {
    const scripts = await db
      .selectFrom("scripts")
      .selectAll()
      .where("enabled", "=", 1)
      .execute()
      .catch((err) => {
        logger.error(err);
        throw err;
      });

    if (scripts === undefined) {
      throw "error";
    }

    const result = scripts.map((scr: ScriptsTable) => {
      return new Script(
        scr.id,
        scr.name,
        scr.description,
        new Date(scr.last_modified),
      );
    });

    for (const scr of result) {
      const deployments = await db
        .selectFrom("script_deployments")
        .selectAll()
        .where("script_id", "=", scr.id)
        .execute()
        .catch((err) => {
          logger.error(err);
          throw err;
        });

      for (const dep of deployments) {
        const status = new DeploymentStatus(dep.location_id, {
          date: new Date(dep.last_deployed),
          value: UploadStatus.uploaded,
        });
        scr.deploymentStatusKvp.push(status);
      }
    }

    return result;
  }

  /// <summary>
  /// Get a script by its id
  /// </summary>
  /// <param name="id">The id of the script to get</param>
  /// <returns>The script</returns>
  async getScript(id: string): Promise<Script> {
    const script = await db
      .selectFrom("scripts")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirstOrThrow()
      .catch((err) => {
        logger.error(err);
        throw err;
      });

    const result = new Script(
      script.id,
      script.name,
      script.description,
      new Date(script.last_modified),
    );

    const deployments = await db
      .selectFrom("script_deployments")
      .selectAll()
      .where("script_id", "=", id)
      .execute()
      .catch((err) => {
        logger.error(err);
        throw err;
      });

    for (const dep of deployments) {
      const status = new DeploymentStatus(dep.location_id, {
        date: new Date(dep.last_deployed),
        value: UploadStatus.uploaded,
      });

      result.deploymentStatusKvp.push(status);
    }

    const channels = await db
      .selectFrom("script_channels")
      .selectAll()
      .where("script_id", "=", id)
      .execute()
      .catch((err) => {
        logger.error(err);
        throw err;
      });

    for (const ch of channels) {
      const channel = new ScriptChannel(
        ch.id,
        ch.script_id,
        ch.channel_type,
        ch.module_channel_id,
        ch.module_channel_type,
        new BaseChannel("", "", "", ModuleType.none, ModuleSubType.none, false),
        0,
      );

      await this.configScriptChannel(channel);

      const events = await db
        .selectFrom("script_events")
        .selectAll()
        .where("script_id", "=", id)
        .where("script_channel_id", "=", ch.id)
        .execute()
        .catch((err) => {
          logger.error(err);
          throw err;
        });

      for (const evt of events) {
        const subtype =
          evt.module_sub_type !== null
            ? evt.module_sub_type
            : ModuleSubType.none;

        const scriptEventType = moduleSubTypeToScriptEventTypes(
          subtype,
          evt.data,
        );

        const event = new ScriptEvent(
          evt.script_channel_id,
          evt.module_type,
          subtype,
          evt.time,
          scriptEventType,
        );

        channel.eventsKvpArray.push({ key: event.time, value: event });
      }

      result.scriptChannels.push(channel);
    }

    return result;
  }

  private async configScriptChannel(
    channel: ScriptChannel,
  ): Promise<ScriptChannel> {
    switch (channel.moduleChannelType) {
      case ModuleChannelTypes.GpioChannel:
        channel.moduleChannel = await this.getGpioChannel(
          channel.moduleChannelId,
        );
        break;
      case ModuleChannelTypes.MaestroChannel:
        channel.moduleChannel = await this.getMaestroChannel(
          channel.moduleChannelId,
        );
        break;
      case ModuleChannelTypes.KangarooX2Channel:
        channel.moduleChannel = await this.getKangarooChannel(
          channel.moduleChannelId,
        );
        break;
      case ModuleChannelTypes.UartChannel:
        channel.moduleChannel = await this.getGenericSerialChannel(
          channel.moduleChannelId,
        );
        break;
      case ModuleChannelTypes.I2cChannel:
        channel.moduleChannel = await this.getGenericI2cChannel(
          channel.moduleChannelId,
        );
        break;
    }

    return channel;
  }

  //#region UART channels

  private async getMaestroChannel(channelId: string): Promise<MaestroChannel> {
    const channel = await db
      .selectFrom("maestro_channels")
      .selectAll()
      .where("id", "=", channelId)
      .executeTakeFirstOrThrow()
      .catch((err) => {
        logger.error(err);
        throw err;
      });

    return new MaestroChannel(
      channel.id,
      channel.board_id,
      channel.name,
      channel.enabled === 1,
      channel.channel_number,
      channel.is_servo === 1,
      channel.min_pos,
      channel.max_pos,
      channel.home_pos,
      channel.inverted === 1,
    );
  }

  private async getKangarooChannel(
    channelId: string,
  ): Promise<KangarooX2Channel> {
    const channel = await db
      .selectFrom("kangaroo_x2")
      .selectAll()
      .where("id", "=", channelId)
      .executeTakeFirstOrThrow()
      .catch((err) => {
        logger.error(err);
        throw err;
      });

    return new KangarooX2Channel(
      channel.id,
      channel.parent_id,
      "",
      channel.ch1_name,
      channel.ch2_name,
    );
  }

  private async getGenericSerialChannel(
    moduleId: string,
  ): Promise<UartChannel> {
    const channel = await db
      .selectFrom("uart_modules")
      .selectAll()
      .where("id", "=", moduleId)
      .executeTakeFirstOrThrow()
      .catch((err) => {
        logger.error(err);
        throw err;
      });

    return new UartChannel(
      channel.id,
      channel.id,
      channel.name,
      channel.uart_type,
      true,
    );
  }

  //#endregion

  //#region I2C channels

  private async getGenericI2cChannel(moduleId: string): Promise<I2cChannel> {
    const channel = await db
      .selectFrom("i2c_modules")
      .selectAll()
      .where("id", "=", moduleId)
      .executeTakeFirstOrThrow()
      .catch((err) => {
        logger.error(err);
        throw err;
      });

    return new I2cChannel(channel.id, channel.id, channel.name, true);
  }
  //  #endregion

  //#region GPIO channels
  private async getGpioChannel(channelId: string): Promise<GpioChannel> {
    const channel = await db
      .selectFrom("gpio_channels")
      .selectAll()
      .where("id", "=", channelId)
      .executeTakeFirstOrThrow()
      .catch((err) => {
        logger.error(err);
        throw err;
      });

    return new GpioChannel(
      channel.id,
      channel.location_id,
      channel.channel_number,
      channel.enabled === 1,
      channel.name,
      channel.default_low === 1,
    );
  }
  //#endregion

  //#region Utility
  async updateScriptControllerUploaded(
    scriptId: string,
    locationId: string,
    dateTime: Date,
  ): Promise<boolean> {
    await db
      .insertInto("script_deployments")
      .values({
        script_id: scriptId,
        location_id: locationId,
        last_deployed: new Date(dateTime).getTime(),
      })
      .onConflict((c) =>
        c.columns(["script_id", "location_id"]).doUpdateSet((_) => ({
          last_deployed: new Date(dateTime).getTime(),
        })),
      )
      .executeTakeFirstOrThrow()
      .catch((err) => {
        logger.error(err);
        throw err;
      });

    return true;
  }

  async getLastScriptUploadedDate(
    scriptId: string,
    locationId: string,
  ): Promise<Date> {
    let result = new Date("1970-01-01T00:00:00.000Z");

    const deployment = await db
      .selectFrom("script_deployments")
      .select("last_deployed")
      .where("script_id", "=", scriptId)
      .where("location_id", "=", locationId)
      .executeTakeFirst()
      .catch((err) => {
        logger.error(err);
        throw err;
      });

    if (deployment !== undefined) {
      result = new Date(deployment.last_deployed);
    }

    return result;
  }

  async saveScript(script: Script): Promise<boolean> {
    await db.transaction().execute(async (tx) => {
      await tx
        .insertInto("scripts")
        .values({
          id: script.id,
          name: script.scriptName,
          description: script.description,
          last_modified: new Date(script.lastSaved).getTime(),
          enabled: 1,
        })
        .onConflict((c) =>
          c.columns(["id"]).doUpdateSet((eb) => ({
            name: eb.ref("excluded.name"),
            description: eb.ref("excluded.description"),
            last_modified: Date.now(),
            enabled: 1,
          })),
        )
        .execute()
        .catch((err) => {
          logger.error(err);
          throw err;
        });

      await tx
        .deleteFrom("script_events")
        .where("script_id", "=", script.id)
        .execute()
        .catch((err) => {
          logger.error(err);
          throw err;
        });

      await tx
        .deleteFrom("script_channels")
        .where("script_id", "=", script.id)
        .execute()
        .catch((err) => {
          logger.error(err);
          throw err;
        });

      for (const ch of script.scriptChannels) {
        await tx
          .insertInto("script_channels")
          .values({
            id: ch.id,
            script_id: script.id,
            channel_type: ch.channelType,
            module_channel_id: ch.moduleChannelId,
            module_channel_type: ch.moduleChannelType,
          })
          .execute()
          .catch((err) => {
            logger.error(err);
            throw err;
          });

        for (const kvp of ch.eventsKvpArray) {
          const evt = kvp.value;

          await tx
            .insertInto("script_events")
            .values({
              script_id: script.id,
              script_channel_id: evt.scriptChannel,
              module_type: evt.moduleType,
              module_sub_type: evt.moduleSubType,
              time: evt.time,
              data: JSON.stringify(evt.event),
            })
            .execute()
            .catch((err) => {
              logger.error(err);
              throw err;
            });
        }
      }
    });

    return true;
  }

  async deleteScript(id: string): Promise<boolean> {
    db.updateTable("scripts")
      .set("enabled", 0)
      .where("id", "=", id)
      .executeTakeFirstOrThrow()
      .catch((err) => {
        logger.error(err);
        throw err;
      });

    return true;
  }

  async copyScript(id: string): Promise<Script> {
    let result = Script.prototype;

    const script = await this.getScript(id);

    script.id = this.generateScriptId(5);
    script.scriptName = script.scriptName + " - copy";
    for (const ch of script.scriptChannels) {
      ch.id = Guid.create().toString();
      for (const kvp of ch.eventsKvpArray) {
        kvp.value.scriptChannel = ch.id;
      }
    }
    script.deploymentStatusKvp = new Array<DeploymentStatus>();
    script.lastSaved = new Date();

    await this.saveScript(script).catch((err: any) => {
      logger.error(`Exception saving copy script for ${id} => ${err}`);
    });

    result = new Script(
      script.id,
      script.scriptName,
      script.description,
      new Date(script.lastSaved),
    );

    return result;
  }

  private generateScriptId(length: number): string {
    let result = `s${Math.floor(Date.now() / 1000)}`;
    const charactersLength = this.characters.length;
    for (let i = 0; i < length; i++) {
      result += this.characters.charAt(
        Math.floor(Math.random() * charactersLength),
      );
    }
    return result;
  }

  //#endregion
}
