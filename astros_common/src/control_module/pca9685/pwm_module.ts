import { PwmChannel } from "./pwm_channel";


// PCA9685 module
// Address is the I2C address of the module
export class PwmModule {

    id: number;
    address: number;
    channels: PwmChannel[];

    constructor(id: number, address: number) {
        this.id = id;
        this.address = address;
        this.channels = new Array<PwmChannel>();
    }
}
