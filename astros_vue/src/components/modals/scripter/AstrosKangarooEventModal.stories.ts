import type { Meta, StoryObj } from '@storybook/vue3';
import { fn } from 'storybook/test';
import { v4 as uuid } from 'uuid';
import AstrosKangarooEventModal from './AstrosKangarooEventModal.vue';
import { ModuleSubType } from '@/enums/modules/ModuleSubType';
import { ModuleType } from '@/enums/modules/ModuleType';
import { KangarooAction, KangarooEvent, KangarooX2, ScriptEvent } from '@/models/scripts/scripting';

const meta = {
  title: 'Components/Modals/Scripter/KangarooEventModal',
  component: AstrosKangarooEventModal,
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
} satisfies Meta<typeof AstrosKangarooEventModal>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    kangaroo: getKangarooModule(),
    scriptEvent: getKangarooEvent(),
    mode: 'add',
  },
};

export const UndefinedEvent: Story = {
  args: {
    kangaroo: getKangarooModule(),
    scriptEvent: getKangarooEvent(true),
    mode: 'add',
  },
};

export const EditMode: Story = {
  args: {
    kangaroo: getKangarooModule(),
    scriptEvent: getKangarooEvent(),
    mode: 'edit',
  },
};

function getKangarooModule(): KangarooX2 {
  return new KangarooX2(uuid(), 'Lifter', 'Spinner');
}

function getKangarooEvent(undefinedEvt = false): ScriptEvent {
  const evt = new KangarooEvent(KangarooAction.position, 100, 200, KangarooAction.start, 0, 0);

  return new ScriptEvent(
    uuid(),
    ModuleType.uart,
    ModuleSubType.kangaroo,
    5000,
    undefinedEvt ? undefined : evt,
  );
}
