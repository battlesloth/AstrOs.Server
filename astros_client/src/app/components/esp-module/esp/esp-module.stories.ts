import {
  applicationConfig,
  Meta,
  StoryObj,
  moduleMetadata,
} from '@storybook/angular';
import { importProvidersFrom } from '@angular/core';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { MatExpansionPanel } from '@angular/material/expansion';
import { EspModuleComponent } from './esp-module.component';
import { ControllerLocation } from 'astros-common';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { v4 as uuid } from 'uuid';

const meta: Meta<EspModuleComponent> = {
  title: 'Modules/EspModule',
  component: EspModuleComponent,
  tags: ['autodocs'],
  decorators: [
    moduleMetadata({
      imports: [MatExpansionPanel, FontAwesomeModule],
    }),
    applicationConfig({
      providers: [importProvidersFrom(BrowserAnimationsModule)],
    }),
  ],
};

export default meta;

type Story = StoryObj<EspModuleComponent>;

export const Default: Story = {
  args: {
    isMaster: false,
    location: getControllerLocation(),
  },
};

function getControllerLocation(): ControllerLocation {
  const loc = new ControllerLocation(
    uuid(),
    'core',
    'Test Location',
    'fingerptint',
  );

  return loc;
}
