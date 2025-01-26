import { Meta, moduleMetadata, StoryObj } from '@storybook/angular';
import { GenericSerialModuleComponent } from './generic-serial-module.component';
import { UartModule, UartType } from 'astros-common';

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

function getSerialModule(ch: number, baudRate: number): UartModule {
  const module = new UartModule(
    '1234',
    0,
    UartType.genericSerial,
    ch,
    baudRate,
    'Generic Serial',
  );

  return module;
}
