import {
  componentWrapperDecorator,
  moduleMetadata,
  Meta,
  StoryObj,
} from '@storybook/angular';
import {
  AddChannelModalComponent,
  AddChannelModalResources,
} from './add-channel-modal.component';
import { ModalComponent } from '../../modal-base/modal.component';
import { ChannelDetails } from '@src/models/scripting';
import { v4 as uuid } from 'uuid';
import { ScriptChannelType } from 'astros-common';

const bodyUuid = '1035b586-54ea-4e12-b08c-b47c20ec4d76';
const coreUuid = '1a216e62-3224-4113-a3a5-24d486d83ca4';
const domeUuid = 'a4836f40-bb67-4173-9746-2113a5014e0b';

const meta: Meta<AddChannelModalComponent> = {
  title: 'Modals/Scripting/AddChannelModal',
  component: AddChannelModalComponent,
  tags: ['autodocs'],
  decorators: [
    moduleMetadata({
      imports: [ModalComponent],
    }),
    componentWrapperDecorator(ModalComponent),
  ],
};

export default meta;

type Story = StoryObj<AddChannelModalComponent>;

export const Default: Story = {
  args: {
    resources: new Map<string, unknown>([
      [AddChannelModalResources.controllers, generateControllers()],
      [AddChannelModalResources.channels, generateChannels()],
    ]),
  },
};

export const Unavailable: Story = {
  args: {
    resources: new Map<string, unknown>([
      [AddChannelModalResources.controllers, generateControllers()],
      [AddChannelModalResources.channels, generateChannels(true)],
    ]),
  },
};

function generateControllers() {
  const result = [
    { id: bodyUuid, name: 'body' },
    { id: coreUuid, name: 'core' },
    { id: domeUuid, name: 'dome' },
  ];

  return result;
}

function generateChannels(addUnavailable = false) {
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
) {
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

function getLocation(n: number) {
  if (n % 3 === 0) {
    return bodyUuid;
  } else if (n % 2 === 0) {
    return coreUuid;
  } else {
    return domeUuid;
  }
}
