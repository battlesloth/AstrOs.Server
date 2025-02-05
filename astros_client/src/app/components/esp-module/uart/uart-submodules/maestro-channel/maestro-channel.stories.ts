import { Meta, moduleMetadata, StoryObj } from '@storybook/angular';
import { MaestroChannelComponent } from './maestro-channel.component';
import { MaestroChannel } from 'astros-common';

const meta: Meta<MaestroChannelComponent> = {
  title: 'Modules/Uart/Submodules/MaestroChannel',
  component: MaestroChannelComponent,
  decorators: [
    moduleMetadata({
      imports: [],
    }),
  ],
};

export default meta;

type Story = StoryObj<MaestroChannelComponent>;

export const Default: Story = {
  args: {
    channel: new MaestroChannel(
      1,
      'Test',
      true,
      '1234',
      true,
      0,
      0,
      0,
      false,
      1,
      9600
    )
  },
};

export const Values: Story = {
  args: {
    channel: new MaestroChannel(
      1,
      'Servo',
      true,
      '1234',
      true,
      500,
      2500,
      1250,
      true,
      1,
      9600
    )
  },
};

export const Output: Story = {
  args: {
    channel: new MaestroChannel(
      1,
      'Output',
      true,
      '1234',
      false,
      0,
      0,
      0,
      false,
      1,
      9600
    )
  },
};

export const OutputDefaultHigh: Story = {
  args: {
    channel: new MaestroChannel(
      1,
      'Output',
      true,
      '1234',
      false,
      0,
      0,
      0,
      true,
      1,
      9600
    )
  },
};

export const Disabled: Story = {
  args: {
    channel: new MaestroChannel(
      1,
      'Test',
      false,
      '1234',
      true,
      0,
      0,
      0,
      false,
      1,
      9600
    )
  },
};
