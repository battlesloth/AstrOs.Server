import { type Meta, type StoryObj } from '@storybook/vue3';
import AstrosMaestroModule from './AstrosMaestroModule.vue';
import { ModuleType } from '@/enums/modules/ModuleType';
import { ModuleSubType } from '@/enums/modules/ModuleSubType';
import type { UartModule } from '@/models/controllers/modules/uart/uartModule';

// Helper function to create Maestro channel
function createMaestroChannel(num: number) {
  return {
    id: crypto.randomUUID(),
    channelNumber: num,
    enabled: num <= 4, // First 4 channels enabled by default
    channelName: `Servo ${num}`,
    isServo: true,
    inverted: false,
    minPos: 500,
    maxPos: 2500,
    homePos: 1500,
  };
}

// Helper function to create mock UART module
function getSerialModule(ch: number, baudRate: number, channelCount: number): UartModule {
  const channels = Array.from({ length: 24 }, (_, i) => createMaestroChannel(i));

  return {
    idx: 0,
    id: '1234',
    name: 'Maestro',
    locationId: 'core',
    moduleType: ModuleType.UART,
    moduleSubType: ModuleSubType.MAESTRO,
    uartChannel: ch,
    baudRate,
    subModule: {
      boards: [
        {
          channelCount,
          channels,
        },
      ],
    },
  };
}

const meta = {
  title: 'components/modules/uart/submodules/MaestroModule',
  component: AstrosMaestroModule,
  render: (args: unknown) => ({
    components: { AstrosMaestroModule },
    setup() {
      return { args };
    },
    template: '<AstrosMaestroModule v-bind="args" />',
  }),
  args: {
    module: getSerialModule(1, 9600, 24),
    parentTestId: 'test',
    isMaster: false,
  },
  tags: ['autodocs'],
} satisfies Meta<typeof AstrosMaestroModule>;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * Default Maestro configuration with 24 channels
 */
export const Default: Story = {
  args: {
    module: getSerialModule(1, 9600, 24),
    parentTestId: 'test',
    isMaster: false,
  },
};

/**
 * Maestro with 18 channels
 */
export const With18Channels: Story = {
  args: {
    module: getSerialModule(1, 9600, 18),
    parentTestId: 'test',
    isMaster: false,
  },
};

/**
 * Maestro with 12 channels
 */
export const With12Channels: Story = {
  args: {
    module: getSerialModule(1, 9600, 12),
    parentTestId: 'test',
    isMaster: false,
  },
};

/**
 * Maestro with 6 channels
 */
export const With6Channels: Story = {
  args: {
    module: getSerialModule(1, 9600, 6),
    parentTestId: 'test',
    isMaster: false,
  },
};

/**
 * High-speed configuration at 115200 baud
 */
export const HighSpeed: Story = {
  args: {
    module: getSerialModule(2, 115200, 24),
    parentTestId: 'test',
    isMaster: false,
  },
};
