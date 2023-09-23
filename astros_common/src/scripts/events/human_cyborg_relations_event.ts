import { HcrCommandCategory, HumanCyborgRelationsCmd } from "../../astros_enums";

export class HcrCommand {
    id: string;
    category: HcrCommandCategory;
    command: HumanCyborgRelationsCmd;
    valueA: number;
    valueB: number;


    constructor(id: string, category: HcrCommandCategory, command: HumanCyborgRelationsCmd, valueA: number, valueB: number){
        this.id = id;
        this.category = category;
        this.command = command;
        this.valueA = valueA;
        this.valueB = valueB;
    }}

export class HumanCyborgRelationsEvent {
    uartChannel: number;
    commands: Array<HcrCommand>;

    constructor(uartChannel: number, commands: Array<HcrCommand>){
        this.uartChannel = uartChannel;
        this.commands = commands;
    }
}