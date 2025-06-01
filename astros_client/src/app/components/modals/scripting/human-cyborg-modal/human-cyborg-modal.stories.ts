import {
  componentWrapperDecorator,
  moduleMetadata,
  Meta,
  StoryObj,
} from '@storybook/angular';
import { HumanCyborgModalComponent } from './human-cyborg-modal.component';
import { ModalComponent } from '../../modal-base/modal.component';
import { ScriptEventModalResources } from '../base-event-modal/base-event-modal.component';
import {
  HcrCommand,
  HcrCommandCategory,
  HumanCyborgRelationsCmd,
  HumanCyborgRelationsEvent,
  ModuleSubType,
  ModuleType,
  ScriptEvent,
} from 'astros-common';
import { v4 as uuid } from 'uuid';

const meta: Meta<HumanCyborgModalComponent> = {
  title: 'Modals/Scripting/HumanCyborgModal',
  component: HumanCyborgModalComponent,
  tags: ['autodocs'],
  decorators: [
    moduleMetadata({
      imports: [ModalComponent],
    }),
    componentWrapperDecorator(ModalComponent),
  ],
};

export default meta;

type Story = StoryObj<HumanCyborgModalComponent>;

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
  return new ScriptEvent(
    uuid(),
    ModuleType.uart,
    ModuleSubType.humanCyborgRelationsSerial,
    3000,
    undefinedEvt ? undefined : getHcrEvents(),
  );
}

function getHcrEvents(): HumanCyborgRelationsEvent {
  return new HumanCyborgRelationsEvent([
    new HcrCommand(
      uuid(),
      HcrCommandCategory.stimuli,
      HumanCyborgRelationsCmd.mildHappy,
      0,
      0,
    ),
    new HcrCommand(
      uuid(),
      HcrCommandCategory.stop,
      HumanCyborgRelationsCmd.panicStop,
      0,
      0,
    ),
  ]);
}
