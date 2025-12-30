import type { Meta, StoryObj } from '@storybook/vue3';
import { fn } from 'storybook/test';
import AstrosChannelTestModal from './AstrosChannelTestModal.vue';
import { ScriptChannelType } from '@/enums/scripts/scriptChannelType';

const meta = {
  title: 'Components/Modals/Scripter/ChannelTestModal',
  component: AstrosChannelTestModal,
  parameters: {
    layout: 'centered',
  },
  args: {
    onTest: fn(),
    onClose: fn(),
  },
  tags: ['autodocs'],
} satisfies Meta<typeof AstrosChannelTestModal>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Servo: Story = {
  args: {
    controllerId: 1,
    scriptChannelType: ScriptChannelType.SERVO,
    channelId: 5,
  },
};

export const GPIO: Story = {
  args: {
    controllerId: 1,
    scriptChannelType: ScriptChannelType.GPIO,
    channelId: 3,
  },
};

export const I2C: Story = {
  args: {
    controllerId: 1,
    scriptChannelType: ScriptChannelType.GENERIC_I2C,
    channelId: 2,
  },
};

export const UART: Story = {
  args: {
    controllerId: 1,
    scriptChannelType: ScriptChannelType.GENERIC_UART,
    channelId: 1,
  },
};

export const Kangaroo: Story = {
  args: {
    controllerId: 1,
    scriptChannelType: ScriptChannelType.KANGAROO,
    channelId: 4,
  },
};
