import {
  applicationConfig,
  Meta,
  moduleMetadata,
  StoryObj,
} from '@storybook/angular';
import { importProvidersFrom } from '@angular/core';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { MatExpansionPanel } from '@angular/material/expansion';
import { UartModuleComponent } from './uart-module.component';

const meta: Meta<UartModuleComponent> = {
  title: 'Modules/UartModule',
  component: UartModuleComponent,
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

type Story = StoryObj<UartModuleComponent>;

export const Default: Story = {
  args: {},
};
