import { type Meta, type StoryObj } from '@storybook/vue3';
import AstrosGenericSerialModule from './AstrosGenericSerialModule.vue';
import { ModuleType } from '@/enums/modules/ModuleType';
import { ModuleSubType } from '@/enums/modules/ModuleSubType';
import type { UartModule } from '@/models/controllers/modules/uart/uartModule';

// Helper function to create mock UART module
function getSerialModule(ch: number, baudRate: number): UartModule {
  return {
    idx: 0,
    id: '1234',
    name: 'Generic Serial',
    locationId: 'core',
    moduleType: ModuleType.UART,
    moduleSubType: ModuleSubType.GENERIC_SERIAL,
    uartChannel: ch,
    baudRate,
    subModule: {},
  };
}

const meta = {
  title: 'components/modules/uart/submodules/GenericSerialModule',
  component: AstrosGenericSerialModule,
  render: (args: unknown) => ({
    components: { AstrosGenericSerialModule },
    setup() {
      return { args };
    },
    template: '<AstrosGenericSerialModule v-bind="args" />',
  }),
  args: {
    module: getSerialModule(1, 9600),
    parentTestId: 'test',
    isMaster: false,
  },
  tags: ['autodocs'],
  argTypes: {
    parentTestId: {
      control: 'text',
      description: 'Test ID prefix for testing',
    },
    isMaster: {
      control: 'boolean',
      description: 'Whether this is a master controller',
    },
  },
} satisfies Meta<typeof AstrosGenericSerialModule>;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * Default generic serial module configuration
 */
export const Default: Story = {
  args: {
    module: getSerialModule(1, 9600),
    parentTestId: 'test',
    isMaster: false,
  },
};

/**
 * Master controller - only shows channel 2
 */
export const Master: Story = {
  args: {
    module: getSerialModule(2, 9600),
    parentTestId: 'test',
    isMaster: true,
  },
};

/**
 * Channel 2 configuration
 */
export const Channel2: Story = {
  args: {
    module: getSerialModule(2, 9600),
    parentTestId: 'test',
    isMaster: false,
  },
};

/**
 * High-speed serial at 115200 baud
 */
export const BaudRate115200: Story = {
  args: {
    module: getSerialModule(1, 115200),
    parentTestId: 'test',
    isMaster: false,
  },
};

/**
 * 57600 baud configuration
 */
export const BaudRate57600: Story = {
  args: {
    module: getSerialModule(2, 57600),
    parentTestId: 'test',
    isMaster: false,
  },
};

/**
 * Interactive example showing configuration changes
 */
export const Interactive: Story = {
  render: () => ({
    components: { AstrosGenericSerialModule },
    setup() {
      const module = getSerialModule(1, 9600);

      return { module };
    },
    template: `
            <div class="space-y-4 p-4">
                <div class="bg-base-200 p-4 rounded">
                    <GenericSerialModule 
                        :module="module"
                        parent-test-id="test"
                        :is-master="false"
                    />
                </div>
                <div class="bg-info text-info-content p-4 rounded">
                    <h3 class="font-bold mb-2">Current Configuration:</h3>
                    <ul class="space-y-1 text-sm">
                        <li>UART Channel: {{ module.uartChannel }}</li>
                        <li>Baud Rate: {{ module.baudRate }}</li>
                    </ul>
                </div>
            </div>
        `,
  }),
};
