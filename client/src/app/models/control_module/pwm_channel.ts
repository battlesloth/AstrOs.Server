export enum PwmType{
    unassigned,
    continuous_servo,
    positional_servo,
    linear_servo,
    led,
    high_low
}


export class PwmChannel {
    id: number;
    channelName: string;
    type: PwmType;
    limit0: number;
    limit1: number;

    constructor(id: number, channelName: string, type: PwmType, limit0: number, limit1: number) {
        this.channelName = channelName;
        this.id = id;
        this.type = type;
        this.limit0 = limit0;
        this.limit1 = limit1;
    }
}
