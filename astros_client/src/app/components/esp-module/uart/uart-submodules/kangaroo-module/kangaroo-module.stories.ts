import { Meta, moduleMetadata, StoryObj } from '@storybook/angular';
import { KangarooModuleComponent } from './kangaroo-module.component';
import { UartType, KangarooX2 as KX2, UartModule } from 'astros-common';

const meta: Meta<KangarooModuleComponent> = {
  title: 'Modules/Uart/Submodules/KangarooModule',
  component: KangarooModuleComponent,
  tags: ['autodocs'],
  decorators: [
    moduleMetadata({
      imports: [],
    }),
  ],
};

export default meta;

type Story = StoryObj<KangarooModuleComponent>;

export const Default: Story = {
  args: {
    module: getSerialModule(1, 9600),
  },
};

function getSerialModule(ch: number, baudRate: number): UartModule {
  const module = new UartModule(
    '1234',
    0,
    UartType.kangaroo,
    ch,
    baudRate,
    'Kangaroo X2',
  );

  module.subModule = new KX2('', 'Lifter', 'Spinner');
  return module;
}
