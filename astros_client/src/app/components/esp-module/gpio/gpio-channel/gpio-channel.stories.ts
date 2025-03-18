import { Meta, StoryObj } from '@storybook/angular';
import { GpioChannelComponent } from './gpio-channel.component';
import { GpioChannel } from 'astros-common';
import { v4 as uuid } from 'uuid';

const meta: Meta<GpioChannelComponent> = {
  title: 'Modules/Gpio/GpioChannel',
  component: GpioChannelComponent,
  tags: ['autodocs'],
};

export default meta;

type Story = StoryObj<GpioChannelComponent>;

export const Default: Story = {
  args: {
    channel: new GpioChannel(uuid(), uuid(), 0, true, 'Test', true),
  },
};

export const DefaultHigh: Story = {
  args: {
    channel: new GpioChannel(uuid(), uuid(), 0, true, 'Test', true),
  },
};

export const Disabled: Story = {
  args: {
    channel: new GpioChannel(uuid(), uuid(), 0, false, 'Test', false),
  },
};
