import {
  componentWrapperDecorator,
  moduleMetadata,
  Meta,
  StoryObj,
} from '@storybook/angular';
import { ServoEventModalComponent } from './servo-event-modal.component';
import { ModalComponent } from '../../modal-base/modal.component';
import { ScriptEventModalResources } from '../base-event-modal/base-event-modal.component';
import { 
  MaestroEvent,
  ModuleType,
  ModuleSubType, 
  ScriptEvent 
} from 'astros-common';
import { v4 as uuid } from 'uuid';


const meta: Meta<ServoEventModalComponent> = {
  title: 'Modals/Scripting/ServoEventModal',
  component: ServoEventModalComponent,
  tags: ['autodocs'],
  decorators: [
    moduleMetadata({
      imports: [ModalComponent],
    }),
    componentWrapperDecorator(ModalComponent),
  ],
};

export default meta;

type Story = StoryObj<ServoEventModalComponent>;

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
      ],
    ),
  },
}

function getScriptEvent(undefinedEvt: boolean = false): ScriptEvent {
  const servoEvent = new MaestroEvent(true, 45, 25, 10);

  return new ScriptEvent(
    uuid(),
    ModuleType.uart,
    ModuleSubType.maestro,
    9000,
    undefinedEvt ? undefined : servoEvent
  );
}