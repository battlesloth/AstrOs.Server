import { ModuleSubType, ModuleType } from 'src/models/enums.js';
import { BaseChannel } from 'src/models/control_module/base_channel.js';

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
