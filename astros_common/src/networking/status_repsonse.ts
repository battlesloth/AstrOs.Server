import { ControllerType } from "../astros_enums";
import { BaseResponse } from "./base_response";
import { TransmissionType } from "../astros_enums";

export class StatusResponse extends BaseResponse{
 
    controllerType: ControllerType;
    up: boolean;
    synced: boolean

    constructor(controllerType: ControllerType, up: boolean, synced: boolean){
        super(TransmissionType.status, true, '');

        this.controllerType = controllerType;
        this.up = up;
        this.synced = synced;
    }
}