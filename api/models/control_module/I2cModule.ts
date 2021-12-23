import { I2cChannel } from "./I2cChannel";



export class I2cModule {
    channels: I2cChannel[];

    constructor() {
        this.channels = new Array<I2cChannel>();
    }
}
