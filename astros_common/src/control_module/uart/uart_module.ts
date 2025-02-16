import { ModuleSubType, ModuleType, ScriptChannelType } from "../../astros_enums";
import { ScriptChannelResource } from "../../scripts/script_channel_resource";
import { BaseModule } from "../base_module";
import { KangarooX2 } from "./sub_modules/kangarooX2/kangaroo_x2";
import { KangarooX2Channel } from "./sub_modules/kangarooX2/kangaroo_x2_channel";
import { MaestroModule } from "./sub_modules/maestro/maestro_module";
import { UartChannel } from "./uart_channel";

export class UartModule extends BaseModule {
  uartChannel: number;
  baudRate: number;
  subModule: unknown;

  constructor(
    id: string,
    name: string,
    locationId: string,
    subType: ModuleSubType,
    uartChannel: number,
    baudRate: number,
  ) {
    super(id, name, locationId, ModuleType.uart, subType);
    this.uartChannel = uartChannel;
    this.baudRate = baudRate;
    this.subModule = {};
  }

  override getScriptResources(): ScriptChannelResource[] {
    let resources: ScriptChannelResource[] = [];

    switch (this.moduleSubType) {
      case ModuleSubType.genericSerial:
        resources = this.generateGenericSerialResources();
        break;
      case ModuleSubType.kangaroo:
        resources = this.generateKangarooResources();
        break;
      case ModuleSubType.maestro:
        resources = this.generateMaestroResources();
        break;
      case ModuleSubType.humanCyborgRelationsSerial:
        resources = this.generateHCRResources();
        break;
    }

    return resources;
  }

  generateGenericSerialResources(): ScriptChannelResource[] {

    const ch = new UartChannel(
      this.id,
      this.id,
      this.name,
      this.moduleSubType,
      true,
      this.uartChannel,
      this.baudRate
    );

    return [
      new ScriptChannelResource(
        this.id,
        ScriptChannelType.GENERIC_UART,
        this.name,
        this.id,
        this.locationId,
        ch
      ),
    ];
  }

  generateKangarooResources(): ScriptChannelResource[] {
    const mod = this.subModule as KangarooX2;

    const ch = new KangarooX2Channel(
      this.id,
      this.id,
      this.name,
      this.uartChannel,
      this.baudRate,
      mod.ch1Name,
      mod.ch2Name
    );

    return [
      new ScriptChannelResource(
        this.id,
        ScriptChannelType.KANGAROO,
        this.name,
        this.id,
        this.locationId,
        ch
      ),
    ];
  }

  generateMaestroResources(): ScriptChannelResource[] {

    const resources: ScriptChannelResource[] = [];

    const mod = this.subModule as MaestroModule;

    for (const ch of mod.boards[0].channels) {
      if (!ch.enabled) continue;

      resources.push(
        new ScriptChannelResource(
          ch.id,
          ch.isServo ? ScriptChannelType.SERVO : ScriptChannelType.GPIO,
          ch.channelName,
          this.id,
          this.locationId,
          ch
        )
      );
    }

    return resources;
  }

  generateHCRResources(): ScriptChannelResource[] {
    const ch = new UartChannel(
      this.id,
      this.id,
      this.name,
      this.moduleSubType,
      true,
      this.uartChannel,
      this.baudRate
    );

    return [
      new ScriptChannelResource(
        this.id,
        ScriptChannelType.AUDIO,
        this.name,
        this.id,
        this.locationId,
        ch
      )
    ];
  }
}
