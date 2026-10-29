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
  HumanCyborgRelationsCmd,
  MaestroChannel,
  RandomGpioEvent,
  RandomMaestroEvent,
} from '../models/index.js';
import { v4 as uuid } from 'uuid';
import { logger } from '../logger.js';
import { ScriptRepository } from '../dal/repositories/script_repository.js';
import { randomSpanProblems } from './random_span_validation.js';

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

// The wire command types of .docs/protocol.md § C (the firmware's
// MODULE_TYPE). Append only.
export enum CommandType {
  none = 0,
  maestro = 1,
  i2c = 2,
  genericSerial = 3,
  kangaroo = 4,
  gpio = 5,
  maestroRandom = 6,
  gpioRandom = 7,
}

export class ScriptConverter {
  readonly TAG = 'ScriptConverter';

  locationIds: string[];
  private readonly scriptChannelMap: Map<string, ScriptChannel>;
  scriptChannelModuleMap: Map<string, string>;
  // enabled GPIO channels only, keyed by the GPIO channel's own id (a script
  // channel's moduleChannelId)
  gpioChannelNumberMap: Map<string, number>;
  // the script being converted, for log lines
  private scriptId = '';
  modulesMap: Map<string, ModuleClassType>;

  constructor(private readonly scriptRepo: ScriptRepository) {
    this.locationIds = [];
    this.scriptChannelMap = new Map<string, ScriptChannel>();
    this.scriptChannelModuleMap = new Map<string, string>();
    this.gpioChannelNumberMap = new Map<string, number>();
    this.modulesMap = new Map<string, ModuleClassType>();
  }

