import { MaestroChannel } from "./maestro_channel";

export class MaestroBoard {
  id: string;
  parentId: string;
  boardId: number;
  name: string;
  channelCount: number;
  channels: MaestroChannel[];

  constructor(id: string, parentId: string, boardId: number, name: string, channelCount: number) {
    this.id = id;
    this.parentId = parentId;
    this.boardId = boardId;
    this.name = name;
    this.channelCount = channelCount;
    this.channels = new Array<MaestroChannel>();
  }
}
