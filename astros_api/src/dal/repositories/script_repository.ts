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
  supportsRandomSpan,
  ModuleClassType,
  MaestroEvent,
  RandomMaestroEvent,
  MaestroChannel,
  isLocationName,
  ScriptValidationError,
} from 'src/models/index.js';
import { logger } from 'src/logger.js';
import { Guid } from 'guid-typescript';
import { Database } from 'src/dal/types.js';
import { Kysely, NoResultError, Transaction } from 'kysely';
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
    // Before calculateLengthDS, so a bad endTime is refused for what it is
    // rather than surfacing as the duration_ds NOT NULL constraint.
    const storedChannels = await this.loadSpanChannels(script);
    validateScriptSpans(
      script,
      new Map([...storedChannels].map(([id, channel]) => [id, channel.moduleSubType])),
    );

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
        await this.saveScriptChannel(tx, script, ch, storedChannels.get(ch.id));
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
        // Key by the location name ('body'|'core'|'dome'), not the location_id
        // UUID: the WS update path and every frontend consumer look up
        // deploymentStatus by that name. The guard narrows location_name to a
        // LocationName and skips orphaned rows (no/unknown location) —
        // unreachable while the FK cascade holds, so log rather than fail the list.
        if (!isLocationName(dep.location_name)) {
          logger.warn(
            `ScriptRepository.getScripts: skipping deployment for script ${scr.id} — ` +
              `location_id ${dep.location_id} has no recognized location name (orphaned FK?)`,
          );
          continue;
        }
        const status: DeploymentStatus = {
          date: new Date(dep.last_deployed),
          value: UploadStatus.uploaded,
        };
        scr.deploymentStatus[dep.location_name] = status;
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
      // Key by the location name ('body'|'core'|'dome'), not the location_id
      // UUID — see getScripts() above. Skip orphaned/unknown-location rows.
      if (!isLocationName(dep.location_name)) {
        logger.warn(
          `ScriptRepository.getScript: skipping deployment for script ${id} — ` +
            `location_id ${dep.location_id} has no recognized location name (orphaned FK?)`,
        );
        continue;
      }
      const status: DeploymentStatus = {
        date: new Date(dep.last_deployed),
        value: UploadStatus.uploaded,
      };
      result.deploymentStatus[dep.location_name] = status;
    }

    result.scriptChannels = await this.readScriptChannels(id);

    // Must run after readScriptChannels — calculateLengthDS reads the events.
    // Defensive: upsertScript always stores a valid value and migration_8
    // corrects older rows, so a replacement here means a row was written some
    // other way. getScriptDurationsDS returns the raw column, so log it.
    const storedDurationDS = result.durationDS;
    updateScriptDuration(result);
    if (result.durationDS !== storedDurationDS) {
      logger.warn(
        `ScriptRepository.getScript: script ${id} has invalid stored duration_ds ${storedDurationDS}; ` +
          `recomputed ${result.durationDS} (not written back)`,
      );
    }

    return result;
  }

  /**
   * Map of script id → recorded duration (deciseconds) for every script.
   * Returns the raw column: unlike getScript, an invalid stored value is not
   * recomputed. Used by the playlist converter to give a Script track its
   * runtime (up to its latest span end or point-event start; see calculateLengthDS) —
   * playlist track rows carry no usable duration for scripts (no editor
   * control), so the queue would otherwise treat scripts as instantaneous.
   * Intentionally unfiltered (no `enabled = 1`) so a still-referenced script's
   * duration resolves even if the script was soft-disabled.
   */
  async getScriptDurationsDS(): Promise<Map<string, number>> {
    const rows = await this.db
      .selectFrom('scripts')
      .select(['id', 'duration_ds'])
      .execute()
      .catch((err) => {
        logger.error('ScriptRepository.getScriptDurationsDS', err);
        throw err;
      });

    return new Map(rows.map((r) => [r.id, r.duration_ds]));
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

  // storedChannel: the channel as stored, loaded for validation when the
  // script channel holds a span; undefined otherwise.
  private async saveScriptChannel(
    tx: Transaction<Database>,
    script: Script,
    ch: ScriptChannel,
    storedChannel: BaseChannel | undefined,
  ) {
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
        const e = evt.event as MaestroEvent | RandomMaestroEvent;
        const c = ch.moduleChannel as MaestroChannel;
        e.channel = c.channelNumber;
        // A span's isServo is a copy of the channel's setting: refresh it from
        // the stored channel, since the request's is the client's word.
        // For a span on a MaestroChannel script channel, validation loaded a
        // MaestroChannel. A point MaestroEvent keeps its own.
        if (evt.endTime != null && storedChannel instanceof MaestroChannel) {
          e.isServo = storedChannel.isServo;
        }
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

      channel.events = await this.readScriptEvents(
        scriptId,
        ch.id,
        channel.moduleChannel.moduleSubType,
      );

      result.push(channel);
    }

    return result;
  }

  private async configScriptChannel(channel: ScriptChannel): Promise<ScriptChannel> {
    const moduleChannel = await this.readModuleChannel(
      channel.moduleChannelType,
      channel.moduleChannelId,
    );
    if (moduleChannel !== undefined) {
      channel.moduleChannel = moduleChannel;
    }

    return channel;
  }

  // undefined for an unknown channel type; a missing row throws NoResultError.
  private async readModuleChannel(
    moduleChannelType: string,
    moduleChannelId: string,
  ): Promise<BaseChannel | undefined> {
    switch (moduleChannelType) {
      case ModuleChannelTypes.GpioChannel:
        return readGpioChannel(this.db, moduleChannelId);
      case ModuleChannelTypes.MaestroChannel:
        return readMaestroChannel(this.db, moduleChannelId);
      case ModuleChannelTypes.KangarooX2Channel:
        return readKangarooChannel(this.db, moduleChannelId);
      case ModuleChannelTypes.UartChannel:
        return readUartChannel(this.db, moduleChannelId);
      case ModuleChannelTypes.I2cChannel:
        return readI2cChannel(this.db, moduleChannelId);
      default:
        return undefined;
    }
  }

  /**
   * The stored channel of each script channel that holds a span, keyed by
   * script channel id, for validateScriptSpans and the Maestro isServo
   * overwrite. Reads through this.db before upsertScript's transaction (inside
   * it, SQLite's one connection belongs to the transaction). A channel that is
   * not in the database, or whose moduleChannelType is unknown, is left out.
   */
  private async loadSpanChannels(script: Script): Promise<Map<string, BaseChannel>> {
    const result = new Map<string, BaseChannel>();

    for (const ch of script.scriptChannels) {
      if (!holdsSpan(ch)) continue;

      const moduleChannel = await this.readModuleChannel(
        ch.moduleChannelType,
        ch.moduleChannelId,
      ).catch((err: unknown) => {
        // Only a missing row means "not found"; any other failure stays a 500.
        if (err instanceof NoResultError) return undefined;
        throw err;
      });
      if (moduleChannel !== undefined) {
        result.set(ch.id, moduleChannel);
      }
    }

    return result;
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
        time: toStoredDs(evt.time), // stored as integer scaled storage to 0.1s
        // == null: a client that omits endTime saves a point event
        end_time: evt.endTime == null ? null : toStoredDs(evt.endTime),
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
    channelSubType: ModuleSubType,
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
      // A database still at migration 8 (BACKUP_FAILED, or a failed migration
      // restored) has no end_time column and yields undefined: a point event.
      const endTimeDs = evt.end_time ?? null;

      // Only a hand edit can store a span on a sub-type without a span payload,
      // or on one that is not its channel's (validateScriptSpans refuses both).
      // Leave it out so neither the editor nor the converter sees it; the
      // editor's next save removes the row. Parsing it first makes an unknown
      // sub-type or unreadable data fail the read, as for a point row, rather
      // than be dropped.
      if (endTimeDs !== null && !supportsRandomSpan(subtype)) {
        moduleSubTypeToScriptEventTypes(subtype, evt.data);
        logger.warn(
          `ScriptRepository.readScriptEvents: dropping random span ${evt.id} on channel ${evt.script_channel_id} in script ${scriptId} ` +
            `(time ${evt.time}, end_time ${endTimeDs}, data ${evt.data}): moduleSubType ${subtype} has no span payload; ` +
            'the row is deleted when this script is next saved',
        );
        continue;
      }
      if (endTimeDs !== null && subtype !== channelSubType) {
        moduleSubTypeToScriptEventTypes(subtype, evt.data, true);
        logger.warn(
          `ScriptRepository.readScriptEvents: dropping random span ${evt.id} on channel ${evt.script_channel_id} in script ${scriptId} ` +
            `(time ${evt.time}, end_time ${endTimeDs}, data ${evt.data}): moduleSubType ${subtype} does not match its channel's (${channelSubType}); ` +
            'the row is deleted when this script is next saved',
        );
        continue;
      }

      const scriptEventType = moduleSubTypeToScriptEventTypes(
        subtype,
        evt.data,
        endTimeDs !== null,
      );

      const event: ScriptEvent = {
        id: evt.id,
        scriptChannel: evt.script_channel_id,
        moduleType: evt.module_type,
        moduleSubType: subtype,
        time: evt.time / 10, // stored as integer scaled storage to 0.1s
        endTime: endTimeDs === null ? null : endTimeDs / 10,
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

// The scripter's timeline length (Vue TIMELINE_DURATION_SECONDS): a span must
// lie inside it.
const TIMELINE_DURATION_SECONDS = 600;

// Event times are stored in whole deciseconds. Validation uses the same
// rounding, so it judges exactly what will be stored.
function toStoredDs(seconds: number): number {
  return Math.round(seconds * 10);
}

function holdsSpan(ch: ScriptChannel): boolean {
  // for...in, like saveScriptChannel: a channel without events holds none.
  for (const key in ch.events) {
    if (ch.events[key].endTime != null) return true;
  }
  return false;
}

/**
 * Throws ScriptValidationError for the first span (endTime != null) that
 * breaks a rule, in the T-009 Contract's order. `channelSubTypes` maps a script
 * channel's id to its channel's sub-type as stored in the database; a missing
 * entry means the channel was not found. Point events are never checked.
 */
export function validateScriptSpans(
  script: Script,
  channelSubTypes: ReadonlyMap<string, ModuleSubType>,
): void {
  for (const ch of script.scriptChannels) {
    for (const key in ch.events) {
      const evt = ch.events[key];
      if (evt.endTime == null) continue;

      const problem = spanProblem(evt, ch, channelSubTypes.get(ch.id));
      if (problem !== undefined) {
        logger.error(
          `ScriptRepository.validateScriptSpans: refusing event ${evt.id} on channel ${ch.id} in script ${script.id}: ${problem}`,
        );
        throw new ScriptValidationError(problem);
      }
    }
  }
}

function spanProblem(
  evt: ScriptEvent,
  ch: ScriptChannel,
  channelSubType: ModuleSubType | undefined,
): string | undefined {
  const { moduleSubType, time, endTime } = evt;

  if (!supportsRandomSpan(moduleSubType)) {
    return `Random span not supported for moduleSubType: ${moduleSubType}`;
  }
  if (channelSubType === undefined) {
    return `Random span channel not found: ${ch.moduleChannelType} ${ch.moduleChannelId}`;
  }
  if (moduleSubType !== channelSubType) {
    return `Random span moduleSubType ${moduleSubType} does not match its channel's (${channelSubType})`;
  }
  // The body is untyped JSON, so endTime and time can be anything.
  if (typeof endTime !== 'number' || !Number.isFinite(endTime)) {
    return `Random span endTime must be a finite number, got ${JSON.stringify(endTime)}`;
  }
  // Rules 4 and 5 judge the times as stored, so a span can't be saved in a
  // form its next save refuses (0.05 → 0.14 s stores as 0.1 → 0.1).
  const storedTime = toStoredDs(time) / 10;
  const storedEnd = toStoredDs(endTime) / 10;
  // Negated so a NaN time fails.
  if (!(storedEnd > storedTime)) {
    return `Random span endTime must be after its time (${storedTime} s), got ${storedEnd} s`;
  }
  if (typeof time !== 'number' || !(storedTime >= 0) || storedEnd > TIMELINE_DURATION_SECONDS) {
    return `Random span must lie between 0 and ${TIMELINE_DURATION_SECONDS} s, got ${storedTime} to ${storedEnd} s`;
  }
  return undefined;
}
