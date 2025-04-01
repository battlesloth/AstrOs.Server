import {
  Script,
  ScriptChannel,
  ScriptEvent,
  UploadStatus,
  DeploymentStatus,
  BaseChannel,
  ModuleChannelTypes,
  ModuleType,
  ModuleSubType,
  moduleSubTypeToScriptEventTypes,
  ModuleClassType,
} from "astros-common";
import { logger } from "../../logger.js";
import { Guid } from "guid-typescript";
import { Database, ScriptsTable } from "../types.js";
import { Kysely, Transaction } from "kysely";
import {
  getGpioModule,
  readGpioChannel,
} from "./module_repositories/gpio_repository.js";
import {
  getUartModules,
  readKangarooChannel,
  readMaestroChannel,
  readUartChannel,
} from "./module_repositories/uart_repository.js";
import {
  getI2cModules,
  readI2cChannel,
} from "./module_repositories/i2c_repository.js";

export class ScriptRepository {
  private characters =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

  constructor(private readonly db: Kysely<Database>) {}

  //#region Script Create

  async upsertScript(script: Script): Promise<boolean> {
    await this.db.transaction().execute(async (tx) => {
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

      await this.deleteScriptEvents(tx, script.id);

      await this.deleteScriptChannels(tx, script.id);

      for (const ch of script.scriptChannels) {
        await this.saveScriptChannel(tx, script, ch);
      }
    });

    return true;
  }

  //#endregion
  //#region Script Copy

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

    await this.upsertScript(script).catch((err: any) => {
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

  //#endregion
  //#region Script Read

  async getScripts(): Promise<Array<Script>> {
    const scripts = await this.db
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
      const deployments = await this.db
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
    const script = await this.db
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

    const deployments = await this.db
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

    result.scriptChannels = await this.readScriptChannels(id);

    return result;
  }

  //#endregion
  //#region Script Delete

  async deleteScript(id: string): Promise<boolean> {
    this.db
      .updateTable("scripts")
      .set("enabled", 0)
      .where("id", "=", id)
      .executeTakeFirstOrThrow()
      .catch((err) => {
        logger.error(err);
        throw err;
      });

    return true;
  }

  //#endregion

  //#region Channels Create

  private async saveScriptChannel(
    tx: Transaction<Database>,
    script: Script,
    ch: ScriptChannel,
  ) {
    await tx
      .insertInto("script_channels")
      .values({
        id: ch.id,
        script_id: script.id,
        channel_type: ch.channelType,
        parent_module_id: ch.parentModuleId,
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
      await this.saveScriptEvent(tx, script.id, ch.id, evt);
    }
  }

  //#endregion

  //#region Channels Read

  private async readScriptChannels(
    scriptId: string,
  ): Promise<Array<ScriptChannel>> {
    const result = new Array<ScriptChannel>();

    const channels = await this.db
      .selectFrom("script_channels")
      .selectAll()
      .where("script_id", "=", scriptId)
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
        ch.parent_module_id,
        ch.module_channel_id,
        ch.module_channel_type,
        new BaseChannel("", "", "", ModuleType.none, ModuleSubType.none, false),
        0,
      );

      await this.configScriptChannel(channel);

      channel.eventsKvpArray = await this.readScriptEvents(scriptId, ch.id);

      result.push(channel);
    }

    return result;
  }

  private async configScriptChannel(
    channel: ScriptChannel,
  ): Promise<ScriptChannel> {
    switch (channel.moduleChannelType) {
      case ModuleChannelTypes.GpioChannel:
        channel.moduleChannel = await readGpioChannel(
          this.db,
          channel.moduleChannelId,
        );
        break;
      case ModuleChannelTypes.MaestroChannel:
        channel.moduleChannel = await readMaestroChannel(
          this.db,
          channel.moduleChannelId,
        );
        break;
      case ModuleChannelTypes.KangarooX2Channel:
        channel.moduleChannel = await readKangarooChannel(
          this.db,
          channel.moduleChannelId,
        );
        break;
      case ModuleChannelTypes.UartChannel:
        channel.moduleChannel = await readUartChannel(
          this.db,
          channel.moduleChannelId,
        );
        break;
      case ModuleChannelTypes.I2cChannel:
        channel.moduleChannel = await readI2cChannel(
          this.db,
          channel.moduleChannelId,
        );
        break;
    }

    return channel;
  }

  //#endregion

  //#region Channels Delete

  private async deleteScriptChannels(
    trx: Transaction<Database>,
    scriptId: string,
  ) {
    await trx
      .deleteFrom("script_channels")
      .where("script_id", "=", scriptId)
      .execute()
      .catch((err) => {
        logger.error(err);
        throw err;
      });
  }

  //#endregion

  //#region Events Create

  private async saveScriptEvent(
    tx: Transaction<Database>,
    scriptId: string,
    channelId: string,
    evt: ScriptEvent,
  ) {
    await tx
      .insertInto("script_events")
      .values({
        script_id: scriptId,
        script_channel_id: channelId,
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

  //#endregion

  //#region Events Read

  private async readScriptEvents(
    scriptId: string,
    channelId: string,
  ): Promise<Array<{ key: number; value: ScriptEvent }>> {
    const result = new Array<{ key: number; value: ScriptEvent }>();

    const events = await this.db
      .selectFrom("script_events")
      .selectAll()
      .where("script_id", "=", scriptId)
      .where("script_channel_id", "=", channelId)
      .execute()
      .catch((err) => {
        logger.error(err);
        throw err;
      });

    for (const evt of events) {
      const subtype =
        evt.module_sub_type !== null ? evt.module_sub_type : ModuleSubType.none;

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

      result.push({ key: event.time, value: event });
    }

    return result;
  }

  //#endregion

  //#region Events Delete

  private async deleteScriptEvents(
    trx: Transaction<Database>,
    scriptId: string,
  ) {
    await trx
      .deleteFrom("script_events")
      .where("script_id", "=", scriptId)
      .execute()
      .catch((err) => {
        logger.error(err);
        throw err;
      });
  }

  //#endregion

  //#region Script Uploads
  async updateScriptControllerUploaded(
    scriptId: string,
    locationId: string,
    dateTime: Date,
  ): Promise<boolean> {
    await this.db
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

    const deployment = await this.db
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

  //#endregion

  //#region Utility

  public async getModules(): Promise<Map<string, ModuleClassType>> {
    const result = new Map<string, ModuleClassType>();

    const locations = await this.db
      .selectFrom("locations")
      .selectAll()
      .execute()
      .catch((err) => {
        logger.error(err);
        throw err;
      });

    for (const loc of locations) {
      const gpioModules = await getGpioModule(this.db, loc.id);
      result.set(loc.id, gpioModules);

      const uartModules = await getUartModules(this.db, loc.id);
      for (const uart of uartModules) {
        result.set(uart.id, uart);
      }

      const i2cModules = await getI2cModules(this.db, loc.id);
      for (const i2c of i2cModules) {
        result.set(i2c.id, i2c);
      }
    }

    return result;
  }

  public async getLocationIds(): Promise<Array<string>> {
    const locations = await this.db
      .selectFrom("locations")
      .select("id")
      .execute()
      .catch((err) => {
        logger.error(err);
        throw err;
      });

    return locations.map((loc) => loc.id);
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
