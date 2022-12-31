import { ControllerType, DirectCommnandType } from "../astros_enums";

export class DirectCommand {
    type: DirectCommnandType;
    controller: ControllerType;
    command: any
    ipAddress: string = '';

    constructor(type: DirectCommnandType, controller: ControllerType, command: any){
        this.type = type;
        this.controller = controller;
        this.command = command;
    }
}