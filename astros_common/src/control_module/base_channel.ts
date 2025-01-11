import { ChannelSubType } from "../index";
import { GpioChannel } from "./gpio/gpio_channel";
import { I2cChannel } from "./i2c/i2c_channel";
import { PwmChannel } from "./pca9685/pwm_channel";
import { KangarooX2Channel } from "./uart/sub_modules/kangarooX2/kangaroo_x2_channel";
import { MaestroChannel } from "./uart/sub_modules/maestro/maestro_channel";
import { UartChannel } from "./uart/uart_channel";

export type ModuleChannelType =
    BaseChannel |
    GpioChannel |
    I2cChannel |
    PwmChannel |
    UartChannel |
    KangarooX2Channel |
    MaestroChannel;

export class BaseChannel {
    id: number;
    channelName: string;
    enabled: boolean;
    subType: ChannelSubType;
    constructor(
        id: number,
        channelName: string,
        enabled: boolean,
        subType: ChannelSubType = ChannelSubType.none
    ) {
        if (channelName === null) {
            this.channelName = "unnamed";
        } else {
            this.channelName = channelName;
        }
        this.id = id;
        this.enabled = enabled;
        this.subType = subType;
    }
}