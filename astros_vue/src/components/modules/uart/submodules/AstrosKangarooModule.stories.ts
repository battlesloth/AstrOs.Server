import { type Meta, type StoryObj } from '@storybook/vue3';
import AstrosKangarooModule from './AstrosKangarooModule.vue';
import { ModuleType } from '@/enums/modules/ModuleType';
import { ModuleSubType } from '@/enums/modules/ModuleSubType';
import type { UartModule } from '@/models/controllers/modules/uart/uartModule';

// Helper function to create mock UART module
function getSerialModule(ch: number, baudRate: number): UartModule {
  return {
    idx: 0,
    id: '1234',
    name: 'Kangaroo X2',
    locationId: 'core',
    moduleType: ModuleType.uart,
    moduleSubType: ModuleSubType.kangaroo,
    uartChannel: ch,
    baudRate,
    subModule: {
      id: '',
      ch1Name: 'Lifter',
      ch2Name: 'Spinner',
    },
  };
}

const meta = {
  title: 'components/modules/uart/submodules/KangarooModule',
  component: AstrosKangarooModule,
  render: (args: unknown) => ({
    components: { AstrosKangarooModule },
    setup() {
      return { args };
    },
    template: '<AstrosKangarooModule v-bind="args" />',
  }),
  args: {
    module: getSerialModule(1, 9600),
    parentTestId: 'test',
    isMaster: false,
  },
  tags: ['autodocs'],
} satisfies Meta<typeof AstrosKangarooModule>;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * Default Kangaroo X2 configuration
 */
export const Default: Story = {
  args: {
    module: getSerialModule(1, 9600),
    parentTestId: 'test',
    isMaster: false,
  },
};

/**
 * High-speed configuration at 115200 baud
 */
export const HighSpeed: Story = {
  args: {
    module: getSerialModule(2, 115200),
    parentTestId: 'test',
    isMaster: false,
  },
};

/**
 * Master controller configuration
 */
export const Master: Story = {
  args: {
    module: getSerialModule(2, 115200),
    parentTestId: 'test',
    isMaster: true,
  },
};
