import { type Meta, type StoryObj } from '@storybook/vue3';
import AstrosRemoteButtonCard from './AstrosRemoteButtonCard.vue';
import type { PageButton } from '@/models/remoteControl/pageButton';

// Wrap each story in a 3x3 grid cell so the card sizing reads correctly.
// The editor is now a view-owned modal (AstrosRemoteButtonEditorModal); this
// card is presentational and just emits `edit` (open the editor) and `change`
// (the direct Clear action) — both logged here.
const gridCellWrapper = `
  <div style="
    width: 160px;
    padding: 8px;
    background: #f6f7f9;
    border: 1px dashed #d6e0e6;
    border-radius: 8px;
  ">
    <AstrosRemoteButtonCard
      v-bind="args"
      @edit="() => console.log('edit')"
      @change="(v) => console.log('change', v)"
    />
  </div>
`;

const meta: Meta<typeof AstrosRemoteButtonCard> = {
  title: 'components/remoteControl/AstrosRemoteButtonCard',
  component: AstrosRemoteButtonCard,
  render: (args) => ({
    components: { AstrosRemoteButtonCard },
    setup: () => ({ args }),
    template: gridCellWrapper,
  }),
};
export default meta;

type Story = StoryObj<typeof AstrosRemoteButtonCard>;

const NONE: PageButton = { id: '0', name: 'None', type: 'none' };
const SCRIPT_ASSIGNED: PageButton = { id: 's1', name: 'Wave Hello', type: 'script' };
const PLAYLIST_ASSIGNED: PageButton = { id: 'p1', name: 'Morning Routine', type: 'playlist' };

export const Unassigned: Story = {
  args: { value: NONE },
};

export const AssignedScript: Story = {
  args: { value: SCRIPT_ASSIGNED },
};

export const AssignedPlaylist: Story = {
  args: { value: PLAYLIST_ASSIGNED },
};

export const LongAssignedName: Story = {
  args: { value: { id: 's-long', name: 'A Really Long Action Name', type: 'script' } },
};
