import { type Meta, type StoryObj } from '@storybook/vue3';
import { createPinia } from 'pinia';
import AstrosEspModule from './AstrosEspModule.vue';
import type { ControllerLocation } from '@/models/controllers/controllerLocation';
import { Location } from '@/enums/modules/Location';
import { ModuleType } from "@/enums/modules/ModuleType";
import { ModuleSubType } from "@/enums/modules/ModuleSubType";
import { useLocationStore } from '@/stores/location';

// Helper function to create mock controller location
function getControllerLocation(): ControllerLocation {
  const id = crypto.randomUUID();

  return {
    id: id,
    locationName: 'core',
    description: 'Test Location',
    configFingerprint: 'fingerprint',
    controller: {
      id: 'controller-1',
      fingerprint: 'controller-fingerprint',
      address: '192.168.1.100',
      name: 'Core Controller',
    },
    gpioModule: {
      id: 'gpio-module-1',
      idx: 1,
      name: 'GPIO Module 1',
      locationId: 'location-1',
      moduleType: ModuleType.gpio,
      moduleSubType: ModuleSubType.genericGpio,
      channels: [
        {
          id: 'gpio-1',
          parentId: 'parent-1',
          channelName: 'Channel 1',
          channelNumber: 1,
          enabled: true,
          defaultHigh: false,
          moduleType: ModuleType.gpio,
          moduleSubType: ModuleSubType.genericGpio,
        },
        {
          id: 'gpio-2',
          parentId: 'parent-2',
          channelName: 'Channel 2',
          channelNumber: 2,
          enabled: true,
          defaultHigh: false,
          moduleType: ModuleType.gpio,
          moduleSubType: ModuleSubType.genericGpio,
        },
        {
          id: 'gpio-3',
          parentId: 'parent-3',
          channelName: 'Channel 3',
          channelNumber: 3,
          enabled: true,
          defaultHigh: false,
          moduleType: ModuleType.gpio,
          moduleSubType: ModuleSubType.genericGpio,
        },
      ],
    },
    i2cModules: [],
    uartModules: [],
  };
}

// Helper function to create location with modules
function getControllerLocationWithModules(): ControllerLocation {
  const location = getControllerLocation();

  location.uartModules = [
    {
      id: 'uart-1',
      uartChannel: 1,
      baudRate: 9600,
      subModule: 'sub-1',
      idx: 1,
      name: 'UART Module 1',
      locationId: 'location-1',
      moduleType: ModuleType.uart,
      moduleSubType: ModuleSubType.genericSerial,
    },
    {
      id: 'uart-2',
      uartChannel: 2,
      baudRate: 115200,
      subModule: 'sub-2',
      idx: 2,
      name: 'UART Module 2',
      locationId: 'location-1',
      moduleType: ModuleType.uart,
      moduleSubType: ModuleSubType.kangaroo,
    },
  ];

  location.i2cModules = [
    {
      id: 'i2c-1',
      i2cAddress: 0x40,
      idx: 1,
      name: 'I2C Module 1',
      locationId: 'location-1',
      moduleType: ModuleType.i2c,
      moduleSubType: ModuleSubType.genericI2C,
      subModule: null,
    },
    {
      id: 'i2c-2',
      i2cAddress: 0x41,
      idx: 2,
      name: 'I2C Module 2',
      locationId: 'location-1',
      moduleType: ModuleType.i2c,
      moduleSubType: ModuleSubType.genericI2C,
      subModule: null,
    },
  ];

  return location;
}

const meta = {
  title: 'components/modules/EspModule',
  component: AstrosEspModule,
  render: (args: any) => ({
    components: { AstrosEspModule },
    setup() {
      const pinia = createPinia();
      const locationStore = useLocationStore(pinia);

      // Set the location in the store from the story context
      if ((args as any)._location && (args as any)._locationEnum) {
        locationStore.setLocation((args as any)._locationEnum, (args as any)._location);
      }

      return { args, pinia };
    },
    template: '<AstrosEspModule v-bind="args" />',
  }),
  args: {
    isMaster: false,
    locationEnum: Location.core,
    parentTestId: 'test',
  },
  tags: ['autodocs'],
  argTypes: {
    isMaster: {
      control: 'boolean',
      description: 'Whether this is a master controller',
    },
    locationEnum: {
      control: 'select',
      options: [Location.core, Location.dome, Location.body],
      description: 'Location enum (core, dome, or body)',
    },
    parentTestId: {
      control: 'text',
      description: 'Test ID prefix for testing',
    },
  },
} satisfies Meta<typeof AstrosEspModule>;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * Default state with empty modules
 */
