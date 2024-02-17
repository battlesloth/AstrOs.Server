import { TransmissionType } from "../astros_enums";
import { ControlModule } from "../control_module/control_module";
import { BaseResponse } from "./base_response";

export class ControllersResponse extends BaseResponse {
    controllers: Array<ControlModule>;

    constructor(controllers: Array<ControlModule>) {
        super(TransmissionType.controllers, true, '');
        this.controllers = controllers;
    }
}