import { DirectCommnandType } from "../astros_enums";

export class DirectCommand {
    type: DirectCommnandType;
    controllerId: number;
    command: any
   
    constructor(type: DirectCommnandType, controllerId: number, command: any){
        this.type = type;
        this.controllerId = controllerId;
        this.command = command;
    }
}