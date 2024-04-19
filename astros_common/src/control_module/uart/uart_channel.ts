import { UartType } from "../../astros_enums";
import { BaseChannel } from "../base_channel";

export class UartChannel extends BaseChannel {

    type: UartType;
    module: any;

    constructor(type: UartType, id: number, channelName: string, module: any) {
        super(id, channelName, true);

        this.type = type;
        this.module = module;
    }
}