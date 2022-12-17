import { ControllerType } from "astros-common";

export class ControllerEndpoint {

    endpointName: string;
    type: ControllerType;
    ip: string;
    useIp: boolean;

    constructor(endpointName: string, type: ControllerType,ip: string, useIp: boolean ) {
        this.endpointName = endpointName;
        this.type = type;
        this.ip = ip;
        this.useIp = useIp;
    }
}