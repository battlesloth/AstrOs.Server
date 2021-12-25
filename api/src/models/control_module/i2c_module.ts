import { I2cChannel } from "src/models/control_module/i2c_channel";



export class I2cModule {
    channels: I2cChannel[];

    constructor() {
        this.channels = new Array<I2cChannel>();
    }
}
