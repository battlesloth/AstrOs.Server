import {
  applicationConfig,
  Meta,
  moduleMetadata,
  StoryObj,
} from '@storybook/angular';
import { I2cModuleComponent } from './i2c-module.component';
import { MatExpansionPanel } from '@angular/material/expansion';
import { importProvidersFrom } from '@angular/core';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { I2cModule, ModuleSubType } from 'astros-common';
import { v4 as uuid } from 'uuid';

const meta: Meta<I2cModuleComponent> = {
  title: 'Modules/I2c/I2cModule',
  component: I2cModuleComponent,
  tags: ['autodocs'],
  decorators: [
    moduleMetadata({
      imports: [MatExpansionPanel],
    }),
    applicationConfig({
      providers: [importProvidersFrom(BrowserAnimationsModule)],
    }),
  ],
};

export default meta;

type Story = StoryObj<I2cModuleComponent>;

export const GenericI2c: Story = {
  args: {
    module: getI2cModule(ModuleSubType.genericI2C, 1),
  },
};

export const HumanCyborgRelations: Story = {
  args: {
    module: getI2cModule(ModuleSubType.humanCyborgRelationsI2C, 2),
  },
};

export const PwmBoard: Story = {
  args: {
    module: getI2cModule(ModuleSubType.pwmBoard, 3),
  },
};

function getI2cModule(type: ModuleSubType, address: number): I2cModule {

  const module = new I2cModule(
    uuid(),
    'I2c Module',
    uuid(),
    address,
    type,
  );

  switch (type) {
    case ModuleSubType.genericI2C:
      module.name = 'Generic I2C Module';
      break;
    case ModuleSubType.humanCyborgRelationsI2C:
      module.name = 'Human Cyborg Relations Module';
      break;
    case ModuleSubType.pwmBoard:
      module.name = 'PWM Board Module';
      break;
  }

  return module;
}