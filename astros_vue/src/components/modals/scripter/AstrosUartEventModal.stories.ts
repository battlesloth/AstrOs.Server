import type { Meta, StoryObj } from '@storybook/vue3';
import { fn } from 'storybook/test';
import AstrosUartEventModal from './AstrosUartEventModal.vue';
import type { ScriptEvent, GenericSerialEvent } from '@/models';
import { ModuleType, ModuleSubType, ModalMode } from '@/enums';

const meta = {
  title: 'Components/Modals/Scripter/UartEventModal',
  component: AstrosUartEventModal,
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
} satisfies Meta<typeof AstrosUartEventModal>;

export default meta;
type Story = StoryObj<typeof meta>;

const createScriptEvent = (time: number = 0, value: string = ''): ScriptEvent => {
  const event: GenericSerialEvent | undefined = value ? { value: value } : undefined;
  return {
    scriptChannelId: 'uart-channel-1',
    moduleType: ModuleType.UART,
    moduleSubType: ModuleSubType.GENERIC_SERIAL,
    time,
    event: event as ScriptEvent['event'],
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
    scriptEvent: createScriptEvent(5000, 'AT+COMMAND'),
  },
};

export const EditModeWithComplexCommand: Story = {
  args: {
    mode: ModalMode.EDIT,
    scriptEvent: createScriptEvent(10000, '0x1A,0x2B,0x3C'),
  },
};

export const EditModeWithHexCommand: Story = {
  args: {
    mode: ModalMode.EDIT,
    scriptEvent: createScriptEvent(2500, '\\xFF\\xAA\\x55'),
  },
};

export const EditModeWithAsciiCommand: Story = {
  args: {
    mode: ModalMode.EDIT,
    scriptEvent: createScriptEvent(7500, 'HELLO\\r\\n'),
  },
};
