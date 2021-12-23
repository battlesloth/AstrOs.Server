import { PwmChannel } from "./PwmChannel";



export class PwmModule {
    channels: PwmChannel[];

    constructor() {
        this.channels = new Array<PwmChannel>();
    }
}
