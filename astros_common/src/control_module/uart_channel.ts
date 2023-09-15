import { UartType } from "../astros_enums";

export class UartChannel {
    channelName: string;
    id: number;
    type: UartType;
    module: any;
    

    constructor(type: UartType, id: number, channelName: string, module: any) {
        this.type = type; 
        this.channelName = channelName;
        this.id = id;
        this.module = module;
    }
}