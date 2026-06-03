import { PwmChannel } from './pwm_channel.js';

// PCA9685 module
// Address is the I2C address of the module
export interface PwmModule {
  id: string;
  address: number;
  channels: PwmChannel[];
}
