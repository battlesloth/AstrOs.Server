import {
  MaestroEvent,
  I2cEvent,
  HumanCyborgRelationsEvent,
  HumanCyborgRelationsModule,
  KangarooAction,
  KangarooEvent,
  ScriptChannel,
  ScriptEvent,
  GenericSerialEvent,
  GpioEvent,
  ModuleType,
  ModuleSubType,
  ModuleClassType,
  UartModule,
  I2cModule,
  GpioChannel,
  GpioModule,
} from "astros-common";
import { v4 as uuid } from "uuid";
import { logger } from "./logger.js";
import { ScriptRepository } from "./dal/repositories/script_repository.js";

interface IUartValues {
  idx: number;
  ch: number;
  baud: number;
}

export interface ISingleCommand {
  controllerId: string;
  moduleId: string;
  moduleType: ModuleType;
  moduleSubType: ModuleSubType;
  channelId: string;
  event: unknown;
}

export enum CommandType {
  none,
  maestro,
  i2c,
  genericSerial,
  kangaroo,
  gpio,
}

export class ScriptConverter {
  readonly TAG = "ScriptConverter";

  locationIds: string[];
  scriptChannelModuleMap: Map<string, string>;
  scriptChannerlGpioChannelMap: Map<string, number>;
  modulesMap: Map<string, ModuleClassType>;

  constructor(private readonly scriptRepo: ScriptRepository) {
    this.locationIds = [];
    this.scriptChannelModuleMap = new Map<string, string>();
    this.scriptChannerlGpioChannelMap = new Map<string, number>();
    this.modulesMap = new Map<string, ModuleClassType>();
  }

  /**
   * Create a single command for testing
   * @param command
   * @returns
   */
  public async convertCommand(command: unknown): Promise<string> {
    let script = "";

    if (command === undefined || command === null) {
      return "";
    }

    this.modulesMap.clear();
    this.modulesMap = await this.scriptRepo.getModules();

    const cmd = command as ISingleCommand;

    switch (cmd.moduleSubType) {
      case ModuleSubType.genericSerial: {
        const mod = this.modulesMap.get(cmd.moduleId) as UartModule;
        script = this.genericSerialAsString(
          cmd.event as GenericSerialEvent,
          { idx: mod.idx, ch: mod.uartChannel, baud: mod.baudRate },
          0,
        );
        break;
      }
      case ModuleSubType.humanCyborgRelationsSerial: {
        const mod = this.modulesMap.get(cmd.moduleId) as UartModule;
        script = this.hcrAsString(
          cmd.event as HumanCyborgRelationsEvent,
          { idx: mod.idx, ch: mod.uartChannel, baud: mod.baudRate },
          0,
        );
        break;
      }
      case ModuleSubType.kangaroo: {
        const mod = this.modulesMap.get(cmd.moduleId) as UartModule;
        script = this.kangarooAsString(
          cmd.event as KangarooEvent,
          { idx: mod.idx, ch: mod.uartChannel, baud: mod.baudRate },
          0,
        );
        break;
      }
      case ModuleSubType.maestro: {
        const mod = this.modulesMap.get(cmd.moduleId) as UartModule;
        script = this.masetroAsToString(
          cmd.event as MaestroEvent,
          { idx: mod.idx, ch: mod.uartChannel, baud: mod.baudRate },
          0,
        );
        break;
      }
      case ModuleSubType.genericI2C: {
        const mod = this.modulesMap.get(cmd.moduleId) as I2cModule;
        script = this.i2cAsString(cmd.event as I2cEvent, mod.i2cAddress, 0);
        break;
      }
      case ModuleSubType.genericGpio: {
        const mod = this.modulesMap.get(cmd.moduleId) as GpioModule;

        const idx = mod.channels.findIndex(
          (ch: GpioChannel) => ch.id === cmd.channelId,
        );
        if (idx < 0) {
          logger.error(
            `No GPIO channel found for command channel id: ${cmd.channelId} in module: ${cmd.moduleId}`,
          );
          return "";
        }

        script = this.gpioEvtAsString(
          cmd.event as GpioEvent,
          mod.channels[idx].channelNumber,
          0,
        );
        break;
      }
      default:
        logger.error(`No module found for test command: ${cmd.moduleSubType}`);
        return "";
    }

    // remove the last semicolon
    if (script.endsWith(";")) {
      script = script.slice(0, -1);
    }

    return script;
  }

