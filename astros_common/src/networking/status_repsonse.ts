import { BaseResponse } from "./base_response";
import { TransmissionType } from "../astros_enums";

export class StatusResponse extends BaseResponse{
 
    controllerId: number;
    up: boolean;
    synced: boolean

    constructor(controllerId: number, up: boolean, synced: boolean){
        super(TransmissionType.status, true, '');

        this.controllerId = controllerId;
        this.up = up;
        this.synced = synced;
    }
}