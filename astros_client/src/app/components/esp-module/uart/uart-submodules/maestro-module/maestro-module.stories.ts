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
    module: getSerialModule(1, 9600),
  },
};

function getSerialModule(ch: number, baudRate: number): UartModule {
  const module = new UartModule(
    '1234',
    0,
    UartType.maestro,
    ch,
    baudRate,
    'Maestro',
  );

  const subModule = new MaestroModule();
  subModule.boards = [new MaestroBoard('1234', 1, '')];

  subModule.boards[0].channels = [
    getMaestroChannel(0, 'Channel 0', true, '1234', true),
    getMaestroChannel(1, 'Channel 1', true, '1234', true),
    getMaestroChannel(2, 'Channel 2', true, '1234', true),
    getMaestroChannel(3, 'Channel 3', true, '1234', true),
    getMaestroChannel(4, 'Channel 4', true, '1234', true),
    getMaestroChannel(5, 'Channel 5', true, '1234', true),
    getMaestroChannel(6, 'Channel 6', true, '1234', true),
    getMaestroChannel(7, 'Channel 7', true, '1234', true),
  ];
  module.subModule = subModule;
  return module;
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
    false,
    500,
    2500,
    1250,
    servo,
    0,
    0,
  );
}
