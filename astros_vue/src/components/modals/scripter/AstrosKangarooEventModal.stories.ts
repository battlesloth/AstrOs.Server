import type { Meta, StoryObj } from '@storybook/vue3';
import { fn } from 'storybook/test';
import { v4 as uuid } from 'uuid';
import AstrosKangarooEventModal from './AstrosKangarooEventModal.vue';
import { ModuleType, ModuleSubType, KangarooAction, ModalMode } from '@/enums';
import type { KangarooEvent, KangarooX2, ScriptEvent } from '@/models';

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
    mode: ModalMode.ADD,
  },
};

export const UndefinedEvent: Story = {
  args: {
    kangaroo: getKangarooModule(),
    scriptEvent: getKangarooEvent(true),
    mode: ModalMode.ADD,
  },
};

export const EditMode: Story = {
  args: {
    kangaroo: getKangarooModule(),
    scriptEvent: getKangarooEvent(),
    mode: ModalMode.EDIT,
  },
};

function getKangarooModule(): KangarooX2 {
  return { id: uuid(), ch1Name: 'Lifter', ch2Name: 'Spinner' };
}

function getKangarooEvent(undefinedEvt = false): ScriptEvent {
  const evt: KangarooEvent = {
    ch1Action: KangarooAction.POSITION,
    ch1Speed: 100,
    ch1Position: 1000,
    ch2Action: KangarooAction.POSITION,
    ch2Speed: 200,
    ch2Position: 2000,
  };

  return {
    scriptChannelId: uuid(),
    moduleType: ModuleType.UART,
    moduleSubType: ModuleSubType.KANGAROO,
    time: 5000,
    event: undefinedEvt ? undefined : evt,
  };
}
