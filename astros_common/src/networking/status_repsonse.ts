import { BaseResponse } from "./base_response";
import { TransmissionType } from "../astros_enums";

export class StatusResponse extends BaseResponse {

    controllerId: number;
    controllerLocation: string;
    up: boolean;
    synced: boolean
    l
    constructor(controllerId: number, controllerLocation: string, up: boolean, synced: boolean) {
        super(TransmissionType.status, true, '');

        this.controllerId = controllerId;
        this.controllerLocation = controllerLocation;
        this.up = up;
        this.synced = synced;
    }
}