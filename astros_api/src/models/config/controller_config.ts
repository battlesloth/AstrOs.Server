import { ControllerLocation } from "astros-common";

export class ControllerConfig {
    id: number;
    location: string;
    name: string;
    address: string;

    constructor(location: ControllerLocation) {
        this.id = location.controller?.id ?? -1;
        this.location = location.locationName;
        this.name = location.controller?.name ?? "";
        this.address = location.controller?.address ?? "";
    }
}