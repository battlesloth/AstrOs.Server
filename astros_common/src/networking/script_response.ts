import { BaseResponse } from "./base_response";
import { TransmissionStatus, TransmissionType } from "../astros_enums";

export class ScriptResponse extends BaseResponse{
 
    scriptId: string;
    controllerId: number;
    status: TransmissionStatus
    date: Date;

    constructor(scriptId: string, controllerId: number, status: TransmissionStatus, date: Date){
        super(TransmissionType.script, true, '');

        this.scriptId = scriptId;
        this.controllerId = controllerId;
        this.date = date;
    }
}