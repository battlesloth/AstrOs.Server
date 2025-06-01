import {
  applicationConfig,
  Meta,
  moduleMetadata,
  StoryObj,
} from '@storybook/angular';
import { ServoSettingsComponent } from './servo-settings.component';
import { MatCheckbox } from '@angular/material/checkbox';

const meta: Meta<ServoSettingsComponent> = {
  title: 'Modules/Shared/ServoSettings',
  component: ServoSettingsComponent,
  tags: ['autodocs'],
  decorators: [
    moduleMetadata({
      imports: [MatCheckbox],
    }),
    applicationConfig({
      providers: [],
    }),
  ],
};

export default meta;

export type Story = StoryObj<ServoSettingsComponent>;

export const Default: Story = {
  args: {
    enabled: true,
    name: 'Servo 1',
    invert: false,
    isServo: true,
    minPulse: 500,
    maxPulse: 2500,
    homePosition: 1500,
  },
};

export const Inverted: Story = {
  args: {
    enabled: true,
    name: 'Servo 2',
    invert: true,
    isServo: true,
    minPulse: 900,
    maxPulse: 2000,
    homePosition: 1000,
  },
};

export const GPIO: Story = {
  args: {
    enabled: true,
    name: 'GPIO 1',
    invert: false,
    isServo: false,
    minPulse: 900,
    maxPulse: 2000,
    homePosition: 1000,
  },
};

export const GPIODefaultHigh: Story = {
  args: {
    enabled: true,
    name: 'GPIO 2',
    invert: true,
    isServo: false,
    minPulse: 900,
    maxPulse: 2000,
    homePosition: 1000,
  },
};

export const Disabled: Story = {
  args: {
    enabled: false,
    name: 'Servo 3',
    invert: false,
    isServo: true,
    minPulse: 500,
    maxPulse: 2500,
    homePosition: 1500,
  },
};
