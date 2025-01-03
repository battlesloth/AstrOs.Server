import { MaestroChannel } from "./maestro_channel";

export class MaestroBoard {
    
    id: string;
    boardId: number;
    name: string;
    channels: MaestroChannel[];

    constructor(id: string, boardId: number, name: string) { 
        this.id = id;
        this.boardId = boardId;
        this.name = name;
        this.channels = new Array<MaestroChannel>();
    }
}