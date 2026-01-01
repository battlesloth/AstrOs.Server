import type { Meta, StoryObj } from '@storybook/vue3';
import { fn } from 'storybook/test';
import { v4 as uuid } from 'uuid';
import AstrosGpioEventModal from './AstrosGpioEventModal.vue';
import { ModuleSubType, ModuleType, ModalMode } from '@/enums';
import type { GpioEvent, MaestroEvent, ScriptEvent } from '@/models';

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
    scriptEvent: getScriptEvent(ModuleSubType.GENERIC_GPIO, true),
    mode: ModalMode.ADD,
  },
};

export const GpioLow: Story = {
  args: {
    scriptEvent: getScriptEvent(ModuleSubType.GENERIC_GPIO, false),
    mode: ModalMode.ADD,
  },
};

export const MaestroHigh: Story = {
  args: {
    scriptEvent: getScriptEvent(ModuleSubType.MAESTRO, true),
    mode: ModalMode.ADD,
  },
};

export const MaestroLow: Story = {
  args: {
    scriptEvent: getScriptEvent(ModuleSubType.MAESTRO, false),
    mode: ModalMode.ADD,
  },
};

export const UndefinedEvent: Story = {
  args: {
    scriptEvent: getScriptEvent(ModuleSubType.MAESTRO, false, true),
    mode: ModalMode.ADD,
  },
};

export const EditMode: Story = {
  args: {
    scriptEvent: getScriptEvent(ModuleSubType.GENERIC_GPIO, true),
    mode: ModalMode.EDIT,
  },
};

function getScriptEvent(type: ModuleSubType, setHigh: boolean, undefinedEvt = false): ScriptEvent {
  let modType = ModuleType.GPIO;
  let evt: GpioEvent | MaestroEvent | undefined = { setHigh };

  switch (type) {
    case ModuleSubType.MAESTRO:
      modType = ModuleType.UART;
      evt = {
        channel: -1,
        isServo: false,
        position: setHigh ? 2500 : 500,
        speed: 0,
        acceleration: 0,
      };
      break;
    default:
      break;
  }

  return {
    scriptChannelId: uuid(),
    moduleType: modType,
    moduleSubType: type,
    time: 2000,
    event: undefinedEvt ? undefined : evt,
  };
}
