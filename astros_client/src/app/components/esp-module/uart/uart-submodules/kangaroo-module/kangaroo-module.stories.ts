import { Meta, moduleMetadata, StoryObj } from '@storybook/angular';
import { KangarooModuleComponent } from './kangaroo-module.component';
import { KangarooX2 as KX2, ModuleSubType, UartModule } from 'astros-common';

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
    0,
    '1234',
    'Kangaroo X2',
    'core',
    ModuleSubType.kangaroo,
    ch,
    baudRate,
  );

  module.subModule = new KX2('', 'Lifter', 'Spinner');
  return module;
}
