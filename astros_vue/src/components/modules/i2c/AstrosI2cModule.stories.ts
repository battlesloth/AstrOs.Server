import { type Meta, type StoryObj } from '@storybook/vue3';
import AstrosI2cModule from './AstrosI2cModule.vue';
import { ModuleType } from '@/enums/modules/ModuleType';
import { ModuleSubType } from '@/enums/modules/ModuleSubType';
import { Location } from '@/enums';
import type { I2cModule as I2cModuleType } from '@/models/controllers/modules/i2c/i2cModule';

// Helper function to create mock I2C module
function getI2cModule(type: ModuleSubType, address: number, name?: string): I2cModuleType {
  const id = crypto.randomUUID();
  const locationId = crypto.randomUUID();

  let moduleName = name || 'I2C Module';

  switch (type) {
    case ModuleSubType.GENERIC_I2C:
      moduleName = name || 'Generic I2C Module';
      break;
    case ModuleSubType.HUMAN_CYBORG_RELATIONS_I2C:
      moduleName = name || 'Human Cyborg Relations Module';
      break;
    case ModuleSubType.PWM_BOARD:
      moduleName = name || 'PWM Board Module';
      break;
  }

  return {
    idx: 22,
    id,
    name: moduleName,
    locationId,
    i2cAddress: address,
    moduleType: ModuleType.I2C,
    moduleSubType: type,
    subModule: {},
  };
}

const meta = {
  title: 'components/modules/I2cModule',
  component: AstrosI2cModule,
  render: (args: unknown) => ({
    components: { AstrosI2cModule },
    setup() {
      return { args };
    },
    template: '<AstrosI2cModule v-bind="args" />',
  }),
  args: {
    module: getI2cModule(ModuleSubType.GENERIC_I2C, 0x40),
    locationId: Location.CORE,
    parentTestId: 'test',
  },
  tags: ['autodocs'],
  argTypes: {
    parentTestId: {
      control: 'text',
      description: 'Test ID prefix for testing',
    },
  },
} satisfies Meta<typeof AstrosI2cModule>;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * Generic I2C module configuration
 */
export const GenericI2c: Story = {
  args: {
    module: getI2cModule(ModuleSubType.GENERIC_I2C, 0x40),
    locationId: Location.CORE,
    parentTestId: 'test',
  },
};

/**
 * Human Cyborg Relations I2C module
 */
export const HumanCyborgRelations: Story = {
  args: {
    module: getI2cModule(ModuleSubType.HUMAN_CYBORG_RELATIONS_I2C, 0x41),
    locationId: Location.CORE,
    parentTestId: 'test',
  },
};

/**
 * PCA9685 PWM Board module
 */
export const PwmBoard: Story = {
  args: {
    module: getI2cModule(ModuleSubType.PWM_BOARD, 0x70),
    locationId: Location.CORE,
    parentTestId: 'test',
  },
};

/**
 * Module with custom name
 */
export const CustomName: Story = {
  args: {
    module: getI2cModule(ModuleSubType.GENERIC_I2C, 0x3c, 'OLED Display Controller'),
    locationId: Location.CORE,
    parentTestId: 'test',
  },
};

/**
 * Multiple I2C modules with different addresses
 */
export const MultipleModules: Story = {
  args: {
    locationId: Location.CORE,
  },
  render: () => ({
    components: { AstrosI2cModule },
    setup() {
      const modules = [
        getI2cModule(ModuleSubType.GENERIC_I2C, 0x40, 'Sensor Module 1'),
        getI2cModule(ModuleSubType.PWM_BOARD, 0x70, 'Servo Controller'),
        getI2cModule(ModuleSubType.HUMAN_CYBORG_RELATIONS_I2C, 0x41, 'HCR Module'),
        getI2cModule(ModuleSubType.GENERIC_I2C, 0x3c, 'OLED Display'),
      ];
      return { modules, Location };
    },
    template: `
            <div class="space-y-4 p-4">
                <AstrosI2cModule 
                    v-for="module in modules" 
                    :key="module.id"
                    :module="module"
                    :locationId="Location.CORE"
                    parent-test-id="test"
                />
            </div>
        `,
  }),
};

/**
 * Module with controlled re-rendering
 */
export const WithUpdateTrigger: Story = {
  args: {
    locationId: Location.CORE,
  },
  render: () => ({
    components: { AstrosI2cModule },
    setup() {
      const module = getI2cModule(ModuleSubType.GENERIC_I2C, 0x40);
      const counter = { value: 0 };

      const updateModule = () => {
        counter.value++;
        module.name = `Updated Module ${counter.value}`;
      };

      return { module, counter, updateModule, Location };
    },
    template: `
            <div class="space-y-4 p-4">
                <button @click="updateModule" class="btn btn-primary btn-sm">
                    Update Module Name ({{ counter.value }})
                </button>
                <AstrosI2cModule 
                    :module="module"
                    :locationId="Location.CORE"
                    parent-test-id="test"
                />
            </div>
        `,
  }),
};
