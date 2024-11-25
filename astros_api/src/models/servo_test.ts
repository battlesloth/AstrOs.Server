import { ControlModule, TransmissionType } from "astros-common";

export class ServoTest {
    type: TransmissionType = TransmissionType.servoTest;
    controller: ControlModule;
    servoId: number;
    msValue: number;

    constructor(controller: ControlModule, servoId: number, msValue: number) {
        this.controller = controller;
        this.servoId = servoId;
        this.msValue = msValue;
    }
}