  /**
   * Convert a script to a string of commands for uploading to the controllers
   * @param scriptId
   * @returns
   */
  public async convertScript(scriptId: string): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    const eventMap = new Map<string, Map<number, Array<ScriptEvent>>>();

    this.scriptChannerlGpioChannelMap.clear();
    this.scriptChannelModuleMap.clear();
    this.modulesMap.clear();

    try {
      this.locationIds = await this.scriptRepo.getLocationIds();
      this.modulesMap = await this.scriptRepo.getModules();
      const script = await this.scriptRepo.getScript(scriptId);

      this.scriptChannerlGpioChannelMap =
        await this.scriptRepo.getGpioChannelMap();

      // sort events by the location id and time
      for (const ch of script.scriptChannels) {
        this.mapEventsByControllerAndTime(ch, eventMap);
      }

      // add a buffer event to all channels that don't have one
      this.addBufferEvents(eventMap);

      // convert the events to script strings
      for (const ctl of eventMap.keys()) {
        const map = eventMap.get(ctl);
        if (map !== undefined) {
          const scriptString = this.convertScriptEvents(map);
          result.set(ctl, scriptString);
        }
      }

      return result;
    } catch (err) {
      logger.error(`Exception converting script${scriptId}: ${err}`);
      return new Map<string, string>();
    }
  }

  private mapEventsByControllerAndTime(
    channel: ScriptChannel,
    map: Map<string, Map<number, Array<ScriptEvent>>>,
  ): void {
    let locationId = undefined;

    const module = this.modulesMap.get(channel.parentModuleId);

    if (module === undefined) {
      logger.error(
        `${this.TAG}: No module found for script channel ${channel.id}`,
      );
      return;
    }

    locationId = module.locationId;

    if (locationId === undefined) {
      logger.error(
        `${this.TAG}: No location id set in module found for script channel ${channel.id}`,
      );
      return;
    }

    this.scriptChannelModuleMap.set(channel.id, module.id);

    for (const key in channel.events) {
      const evt = channel.events[key] as ScriptEvent;

      // convert from seconds to ms
      evt.time = evt.time * 1000;

      if (map.has(locationId)) {
        if (map.get(locationId)?.has(evt.time)) {
          map.get(locationId)?.get(evt.time)?.push(evt);
        } else {
          map.get(locationId)?.set(evt.time, new Array<ScriptEvent>());
          map.get(locationId)?.get(evt.time)?.push(evt);
        }
      } else {
        map.set(locationId, new Map<number, Array<ScriptEvent>>());
        map.get(locationId)?.set(evt.time, new Array<ScriptEvent>());
        map.get(locationId)?.get(evt.time)?.push(evt);
      }
    }
  }

  private addBufferEvents(
    map: Map<string, Map<number, Array<ScriptEvent>>>,
  ): void {
    // get the script duration for all locations
    // figure out which one is the longest
    let maxDuration = 0;
    for (const loc of map.keys()) {
      const locationEvents = map.get(loc);
      if (locationEvents === undefined) {
        continue;
      }

      const times = Array.from(locationEvents.keys());
      const sortedTimes = times.sort((n1, n2) => n1 - n2);

      if (sortedTimes.length > 0) {
        const lastTime = sortedTimes[sortedTimes.length - 1];
        if (lastTime > maxDuration) {
          maxDuration = lastTime;
        }
      }
    }

    // add a buffer event to the end of all locations with
    // a shorter duration
    for (const location of map.keys()) {
      const locationEvents = map.get(location);
      if (locationEvents === undefined) {
        continue;
      }

      // if the location doesn't have an event at time 0
      // add a buffer event at time for script start timming
      if (!locationEvents.has(0)) {
        this.addBufferEvent(locationEvents, 0);
      }

      // if the location doesn't have an event at the max duration
      // add a buffer event at the max duration so we don't load the
      // next script until this one is done
      if (!locationEvents.has(maxDuration)) {
        this.addBufferEvent(locationEvents, maxDuration);
      }
    }

    // add a buffer events to all locations that don't have
    // any script events so scripts timeout properly across
    // locations when multiple scripts are queued
    for (const loc of this.locationIds) {
      if (!map.has(loc)) {
        const locEvents = new Map<number, Array<ScriptEvent>>();

        this.addBufferEvent(locEvents, 0);
        this.addBufferEvent(locEvents, maxDuration);

        map.set(loc, locEvents);
      }
    }
  }

  private addBufferEvent(
    map: Map<number, Array<ScriptEvent>>,
    time: number,
  ): void {
    if (map.has(time)) {
      const events = map.get(time);
      if (events !== undefined && events.length > 0) {
        // don't add a buffer event if there are already events at this time
        return;
      }
    }

    const bufferEvent = new ScriptEvent(
      uuid(),
      "buffer",
      ModuleType.none,
      ModuleSubType.none,
      time,
      undefined,
    );
    map.set(time, new Array<ScriptEvent>());
    map.get(time)?.push(bufferEvent);
  }

  private convertScriptEvents(
    timeMap: Map<number, Array<ScriptEvent>>,
  ): string {
    let script = "";

    const times = Array.from(timeMap.keys());

    // sort event times
    const sortedTimes = times.sort((n1, n2) => n1 - n2);

    let nextEventTime = 0;

    // starting with the last event, work backwards so we
    // properly set the delay till next event
    for (let i = sortedTimes.length - 1; i >= 0; i--) {
      const events = timeMap.get(sortedTimes[i]);

      if (events?.length === undefined || events?.length < 1) {
        continue;
      }

      // calculate the time to delay until the next set of events
      const timeTill = Math.max(0, nextEventTime - events[0].time);

      for (let j = 0; j < events.length; j++) {
        // if there are more events at this time only
        // add the time till next on the first event added
        const timeToSend = j === 0 ? timeTill : 0;

        const event = events[j];
        switch (event.moduleType) {
          case ModuleType.uart:
            script = this.convertUartEvent(event, timeToSend) + script;
            break;
          case ModuleType.i2c:
            script = this.convertI2cEvent(event, timeToSend) + script;
            break;
          case ModuleType.gpio:
            script = this.convertGpioEvent(event, timeToSend) + script;
            break;
          case ModuleType.none:
            script = this.convertBufferEvent(event, timeToSend) + script;
        }
      }

      nextEventTime = sortedTimes[i];
    }

    // remove the last semicolon
    if (script.endsWith(";")) {
      script = script.slice(0, -1);
    }

    return script;
  }

  //#region UART events

  convertUartEvent(evt: ScriptEvent, timeTillNextEvent: number): string {
    switch (evt.moduleSubType) {
      case ModuleSubType.genericSerial:
        return this.convertGenericSerialEvent(evt, timeTillNextEvent);
      case ModuleSubType.humanCyborgRelationsSerial:
        return this.convertHcrEvent(evt, timeTillNextEvent);
      case ModuleSubType.kangaroo:
        return this.convertKangarooEvent(evt, timeTillNextEvent);
      case ModuleSubType.maestro:
        return this.convertMaestroEvent(evt, timeTillNextEvent);
      default:
        logger.warn("ScriptConverter: invalid subtype");
    }

    return "";
  }

  //#endregion
  //#region GenericSerial events

  // |___|_________|___________|___________|___________;
  //  evt time_till serial ch   baud rate   msg
  convertGenericSerialEvent(
    evt: ScriptEvent,
    timeTillNextEvent: number,
  ): string {
    const serial = evt.event as GenericSerialEvent;

    const uart = this.getUartValues(evt.scriptChannel);

    if (uart === undefined) {
      logger.error(
        `${this.TAG}: No UART module found for script channel ${evt.scriptChannel}`,
      );
      throw new Error(
        `No UART module found for script channel ${evt.scriptChannel}`,
      );
    }

    return this.genericSerialAsString(serial, uart, timeTillNextEvent);
  }

  genericSerialAsString(
    val: GenericSerialEvent,
    uart: IUartValues,
    timeTillNextEvent: number,
  ): string {
    return `${CommandType.genericSerial}|${timeTillNextEvent}|${uart.ch}|${uart.baud}|${val.value};`;
  }

  //#endregion
  //#region HCR events

  // |___|_________|___________|___________|___________;
  //  evt time_till serial ch   baud rate   msg
  convertHcrEvent(evt: ScriptEvent, timeTillNextEvent: number): string {
    const hcr = evt.event as HumanCyborgRelationsEvent;

    const uart = this.getUartValues(evt.scriptChannel);

    if (uart === undefined) {
      logger.error(
        `${this.TAG}: No UART module found for script channel ${evt.scriptChannel}`,
      );
      throw new Error(
        `No UART module found for script channel ${evt.scriptChannel}`,
      );
    }

    return this.hcrAsString(hcr, uart, timeTillNextEvent);
  }

  hcrAsString(
    hcr: HumanCyborgRelationsEvent,
    uart: IUartValues,
    timeTillNextEvent: number,
  ): string {
    let val = "<";

    for (const cmd of hcr.commands) {
      if (cmd.valueA === null || cmd.valueA === undefined) {
        cmd.valueA = 0;
      }

      if (cmd.valueB === null || cmd.valueB === undefined) {
        cmd.valueB = 0;
      }

      let cmdS = HumanCyborgRelationsModule.getCommandString(cmd.command);
      let re = /#/;
      cmdS = cmdS.replace(re, cmd.valueA.toString());
      re = /\*/;
      cmdS = cmdS.replace(re, cmd.valueB.toString());
      val += cmdS + ",";
    }

    val = val.slice(0, -1);

    val += ">";

    return `${CommandType.genericSerial}|${timeTillNextEvent}|${uart.ch}|${uart.baud}|${val};`;
  }

  //#endregion
  //#region Kangaroo events

  // |___|_________|__________|__________|___|____|____|____;
  //  evt time_till serial ch  baud rate  ch  cmd  spd  pos
  convertKangarooEvent(evt: ScriptEvent, timeTillNextEvent: number): string {
    const uart = this.getUartValues(evt.scriptChannel);

    if (uart === undefined) {
      logger.error(
        `${this.TAG}: No UART module found for script channel ${evt.scriptChannel}`,
      );
      throw new Error(
        `No UART module found for script channel ${evt.scriptChannel}`,
      );
    }

    const kangaroo = evt.event as KangarooEvent;

    return this.kangarooAsString(kangaroo, uart, timeTillNextEvent);
  }

  kangarooAsString(
    evt: KangarooEvent,
    uart: IUartValues,
    timeTillNextEvent: number,
  ): string {
    let command = "";

    if (evt.ch1Action != KangarooAction.none) {
      const evtTime =
        evt.ch2Action === KangarooAction.none ? timeTillNextEvent : 0;

      // if the ch2 action is none, use timeTill. Otherwise we have 2 actions for the
      // same time period, so don't delay untill after second action is done.
      command = `${CommandType.kangaroo}|${evtTime}|${uart.ch}|${uart.baud}|1|${evt.ch1Action}|${evt.ch1Speed}|${evt.ch1Position};`;
    }
    if (evt.ch2Action != KangarooAction.none) {
      command =
        command +
        `${CommandType.kangaroo}|${timeTillNextEvent}|${uart.ch}|${uart.baud}|2|${evt.ch2Action}|${evt.ch2Speed}|${evt.ch2Position};`;
    }

    return command;
  }

  //#endregion
  //#region Maestro events

  // |___|_________|_____|___|_____|____|____;
  //  evt time_till ctrl  ch  pos  speed accel
  convertMaestroEvent(evt: ScriptEvent, timeTillNextEvent: number): string {
    const maestro = evt.event as MaestroEvent;

    if (maestro.channel < 0) {
      logger.error(
        `${this.TAG}: Maestro event channel is invalid (${maestro.channel}) for script channel ${evt.scriptChannel}`,
      );
      throw new Error(
        `Maestro event channel is invalid (${maestro.channel}) for script channel ${evt.scriptChannel}`,
      );
    }

    const uart = this.getUartValues(evt.scriptChannel);
    if (uart === undefined) {
      logger.error(
        `${this.TAG}: No UART module found for script channel ${evt.scriptChannel}`,
      );
      throw new Error(
        `No UART module found for script channel ${evt.scriptChannel}`,
      );
    }

    return this.masetroAsToString(maestro, uart, timeTillNextEvent);
  }

  masetroAsToString(
    evt: MaestroEvent,
    uart: IUartValues,
    next: number,
  ): string {
    return `${CommandType.maestro}|${next}|${uart.idx}|${evt.channel}|${evt.position}|${evt.speed}|${evt.acceleration};`;
  }

  //#endregion
  //#region I2C events

  // |___|_________|___|________;
  //  evt time_till ch   msg
  convertI2cEvent(evt: ScriptEvent, timeTillNextEvent: number): string {
    const i2c = evt.event as I2cEvent;

    const i2cAddress = this.getI2cChannel(evt.scriptChannel);
    if (i2cAddress === undefined) {
      logger.error(
        `${this.TAG}: No I2C module found for script channel ${evt.scriptChannel}`,
      );
      throw new Error(
        `No I2C module found for script channel ${evt.scriptChannel}`,
      );
    }

    return this.i2cAsString(i2c, i2cAddress, timeTillNextEvent);
  }

  i2cAsString(
    evt: I2cEvent,
    i2cAddress: number,
    timeTillNextEvent: number,
  ): string {
    return `${CommandType.i2c}|${timeTillNextEvent}|${i2cAddress}|${evt.message};`;
  }

  //#endregion
  //#region GPIO events

  // |___|_________|___|____;
  //  evt time_till ch  val
  convertGpioEvent(evt: ScriptEvent, timeTillNextEvent: number): string {
    const gpio = evt.event as GpioEvent;

    const gpioChannel = this.scriptChannerlGpioChannelMap.get(
      evt.scriptChannel,
    );
    if (gpioChannel === undefined) {
      logger.error(
        `${this.TAG}: No GPIO channel found for script channel ${evt.scriptChannel}`,
      );
      throw new Error(
        `No GPIO channel found for script channel ${evt.scriptChannel}`,
      );
    }

    return this.gpioEvtAsString(gpio, gpioChannel, timeTillNextEvent);
  }

  gpioEvtAsString(
    evt: GpioEvent,
    gpioChannel: number,
    timeTillNextEvent: number,
  ): string {
    return `${CommandType.gpio}|${timeTillNextEvent}|${gpioChannel}|${evt.setHigh ? 1 : 0};`;
  }

  //#endregion
  //#region Buffer event

  // |___|_________|____;
  //  evt time_till ch (event is at least 3 parts)
  convertBufferEvent(evt: ScriptEvent, timeTillNextEvent: number): string {
    if (evt.scriptChannel !== "buffer") {
      logger.error(
        `${this.TAG}: Buffer event requested but script channel is incorrect: ${evt.scriptChannel}`,
      );
      throw new Error(
        `Buffer event requested but script channel is incorrect: ${evt.scriptChannel}`,
      );
    }

    return `${CommandType.none}|${timeTillNextEvent}|0;`;
  }

  //#endregion
  //#region Utility functions

  getUartValues(scriptCh: string): IUartValues | undefined {
    const moduleId = this.scriptChannelModuleMap.get(scriptCh);

    if (moduleId === undefined) {
      return undefined;
    }

    const module = this.modulesMap.get(moduleId);
    if (module === undefined) {
      return undefined;
    }

    if (module.moduleType !== ModuleType.uart) {
      return undefined;
    }

    const val = module as UartModule;

    return { idx: val.idx, ch: val.uartChannel, baud: val.baudRate };
  }

  getI2cChannel(scriptCh: string): number | undefined {
    const moduleId = this.scriptChannelModuleMap.get(scriptCh);

    if (moduleId === undefined) {
      return undefined;
    }

    const module = this.modulesMap.get(moduleId);
    if (module === undefined) {
      return undefined;
    }

    if (module.moduleType !== ModuleType.i2c) {
      return undefined;
    }

    const val = module as unknown as I2cModule;

    return val.i2cAddress;
  }
}
