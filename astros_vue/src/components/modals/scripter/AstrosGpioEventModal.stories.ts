import type { Meta, StoryObj } from '@storybook/vue3';
import { fn } from 'storybook/test';
import { v4 as uuid } from 'uuid';
import AstrosGpioEventModal from './AstrosGpioEventModal.vue';
import { ModuleSubType } from '@/enums/modules/ModuleSubType';
import { ModuleType } from '@/enums/modules/ModuleType';
import {
  GpioEvent,
  MaestroEvent,
  ScriptEvent,
} from '@/models/scripts/scripting';

const meta = {
  title: 'Components/Modals/Scripter/GpioEventModal',
  component: AstrosGpioEventModal,
  parameters: {
    layout: 'centered',
  },
  args: {
    onAddEvent: fn(),
    onEditEvent: fn(),
    onRemoveEvent: fn(),
    onClose: fn(),
  },
  tags: ['autodocs'],
} satisfies Meta<typeof AstrosGpioEventModal>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    scriptEvent: getScriptEvent(ModuleSubType.genericGpio, true),
    mode: 'add',
  },
};

export const GpioLow: Story = {
  args: {
    scriptEvent: getScriptEvent(ModuleSubType.genericGpio, false),
    mode: 'add',
  },
};

export const MaestroHigh: Story = {
  args: {
    scriptEvent: getScriptEvent(ModuleSubType.maestro, true),
    mode: 'add',
  },
};

export const MaestroLow: Story = {
  args: {
    scriptEvent: getScriptEvent(ModuleSubType.maestro, false),
    mode: 'add',
  },
};

export const UndefinedEvent: Story = {
  args: {
    scriptEvent: getScriptEvent(ModuleSubType.maestro, false, true),
    mode: 'add',
  },
};

export const EditMode: Story = {
  args: {
    scriptEvent: getScriptEvent(ModuleSubType.genericGpio, true),
    mode: 'edit',
  },
};

function getScriptEvent(
  type: ModuleSubType,
  setHigh: boolean,
  undefinedEvt = false,
): ScriptEvent {
  let modType = ModuleType.gpio;
  let evt: GpioEvent | MaestroEvent | undefined = new GpioEvent(setHigh);

  switch (type) {
    case ModuleSubType.maestro:
      modType = ModuleType.uart;
      evt = new MaestroEvent(-1, false, setHigh ? 2500 : 500, 0, 0);
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
