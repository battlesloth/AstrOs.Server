import type { Meta, StoryObj } from '@storybook/vue3';
import { fn } from 'storybook/test';
import { v4 as uuid } from 'uuid';
import AstrosHumanCyborgModal from './AstrosHumanCyborgModal.vue';
import { ModuleSubType } from '@/enums/modules/ModuleSubType';
import { ModuleType } from '@/enums/modules/ModuleType';
import { HcrCommandCategory, HumanCyborgRelationsCmd } from '@/enums/scripts/humanCyborgRelations';
import { HcrCommand, HumanCyborgRelationsEvent, ScriptEvent } from '@/models/scripts/scripting';

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
    new HcrCommand(uuid(), HcrCommandCategory.stimuli, HumanCyborgRelationsCmd.mildHappy, 0, 0),
    new HcrCommand(uuid(), HcrCommandCategory.stop, HumanCyborgRelationsCmd.panicStop, 0, 0),
  ]);
}
