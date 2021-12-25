import { PwmChannel } from "src/models/control_module/pwm_channel";



export class PwmModule {
    channels: PwmChannel[];

    constructor() {
        this.channels = new Array<PwmChannel>();
    }
}
