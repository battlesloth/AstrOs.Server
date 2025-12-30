import type { Meta, StoryObj } from '@storybook/vue3'
import { fn } from 'storybook/test'
import AstrosUartEventModal from './AstrosUartEventModal.vue'
import { ScriptEvent, GenericSerialEvent } from '@/models/scripts/scripting'
import { ModuleType } from '@/enums/modules/ModuleType'
import { ModuleSubType } from '@/enums/modules/ModuleSubType'

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
} satisfies Meta<typeof AstrosUartEventModal>

export default meta
type Story = StoryObj<typeof meta>

const createScriptEvent = (
  time: number = 0,
  value: string = '',
): ScriptEvent => {
  const event = value ? new GenericSerialEvent(value) : undefined
  return new ScriptEvent(
    'uart-channel-1',
    ModuleType.uart,
    ModuleSubType.genericSerial,
    time,
    event,
  )
}

export const AddMode: Story = {
  args: {
    mode: 'add',
    scriptEvent: createScriptEvent(),
  },
}

export const EditMode: Story = {
  args: {
    mode: 'edit',
    scriptEvent: createScriptEvent(5000, 'AT+COMMAND'),
  },
}

export const EditModeWithComplexCommand: Story = {
  args: {
    mode: 'edit',
    scriptEvent: createScriptEvent(10000, '0x1A,0x2B,0x3C'),
  },
}

export const EditModeWithHexCommand: Story = {
  args: {
    mode: 'edit',
    scriptEvent: createScriptEvent(2500, '\\xFF\\xAA\\x55'),
  },
}

export const EditModeWithAsciiCommand: Story = {
  args: {
    mode: 'edit',
    scriptEvent: createScriptEvent(7500, 'HELLO\\r\\n'),
  },
}
