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
import { I2cModule, I2cType } from 'astros-common';

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
    module: getI2cModule(I2cType.genericI2C, 1),
  },
};

export const HumanCyborgRelations: Story = {
  args: {
    module: getI2cModule(I2cType.humanCyborgRelations, 2),
  },
};

export const PwmBoard: Story = {
  args: {
    module: getI2cModule(I2cType.pwmBoard, 3),
  },
};

function getI2cModule(type: I2cType, address: number): I2cModule {

  const module = new I2cModule(
    '1234',
    'I2c Module',
    'test',
    address,
    type,
  );

  switch (type) {
    case I2cType.genericI2C:
      module.name = 'Generic I2C Module';
      break;
    case I2cType.humanCyborgRelations:
      module.name = 'Human Cyborg Relations Module';
      break;
    case I2cType.pwmBoard:
      module.name = 'PWM Board Module';
      break;
  }

  return module;
}