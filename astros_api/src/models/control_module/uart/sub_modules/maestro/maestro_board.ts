import { MaestroChannel } from './maestro_channel.js';

export interface MaestroBoard {
  id: string;
  parentId: string;
  boardId: number;
  name: string;
  channelCount: number;
  channels: MaestroChannel[];
}
