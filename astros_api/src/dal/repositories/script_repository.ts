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
  MaestroEvent,
  MaestroChannel,
} from 'src/models/index.js';
import { logger } from 'src/logger.js';
import { Guid } from 'guid-typescript';
import { Database } from 'src/dal/types.js';
import { Kysely, Transaction } from 'kysely';
import {
  getAllActiveGpioChannels,
  getGpioModule,
  readGpioChannel,
} from './module_repositories/gpio_repository.js';
import {
  getUartModules,
  readKangarooChannel,
  readMaestroChannel,
  readUartChannel,
} from './module_repositories/uart_repository.js';
import { getI2cModules, readI2cChannel } from './module_repositories/i2c_repository.js';
import { generateShortId } from 'src/utility/short_id.js';
import { calculateLengthDS, updateScriptDuration } from 'src/scripting/script_duration.js';

export class ScriptRepository {
  constructor(private readonly db: Kysely<Database>) {}

  //#region Script Create

  async upsertScript(script: Script): Promise<boolean> {
    // always calculate duration on save to ensure it is up
    // to date with any changes to events or channels
    script.durationDS = calculateLengthDS(script);

    await this.db.transaction().execute(async (tx) => {
      await tx
        .insertInto('scripts')
        .values({
          id: script.id,
          name: script.scriptName,
          description: script.description,
          last_modified: new Date(script.lastSaved).getTime(),
          enabled: 1,
          duration_ds: script.durationDS,
        })
        .onConflict((c) =>
          c.columns(['id']).doUpdateSet((eb) => ({
            name: eb.ref('excluded.name'),
            description: eb.ref('excluded.description'),
            last_modified: Date.now(),
            enabled: 1,
            duration_ds: eb.ref('excluded.duration_ds'),
          })),
        )
        .execute()
        .catch((err) => {
          logger.error('ScriptRepository.upsertScript', err);
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
    const script = await this.getScript(id);

    script.id = generateShortId('s');
    script.scriptName = script.scriptName + ' (Copy)';
    for (const ch of script.scriptChannels) {
      ch.id = Guid.create().toString();

      const events = [...Object.values(ch.events)];

      ch.events = {};
      for (const evt of events) {
        evt.id = Guid.create().toString();
        evt.scriptChannel = ch.id;
        ch.events[evt.id] = evt;
      }
    }

    script.deploymentStatus = {};
    script.lastSaved = new Date();

    updateScriptDuration(script);

    await this.upsertScript(script).catch((err: any) => {
      logger.error(`Exception saving copy script for ${id} => ${err}`);
      throw err;
    });

    const result: Script = {
      id: script.id,
      scriptName: script.scriptName,
      description: script.description,
      lastSaved: new Date(script.lastSaved),
      durationDS: script.durationDS,
      playlistCount: 0,
      deploymentStatus: {},
      scriptChannels: [],
    };

    return result;
  }

  //#endregion
  //#region Script Read

  async getScripts(): Promise<Array<Script>> {
    const scripts = await this.db
      .with('playlist_counts', (qb) =>
        qb
          .selectFrom('playlist_tracks')
          .innerJoin('playlists', 'playlists.id', 'playlist_tracks.playlist_id')
          .select([
            'playlist_tracks.track_id',
            (eb) => eb.fn.count<number>('playlists.id').distinct().as('playlist_count'),
          ])
          .where('playlist_tracks.track_type', '=', 'Script')
          .where('playlists.enabled', '=', 1)
          .groupBy('playlist_tracks.track_id'),
      )
      .selectFrom('scripts')
      .leftJoin('playlist_counts', 'playlist_counts.track_id', 'scripts.id')
      .selectAll('scripts')
      .select('playlist_counts.playlist_count')
      .where('scripts.enabled', '=', 1)
      .execute()
      .catch((err) => {
        logger.error('ScriptRepository.getScripts', err);
        throw err;
      });

    if (scripts === undefined) {
      throw 'error';
    }

    const result = scripts.map((scr) => {
      return {
        id: scr.id,
        scriptName: scr.name,
        description: scr.description,
        lastSaved: new Date(scr.last_modified),
        durationDS: scr.duration_ds,
        playlistCount: scr.playlist_count ?? 0,
        deploymentStatus: {},
        scriptChannels: [],
      } as Script;
    });

    for (const scr of result) {
      const deployments = await this.db
        .selectFrom('script_deployments')
        .selectAll()
        .leftJoin('locations', 'locations.id', 'script_deployments.location_id')
        .select(['locations.name as location_name'])
        .where('script_id', '=', scr.id)
        .execute()
        .catch((err) => {
          logger.error('ScriptRepository.getScripts.deployments', err);
          throw err;
        });

      for (const dep of deployments) {
        const status: DeploymentStatus = {
          date: new Date(dep.last_deployed),
          value: UploadStatus.uploaded,
          locationName: dep.location_name || '',
        };
        scr.deploymentStatus[dep.location_id] = status;
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
      .selectFrom('scripts')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirstOrThrow()
      .catch((err) => {
        logger.error('ScriptRepository.getScript', err);
        throw err;
      });

    const result: Script = {
      id: script.id,
      scriptName: script.name,
      description: script.description,
      lastSaved: new Date(script.last_modified),
      durationDS: script.duration_ds,
      playlistCount: 0,
      deploymentStatus: {},
      scriptChannels: [],
    };

    updateScriptDuration(result);

    const deployments = await this.db
      .selectFrom('script_deployments')
      .selectAll()
      .leftJoin('locations', 'locations.id', 'script_deployments.location_id')
      .select(['locations.name as location_name'])
      .where('script_id', '=', id)
      .execute()
      .catch((err) => {
        logger.error('ScriptRepository.getScript.deployments', err);
        throw err;
      });

    for (const dep of deployments) {
      const status: DeploymentStatus = {
        date: new Date(dep.last_deployed),
        value: UploadStatus.uploaded,
        locationName: dep.location_name || '',
      };
      result.deploymentStatus[dep.location_id] = status;
    }

    result.scriptChannels = await this.readScriptChannels(id);

    return result;
  }

  //#endregion
  //#region Script Delete

  async deleteScript(id: string): Promise<boolean> {
    await this.db.transaction().execute(async (tx) => {
      await tx
        .updateTable('scripts')
        .set('enabled', 0)
        .where('id', '=', id)
        .executeTakeFirstOrThrow()
        .catch((err) => {
          logger.error('ScriptRepository.deleteScript', err);
          throw err;
        });

      await tx
        .deleteFrom('playlist_tracks')
        .where('track_type', '=', 'Script')
        .where('track_id', '=', id)
        .execute()
        .catch((err) => {
          logger.error('ScriptRepository.deleteScript.playlistTracks', err);
          throw err;
        });
    });

    return true;
  }

  //#endregion

  //#region Channels Create

  private async saveScriptChannel(tx: Transaction<Database>, script: Script, ch: ScriptChannel) {
    await tx
      .insertInto('script_channels')
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
        logger.error('ScriptRepository.saveScriptChannel', err);
        throw err;
      });

    for (const key in ch.events) {
      const evt = ch.events[key] as ScriptEvent;

      // set the channel number for Maestro events
      // we do this here because the channel can be changed in the UI
      // and it's simpler to do it here than in the UI
      if (ch.moduleChannelType === ModuleChannelTypes.MaestroChannel) {
        const e = evt.event as MaestroEvent;
        const c = ch.moduleChannel as MaestroChannel;
        e.channel = c.channelNumber;
        evt.event = e;
      }

      await this.saveScriptEvent(tx, script.id, ch.id, evt);
    }
  }

  //#endregion

  //#region Channels Read

  private async readScriptChannels(scriptId: string): Promise<Array<ScriptChannel>> {
    const result = new Array<ScriptChannel>();

    const channels = await this.db
      .selectFrom('script_channels')
      .selectAll()
      .where('script_id', '=', scriptId)
      .execute()
      .catch((err) => {
        logger.error('ScriptRepository.readScriptChannels', err);
        throw err;
      });

    for (const ch of channels) {
      const channel: ScriptChannel = {
        id: ch.id,
        scriptId: ch.script_id,
        channelType: ch.channel_type,
        parentModuleId: ch.parent_module_id,
        moduleChannelId: ch.module_channel_id,
        moduleChannelType: ch.module_channel_type,
        moduleChannel: new BaseChannel('', '', '', ModuleType.none, ModuleSubType.none, false),
        maxDuration: 0,
        events: {},
      };

      await this.configScriptChannel(channel);

      channel.events = await this.readScriptEvents(scriptId, ch.id);

      result.push(channel);
    }

    return result;
  }

  private async configScriptChannel(channel: ScriptChannel): Promise<ScriptChannel> {
    switch (channel.moduleChannelType) {
      case ModuleChannelTypes.GpioChannel:
        channel.moduleChannel = await readGpioChannel(this.db, channel.moduleChannelId);
        break;
      case ModuleChannelTypes.MaestroChannel:
        channel.moduleChannel = await readMaestroChannel(this.db, channel.moduleChannelId);
        break;
      case ModuleChannelTypes.KangarooX2Channel:
        channel.moduleChannel = await readKangarooChannel(this.db, channel.moduleChannelId);
        break;
      case ModuleChannelTypes.UartChannel:
        channel.moduleChannel = await readUartChannel(this.db, channel.moduleChannelId);
        break;
      case ModuleChannelTypes.I2cChannel:
        channel.moduleChannel = await readI2cChannel(this.db, channel.moduleChannelId);
        break;
    }

    return channel;
  }

  async getGpioChannelMap(): Promise<Map<string, number>> {
    const result = new Map<string, number>();

    const gpioChannels = await getAllActiveGpioChannels(this.db);

    for (const gpio of gpioChannels) {
      result.set(gpio.id, gpio.channelNumber);
    }

    return result;
  }
  //#endregion

  //#region Channels Delete

  private async deleteScriptChannels(trx: Transaction<Database>, scriptId: string) {
    await trx
      .deleteFrom('script_channels')
      .where('script_id', '=', scriptId)
      .execute()
      .catch((err) => {
        logger.error('ScriptRepository.deleteScriptChannels', err);
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
      .insertInto('script_events')
      .values({
        id: evt.id,
        script_id: scriptId,
        script_channel_id: channelId,
        module_type: evt.moduleType,
        module_sub_type: evt.moduleSubType,
        time: Math.round(evt.time * 10), // stored as integer scaled storage to 0.1s
        data: JSON.stringify(evt.event),
      })
      .execute()
      .catch((err) => {
        logger.error('ScriptRepository.saveScriptEvent', err);
        throw err;
      });
  }

  //#endregion

  //#region Events Read

  private async readScriptEvents(
    scriptId: string,
    channelId: string,
  ): Promise<Record<string, ScriptEvent>> {
    const result = {} as Record<string, ScriptEvent>;

    const events = await this.db
      .selectFrom('script_events')
      .selectAll()
      .where('script_id', '=', scriptId)
      .where('script_channel_id', '=', channelId)
      .execute()
      .catch((err) => {
        logger.error('ScriptRepository.readScriptEvents', err);
        throw err;
      });

    for (const evt of events) {
      const subtype = evt.module_sub_type !== null ? evt.module_sub_type : ModuleSubType.none;

      const scriptEventType = moduleSubTypeToScriptEventTypes(subtype, evt.data);

      const event: ScriptEvent = {
        id: evt.id,
        scriptChannel: evt.script_channel_id,
        moduleType: evt.module_type,
        moduleSubType: subtype,
        time: evt.time / 10, // stored as integer scaled storage to 0.1s
        event: scriptEventType,
      };

      result[event.id] = event;
    }

    return result;
  }

  //#endregion

  //#region Events Delete

  private async deleteScriptEvents(trx: Transaction<Database>, scriptId: string) {
    await trx
      .deleteFrom('script_events')
      .where('script_id', '=', scriptId)
      .execute()
      .catch((err) => {
        logger.error('ScriptRepository.deleteScriptEvents', err);
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
      .insertInto('script_deployments')
      .values({
        script_id: scriptId,
        location_id: locationId,
        last_deployed: new Date(dateTime).getTime(),
      })
      .onConflict((c) =>
        c.columns(['script_id', 'location_id']).doUpdateSet((_) => ({
          last_deployed: new Date(dateTime).getTime(),
        })),
      )
      .executeTakeFirstOrThrow()
      .catch((err) => {
        logger.error('ScriptRepository.updateScriptControllerUploaded', err);
        throw err;
      });

    return true;
  }

  async getLastScriptUploadedDate(scriptId: string, locationId: string): Promise<Date> {
    let result = new Date('1970-01-01T00:00:00.000Z');

    const deployment = await this.db
      .selectFrom('script_deployments')
      .select('last_deployed')
      .where('script_id', '=', scriptId)
      .where('location_id', '=', locationId)
      .executeTakeFirst()
      .catch((err) => {
        logger.error('ScriptRepository.getLastScriptUploadedDate', err);
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
      .selectFrom('locations')
      .selectAll()
      .execute()
      .catch((err) => {
        logger.error('ScriptRepository.getModules.locations', err);
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
      .selectFrom('locations')
      .select('id')
      .execute()
      .catch((err) => {
        logger.error('ScriptRepository.getLocationIds', err);
        throw err;
      });

    return locations.map((loc) => loc.id);
  }

  //#endregion
}
