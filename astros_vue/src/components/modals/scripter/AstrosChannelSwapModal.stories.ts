import type { Meta, StoryObj } from '@storybook/vue3';
import { fn } from 'storybook/test';
import { v4 as uuid } from 'uuid';
import AstrosChannelSwapModal from './AstrosChannelSwapModal.vue';
import { ScriptChannelType } from '@/enums';
import type { ChannelDetails } from '@/models';
import { useScripterStore } from '@/stores/scripter';

const meta = {
  title: 'Components/Modals/Scripter/ChannelSwapModal',
  component: AstrosChannelSwapModal,
  parameters: {
    layout: 'centered',
  },
  args: {
    onConfirm: fn(),
    onClose: fn(),
  },
  tags: ['autodocs'],
} satisfies Meta<typeof AstrosChannelSwapModal>;

export default meta;
type Story = StoryObj<typeof meta>;

// Mock the scripter store for Storybook
const mockScripterStore = () => {
  const store = useScripterStore();
  store.getChannelDetailsList = (channelType: ScriptChannelType, availableOnly = true) => {
    return generateChannelDetails(channelType, 5);
  };
  return store;
};

function generateChannelDetails(type: ScriptChannelType, count: number): ChannelDetails[] {
  const result: ChannelDetails[] = [];
  const typeName = getChannelTypeName(type);

  for (let i = 0; i < count; i++) {
    result.push({
      id: uuid(),
      name: `${typeName} Channel ${i + 1}`,
      locationId: i % 3 === 0 ? 'body' : i % 3 === 1 ? 'core' : 'dome',
      available: i % 2 === 0, // Every other channel is available
      scriptChannelType: type,
    });
  }

  return result;
}

function getChannelTypeName(type: ScriptChannelType): string {
  switch (type) {
    case ScriptChannelType.SERVO:
      return 'Servo';
    case ScriptChannelType.GPIO:
      return 'GPIO';
    case ScriptChannelType.AUDIO:
      return 'HCR';
    case ScriptChannelType.GENERIC_I2C:
      return 'I2C';
    case ScriptChannelType.GENERIC_UART:
      return 'Serial';
    case ScriptChannelType.KANGAROO:
      return 'Kangaroo';
    default:
      return 'Channel';
  }
}

export const ServoChannels: Story = {
  args: {
    currentChannel: uuid(),
    channelType: ScriptChannelType.SERVO,
  },
  beforeEach: () => {
    mockScripterStore();
  },
};

export const GpioChannels: Story = {
  args: {
    currentChannel: uuid(),
    channelType: ScriptChannelType.GPIO,
  },
  beforeEach: () => {
    mockScripterStore();
  },
};

export const AudioChannels: Story = {
  args: {
    currentChannel: uuid(),
    channelType: ScriptChannelType.AUDIO,
  },
  beforeEach: () => {
    mockScripterStore();
  },
};

export const I2cChannels: Story = {
  args: {
    currentChannel: uuid(),
    channelType: ScriptChannelType.GENERIC_I2C,
  },
  beforeEach: () => {
    mockScripterStore();
  },
};

export const SerialChannels: Story = {
  args: {
    currentChannel: uuid(),
    channelType: ScriptChannelType.GENERIC_UART,
  },
  beforeEach: () => {
    mockScripterStore();
  },
};

export const KangarooChannels: Story = {
  args: {
    currentChannel: uuid(),
    channelType: ScriptChannelType.KANGAROO,
  },
  beforeEach: () => {
    mockScripterStore();
  },
};

export const NoEligibleChannels: Story = {
  args: {
    currentChannel: uuid(),
    channelType: ScriptChannelType.SERVO,
  },
  beforeEach: () => {
    const store = useScripterStore();
    store.getChannelDetailsList = () => {
      return []; // Return empty array - no eligible channels
    };
  },
};

export const SingleChannel: Story = {
  args: {
    currentChannel: uuid(),
    channelType: ScriptChannelType.GPIO,
  },
  beforeEach: () => {
    const store = useScripterStore();
    store.getChannelDetailsList = (channelType: ScriptChannelType) => {
      return generateChannelDetails(channelType, 1);
    };
  },
};

export const ManyChannels: Story = {
  args: {
    currentChannel: uuid(),
    channelType: ScriptChannelType.SERVO,
  },
  beforeEach: () => {
    const store = useScripterStore();
    store.getChannelDetailsList = (channelType: ScriptChannelType) => {
      return generateChannelDetails(channelType, 15);
    };
  },
};

export const LongChannelNames: Story = {
  args: {
    currentChannel: uuid(),
    channelType: ScriptChannelType.GENERIC_UART,
  },
  beforeEach: () => {
    const store = useScripterStore();
    store.getChannelDetailsList = () => {
      return [
        {
          id: uuid(),
          name: 'This is a very long channel name that should be displayed properly',
          locationId: 'body',
          available: true,
          scriptChannelType: ScriptChannelType.GENERIC_UART,
        },
        {
          id: uuid(),
          name: 'Another extremely long channel name with lots of characters',
          locationId: 'core',
          available: true,
          scriptChannelType: ScriptChannelType.GENERIC_UART,
        },
        {
          id: uuid(),
          name: 'Short name',
          locationId: 'dome',
          available: true,
          scriptChannelType: ScriptChannelType.GENERIC_UART,
        },
      ];
    };
  },
};
