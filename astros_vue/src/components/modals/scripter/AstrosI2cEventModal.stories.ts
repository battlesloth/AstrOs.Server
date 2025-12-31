import type { Meta, StoryObj } from '@storybook/vue3';
import { fn } from 'storybook/test';
import { v4 as uuid } from 'uuid';
import AstrosI2cEventModal from './AstrosI2cEventModal.vue';
import { ModuleSubType } from '@/enums/modules/ModuleSubType';
import { ModuleType } from '@/enums/modules/ModuleType';
import type { I2cEvent, ScriptEvent } from '@/models';

const meta = {
  title: 'Components/Modals/Scripter/I2cEventModal',
  component: AstrosI2cEventModal,
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
} satisfies Meta<typeof AstrosI2cEventModal>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    scriptEvent: getScriptEvent(),
    mode: 'add',
  },
};

export const UndefinedEvent: Story = {
  args: {
    scriptEvent: getScriptEvent(true),
    mode: 'add',
  },
};

export const EditMode: Story = {
  args: {
    scriptEvent: getScriptEvent(),
    mode: 'edit',
  },
};

function getScriptEvent(undefinedEvt = false): ScriptEvent {
  const i2cEvent: I2cEvent = { message: 'test message' };

  return {
    scriptChannelId: uuid(),
    moduleType: ModuleType.I2C,
    moduleSubType: ModuleSubType.GENERIC_I2C,
    time: 5000,
    event: undefinedEvt ? undefined : i2cEvent,
  };
}
