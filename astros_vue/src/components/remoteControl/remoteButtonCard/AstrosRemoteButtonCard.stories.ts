import { type Meta, type StoryObj } from '@storybook/vue3';
import AstrosRemoteButtonCard from './AstrosRemoteButtonCard.vue';
import type { PageButton } from '@/models/remoteControl/pageButton';

const SAMPLE_SCRIPTS = [
  { id: 's1', name: 'Wave Hello' },
  { id: 's2', name: 'Bow' },
  { id: 's3', name: 'Whistle' },
];
const SAMPLE_PLAYLISTS = [
  { id: 'p1', name: 'Morning Routine' },
  { id: 'p2', name: 'Performance Set' },
];

// Wrap each story in a 3x3 grid cell so the card sizing reads correctly.
// The popover teleports to body, so the wrapper doesn't constrain it —
// click Configure / Edit in the story to see the editor anchored.
const gridCellWrapper = `
  <div style="
    width: 160px;
    padding: 8px;
    background: #f6f7f9;
    border: 1px dashed #d6e0e6;
    border-radius: 8px;
  ">
    <AstrosRemoteButtonCard v-bind="args" @change="(v) => console.log('change', v)" />
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
  args: {
    buttonNumber: 5,
    value: NONE,
    scripts: SAMPLE_SCRIPTS,
    playlists: SAMPLE_PLAYLISTS,
  },
};

export const AssignedScript: Story = {
  args: {
    buttonNumber: 5,
    value: SCRIPT_ASSIGNED,
    scripts: SAMPLE_SCRIPTS,
    playlists: SAMPLE_PLAYLISTS,
  },
};

export const AssignedPlaylist: Story = {
  args: {
    buttonNumber: 5,
    value: PLAYLIST_ASSIGNED,
    scripts: SAMPLE_SCRIPTS,
    playlists: SAMPLE_PLAYLISTS,
  },
};

export const LongAssignedName: Story = {
  args: {
    buttonNumber: 5,
    value: { id: 's-long', name: 'A Really Long Action Name', type: 'script' },
    scripts: SAMPLE_SCRIPTS,
    playlists: SAMPLE_PLAYLISTS,
  },
};
