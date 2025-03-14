import {
  componentWrapperDecorator,
  moduleMetadata,
  Meta,
  StoryObj,
} from '@storybook/angular';
import { I2cEventModalComponent } from './i2c-event-modal.component';
import { ModalComponent } from '../../modal-base/modal.component';
import {
  I2cEvent,
  ModuleSubType,
  ModuleType,
  ScriptEvent,
} from 'astros-common';
import { v4 as uuid } from 'uuid';
import { ScriptEventModalResources } from '../base-event-modal/base-event-modal.component';

const meta: Meta<I2cEventModalComponent> = {
  title: 'Modals/Scripting/I2cEventModal',
  component: I2cEventModalComponent,
  tags: ['autodocs'],
  decorators: [
    moduleMetadata({
      imports: [ModalComponent],
    }),
    componentWrapperDecorator(ModalComponent),
  ],
};

export default meta;

type Story = StoryObj<I2cEventModalComponent>;

export const Default: Story = {
  args: {
    resources: new Map([
      [ScriptEventModalResources.scriptEvent, getScriptEvent()],
    ]),
  },
};

export const UndefinedEvent = {
  args: {
    resources: new Map([
      [ScriptEventModalResources.scriptEvent, getScriptEvent(true)],
    ]),
  },
};

function getScriptEvent(undefinedEvt = false): ScriptEvent {
  const i2cEvent = new I2cEvent('test message');

  return new ScriptEvent(
    uuid(),
    ModuleType.i2c,
    ModuleSubType.genericI2C,
    4000,
    undefinedEvt ? undefined : i2cEvent,
  );
}
