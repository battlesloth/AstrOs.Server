import {
  applicationConfig,
  Meta,
  moduleMetadata,
  StoryObj,
} from '@storybook/angular';
import { ScriptRowComponent } from './script-row.component';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import {
  GpioChannel,
  I2cChannel,
  KangarooX2Channel,
  MaestroChannel,
  ModuleChannelType,
  ModuleChannelTypes,
  ModuleSubType,
  ScriptChannel,
  ScriptChannelType,
} from 'astros-common';
import { v4 as uuid } from 'uuid';
import { UartChannel } from 'astros-common';
import { NgFor, NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ChannelDetails } from '@src/models/scripting';

const meta: Meta<ScriptRowComponent> = {
  title: 'Scripting/ScriptRow',
  component: ScriptRowComponent,
  tags: ['autodocs'],
  decorators: [
    moduleMetadata({
      imports: [FontAwesomeModule, FormsModule, NgIf, NgFor],
    }),
    applicationConfig({
      providers: [],
    }),
  ],
};

export default meta;

type Story = StoryObj<ScriptRowComponent>;

export const Default: Story = {
  args: generateArgs(ModuleSubType.genericSerial),
};

export const MaestroServo: Story = {
  args: generateArgs(ModuleSubType.maestro, true),
};

export const MaestroGpio: Story = {
  args: generateArgs(ModuleSubType.maestro),
};

export const Kangaroo: Story = {
  args: generateArgs(ModuleSubType.kangaroo),
};

export const HumanCyborgRelations: Story = {
  args: generateArgs(ModuleSubType.humanCyborgRelationsSerial),
};

export const GenericI2c: Story = {
  args: generateArgs(ModuleSubType.genericI2C),
};

export const Gpio: Story = {
  args: generateArgs(ModuleSubType.genericGpio),
};

function generateArgs(
  chType: ModuleSubType,
  isServo = false,
): { channel: ScriptChannel; availableChannels: ChannelDetails[] } {
  const availableChannels: ModuleChannelType[] = [];
  let scriptChannelType: ScriptChannelType;

  switch (chType) {
    case ModuleSubType.genericSerial: {
      for (let i = 0; i < 10; i++) {
        const channel = getGenericSerialChannel(i);
        availableChannels.push(channel);
      }
      scriptChannelType = ScriptChannelType.GENERIC_UART;
      break;
    }
    case ModuleSubType.kangaroo: {
      for (let i = 0; i < 10; i++) {
        const channel = getKangarooChannel(i);
        availableChannels.push(channel);
      }
      scriptChannelType = ScriptChannelType.KANGAROO;
      break;
    }
    case ModuleSubType.humanCyborgRelationsSerial: {
      for (let i = 0; i < 10; i++) {
        const channel = getHumanCyborgRelationsChannel(i);
        availableChannels.push(channel);
      }
      scriptChannelType = ScriptChannelType.AUDIO;
      break;
    }
    case ModuleSubType.maestro: {
      if (isServo) {
        for (let i = 0; i < 10; i++) {
          const channel = getMaestroChannelServo(i);
          availableChannels.push(channel);
        }
        scriptChannelType = ScriptChannelType.SERVO;
      } else {
        for (let i = 0; i < 5; i++) {
          const channel = getMaestroChannelOutput(i);
          availableChannels.push(channel);
        }
        for (let i = 5; i < 10; i++) {
          const channel = getGpioChannel(i);
          availableChannels.push(channel);
        }
        scriptChannelType = ScriptChannelType.GPIO;
      }
      break;
    }
    case ModuleSubType.genericI2C: {
      for (let i = 0; i < 10; i++) {
        const channel = getGenericI2cChannel(i);
        availableChannels.push(channel);
      }
      scriptChannelType = ScriptChannelType.GENERIC_I2C;
      break;
    }
    case ModuleSubType.genericGpio: {
      for (let i = 0; i < 5; i++) {
        const channel = getGpioChannel(i);
        availableChannels.push(channel);
      }
      for (let i = 5; i < 10; i++) {
        const channel = getMaestroChannelOutput(i);
        availableChannels.push(channel);
      }
      scriptChannelType = ScriptChannelType.GPIO;
      break;
    }
    default: {
      for (let i = 0; i < 10; i++) {
        const channel = getGenericSerialChannel(i);
        availableChannels.push(channel);
      }
      scriptChannelType = ScriptChannelType.GENERIC_UART;
      break;
    }
  }

  const channelId = uuid();

  const scriptCh = new ScriptChannel(
    channelId,
    uuid(),
    scriptChannelType,
    availableChannels[4].id,
    ModuleChannelTypes.fromSubType(availableChannels[4].moduleSubType),
    availableChannels[4],
    300,
  );

  return {
    channel: scriptCh,
    availableChannels: toChannelDetails(availableChannels),
  };
}

