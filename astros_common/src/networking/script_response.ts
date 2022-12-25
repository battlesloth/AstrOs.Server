import { ControllerType } from "../astros_enums";
import { BaseResponse } from "./base_response";
import { TransmissionStatus } from "./transmission_status";
import { TransmissionType } from "./transmission_type";

export class ScriptResponse extends BaseResponse{
 
    scriptId: string;
    controllerType: ControllerType;
    status: TransmissionStatus
    date: string;

    constructor(scriptId: string, controllerType: ControllerType, status: TransmissionStatus, date: string){
        super(TransmissionType.script, true, '');

        this.scriptId = scriptId;
        this.controllerType = controllerType;
        this.date = date;
    }
}