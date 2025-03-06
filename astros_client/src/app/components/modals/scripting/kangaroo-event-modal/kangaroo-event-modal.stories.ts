import {
  componentWrapperDecorator,
  moduleMetadata,
  Meta,
  StoryObj,
} from '@storybook/angular';
import { KangarooEventModalComponent, KangarooEventModalResources } from './kangaroo-event-modal.component';
import { ModalComponent } from '../../modal-base/modal.component';
import { 
  KangarooAction,
  KangarooEvent, 
  KangarooX2,
  ModuleSubType,
  ModuleType,
  ScriptEvent,
} from 'astros-common';
import { v4 as uuid } from 'uuid';
import { ScriptEventModalResources } from '../base-event-modal/base-event-modal.component';
import { get } from 'http';

const meta: Meta<KangarooEventModalComponent> = {
  title: 'Modals/Scripting/KangarooEventModal',
  component: KangarooEventModalComponent,
  tags: ['autodocs'],
  decorators: [
    moduleMetadata({
      imports: [ModalComponent],
    }),
    componentWrapperDecorator(ModalComponent),
  ],
};

export default meta;

type Story = StoryObj<KangarooEventModalComponent>;

export const Default: Story = {
  args: {
    resources: new Map<string, unknown>([
      [KangarooEventModalResources.kangaroo, getKangarooModule()],
      [ScriptEventModalResources.scriptEvent, getKangarooEvent()],
    ]),
  },
};

export const UndefinedEvent = {
  args: {
    resources: new Map<string, unknown>([
      [KangarooEventModalResources.kangaroo, getKangarooModule()],
      [ScriptEventModalResources.scriptEvent, getKangarooEvent(true)],
    ]),
  },
};

function getKangarooModule(){
 return new KangarooX2(
  uuid(),
  "Lifter",
  "Spinner"
 ); 
}

function getKangarooEvent(undefinedEvt: boolean = false): ScriptEvent {
  const evt = new KangarooEvent(
    KangarooAction.position,
    100,
    200,
    KangarooAction.start,
    0,
    0
  );

  return new ScriptEvent(
    uuid(),
    ModuleType.uart,
    ModuleSubType.kangaroo,
    5000,
    undefinedEvt ? undefined : evt
  );
}