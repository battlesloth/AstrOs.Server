import { Meta, moduleMetadata, StoryObj } from '@storybook/angular';
import { GenericSerialModuleComponent } from './generic-serial-module.component';
import { ModuleSubType, UartModule } from 'astros-common';

const meta: Meta<GenericSerialModuleComponent> = {
  title: 'Modules/Uart/Submodules/GenericSerialModule',
  component: GenericSerialModuleComponent,
  tags: ['autodocs'],
  decorators: [
    moduleMetadata({
      imports: [],
    }),
  ],
};

export default meta;

type Story = StoryObj<GenericSerialModuleComponent>;

export const Default: Story = {
  args: {
    module: getSerialModule(1, 9600),
  },
};

export const Master: Story = {
  args: {
    module: getSerialModule(2, 9600),
    isMaster: true,
  },
};

export const Channel2: Story = {
  args: {
    module: getSerialModule(2, 9600),
  },
};

export const BaudRate115200: Story = {
  args: {
    module: getSerialModule(1, 115200),
  },
};


function getSerialModule(ch: number, baudRate: number): UartModule {
  const module = new UartModule(
    '1234',
    'Generic Serial',
    'core',
    ModuleSubType.genericSerial,
    ch,
    baudRate,
  );

  return module;
}
