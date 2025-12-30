import { type Meta, type StoryObj } from '@storybook/vue3';
import GpioChannel from './AstrosGpioChannel.vue';
import type { GpioChannel as GpioChannelType } from '@/models/controllers/modules/gpio/gpioChannel';
import { ModuleType } from '@/enums/modules/ModuleType';
import { ModuleSubType } from '@/enums/modules/ModuleSubType';

// Helper function to create mock GPIO channel
function createGpioChannel(
  channelNumber: number,
  enabled: boolean = true,
  channelName: string = 'Test',
  defaultHigh: boolean = false,
): GpioChannelType {
  const id = crypto.randomUUID();
  const parentId = crypto.randomUUID();

  return {
    id,
    parentId,
    channelNumber,
    enabled,
    channelName,
    defaultHigh,
    moduleType: ModuleType.gpio,
    moduleSubType: ModuleSubType.genericGpio,
  };
}

const meta = {
  title: 'components/modules/gpio/GpioChannel',
  component: GpioChannel,
  render: (args: unknown) => ({
    components: { GpioChannel },
    setup() {
      return { args };
    },
    template: '<GpioChannel v-bind="args" />',
  }),
  args: {
    channel: createGpioChannel(0),
    parentTestId: 'test',
  },
  tags: ['autodocs'],
  argTypes: {
    parentTestId: {
      control: 'text',
      description: 'Test ID prefix for testing',
    },
  },
} satisfies Meta<typeof GpioChannel>;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * Default GPIO channel configuration
 */
export const Default: Story = {
  args: {
    channel: createGpioChannel(0, true, 'Test', false),
    parentTestId: 'test',
  },
};

/**
 * GPIO channel configured with default high output
 */
export const DefaultHigh: Story = {
  args: {
    channel: createGpioChannel(1, true, 'Power LED', true),
    parentTestId: 'test',
  },
};

/**
 * Disabled GPIO channel
 */
export const Disabled: Story = {
  args: {
    channel: createGpioChannel(2, false, 'Unused', false),
    parentTestId: 'test',
  },
};

/**
 * GPIO channel with a longer name
 */
export const LongName: Story = {
  args: {
    channel: createGpioChannel(3, true, 'Motor Controller Enable Signal', true),
    parentTestId: 'test',
  },
};

/**
 * Multiple channels demonstration
 */
export const MultipleChannels: Story = {
  render: () => ({
    components: { GpioChannel },
    setup() {
      const channels = [
        createGpioChannel(0, true, 'LED Red', false),
        createGpioChannel(1, true, 'LED Green', false),
        createGpioChannel(2, true, 'LED Blue', true),
        createGpioChannel(3, false, 'Unused', false),
        createGpioChannel(4, true, 'Motor Enable', false),
      ];
      return { channels };
    },
    template: `
            <div class="space-y-4 p-4 bg-base-100">
                <GpioChannel 
                    v-for="channel in channels" 
                    :key="channel.id"
                    :channel="channel"
                    parent-test-id="test"
                    class="border-2 border-base-content/20 rounded p-4"
                />
            </div>
        `,
  }),
};
