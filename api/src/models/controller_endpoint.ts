export class ControllerEndpoint {

    endpointName: string;
    ip: string;
    useIp: boolean;

    constructor(endpointName: string, ip: string, useIp: boolean ) {
        this.endpointName = endpointName;
        this.ip = ip;
        this.useIp = useIp;
    }
}