import {
  componentWrapperDecorator,
  moduleMetadata,
  Meta,
  StoryObj,
} from '@storybook/angular';
import { GpioEventModalComponent } from './gpio-event-modal.component';
import { ModalComponent } from '../../modal-base/modal.component';
import { ScriptEventModalResources } from '../base-event-modal/base-event-modal.component';
import {
  GpioEvent,
  MaestroEvent,
  ModuleSubType,
  ModuleType,
  ScriptEvent,
} from 'astros-common';
import { v4 as uuid } from 'uuid';

const meta: Meta<GpioEventModalComponent> = {
  title: 'Modals/Scripting/GpioEventModal',
  component: GpioEventModalComponent,
  tags: ['autodocs'],
  decorators: [
    moduleMetadata({
      imports: [ModalComponent],
    }),
    componentWrapperDecorator(ModalComponent),
  ],
};

export default meta;

type Story = StoryObj<GpioEventModalComponent>;

export const Default: Story = {
  args: {
    resources: new Map([
      [
        ScriptEventModalResources.scriptEvent,
        getScriptEvent(ModuleSubType.genericGpio, true),
      ],
    ]),
  },
};

export const GpioLow = {
  args: {
    resources: new Map([
      [
        ScriptEventModalResources.scriptEvent,
        getScriptEvent(ModuleSubType.genericGpio, false),
      ],
    ]),
  },
};

export const MaestroHigh = {
  args: {
    resources: new Map([
      [
        ScriptEventModalResources.scriptEvent,
        getScriptEvent(ModuleSubType.maestro, true),
      ],
    ]),
  },
};

export const MaestroLow = {
  args: {
    resources: new Map([
      [
        ScriptEventModalResources.scriptEvent,
        getScriptEvent(ModuleSubType.maestro, false),
      ],
    ]),
  },
};

export const UndefinedEvent = {
  args: {
    resources: new Map([
      [
        ScriptEventModalResources.scriptEvent,
        getScriptEvent(ModuleSubType.maestro, false, true),
      ],
    ]),
  },
};

function getScriptEvent(
  type: ModuleSubType,
  setHigh: boolean,
  undefinedEvt = false,
): ScriptEvent {
  let modType = ModuleType.gpio;
  let evt: GpioEvent | MaestroEvent = new GpioEvent(setHigh);

  switch (type) {
    case ModuleSubType.maestro:
      modType = ModuleType.uart;
      evt = new MaestroEvent(false, setHigh ? 2500 : 500, 0, 0);
      break;
    default:
      break;
  }

  return new ScriptEvent(
    uuid(),
    modType,
    type,
    2000,
    undefinedEvt ? undefined : evt,
  );
}
