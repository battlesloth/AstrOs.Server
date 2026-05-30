import { type Meta, type StoryObj } from '@storybook/vue3';
import AstrosRemoteButtonEditor from './AstrosRemoteButtonEditor.vue';
import type { PageButton } from '@/models/remoteControl/pageButton';

const SAMPLE_SCRIPTS = [
  { id: 's1', name: 'Wave Hello' },
  { id: 's2', name: 'Bow' },
  { id: 's3', name: 'Whistle' },
  { id: 's4', name: 'Spin in Place' },
];
const SAMPLE_PLAYLISTS = [
  { id: 'p1', name: 'Morning Routine' },
  { id: 'p2', name: 'Performance Set' },
  { id: 'p3', name: 'Quick Demo' },
];

// Wrap each story in a modal-box-shaped container so it reads how it appears
// inside AstrosRemoteButtonEditorModal (the editor renders in the app's
// standard modal-box now, not an anchored popover).
const modalBoxWrapper = `
  <div style="
    width: 320px;
    border-radius: 16px;
    padding: 24px;
    background: #fff;
    box-shadow: 0 10px 40px rgba(0,0,0,0.2);
  ">
    <AstrosRemoteButtonEditor
      v-bind="args"
      @change="(v) => console.log('change', v)"
      @close="() => console.log('close')"
    />
  </div>
`;

const meta: Meta<typeof AstrosRemoteButtonEditor> = {
  title: 'components/remoteControl/AstrosRemoteButtonEditor',
  component: AstrosRemoteButtonEditor,
  render: (args) => ({
    components: { AstrosRemoteButtonEditor },
    setup: () => ({ args }),
    template: modalBoxWrapper,
  }),
};
export default meta;

type Story = StoryObj<typeof AstrosRemoteButtonEditor>;

const NONE: PageButton = { id: '0', name: 'None', type: 'none' };
const SCRIPT_ASSIGNED: PageButton = { id: 's1', name: 'Wave Hello', type: 'script' };
const PLAYLIST_ASSIGNED: PageButton = { id: 'p1', name: 'Morning Routine', type: 'playlist' };

export const EmptyButtonOpensOnScripts: Story = {
  args: {
    buttonNumber: 5,
    currentValue: NONE,
    scripts: SAMPLE_SCRIPTS,
    playlists: SAMPLE_PLAYLISTS,
  },
};

export const AssignedScriptOpensOnScripts: Story = {
  args: {
    buttonNumber: 5,
    currentValue: SCRIPT_ASSIGNED,
    scripts: SAMPLE_SCRIPTS,
    playlists: SAMPLE_PLAYLISTS,
  },
};

export const AssignedPlaylistOpensOnPlaylists: Story = {
  args: {
    buttonNumber: 5,
    currentValue: PLAYLIST_ASSIGNED,
    scripts: SAMPLE_SCRIPTS,
    playlists: SAMPLE_PLAYLISTS,
  },
};

export const EmptyScriptList: Story = {
  args: {
    buttonNumber: 5,
    currentValue: NONE,
    scripts: [],
    playlists: SAMPLE_PLAYLISTS,
  },
};

export const LongName: Story = {
  args: {
    buttonNumber: 5,
    currentValue: NONE,
    scripts: [
      { id: 's-long', name: 'This Is A Really Long Script Name That Should Truncate' },
      ...SAMPLE_SCRIPTS,
    ],
    playlists: SAMPLE_PLAYLISTS,
  },
};
