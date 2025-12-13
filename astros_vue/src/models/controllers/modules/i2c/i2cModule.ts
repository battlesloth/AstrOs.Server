import type { BaseModule } from '@/models/controllers/baseModule';

export interface I2cModule extends BaseModule {
  i2cAddress: number;
  subModule: unknown;
}
