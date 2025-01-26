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
  MaestroModule,
  UartModule,
  UartType,
} from 'astros-common';

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
    module: getSerialModule(UartType.genericSerial, 1, 9600),
  },
};

export const KangarooX2: Story = {
  args: {
    module: getSerialModule(UartType.kangaroo, 2, 115200),
  },
};

export const Maestro: Story = {
  args: {
    module: getSerialModule(UartType.maestro, 1, 57600),
  },
};

export const MasterModule: Story = {
  args: {
    module: getSerialModule(UartType.genericSerial, 2, 9600),
    isMaster: true,
  },
};

function getSerialModule(
  type: UartType,
  ch: number,
  baudRate: number,
): UartModule {
  const module = new UartModule(
    '1234',
    0,
    type,
    ch,
    baudRate,
    'Generic Serial',
  );

  switch (type) {
    case UartType.genericSerial:
      module.name = 'Generic Serial';
      break;
    case UartType.kangaroo: {
      module.name = 'Kangaroo X2';
      module.subModule = new KX2('', 'Lifter', 'Spinner');
      break;
    }
    case UartType.maestro: {
      module.name = 'Maestro';
      const subModule = new MaestroModule();
      subModule.boards = [new MaestroBoard('1234', 1, '')];
      module.subModule = subModule;
      break;
    }
  }
  return module;
}
