import { ModuleSubType } from 'src/models/enums.js';
import { UartChannel } from 'src/models/control_module/uart/uart_channel.js';

export class MaestroChannel extends UartChannel {
  channelNumber: number;
  // servo or GPIO
  isServo: boolean;
  minPos: number;
  maxPos: number;
  homePos: number;
  // if not servo, this is default low value
  inverted: boolean;
  // minimum powered time after a move, in ms (release_ms.ts holds the range)
  releaseMs: number;

  constructor(
    id: string,
    parentId: string,
    channelName: string,
    enabled: boolean,
    channelNumber: number,
    isServo: boolean,
    minPos: number,
    maxPos: number,
    homePos: number,
    inverted: boolean,
    releaseMs: number,
  ) {
    super(id, parentId, channelName, ModuleSubType.maestro, enabled);

    this.channelNumber = channelNumber;
    this.isServo = isServo;
    this.minPos = minPos;
    this.maxPos = maxPos;
    this.homePos = homePos;
    this.inverted = inverted;
    this.releaseMs = releaseMs;
  }
}
