import { MaestroChannel } from "./maestro_channel";

export class MaestroBoard {
  id: string;
  boardId: number;
  name: string;
  channelCount: number;
  channels: MaestroChannel[];

  constructor(id: string, boardId: number, name: string, channelCount: number) {
    this.id = id;
    this.boardId = boardId;
    this.name = name;
    this.channelCount = channelCount;
    this.channels = new Array<MaestroChannel>();
  }
}
