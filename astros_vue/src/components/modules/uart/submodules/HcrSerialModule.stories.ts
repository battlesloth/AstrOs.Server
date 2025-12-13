import { type Meta, type StoryObj } from '@storybook/vue3';
import HcrSerialModule from './HcrSerialModule.vue';
import { ModuleSubType, ModuleType } from '@/models/enums';
import type { UartModule } from '@/models/controllers/modules/uart/uartModule';

// Helper function to create mock UART module
function getSerialModule(ch: number, baudRate: number): UartModule {
    return {
        idx: 0,
        id: '1234',
        name: 'HCR Serial',
        locationId: 'core',
        moduleType: ModuleType.uart,
        moduleSubType: ModuleSubType.humanCyborgRelationsSerial,
        uartChannel: ch,
        baudRate,
        subModule: {}
    };
}

const meta = {
    title: 'components/modules/uart/submodules/HcrSerialModule',
    component: HcrSerialModule,
    render: (args: unknown) => ({
        components: { HcrSerialModule },
        setup() {
            return { args };
        },
        template: '<HcrSerialModule v-bind="args" />',
    }),
    args: {
        module: getSerialModule(1, 9600),
        parentTestId: 'test',
        isMaster: false
    },
    tags: ['autodocs']
} satisfies Meta<typeof HcrSerialModule>;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * Default HCR Serial configuration
 */
export const Default: Story = {
    args: {
        module: getSerialModule(1, 9600),
        parentTestId: 'test',
        isMaster: false
    },
};

/**
 * Channel 2 configuration
 */
export const Channel2: Story = {
    args: {
        module: getSerialModule(2, 9600),
        parentTestId: 'test',
        isMaster: false
    },
};

/**
 * Master controller configuration
 */
export const Master: Story = {
    args: {
        module: getSerialModule(2, 9600),
        parentTestId: 'test',
        isMaster: true
    },
};
