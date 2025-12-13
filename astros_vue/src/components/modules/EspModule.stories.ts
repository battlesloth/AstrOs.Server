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
                { id: 'gpio-1', parentId: 'parent-1', channelName: 'Channel 1', channelNumber: 1, enabled: true, defaultHigh: false },
                { id: 'gpio-2', parentId: 'parent-2', channelName: 'Channel 2', channelNumber: 2, enabled: true, defaultHigh: false },
                { id: 'gpio-3', parentId: 'parent-3', channelName: 'Channel 3', channelNumber: 3, enabled: true, defaultHigh: false }
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
        { id: 'uart-1', uartChannel: 1, baudRate: 9600, subModule: 'sub-1', idx: 1, name: 'UART Module 1', locationId: 'location-1', moduleSubType: 1 },
        { id: 'uart-2', uartChannel: 2, baudRate: 115200, subModule: 'sub-2', idx: 2, name: 'UART Module 2', locationId: 'location-1', moduleSubType: 2 }
    ];

    location.i2cModules = [
        { id: 'i2c-1', i2cAddress: 0x40, idx: 1, name: 'I2C Module 1', locationId: 'location-1', moduleSubType: 1 },
        { id: 'i2c-2', i2cAddress: 0x41, idx: 2, name: 'I2C Module 2', locationId: 'location-1', moduleSubType: 2 }
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
                { id: 'uart-1', uartChannel: 1, baudRate: 9600, subModule: 'sub-1', idx: 1, name: 'UART Module 1', locationId: 'location-1', moduleSubType: 1 },
                { id: 'uart-2', uartChannel: 2, baudRate: 115200, subModule: 'sub-2', idx: 2, name: 'UART Module 2', locationId: 'location-1', moduleSubType: 2 },
                { id: 'uart-3', uartChannel: 3, baudRate: 4800, subModule: 'sub-3', idx: 3, name: 'UART Module 3', locationId: 'location-1', moduleSubType: 3 }
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
                { id: 'i2c-1', i2cAddress: 0x40, idx: 1, name: 'I2C Module 1', locationId: 'location-1', moduleSubType: 1 },
                { id: 'i2c-2', i2cAddress: 0x41, idx: 2, name: 'I2C Module 2', locationId: 'location-1', moduleSubType: 2 },
                { id: 'i2c-3', i2cAddress: 0x70, idx: 3, name: 'I2C Module 3', locationId: 'location-1', moduleSubType: 3 }
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
            uartModules: Array.from({ length: 10 }, (_, i) => ({
                id: `uart-${i + 1}`,
                uartChannel: i + 1,
                baudRate: 9600 + i * 100,
                subModule: `sub-${i + 1}`,
                idx: i + 1,
                name: `UART Module ${i + 1}`,
                locationId: `location-${i + 1}`,
                moduleSubType: i + 1
            })),
            i2cModules: Array.from({ length: 10 }, (_, i) => ({
                id: `i2c-${i + 1}`,
                i2cAddress: 0x40 + i,
                idx: i + 1,
                name: `I2C Module ${i + 1}`,
                locationId: `location-${i + 1}`,
                moduleSubType: i + 1
            })),
            gpioModule: {
                channels: Array.from({ length: 10 }, (_, i) => ({
                    id: `gpio-${i + 1}`,
                    parentId: `parent-${i + 1}`,
                    channelName: `Channel ${i + 1}`,
                    channelNumber: i + 1,
                    enabled: true,
                    defaultHigh: false
                }))
            }
        },
        parentTestId: 'test'
    },
};
