import { Meta, moduleMetadata, StoryObj } from '@storybook/angular';
import { HcrSerialModuleComponent } from './hcr-serial-module.component';
import { ModuleSubType, UartModule } from 'astros-common';

const meta: Meta<HcrSerialModuleComponent> = {
  title: 'Modules/Uart/Submodules/HcrSerialModule',
  component: HcrSerialModuleComponent,
  tags: ['autodocs'],
  decorators: [
    moduleMetadata({
      imports: [],
    }),
  ],
};

export default meta;

type Story = StoryObj<HcrSerialModuleComponent>;

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
    0,
    '1234',
    'Generic Serial',
    'core',
    ModuleSubType.humanCyborgRelationsSerial,
    ch,
    baudRate,
  );

  return module;
}
