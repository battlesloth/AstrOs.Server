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
} from 'astros-common';

export default class EventMarkerHelper {
  static generateText(event: ScriptEvent): string[] {
    switch (event.moduleType) {
      case ModuleType.i2c:
        return this.i2cText(event.dataJson);
      case ModuleType.gpio:
        return this.gpioText(event.dataJson);
      case ModuleType.uart:
        return this.uartText(event.moduleSubType, event.dataJson);
      default:
        return this.generateBasicResponse('error');
    }
  }

  /*private static servoText(json: string): Array<string> {
        const evt = JSON.parse(json) as ServoEvent;
        const result = new Array<string>();
        result[0] = 'Position:';
        result[1] = evt.position.toString();
        result[2] = 'Speed:';
        result[3] = evt.speed.toString();

        return result;
    }*/

  private static i2cText(json: string): string[] {
    const evt = JSON.parse(json) as I2cEvent;
    const result = new Array<string>();
    result[0] = '\u00A0';
    result[1] = 'Message:';
    result[2] = evt.message;
    result[3] = '';

    return result;
  }

  private static gpioText(json: string): string[] {
    const evt = JSON.parse(json) as GpioEvent;
    const result = new Array<string>();
    result[0] = '\u00A0';
    result[1] = 'State:';
    result[2] = evt.setHigh ? 'High' : 'Low';
    result[3] = '';

    return result;
  }

  private static uartText(subType: ModuleSubType, json: string): string[] {
    switch (subType) {
      case ModuleSubType.genericSerial:
        return this.genericUart(json);
      case ModuleSubType.kangaroo:
        return this.kangaroo(json);
      case ModuleSubType.humanCyborgRelationsSerial:
        return this.humanCyborg(json);
      default:
        return this.generateBasicResponse('error');
    }
  }

  private static genericUart(json: string): string[] {
    const evt = JSON.parse(json) as GenericSerialEvent;
    const result = new Array<string>();
    result[0] = '\u00A0';
    result[1] = 'Message:';
    result[2] = evt.value;
    result[3] = '';

    return result;
  }

  static kangaroo(json: string): string[] {
    const evt = JSON.parse(json) as KangarooEvent;
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

  static humanCyborg(json: string): string[] {
    const evt = JSON.parse(json) as HumanCyborgRelationsEvent;
    const result = new Array<string>();
    result[0] = '';
    result[1] = 'Event Count';
    result[2] = evt.commands.length.toString();
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
