import {
  ModuleType,
  ModuleSubType,
  GenericSerialEvent,
  GpioEvent,
  HumanCyborgRelationsEvent,
  I2cEvent,
  KangarooAction,
  KangarooEvent,
  ScriptEvent,
  MaestroEvent,
} from 'astros-common';
import { ScriptEventTypes } from 'astros-common/dist/scripts/script_event';

export default class EventMarkerHelper {
  static generateText(event: ScriptEvent): string[] {
    switch (event.moduleType) {
      case ModuleType.i2c:
        return this.i2cText(event.event as I2cEvent);
      case ModuleType.gpio:
        return this.gpioText(event.event as GpioEvent);
      case ModuleType.uart:
        return this.uartText(
          event.moduleSubType,
          event.event as ScriptEventTypes,
        );
      default:
        return this.generateBasicResponse('error');
    }
  }

  private static i2cText(evt: I2cEvent): string[] {
    const result = new Array<string>();
    result[0] = '\u00A0';
    result[1] = 'Message:';
    result[2] = evt.message;
    result[3] = '';

    return result;
  }

  private static gpioText(evt: GpioEvent): string[] {
    return this.generateGpioResponse(evt.setHigh);
  }

  private static uartText(
    subType: ModuleSubType,
    evt: ScriptEventTypes,
  ): string[] {
    switch (subType) {
      case ModuleSubType.genericSerial:
        return this.genericUartText(evt as GenericSerialEvent);
      case ModuleSubType.kangaroo:
        return this.kangarooText(evt as KangarooEvent);
      case ModuleSubType.humanCyborgRelationsSerial:
        return this.humanCyborgText(evt as HumanCyborgRelationsEvent);
      case ModuleSubType.maestro:
        return this.maestroText(evt as MaestroEvent);
      default:
        return this.generateBasicResponse('error');
    }
  }

  private static genericUartText(evt: GenericSerialEvent): string[] {
    const result = new Array<string>();
    result[0] = '\u00A0';
    result[1] = 'Message:';
    result[2] = evt.value;
    result[3] = '';

    return result;
  }

  static kangarooText(evt: KangarooEvent): string[] {
    const result = new Array<string>();
    result[0] = 'CH 1:';
    result[1] = this.getKangarooActionName(evt.ch1Action);
    result[2] = 'CH 2:';
    result[3] = this.getKangarooActionName(evt.ch2Action);

    return result;
  }

  static getKangarooActionName(action: KangarooAction): string {
    switch (action) {
      case KangarooAction.start:
        return 'Start';
      case KangarooAction.home:
        return 'Home';
      case KangarooAction.position:
        return 'Position';
      case KangarooAction.speed:
        return 'Speed';
      case KangarooAction.none:
        return 'None';
      default:
        return 'error';
    }
  }

  static humanCyborgText(evt: HumanCyborgRelationsEvent): string[] {
    const result = new Array<string>();
    result[0] = '';
    result[1] = 'Event Count';
    result[2] = evt.commands.length.toString();
    result[3] = '';

    return result;
  }

  // per maestro docs, the output is low unless the position value is
  // greater than or equal to 1500.00 μs
  static maestroText(evt: MaestroEvent): string[] {
    if (evt.isServo) {
      return this.generateServoResponse(
        evt.position.toString(),
        evt.speed.toString(),
      );
    } else {
      return this.generateGpioResponse(evt.position >= 1500);
    }
  }

  static generateServoResponse(position: string, speed: string): string[] {
    const result = new Array<string>();
    result[0] = 'Position:';
    result[1] = position;
    result[2] = 'Speed:';
    result[3] = speed;

    return result;
  }

  static generateGpioResponse(setHigh: boolean): string[] {
    const result = new Array<string>();
    result[0] = '\u00A0';
    result[1] = 'State:';
    result[2] = setHigh ? 'High' : 'Low';
    result[3] = '';

    return result;
  }

  static generateBasicResponse(val: string): string[] {
    const result = [];
    result[0] = '\u00A0';
    result[1] = val;
    result[2] = '';
    result[3] = '';
    return result;
  }
}
