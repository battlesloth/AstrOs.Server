import type { Meta, StoryObj } from '@storybook/vue3';
import { fn } from 'storybook/test';
import AstrosServoEventModal from './AstrosServoEventModal.vue';
import type { ScriptEvent, MaestroEvent } from '@/models';
import { ModuleType, ModuleSubType, ModalMode } from '@/enums';

const meta = {
  title: 'Components/Modals/Scripter/ServoEventModal',
  component: AstrosServoEventModal,
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
} satisfies Meta<typeof AstrosServoEventModal>;

export default meta;
type Story = StoryObj<typeof meta>;

const createScriptEvent = (
  time: number = 0,
  position: number = 0,
  speed: number = 0,
  acceleration: number = 0,
): ScriptEvent => {
  const event: MaestroEvent = {
    channel: 0,
    isServo: true,
    position,
    speed,
    acceleration,
  };

  return {
    id: 'event-1',
    scriptChannel: 'channel-1',
    moduleType: ModuleType.UART,
    moduleSubType: ModuleSubType.MAESTRO,
    time,
    event,
  };
};

export const AddMode: Story = {
  args: {
    mode: ModalMode.ADD,
    scriptEvent: createScriptEvent(),
  },
};

export const EditMode: Story = {
  args: {
    mode: ModalMode.EDIT,
    scriptEvent: createScriptEvent(5000, 50, 100, 50),
  },
};

export const EditModeHome: Story = {
  args: {
    mode: ModalMode.EDIT,
    scriptEvent: createScriptEvent(2000, -1, 255, 255),
  },
};

export const EditModeUnlimited: Story = {
  args: {
    mode: ModalMode.EDIT,
    scriptEvent: createScriptEvent(10000, 75, 0, 0),
  },
};

export const EditModeFullSpeed: Story = {
  args: {
    mode: ModalMode.EDIT,
    scriptEvent: createScriptEvent(3000, 100, 255, 128),
  },
};
