import {
  applicationConfig,
  Meta,
  moduleMetadata,
  StoryObj,
} from '@storybook/angular';
import { importProvidersFrom } from '@angular/core';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { MatExpansionPanel } from '@angular/material/expansion';
import { UartModuleComponent } from './uart-module.component';
import {
  KangarooX2 as KX2,
  MaestroBoard,
  MaestroChannel,
  MaestroModule,
  ModuleSubType,
  UartModule
} from 'astros-common';
import { v4 as uuid } from 'uuid';

const meta: Meta<UartModuleComponent> = {
  title: 'Modules/Uart/UartModule',
  component: UartModuleComponent,
  tags: ['autodocs'],
  decorators: [
    moduleMetadata({
      imports: [MatExpansionPanel],
    }),
    applicationConfig({
      providers: [importProvidersFrom(BrowserAnimationsModule)],
    }),
  ],
};

export default meta;

type Story = StoryObj<UartModuleComponent>;

export const GenericSerial: Story = {
  args: {
    module: getSerialModule(ModuleSubType.genericSerial, 1, 9600),
  },
};

export const KangarooX2: Story = {
  args: {
    module: getSerialModule(ModuleSubType.kangaroo, 2, 115200),
  },
};

export const Maestro: Story = {
  args: {
    module: getSerialModule(ModuleSubType.maestro, 1, 57600),
  },
};

export const HumanCyborgRelations: Story = {
  args: {
    module: getSerialModule(ModuleSubType.humanCyborgRelationsSerial, 1, 9600),
  },
};

export const MasterModule: Story = {
  args: {
    module: getSerialModule(ModuleSubType.genericSerial, 2, 9600),
    isMaster: true,
  },
};

function getSerialModule(
  type: ModuleSubType,
  ch: number,
  baudRate: number,
): UartModule {
  const module = new UartModule(
    uuid(),
    'Generic Serial',
    uuid(),
    type,
    ch,
    baudRate,
  );

  switch (type) {
    case ModuleSubType.genericSerial:
      module.name = 'Generic Serial';
      break;
    case ModuleSubType.kangaroo: {
      module.name = 'Kangaroo X2';
      module.subModule = new KX2('', 'Lifter', 'Spinner');
      break;
    }
    case ModuleSubType.maestro: {
      module.name = 'Maestro';
      const subModule = new MaestroModule();
      subModule.boards = [getMaestroBoard(module.id, 24)];
      module.subModule = subModule;
      break;
    }
    case ModuleSubType.humanCyborgRelationsSerial:
      module.name = 'Human Cyborg Relations';
      break;
  }
  return module;
}

function getMaestroBoard(parentId: string, channelCount: number): MaestroBoard {
  const board = new MaestroBoard(uuid(), parentId, 0, '', channelCount);
  
  for (let i = 0; i < 24; i++) {
    
    const idx = i + 1;
    const enabled = idx % 3 !== 0;
    const servo = (idx % 2 ===0 && idx % 3 !== 0);
    
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
