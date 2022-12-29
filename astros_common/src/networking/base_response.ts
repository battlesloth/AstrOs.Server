import { TransmissionType } from "./transmission_type";

export class BaseResponse {
    type: TransmissionType;
    success: boolean;
    message: string;

    constructor(type: TransmissionType, success: boolean, msg: string){
        this.type = type;
        this.success = success;
        this.message = msg;
    }
}