export const Default: Story = {
  args: {
    isMaster: false,
    locationEnum: Location.core,
    parentTestId: 'test',
    _location: getControllerLocation(),
    _locationEnum: Location.core,
  } as any,
};

/**
 * Controller location with multiple UART and I2C modules configured
 */
export const WithModules: Story = {
  args: {
    isMaster: false,
    locationEnum: Location.core,
    parentTestId: 'test',
    _location: getControllerLocationWithModules(),
    _locationEnum: Location.core,
  } as any,
};

/**
 * Master controller configuration
 */
export const MasterController: Story = {
  args: {
    isMaster: true,
    locationEnum: Location.dome,
    parentTestId: 'test',
    _location: getControllerLocationWithModules(),
    _locationEnum: Location.dome,
  } as any,
};

/**
 * Location with only UART modules
 */
export const OnlyUartModules: Story = {
  args: {
    isMaster: false,
    locationEnum: Location.body,
    parentTestId: 'test',
    _location: {
      ...getControllerLocation(),
      uartModules: [
        {
          id: 'uart-1',
          uartChannel: 1,
          baudRate: 9600,
          subModule: 'sub-1',
          idx: 1,
          name: 'UART Module 1',
          locationId: 'location-1',
          moduleSubType: 1,
        },
        {
          id: 'uart-2',
          uartChannel: 2,
          baudRate: 115200,
          subModule: 'sub-2',
          idx: 2,
          name: 'UART Module 2',
          locationId: 'location-1',
          moduleSubType: 2,
        },
        {
          id: 'uart-3',
          uartChannel: 3,
          baudRate: 4800,
          subModule: 'sub-3',
          idx: 3,
          name: 'UART Module 3',
          locationId: 'location-1',
          moduleSubType: 3,
        },
      ],
    },
    _locationEnum: Location.body,
  } as any,
};

/**
 * Location with only I2C modules
 */
export const OnlyI2cModules: Story = {
  args: {
    isMaster: false,
    locationEnum: Location.core,
    parentTestId: 'test',
    _location: {
      ...getControllerLocation(),
      i2cModules: [
        {
          id: 'i2c-1',
          i2cAddress: 0x40,
          idx: 1,
          name: 'I2C Module 1',
          locationId: 'location-1',
          moduleSubType: 1,
        },
        {
          id: 'i2c-2',
          i2cAddress: 0x41,
          idx: 2,
          name: 'I2C Module 2',
          locationId: 'location-1',
          moduleSubType: 2,
        },
        {
          id: 'i2c-3',
          i2cAddress: 0x70,
          idx: 3,
          name: 'I2C Module 3',
          locationId: 'location-1',
          moduleSubType: 3,
        },
      ],
    },
    _locationEnum: Location.core,
  } as any,
};

/**
 * Location with many modules to test scrolling
 */
export const ManyModules: Story = {
  args: {
    isMaster: false,
    locationEnum: Location.dome,
    parentTestId: 'test',
    _location: {
      ...getControllerLocation(),
      uartModules: Array.from({ length: 10 }, (_, i) => ({
        id: `uart-${i + 1}`,
        uartChannel: i + 1,
        baudRate: 9600 + i * 100,
        subModule: `sub-${i + 1}`,
        idx: i + 1,
        name: `UART Module ${i + 1}`,
        locationId: `location-${i + 1}`,
        moduleSubType: i + 1,
      })),
      i2cModules: Array.from({ length: 10 }, (_, i) => ({
        id: `i2c-${i + 1}`,
        i2cAddress: 0x40 + i,
        idx: i + 1,
        name: `I2C Module ${i + 1}`,
        locationId: `location-${i + 1}`,
        moduleSubType: i + 1,
      })),
      gpioModule: {
        channels: Array.from({ length: 10 }, (_, i) => ({
          id: `gpio-${i + 1}`,
          parentId: `parent-${i + 1}`,
          channelName: `Channel ${i + 1}`,
          channelNumber: i + 1,
          enabled: true,
          defaultHigh: false,
        })),
      },
    },
    _locationEnum: Location.dome,
  } as any,
};
