import type { Meta, StoryObj } from '@storybook/vue3';
import { fn } from 'storybook/test';
import { v4 as uuid } from 'uuid';
import AstrosHumanCyborgModal from './AstrosHumanCyborgModal.vue';
import { ModuleSubType } from '@/enums/modules/ModuleSubType';
import { ModuleType } from '@/enums/modules/ModuleType';
import { HcrCommandCategory, HumanCyborgRelationsCmd } from '@/enums/scripts/humanCyborgRelations';
import type { HumanCyborgRelationsEvent, ScriptEvent } from '@/models';


const meta = {
  title: 'Components/Modals/Scripter/HumanCyborgModal',
  component: AstrosHumanCyborgModal,
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
} satisfies Meta<typeof AstrosHumanCyborgModal>;

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
  return {
    scriptChannelId: uuid(),
    moduleType: ModuleType.UART,
    moduleSubType: ModuleSubType.HUMAN_CYBORG_RELATIONS_SERIAL,
    time: 3000,
    event: undefinedEvt ? undefined : getHcrEvents(),
  }
}

function getHcrEvents(): HumanCyborgRelationsEvent {
  return {
    commands: [
      { id: uuid(), category: HcrCommandCategory.STIMULI, command: HumanCyborgRelationsCmd.MILD_HAPPY, valueA: 0, valueB: 0 },
      { id: uuid(), category: HcrCommandCategory.STOP, command: HumanCyborgRelationsCmd.PANIC_STOP, valueA: 0, valueB: 0 },
    ]
  };
}
