import { Meta, moduleMetadata, StoryObj } from '@storybook/angular';
import { MaestroModuleComponent } from './maestro-module.component';
import {
  MaestroBoard,
  MaestroChannel,
  MaestroModule,
  ModuleSubType,
  UartModule,
} from 'astros-common';
import { v4 as uuid } from 'uuid';

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

function getSerialModule(
  ch: number,
  baudRate: number,
  channelCount: number,
): UartModule {
  const module = new UartModule(
    11,
    '1234',
    'Maestro',
    'core',
    ModuleSubType.maestro,
    ch,
    baudRate,
  );

  const subModule = new MaestroModule();
  subModule.boards[0] = getMaestroBoard(module.id, channelCount);
  module.subModule = subModule;

  console.log('sub', subModule);
  return module;
}

function getMaestroBoard(parentId: string, channelCount: number): MaestroBoard {
  const board = new MaestroBoard('1234', parentId, 0, '', channelCount);

  for (let i = 0; i < 24; i++) {
    const idx = i + 1;
    const enabled = idx % 3 !== 0;
    const servo = idx % 2 === 0 && idx % 3 !== 0;

    board.channels.push(
      getMaestroChannel(board.id, idx, `Channel ${i + idx}`, enabled, servo),
    );
  }
  return board;
}

function getMaestroChannel(
  parentId: string,
  channel: number,
  name: string,
  enabled: boolean,
  servo: boolean,
): MaestroChannel {
  return new MaestroChannel(
    uuid(),
    parentId,
    name,
    enabled,
    channel,
    servo,
    500,
    2500,
    1250,
    false,
  );
}
