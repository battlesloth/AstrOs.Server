import { type Meta, type StoryObj } from '@storybook/vue3';
import AstrosUartModule from './AstrosUartModule.vue';
import { ModuleSubType, ModuleType } from '@/models/enums';
import type { UartModule as UartModuleType } from '@/models/controllers/modules/uart/uartModule';

// Helper function to create mock UART module
function getSerialModule(
    type: ModuleSubType,
    ch: number,
    baudRate: number,
    name?: string
): UartModuleType {
    const id = crypto.randomUUID();
    const locationId = crypto.randomUUID();

    let moduleName = name || 'UART Module';

    switch (type) {
        case ModuleSubType.genericSerial:
            moduleName = name || 'Generic Serial';
            break;
        case ModuleSubType.kangaroo:
            moduleName = name || 'Kangaroo X2';
            break;
        case ModuleSubType.maestro:
            moduleName = name || 'Maestro';
            break;
        case ModuleSubType.humanCyborgRelationsSerial:
            moduleName = name || 'HCR';
            break;
    }

    return {
        idx: 11,
        id,
        name: moduleName,
        locationId,
        moduleType: ModuleType.uart,
        moduleSubType: type,
        uartChannel: ch,
        baudRate,
        subModule: {}
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
        module: getSerialModule(ModuleSubType.genericSerial, 1, 9600),
        parentTestId: 'test',
        isMaster: false
    },
    tags: ['autodocs'],
    argTypes: {
        parentTestId: {
            control: 'text',
            description: 'Test ID prefix for testing'
        },
        isMaster: {
            control: 'boolean',
            description: 'Whether this is a master controller'
        }
    }
} satisfies Meta<typeof AstrosUartModule>;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * Generic serial UART module
 */
export const GenericSerial: Story = {
    args: {
        module: getSerialModule(ModuleSubType.genericSerial, 1, 9600),
        parentTestId: 'test',
        isMaster: false
    },
};

/**
 * Kangaroo X2 motor controller module
 */
export const KangarooX2: Story = {
    args: {
        module: getSerialModule(ModuleSubType.kangaroo, 2, 115200),
        parentTestId: 'test',
        isMaster: false
    },
};

/**
 * Pololu Maestro servo controller module
 */
export const Maestro: Story = {
    args: {
        module: getSerialModule(ModuleSubType.maestro, 1, 57600),
        parentTestId: 'test',
        isMaster: false
    },
};

/**
 * Human Cyborg Relations module
 */
export const HumanCyborgRelations: Story = {
    args: {
        module: getSerialModule(ModuleSubType.humanCyborgRelationsSerial, 1, 9600),
        parentTestId: 'test',
        isMaster: false
    },
};

/**
 * Master module configuration
 */
export const MasterModule: Story = {
    args: {
        module: getSerialModule(ModuleSubType.genericSerial, 2, 9600),
        parentTestId: 'test',
        isMaster: true
    },
};

/**
 * Custom baud rate example
 */
export const CustomBaudRate: Story = {
    args: {
        module: getSerialModule(ModuleSubType.genericSerial, 1, 115200, 'High Speed Serial'),
        parentTestId: 'test',
        isMaster: false
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
                getSerialModule(ModuleSubType.genericSerial, 1, 9600, 'GPS Module'),
                getSerialModule(ModuleSubType.kangaroo, 2, 115200, 'Drive Motors'),
                getSerialModule(ModuleSubType.maestro, 3, 57600, 'Servo Controller'),
                getSerialModule(ModuleSubType.humanCyborgRelationsSerial, 0, 9600, 'Voice Module'),
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
