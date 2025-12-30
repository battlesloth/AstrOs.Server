import { type Meta, type StoryObj } from '@storybook/vue3';
import AstrosPca9685Module from './AstrosPca9685Module.vue';
import { ModuleType } from '@/enums/modules/ModuleType';
import { ModuleSubType } from '@/enums/modules/ModuleSubType';
import type { I2cModule } from '@/models/controllers/modules/i2c/i2cModule';

// Helper function to create mock I2C module
function getModule(i2cAddress: number): I2cModule {
  const id = crypto.randomUUID();
  const locationId = crypto.randomUUID();

  return {
    idx: 22,
    id,
    name: 'PCA9685',
    locationId,
    i2cAddress,
    moduleType: ModuleType.i2c,
    moduleSubType: ModuleSubType.pwmBoard,
    subModule: {},
  };
}

const meta = {
  title: 'components/modules/i2c/submodules/Pca9685Module',
  component: AstrosPca9685Module,
  render: (args: unknown) => ({
    components: { AstrosPca9685Module },
    setup() {
      return { args };
    },
    template: '<AstrosPca9685Module v-bind="args" />',
  }),
  args: {
    module: getModule(1),
    parentTestId: 'test',
  },
  tags: ['autodocs'],
  argTypes: {
    parentTestId: {
      control: 'text',
      description: 'Test ID prefix for testing',
    },
  },
} satisfies Meta<typeof AstrosPca9685Module>;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * Default PCA9685 module with address 1
 */
export const Default: Story = {
  args: {
    module: getModule(1),
    parentTestId: 'test',
  },
};

/**
 * PCA9685 module with standard address 0x40 (64)
 */
export const StandardAddress: Story = {
  args: {
    module: getModule(64),
    parentTestId: 'test',
  },
};

/**
 * PCA9685 module with address 0x70 (112) - typical for multiplexed boards
 */
export const MultiplexedAddress: Story = {
  args: {
    module: getModule(112),
    parentTestId: 'test',
  },
};

/**
 * Interactive example with address change handling
 */
export const Interactive: Story = {
  render: () => ({
    components: { AstrosPca9685Module },
    setup() {
      const module = getModule(64);
      const lastChangedAddress = { value: '' };

      const handleAddressChange = (addr: string) => {
        lastChangedAddress.value = addr;
        console.log('I2C Address changed to:', addr);
      };

      return { module, lastChangedAddress, handleAddressChange };
    },
    template: `
            <div class="space-y-4 p-4">
                <AstrosPca9685Module 
                    :module="module"
                    parent-test-id="test"
                    @i2c-address-changed="handleAddressChange"
                />
                <div v-if="lastChangedAddress.value" class="alert alert-info">
                    <span>PCA9685 Address changed to: {{ lastChangedAddress.value }}</span>
                </div>
            </div>
        `,
  }),
};
