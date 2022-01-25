import { PwmChannel } from "./pwm_channel";



export class PwmModule {
    channels: PwmChannel[];

    constructor() {
        this.channels = new Array<PwmChannel>();
    }
}
