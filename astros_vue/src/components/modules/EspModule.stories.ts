import { type Meta, type StoryObj } from '@storybook/vue3';
import EspModule from './EspModule.vue';
import type { ControllerLocation } from '@/models/module.types';

// Helper function to create mock controller location
function getControllerLocation(): ControllerLocation {
    const id = crypto.randomUUID();
    
    return {
        id: id,
        locationName: 'core',
        description: 'Test Location',
        configFingerprint: 'fingerprint',
        controller: {
            address: '192.168.1.100',
            name: 'Core Controller'
        },
        gpioModule: {
            channels: [
                { id: 'gpio-1' },
                { id: 'gpio-2' },
                { id: 'gpio-3' }
            ]
        },
        i2cModules: [],
        uartModules: []
    };
}

// Helper function to create location with modules
function getControllerLocationWithModules(): ControllerLocation {
    const location = getControllerLocation();
    
    location.uartModules = [
        { id: 'uart-1' },
        { id: 'uart-2' }
    ];
    
    location.i2cModules = [
        { id: 'i2c-1', i2cAddress: 0x40 },
        { id: 'i2c-2', i2cAddress: 0x41 }
    ];
    
    return location;
}

const meta = {
    title: 'components/modules/EspModule',
    component: EspModule,
    render: (args: unknown) => ({
        components: { EspModule },
        setup() {
            return { args };
        },
        template: '<EspModule v-bind="args" />',
    }),
    args: {
        isMaster: false,
        location: getControllerLocation(),
        parentTestId: 'test'
    },
    tags: ['autodocs'],
    argTypes: {
        isMaster: {
            control: 'boolean',
            description: 'Whether this is a master controller'
        },
        parentTestId: {
            control: 'text',
            description: 'Test ID prefix for testing'
        }
    }
} satisfies Meta<typeof EspModule>;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * Default state with empty modules
 */
export const Default: Story = {
    args: {
        isMaster: false,
        location: getControllerLocation(),
        parentTestId: 'test'
    },
};

/**
 * Controller location with multiple UART and I2C modules configured
 */
export const WithModules: Story = {
    args: {
        isMaster: false,
        location: getControllerLocationWithModules(),
        parentTestId: 'test'
    },
};

/**
 * Master controller configuration
 */
export const MasterController: Story = {
    args: {
        isMaster: true,
        location: getControllerLocationWithModules(),
        parentTestId: 'test'
    },
};

/**
 * Location with only UART modules
 */
export const OnlyUartModules: Story = {
    args: {
        isMaster: false,
        location: {
            ...getControllerLocation(),
            uartModules: [
                { id: 'uart-1' },
                { id: 'uart-2' },
                { id: 'uart-3' }
            ]
        },
        parentTestId: 'test'
    },
};

/**
 * Location with only I2C modules
 */
export const OnlyI2cModules: Story = {
    args: {
        isMaster: false,
        location: {
            ...getControllerLocation(),
            i2cModules: [
                { id: 'i2c-1', i2cAddress: 0x40 },
                { id: 'i2c-2', i2cAddress: 0x41 },
                { id: 'i2c-3', i2cAddress: 0x70 }
            ]
        },
        parentTestId: 'test'
    },
};

/**
 * Location with many modules to test scrolling
 */
export const ManyModules: Story = {
    args: {
        isMaster: false,
        location: {
            ...getControllerLocation(),
            uartModules: Array.from({ length: 10 }, (_, i) => ({ id: `uart-${i + 1}` })),
            i2cModules: Array.from({ length: 10 }, (_, i) => ({ 
                id: `i2c-${i + 1}`, 
                i2cAddress: 0x40 + i 
            })),
            gpioModule: {
                channels: Array.from({ length: 10 }, (_, i) => ({ id: `gpio-${i + 1}` }))
            }
        },
        parentTestId: 'test'
    },
};
