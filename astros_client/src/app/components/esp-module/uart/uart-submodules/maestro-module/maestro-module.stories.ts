import { Meta, moduleMetadata, StoryObj } from '@storybook/angular';
import { MaestroModuleComponent } from './maestro-module.component';
import {
  MaestroBoard,
  MaestroChannel,
  MaestroModule,
  UartModule,
  UartType,
} from 'astros-common';

const meta: Meta<MaestroModuleComponent> = {
  title: 'Modules/Uart/Submodules/MaestroModule',
  component: MaestroModuleComponent,
  decorators: [
    moduleMetadata({
      imports: [],
    }),
  ],
};

export default meta;

type Story = StoryObj<MaestroModuleComponent>;

export const Default: Story = {
  args: {
    module: getSerialModule(1, 9600, 24),
  },
};

export const With18Channels: Story = {
  args: {
    module: getSerialModule(1, 9600, 18),
  },
};

export const With12Channels: Story = {
  args: {
    module: getSerialModule(1, 9600, 12),
  },
};

export const With6Channels: Story = {
  args: {
    module: getSerialModule(1, 9600, 6),
  },
};

function getSerialModule(ch: number, baudRate: number, channelCount: number): UartModule {
  const module = new UartModule(
    '1234',
    'Maestro',
    'core',
    UartType.maestro,
    ch,
    baudRate,
  );

  const subModule = new MaestroModule();
  subModule.boards[0] = getMaestroBoard(channelCount);
  module.subModule = subModule;

  console.log('sub',subModule)
  return module;
}

function getMaestroBoard(channelCount: number): MaestroBoard {
  const board = new MaestroBoard('1234', 0, '', channelCount);
  
  for (let i = 0; i < 24; i++) {
    
    const idx = i + 1;
    const enabled = idx % 3 !== 0;
    const servo = (idx % 2 ===0 && idx % 3 !== 0);
    
    board.channels.push(
      getMaestroChannel(idx, `Channel ${i + idx}`, enabled, '1234', servo),
    );
  }
  return board;
}
function getMaestroChannel(
  channel: number,
  name: string,
  enabled: boolean,
  boardId: string,
  servo: boolean,
): MaestroChannel {
  return new MaestroChannel(
    channel,
    name,
    enabled,
    boardId,
    servo,
    500,
    2500,
    1250,
    false,
    0,
    0,
  );
}
