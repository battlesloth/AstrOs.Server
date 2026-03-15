import { ModuleSubType, ModuleType } from '../../enums.js';
import { BaseChannel } from '../base_channel.js';

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
