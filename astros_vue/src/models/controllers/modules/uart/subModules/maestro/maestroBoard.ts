import type { MaestroChannel } from './maestroChannel';

export interface MaestroBoard {
  id: string;
  parentId: string;
  boardId: number;
  name: string;
  channelCount: number;
  channels: MaestroChannel[];
}
