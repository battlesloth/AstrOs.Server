import { type Meta, type StoryObj } from '@storybook/vue3';
import AstrosI2cModule from './AstrosI2cModule.vue';
import { ModuleType } from "@/enums/modules/ModuleType";
import { ModuleSubType } from "@/enums/modules/ModuleSubType";
import type { I2cModule as I2cModuleType } from '@/models/controllers/modules/i2c/i2cModule';

// Helper function to create mock I2C module
function getI2cModule(type: ModuleSubType, address: number, name?: string): I2cModuleType {
  const id = crypto.randomUUID();
  const locationId = crypto.randomUUID();

  let moduleName = name || 'I2C Module';

  switch (type) {
    case ModuleSubType.genericI2C:
      moduleName = name || 'Generic I2C Module';
      break;
    case ModuleSubType.humanCyborgRelationsI2C:
      moduleName = name || 'Human Cyborg Relations Module';
      break;
    case ModuleSubType.pwmBoard:
      moduleName = name || 'PWM Board Module';
      break;
  }

  return {
    idx: 22,
    id,
    name: moduleName,
    locationId,
    i2cAddress: address,
    moduleType: ModuleType.i2c,
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
    module: getI2cModule(ModuleSubType.genericI2C, 0x40),
    parentTestId: 'test',
    updateTrigger: 0,
  },
  tags: ['autodocs'],
  argTypes: {
    parentTestId: {
      control: 'text',
      description: 'Test ID prefix for testing',
    },
    updateTrigger: {
      control: 'number',
      description: 'Trigger to force re-render when module properties change',
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
    module: getI2cModule(ModuleSubType.genericI2C, 0x40),
    parentTestId: 'test',
  },
};

/**
 * Human Cyborg Relations I2C module
 */
export const HumanCyborgRelations: Story = {
  args: {
    module: getI2cModule(ModuleSubType.humanCyborgRelationsI2C, 0x41),
    parentTestId: 'test',
  },
};

/**
 * PCA9685 PWM Board module
 */
export const PwmBoard: Story = {
  args: {
    module: getI2cModule(ModuleSubType.pwmBoard, 0x70),
    parentTestId: 'test',
  },
};

/**
 * Module with custom name
 */
export const CustomName: Story = {
  args: {
    module: getI2cModule(ModuleSubType.genericI2C, 0x3c, 'OLED Display Controller'),
    parentTestId: 'test',
  },
};

/**
 * Multiple I2C modules with different addresses
 */
export const MultipleModules: Story = {
  render: () => ({
    components: { AstrosI2cModule },
    setup() {
      const modules = [
        getI2cModule(ModuleSubType.genericI2C, 0x40, 'Sensor Module 1'),
        getI2cModule(ModuleSubType.pwmBoard, 0x70, 'Servo Controller'),
        getI2cModule(ModuleSubType.humanCyborgRelationsI2C, 0x41, 'HCR Module'),
        getI2cModule(ModuleSubType.genericI2C, 0x3c, 'OLED Display'),
      ];
      return { modules };
    },
    template: `
            <div class="space-y-4 p-4">
                <AstrosI2cModule 
                    v-for="module in modules" 
                    :key="module.id"
                    :module="module"
                    parent-test-id="test"
                />
            </div>
        `,
  }),
};

/**
 * Module with update trigger demonstration
 */
export const WithUpdateTrigger: Story = {
  render: () => ({
    components: { AstrosI2cModule },
    setup() {
      const module = getI2cModule(ModuleSubType.genericI2C, 0x40);
      const updateTrigger = { value: 0 };

      const triggerUpdate = () => {
        updateTrigger.value++;
      };

      return { module, updateTrigger, triggerUpdate };
    },
    template: `
            <div class="space-y-4 p-4">
                <button @click="triggerUpdate" class="btn btn-primary btn-sm">
                    Trigger Update ({{ updateTrigger.value }})
                </button>
                <AstrosI2cModule 
                    :module="module"
                    :update-trigger="updateTrigger.value"
                    parent-test-id="test"
                />
            </div>
        `,
  }),
};
