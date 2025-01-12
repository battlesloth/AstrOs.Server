import {
  applicationConfig,
  Meta,
  moduleMetadata,
  StoryObj,
} from '@storybook/angular';
import { importProvidersFrom } from '@angular/core';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { MatExpansionPanel } from '@angular/material/expansion';
import { EspModuleComponent } from './esp-module.component';
const meta: Meta<EspModuleComponent> = {
  title: 'Modules/EspModule',
  component: EspModuleComponent,
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

type Story = StoryObj<EspModuleComponent>;

export const Default: Story = {
  args: {},
};
