import type { Meta, StoryObj } from '@storybook/vue3';
import { fn } from 'storybook/test';
import { v4 as uuid } from 'uuid';
import AstrosAddChannelModal from './AstrosAddChannelModal.vue';
import { ScriptChannelType } from '@/enums/scripts/scriptChannelType';
import type { LocationDetails, ChannelDetails } from '@/models/scripts/scripting';

const bodyUuid = '1035b586-54ea-4e12-b08c-b47c20ec4d76';
const coreUuid = '1a216e62-3224-4113-a3a5-24d486d83ca4';
const domeUuid = 'a4836f40-bb67-4173-9746-2113a5014e0b';

const meta = {
  title: 'Components/Modals/Scripter/AddChannelModal',
  component: AstrosAddChannelModal,
  parameters: {
    layout: 'centered',
  },
  args: {
    onAddChannel: fn(),
    onClose: fn(),
  },
  tags: ['autodocs'],
} satisfies Meta<typeof AstrosAddChannelModal>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    controllers: generateControllers(),
    channels: generateChannels(),
  },
};

export const Unavailable: Story = {
  args: {
    controllers: generateControllers(),
    channels: generateChannels(true),
  },
};

function generateControllers(): LocationDetails[] {
  return [
    { id: bodyUuid, name: 'body', assigned: true },
    { id: coreUuid, name: 'core', assigned: true },
    { id: domeUuid, name: 'dome', assigned: true },
  ];
}

function generateChannels(addUnavailable = false): Map<ScriptChannelType, ChannelDetails[]> {
  const result = new Map<ScriptChannelType, ChannelDetails[]>();

  result.set(
    ScriptChannelType.AUDIO,
    generateChannelDetails(ScriptChannelType.AUDIO, addUnavailable),
  );

  result.set(
    ScriptChannelType.GENERIC_I2C,
    generateChannelDetails(ScriptChannelType.GENERIC_I2C, addUnavailable),
  );

  result.set(
    ScriptChannelType.GENERIC_UART,
    generateChannelDetails(ScriptChannelType.GENERIC_UART, addUnavailable),
  );

  result.set(
    ScriptChannelType.GPIO,
    generateChannelDetails(ScriptChannelType.GPIO, addUnavailable),
  );

  result.set(
    ScriptChannelType.KANGAROO,
    generateChannelDetails(ScriptChannelType.KANGAROO, addUnavailable),
  );

  result.set(
    ScriptChannelType.SERVO,
    generateChannelDetails(ScriptChannelType.SERVO, addUnavailable),
  );

  return result;
}

function generateChannelDetails(
  type: ScriptChannelType,
  addUnavailable = false,
): ChannelDetails[] {
  const result: ChannelDetails[] = [];

  let name = '';

  switch (type) {
    case ScriptChannelType.AUDIO:
      name = 'HCR';
      break;
    case ScriptChannelType.GENERIC_I2C:
      name = 'I2C';
      break;
    case ScriptChannelType.GENERIC_UART:
      name = 'Serial';
      break;
    case ScriptChannelType.GPIO:
      name = 'GPIO';
      break;
    case ScriptChannelType.KANGAROO:
      name = 'Kangaroo';
      break;
    case ScriptChannelType.SERVO:
      name = 'Servo';
      break;
  }

  for (let i = 0; i < 10; i++) {
    result.push({
      id: uuid(),
      name: `${name} ${i}`,
      locationId: getLocation(i),
      available: addUnavailable && i !== 0 && i !== 5 ? false : true,
      scriptChannelType: type,
    });
  }

  return result;
}

function getLocation(n: number): string {
  if (n % 3 === 0) {
    return bodyUuid;
  } else if (n % 2 === 0) {
    return coreUuid;
  } else {
    return domeUuid;
  }
}