  /**
   * Create a single command for testing
   * @param command
   * @returns
   */
  public async convertCommand(command: unknown): Promise<string> {
    let script = '';

    if (command === undefined || command === null) {
      return '';
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
        script = this.maestroAsToString(
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

        const idx = mod.channels.findIndex((ch: GpioChannel) => ch.id === cmd.channelId);
        if (idx < 0) {
          logger.error(
            `No GPIO channel found for command channel id: ${cmd.channelId} in module: ${cmd.moduleId}`,
          );
          return '';
        }

        script = this.gpioEvtAsString(cmd.event as GpioEvent, mod.channels[idx].channelNumber, 0);
        break;
      }
      default:
        logger.error(`No module found for test command: ${cmd.moduleSubType}`);
        return '';
    }

    // remove the last semicolon
    if (script.endsWith(';')) {
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

    this.scriptId = scriptId;
    this.gpioChannelNumberMap.clear();
    this.scriptChannelMap.clear();
    this.scriptChannelModuleMap.clear();
    this.modulesMap.clear();

    try {
      this.locationIds = await this.scriptRepo.getLocationIds();
      this.modulesMap = await this.scriptRepo.getModules();
      const script = await this.scriptRepo.getScript(scriptId);

      this.gpioChannelNumberMap = await this.scriptRepo.getGpioChannelMap();

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
      logger.error(`${this.TAG}: No module found for script channel ${channel.id}`);
      return;
    }

    locationId = module.locationId;

    if (locationId === undefined) {
      logger.error(
        `${this.TAG}: No location id set in module found for script channel ${channel.id}`,
      );
      return;
    }

    this.scriptChannelMap.set(channel.id, channel);
    this.scriptChannelModuleMap.set(channel.id, module.id);

    for (const key in channel.events) {
      const evt = channel.events[key] as ScriptEvent;

      // convert from seconds to ms
      evt.time = evt.time * 1000;
      if (evt.endTime != null) {
        evt.endTime = evt.endTime * 1000;
      }

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

  private addBufferEvents(map: Map<string, Map<number, Array<ScriptEvent>>>): void {
    // The script ends at the latest event start or span end across all
    // locations; a span skipped as invalid still counts. A non-finite start
    // is ignored, and a non-finite end, or one before the start, counts as
    // the span's start, so one bad row can't poison or shorten every
    // location's end buffer.
    let maxDuration = 0;
    for (const locationEvents of map.values()) {
      for (const events of locationEvents.values()) {
        for (const evt of events) {
          if (!Number.isFinite(evt.time)) {
            continue;
          }
          const end = Number.isFinite(evt.endTime) ? Number(evt.endTime) : evt.time;
          maxDuration = Math.max(maxDuration, evt.time, end);
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

  private addBufferEvent(map: Map<number, Array<ScriptEvent>>, time: number): void {
    if (map.has(time)) {
      const events = map.get(time);
      if (events !== undefined && events.length > 0) {
        // don't add a buffer event if there are already events at this time
        return;
      }
    }

    const bufferEvent: ScriptEvent = {
      id: uuid(),
      scriptChannel: 'buffer',
      moduleType: ModuleType.none,
      moduleSubType: ModuleSubType.none,
      time,
      endTime: null,
      event: undefined,
    };
    map.set(time, new Array<ScriptEvent>());
    map.get(time)?.push(bufferEvent);
  }

  private convertScriptEvents(timeMap: Map<number, Array<ScriptEvent>>): string {
    let script = '';

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
        if (event.endTime != null) {
          script = this.convertRandomSpanEvent(event, timeToSend) + script;
          continue;
        }

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
    if (script.endsWith(';')) {
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
        logger.warn('ScriptConverter: invalid subtype');
    }

    return '';
  }

  //#endregion
  //#region GenericSerial events

  // |___|_________|___________|___________|___________;
  //  evt time_till serial ch   baud rate   msg
  convertGenericSerialEvent(evt: ScriptEvent, timeTillNextEvent: number): string {
    const serial = evt.event as GenericSerialEvent;

    const uart = this.getUartValues(evt.scriptChannel);

    if (uart === undefined) {
      logger.error(`${this.TAG}: No UART module found for script channel ${evt.scriptChannel}`);
      throw new Error(`No UART module found for script channel ${evt.scriptChannel}`);
    }

    return this.genericSerialAsString(serial, uart, timeTillNextEvent);
  }

  genericSerialAsString(
    val: GenericSerialEvent,
    uart: IUartValues,
    timeTillNextEvent: number,
  ): string {
    return `${CommandType.genericSerial}|${this.toMsStr(timeTillNextEvent)}|${uart.ch}|${uart.baud}|${val.value};`;
  }

  //#endregion
  //#region HCR events

  // |___|_________|___________|___________|___________;
  //  evt time_till serial ch   baud rate   msg
  convertHcrEvent(evt: ScriptEvent, timeTillNextEvent: number): string {
    const hcr = evt.event as HumanCyborgRelationsEvent;

    const uart = this.getUartValues(evt.scriptChannel);

    if (uart === undefined) {
      logger.error(`${this.TAG}: No UART module found for script channel ${evt.scriptChannel}`);
      throw new Error(`No UART module found for script channel ${evt.scriptChannel}`);
    }

    return this.hcrAsString(hcr, uart, timeTillNextEvent);
  }

  hcrAsString(
    hcr: HumanCyborgRelationsEvent,
    uart: IUartValues,
    timeTillNextEvent: number,
  ): string {
    let val = '<';

    for (const cmd of hcr.commands) {
      if (cmd.valueA === null || cmd.valueA === undefined) {
        cmd.valueA = 0;
      }

      if (cmd.valueB === null || cmd.valueB === undefined) {
        cmd.valueB = 0;
      }

      let cmdS = HumanCyborgRelationsModule.getCommandString(cmd.command);
      let re = /#/;
      cmdS = cmdS.replace(re, this.hcrValueAsString(cmd.command, cmd.valueA));
      re = /\*/;
      cmdS = cmdS.replace(re, this.hcrValueAsString(cmd.command, cmd.valueB));
      val += cmdS + ',';
    }

    val = val.slice(0, -1);

    val += '>';

    return `${CommandType.genericSerial}|${this.toMsStr(timeTillNextEvent)}|${uart.ch}|${uart.baud}|${val};`;
  }

  hcrValueAsString(cmd: HumanCyborgRelationsCmd, val: number): string {
    if (
      cmd === HumanCyborgRelationsCmd.playWavOnA ||
      cmd === HumanCyborgRelationsCmd.playWavOnB ||
      cmd === HumanCyborgRelationsCmd.playSdRandomOnA ||
      cmd === HumanCyborgRelationsCmd.playSdRandomOnB
    ) {
      // for these commands the value is 4 positions with leading zeros, so pad the value with leading zeros if needed
      const valStr = val.toString().padStart(4, '0');
      return valStr;
    }

    return val.toString();
  }

  //#endregion
  //#region Kangaroo events

  // |___|_________|__________|__________|___|____|____|____;
  //  evt time_till serial ch  baud rate  ch  cmd  spd  pos
  convertKangarooEvent(evt: ScriptEvent, timeTillNextEvent: number): string {
    const uart = this.getUartValues(evt.scriptChannel);

    if (uart === undefined) {
      logger.error(`${this.TAG}: No UART module found for script channel ${evt.scriptChannel}`);
      throw new Error(`No UART module found for script channel ${evt.scriptChannel}`);
    }

    const kangaroo = evt.event as KangarooEvent;

    return this.kangarooAsString(kangaroo, uart, timeTillNextEvent);
  }

  kangarooAsString(evt: KangarooEvent, uart: IUartValues, timeTillNextEvent: number): string {
    let command = '';

    if (evt.ch1Action != KangarooAction.none) {
      const evtTime = evt.ch2Action === KangarooAction.none ? timeTillNextEvent : 0;

      // if the ch2 action is none, use timeTill. Otherwise we have 2 actions for the
      // same time period, so don't delay untill after second action is done.
      command = `${CommandType.kangaroo}|${this.toMsStr(evtTime)}|${uart.ch}|${uart.baud}|1|${evt.ch1Action}|${evt.ch1Speed}|${evt.ch1Position};`;
    }
    if (evt.ch2Action != KangarooAction.none) {
      command =
        command +
        `${CommandType.kangaroo}|${this.toMsStr(timeTillNextEvent)}|${uart.ch}|${uart.baud}|2|${evt.ch2Action}|${evt.ch2Speed}|${evt.ch2Position};`;
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
      logger.error(`${this.TAG}: No UART module found for script channel ${evt.scriptChannel}`);
      throw new Error(`No UART module found for script channel ${evt.scriptChannel}`);
    }

    // a position that isn't a finite number (undefined, null, "") aborts the
    // firmware's std::stoi and reboots the controller
    if (!Number.isFinite(maestro.position)) {
      logger.warn(
        `${this.TAG}: skipping Maestro event ${evt.id} on channel ${evt.scriptChannel} in script ${this.scriptId}: position ${maestro.position} is not a number`,
      );
      return this.noneAsString(timeTillNextEvent);
    }

    return this.maestroAsToString(maestro, uart, timeTillNextEvent);
  }

  maestroAsToString(evt: MaestroEvent, uart: IUartValues, next: number): string {
    return `${CommandType.maestro}|${this.toMsStr(next)}|${uart.idx}|${evt.channel}|${evt.position}|${evt.speed}|${evt.acceleration};`;
  }

  //#endregion
  //#region I2C events

  // |___|_________|___|________;
  //  evt time_till ch   msg
  convertI2cEvent(evt: ScriptEvent, timeTillNextEvent: number): string {
    const i2c = evt.event as I2cEvent;

    const i2cAddress = this.getI2cChannel(evt.scriptChannel);
    if (i2cAddress === undefined) {
      logger.error(`${this.TAG}: No I2C module found for script channel ${evt.scriptChannel}`);
      throw new Error(`No I2C module found for script channel ${evt.scriptChannel}`);
    }

    return this.i2cAsString(i2c, i2cAddress, timeTillNextEvent);
  }

  i2cAsString(evt: I2cEvent, i2cAddress: number, timeTillNextEvent: number): string {
    return `${CommandType.i2c}|${this.toMsStr(timeTillNextEvent)}|${i2cAddress}|${evt.message};`;
  }

  //#endregion
  //#region GPIO events

  // |___|_________|___|____;
  //  evt time_till ch  val
  convertGpioEvent(evt: ScriptEvent, timeTillNextEvent: number): string {
    const gpio = evt.event as GpioEvent;

    const gpioChannel = this.getGpioChannelNumber(evt.scriptChannel);
    if (gpioChannel === undefined) {
      logger.error(`${this.TAG}: No GPIO channel found for script channel ${evt.scriptChannel}`);
      throw new Error(`No GPIO channel found for script channel ${evt.scriptChannel}`);
    }

    return this.gpioEvtAsString(gpio, gpioChannel, timeTillNextEvent);
  }

  gpioEvtAsString(evt: GpioEvent, gpioChannel: number, timeTillNextEvent: number): string {
    return `${CommandType.gpio}|${this.toMsStr(timeTillNextEvent)}|${gpioChannel}|${evt.setHigh ? 1 : 0};`;
  }

  //#endregion
  //#region Random span events

  // A span that can't be sent becomes a buffer with the same delay, so the
  // events after it keep their times. Never throws: a throw in convertScript
  // empties every controller's upload.
  convertRandomSpanEvent(evt: ScriptEvent, timeTillNextEvent: number): string {
    // both already ms; rounded once, so validation and the wire see the same value
    const spanMs = Math.round(Number(evt.endTime) - evt.time);

    let result: string | string[];
    try {
      result = this.randomSpanCommand(evt, spanMs, timeTillNextEvent);
    } catch (err) {
      // stored JSON can hold values that throw on Math.round or interpolation;
      // logged at error with the stack in case it is a converter bug instead
      logger.error({ err }, `${this.TAG}: converting random span ${evt.id} threw`);
      result = [`unexpected error: ${err instanceof Error ? err.message : 'unknown'}`];
    }
    if (typeof result === 'string') {
      return result;
    }

    logger.warn(
      `${this.TAG}: skipping random span ${evt.id} on channel ${evt.scriptChannel} in script ${this.scriptId}: ${result.join('; ')}`,
    );
    return this.noneAsString(timeTillNextEvent);
  }

  // The span's command, or the reasons it can't be sent.
  private randomSpanCommand(evt: ScriptEvent, spanMs: number, next: number): string | string[] {
    if (evt.event === null || typeof evt.event !== 'object') {
      return [`payload ${JSON.stringify(evt.event)} is not an object`];
    }

    switch (evt.moduleSubType) {
      case ModuleSubType.genericGpio: {
        const gpioChannel = this.getGpioChannelNumber(evt.scriptChannel);
        if (gpioChannel === undefined) {
          return [this.missingGpioChannelReason(evt.scriptChannel)];
        }

        const span = evt.event as RandomGpioEvent;
        const sent: RandomGpioEvent = {
          minGapMs: Math.round(span.minGapMs),
          maxGapMs: Math.round(span.maxGapMs),
        };

        const problems = randomSpanProblems(spanMs, sent, false);
        if (!(Number.isInteger(gpioChannel) && gpioChannel >= 0)) {
          problems.push(`GPIO channel ${gpioChannel} is not an integer ≥ 0`);
        }

        return problems.length > 0
          ? problems
          : this.randomGpioAsString(sent, gpioChannel, spanMs, next);
      }
      case ModuleSubType.maestro: {
        const uart = this.getUartValues(evt.scriptChannel);
        if (uart === undefined) {
          return ['no UART module found'];
        }

        const isServo = this.getMaestroIsServo(evt.scriptChannel);
        if (isServo === undefined) {
          return ['no Maestro channel found'];
        }

        // Copy each wire field by name. Without isServo, the validator knows a
        // Maestro payload by its channel key, so naming channel here gets it
        // checked (and failed) when the stored payload lacks it, instead of
        // sent as "undefined". Servo or digital is the channel's current
        // setting, not the payload's.
        const span = evt.event as RandomMaestroEvent;
        const sent: RandomMaestroEvent = {
          channel: span.channel,
          isServo,
          minGapMs: Math.round(span.minGapMs),
          maxGapMs: Math.round(span.maxGapMs),
          minPos: span.minPos,
          maxPos: span.maxPos,
          minMove: span.minMove,
          maxMove: span.maxMove,
          speed: span.speed,
          acceleration: span.acceleration,
        };

        const problems = randomSpanProblems(spanMs, sent, isServo);
        if (!(Number.isInteger(uart.idx) && uart.idx >= 0)) {
          problems.push(`UART idx ${uart.idx} is not an integer ≥ 0`);
        }

        return problems.length > 0
          ? problems
          : this.randomMaestroAsString(sent, uart, spanMs, next);
      }
      default:
        return [`moduleSubType ${evt.moduleSubType} has no random span`];
    }
  }

  // |___|_________|____|______|________|________;
  //  evt time_till gpio spanMs minGapMs maxGapMs
  randomGpioAsString(
    evt: RandomGpioEvent,
    gpioChannel: number,
    spanMs: number,
    next: number,
  ): string {
    return `${CommandType.gpioRandom}|${this.toMsStr(next)}|${gpioChannel}|${this.toMsStr(spanMs)}|${this.toMsStr(evt.minGapMs)}|${this.toMsStr(evt.maxGapMs)};`;
  }

  // |___|_________|____|___|______|________|________|______|______|_______|_______|_____|_____;
  //  evt time_till ctrl ch  spanMs minGapMs maxGapMs minPos maxPos minMove maxMove speed accel
  // A digital channel sends the six fields after maxGapMs as 0; maxMove null is sent as 0.
  randomMaestroAsString(
    evt: RandomMaestroEvent,
    uart: IUartValues,
    spanMs: number,
    next: number,
  ): string {
    const servoFields = evt.isServo
      ? [evt.minPos, evt.maxPos, evt.minMove, evt.maxMove ?? 0, evt.speed, evt.acceleration]
      : [0, 0, 0, 0, 0, 0];

    return `${CommandType.maestroRandom}|${this.toMsStr(next)}|${uart.idx}|${evt.channel}|${this.toMsStr(spanMs)}|${this.toMsStr(evt.minGapMs)}|${this.toMsStr(evt.maxGapMs)}|${servoFields.join('|')};`;
  }

  //#endregion
  //#region Buffer event

  // |___|_________|____;
  //  evt time_till ch (event is at least 3 parts)
  convertBufferEvent(evt: ScriptEvent, timeTillNextEvent: number): string {
    if (evt.scriptChannel !== 'buffer') {
      logger.error(
        `${this.TAG}: Buffer event requested but script channel is incorrect: ${evt.scriptChannel}`,
      );
      throw new Error(
        `Buffer event requested but script channel is incorrect: ${evt.scriptChannel}`,
      );
    }

    return this.noneAsString(timeTillNextEvent);
  }

  noneAsString(timeTillNextEvent: number): string {
    return `${CommandType.none}|${this.toMsStr(timeTillNextEvent)}|0;`;
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

  getGpioChannelNumber(scriptCh: string): number | undefined {
    const channel = this.scriptChannelMap.get(scriptCh);

    if (channel === undefined) {
      return undefined;
    }

    return this.gpioChannelNumberMap.get(channel.moduleChannelId);
  }

  // getGpioChannelMap holds enabled channels only, so a disabled one misses too
  private missingGpioChannelReason(scriptCh: string): string {
    const channel = this.scriptChannelMap.get(scriptCh)?.moduleChannel;

    if (channel instanceof GpioChannel && !channel.enabled) {
      return `GPIO channel ${channel.channelNumber} (${channel.id}) is disabled`;
    }

    return `no GPIO channel found for ${channel?.id || 'an unknown channel'}`;
  }

  getMaestroIsServo(scriptCh: string): boolean | undefined {
    const channel = this.scriptChannelMap.get(scriptCh)?.moduleChannel;

    if (!(channel instanceof MaestroChannel)) {
      return undefined;
    }

    return channel.isServo;
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

  toMsStr(time: number): string {
    // remove any decimal places and convert to string
    return time.toFixed(0);
  }
}
