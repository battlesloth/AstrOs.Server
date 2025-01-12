import { SerialMessageType } from "./serial_message";

export class SerialMessageTracker {
  id: string;
  type: SerialMessageType;
  metaData: any;
  controllerStatus: Map<string, boolean> = new Map<string, boolean>();

  constructor(
    id: string,
    type: SerialMessageType,
    controllers: string[],
    metaData: any,
  ) {
    this.id = id;
    this.type = type;
    this.metaData = metaData;

    for (const controller of controllers) {
      this.controllerStatus.set(controller, false);
    }
  }
}
