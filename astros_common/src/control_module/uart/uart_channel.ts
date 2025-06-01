import { ModuleSubType, ModuleType } from "../../astros_enums";
import { BaseChannel } from "../base_channel";

export class UartChannel extends BaseChannel {
  constructor(
    id: string,
    parentId: string,
    name: string,
    subType: ModuleSubType,
    enabled: boolean,
  ) {
    super(id, parentId, name, ModuleType.uart, subType, enabled);
  }
}