function toChannelDetails(ch: ModuleChannelType[]): ChannelDetails[] {
  const location = uuid();

  return ch.map((c) => moduleChannelTypeToChannelDetails(c, location));
}

function moduleChannelTypeToChannelDetails(
  ch: ModuleChannelType,
  location: string,
): ChannelDetails {
  let scriptChannelType: ScriptChannelType = ScriptChannelType.NONE;

  switch (ch.moduleSubType) {
    case ModuleSubType.genericSerial:
      scriptChannelType = ScriptChannelType.GENERIC_UART;
      break;
    case ModuleSubType.kangaroo:
      scriptChannelType = ScriptChannelType.KANGAROO;
      break;
    case ModuleSubType.humanCyborgRelationsSerial:
      scriptChannelType = ScriptChannelType.AUDIO;
      break;
    case ModuleSubType.maestro: {
      const m = ch as MaestroChannel;
      if (m.isServo) {
        scriptChannelType = ScriptChannelType.SERVO;
      } else {
        scriptChannelType = ScriptChannelType.GPIO;
      }
      break;
    }
    case ModuleSubType.genericI2C:
      scriptChannelType = ScriptChannelType.GENERIC_I2C;
      break;
    case ModuleSubType.genericGpio:
      scriptChannelType = ScriptChannelType.GPIO;
      break;
  }

  return {
    id: ch.id,
    name: ch.channelName,
    locationId: location,
    available: true,
    scriptChannelType: scriptChannelType,
  };
}

function getGenericSerialChannel(idx: number): UartChannel {
  return new UartChannel(
    uuid(),
    uuid(),
    `Uart ${idx}`,
    ModuleSubType.genericSerial,
    true,
  );
}

function getKangarooChannel(idx: number): KangarooX2Channel {
  return new KangarooX2Channel(
    uuid(),
    uuid(),
    `Kangaroo ${idx}`,
    'Channel 1',
    'Channel 2',
  );
}

function getHumanCyborgRelationsChannel(idx: number): UartChannel {
  return new UartChannel(
    uuid(),
    uuid(),
    `HCR ${idx}`,
    ModuleSubType.humanCyborgRelationsSerial,
    true,
  );
}

function getMaestroChannelServo(idx: number): MaestroChannel {
  return new MaestroChannel(
    uuid(),
    uuid(),
    `Maestro Servo ${idx}`,
    true,
    1,
    true,
    500,
    2500,
    1250,
    true,
  );
}

function getMaestroChannelOutput(idx: number): MaestroChannel {
  return new MaestroChannel(
    uuid(),
    uuid(),
    `Maestro GPIO ${idx}`,
    true,
    1,
    false,
    0,
    0,
    0,
    false,
  );
}

function getGenericI2cChannel(idx: number): I2cChannel {
  return new I2cChannel(uuid(), uuid(), `Generic I2C ${idx}`, true);
}

function getGpioChannel(idx: number): GpioChannel {
  return new GpioChannel(uuid(), uuid(), idx, true, `GPIO  ${idx}`, false);
}
