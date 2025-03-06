import {
  componentWrapperDecorator,
  moduleMetadata,
  Meta,
  StoryObj,
} from '@storybook/angular';
import { UartEventModalComponent } from './uart-event-modal.component';
import { ModalComponent } from '../../modal-base/modal.component';
import { ScriptEventModalResources } from '../base-event-modal/base-event-modal.component';
import {
  GenericSerialEvent,
  ModuleSubType,
  ModuleType,
  ScriptEvent
} from 'astros-common';
import { v4 as uuid } from 'uuid';

const meta: Meta<UartEventModalComponent> = {
  title: 'Modals/Scripting/UartEventModal',
  component: UartEventModalComponent,
  tags: ['autodocs'],
  decorators: [
    moduleMetadata({
      imports: [ModalComponent],
    }),
    componentWrapperDecorator(ModalComponent),
  ],
};

export default meta;

type Story = StoryObj<UartEventModalComponent>;

export const Default: Story = {
  args: {
    resources: new Map([
      [ScriptEventModalResources.scriptEvent, getScriptEvent()]
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

function getScriptEvent(undefinedEvt: boolean = false): ScriptEvent {
  const uartEvent = new GenericSerialEvent("test message");

  return new ScriptEvent(
    uuid(),
    ModuleType.uart,
    ModuleSubType.genericSerial,
    4000,
    undefinedEvt ? undefined : uartEvent
  )
}
