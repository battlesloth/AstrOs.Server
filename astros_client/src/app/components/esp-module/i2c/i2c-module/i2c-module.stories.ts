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

export const I2c: Story = {
  args: {},
};
