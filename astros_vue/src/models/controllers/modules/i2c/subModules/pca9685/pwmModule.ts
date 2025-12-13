import type { PwmChannel } from "./pwmChannel";

// PCA9685 module
// Address is the I2C address of the module
export interface PwmModule {
  id: string;
  address: number;
  channels: PwmChannel[];
}
