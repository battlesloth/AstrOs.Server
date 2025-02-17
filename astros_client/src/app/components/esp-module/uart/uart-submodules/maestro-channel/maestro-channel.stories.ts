import { Meta, moduleMetadata, StoryObj } from '@storybook/angular';
import { MaestroChannelComponent } from './maestro-channel.component';
import { MaestroChannel } from 'astros-common';
import { v4 as uuid} from 'uuid'

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
      uuid(),
      uuid(),
      'Channel 1',
      true,
      1, 
      true,
      0,
      0,
      0,
      false,
    )
  },
};

export const Values: Story = {
  args: {
    channel: new MaestroChannel(
      uuid(),
      uuid(),
      'Channel 1',
      true,
      1, 
      true,
      500,
      2500,
      1250,
      true
    )
  },
};

export const Output: Story = {
  args: {
    channel: new MaestroChannel(
      uuid(),
      uuid(),
      'Output',
      true,
      1, 
      false,
      0,
      0,
      0,
      false,
    )
  },
};

export const OutputDefaultHigh: Story = {
  args: {
    channel: new MaestroChannel(
      uuid(),
      uuid(),
      'Output',
      true,
      1,
      false,
      0,
      0,
      0,
      true
     )
  },
};

export const Disabled: Story = {
  args: {
    channel: new MaestroChannel(
      uuid(),
      uuid(),
      'Channel 1',
      false,
      1, 
      true,
      0,
      0,
      0,
      false,
    )
  },
};
