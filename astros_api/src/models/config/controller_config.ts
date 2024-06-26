import { ControllerLocation } from "astros-common";
import { ServoConfig } from "./servo_config";

export class ControllerConfig {
    id: number;
    location: string;
    name: string;
    address: string;
    servoChannels: Array<ServoConfig>;

    constructor(location: ControllerLocation) {
        this.id = location.controller?.id ?? -1;
        this.location = location.locationName;
        this.name = location.controller?.name ?? "";
        this.address = location.controller?.address ?? "";

        this.servoChannels = new Array<ServoConfig>();

        location.servoModule.channels.forEach(ch => {
            this.servoChannels.push(new ServoConfig(ch.id, ch.minPos, ch.maxPos, ch.enabled, ch.inverted));
        })
    }
}