import { type Meta, type StoryObj } from '@storybook/vue3';
import GenericI2cModule from './GenericI2cModule.vue';
import { ModuleSubType, ModuleType } from '@/models/enums';
import type { I2cModule } from '@/models/controllers/modules/i2c/i2cModule';

// Helper function to create mock I2C module
function getModule(i2cAddress: number): I2cModule {
    const id = crypto.randomUUID();
    const locationId = crypto.randomUUID();

    return {
        idx: 22,
        id,
        name: 'Generic I2C',
        locationId,
        i2cAddress,
        moduleType: ModuleType.i2c,
        moduleSubType: ModuleSubType.genericI2C,
        subModule: {}
    };
}

const meta = {
    title: 'components/modules/i2c/submodules/GenericI2cModule',
    component: GenericI2cModule,
    render: (args: unknown) => ({
        components: { GenericI2cModule },
        setup() {
            return { args };
        },
        template: '<GenericI2cModule v-bind="args" />',
    }),
    args: {
        module: getModule(1),
        parentTestId: 'test'
    },
    tags: ['autodocs'],
    argTypes: {
        parentTestId: {
            control: 'text',
            description: 'Test ID prefix for testing'
        }
    }
} satisfies Meta<typeof GenericI2cModule>;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * Default generic I2C module with address 1
 */
export const Default: Story = {
    args: {
        module: getModule(1),
        parentTestId: 'test'
    },
};

/**
 * Generic I2C module with standard address 0x40 (64)
 */
export const StandardAddress: Story = {
    args: {
        module: getModule(64),
        parentTestId: 'test'
    },
};

/**
 * Generic I2C module with high address 0x70 (112)
 */
export const HighAddress: Story = {
    args: {
        module: getModule(112),
        parentTestId: 'test'
    },
};

/**
 * Interactive example with address change handling
 */
export const Interactive: Story = {
    render: () => ({
        components: { GenericI2cModule },
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
                <GenericI2cModule 
                    :module="module"
                    parent-test-id="test"
                    @i2c-address-changed="handleAddressChange"
                />
                <div v-if="lastChangedAddress.value" class="alert alert-info">
                    <span>Address changed to: {{ lastChangedAddress.value }}</span>
                </div>
            </div>
        `,
    }),
};
