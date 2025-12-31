import { type Meta, type StoryObj } from '@storybook/vue3';
import AstrosUartModule from './AstrosUartModule.vue';
import { ModuleType } from '@/enums/modules/ModuleType';
import { ModuleSubType } from '@/enums/modules/ModuleSubType';
import type { UartModule as UartModuleType } from '@/models/controllers/modules/uart/uartModule';

// Helper function to create mock UART module
function getSerialModule(
  type: ModuleSubType,
  ch: number,
  baudRate: number,
  name?: string,
): UartModuleType {
  const id = crypto.randomUUID();
  const locationId = crypto.randomUUID();

  let moduleName = name || 'UART Module';

  switch (type) {
    case ModuleSubType.GENERIC_SERIAL:
      moduleName = name || 'Generic Serial';
      break;
    case ModuleSubType.KANGAROO:
      moduleName = name || 'Kangaroo X2';
      break;
    case ModuleSubType.MAESTRO:
      moduleName = name || 'Maestro';
      break;
    case ModuleSubType.HUMAN_CYBORG_RELATIONS_SERIAL:
      moduleName = name || 'HCR';
      break;
  }

  return {
    idx: 11,
    id,
    name: moduleName,
    locationId,
    moduleType: ModuleType.UART,
    moduleSubType: type,
    uartChannel: ch,
    baudRate,
    subModule: {},
  };
}

const meta = {
  title: 'components/modules/UartModule',
  component: AstrosUartModule,
  render: (args: unknown) => ({
    components: { AstrosUartModule },
    setup() {
      return { args };
    },
    template: '<AstrosUartModule v-bind="args" />',
  }),
  args: {
    module: getSerialModule(ModuleSubType.GENERIC_SERIAL, 1, 9600),
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
} satisfies Meta<typeof AstrosUartModule>;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * Generic serial UART module
 */
export const GenericSerial: Story = {
  args: {
    module: getSerialModule(ModuleSubType.GENERIC_SERIAL, 1, 9600),
    parentTestId: 'test',
    isMaster: false,
  },
};

/**
 * Kangaroo X2 motor controller module
 */
export const KangarooX2: Story = {
  args: {
    module: getSerialModule(ModuleSubType.KANGAROO, 2, 115200),
    parentTestId: 'test',
    isMaster: false,
  },
};

/**
 * Pololu Maestro servo controller module
 */
export const Maestro: Story = {
  args: {
    module: getSerialModule(ModuleSubType.MAESTRO, 1, 57600),
    parentTestId: 'test',
    isMaster: false,
  },
};

/**
 * Human Cyborg Relations module
 */
export const HumanCyborgRelations: Story = {
  args: {
    module: getSerialModule(ModuleSubType.HUMAN_CYBORG_RELATIONS_SERIAL, 1, 9600),
    parentTestId: 'test',
    isMaster: false,
  },
};

/**
 * Master module configuration
 */
export const MasterModule: Story = {
  args: {
    module: getSerialModule(ModuleSubType.GENERIC_SERIAL, 2, 9600),
    parentTestId: 'test',
    isMaster: true,
  },
};

/**
 * Custom baud rate example
 */
export const CustomBaudRate: Story = {
  args: {
    module: getSerialModule(ModuleSubType.GENERIC_SERIAL, 1, 115200, 'High Speed Serial'),
    parentTestId: 'test',
    isMaster: false,
  },
};

/**
 * Multiple UART modules
 */
export const MultipleModules: Story = {
  render: () => ({
    components: { AstrosUartModule },
    setup() {
      const modules = [
        getSerialModule(ModuleSubType.GENERIC_SERIAL, 1, 9600, 'GPS Module'),
        getSerialModule(ModuleSubType.KANGAROO, 2, 115200, 'Drive Motors'),
        getSerialModule(ModuleSubType.MAESTRO, 3, 57600, 'Servo Controller'),
        getSerialModule(ModuleSubType.HUMAN_CYBORG_RELATIONS_SERIAL, 0, 9600, 'Voice Module'),
      ];
      return { modules };
    },
    template: `
            <div class="space-y-4 p-4">
                <AstrosUartModule 
                    v-for="module in modules" 
                    :key="module.id"
                    :module="module"
                    parent-test-id="test"
                />
            </div>
        `,
  }),
};
