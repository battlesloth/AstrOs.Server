import { I2cChannel } from "./i2c_channel";



export class I2cModule {
    channels: I2cChannel[];

    constructor() {
        this.channels = new Array<I2cChannel>();
    }
}
