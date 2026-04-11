import { type Meta, type StoryObj } from '@storybook/vue3';

import AstrosRemoteButton from './AstrosRemoteButton.vue';

const meta = {
  title: 'components/remoteControl/AstrosRemoteButton',
  component: AstrosRemoteButton,
  render: (args: unknown) => ({
    components: { AstrosRemoteButton },
    setup() {
      return { args };
    },
    template: '<AstrosRemoteButton v-bind="args" />',
  }),
  parameters: {
    layout: 'centered',
  },
  args: {},
  tags: ['autodocs'],
} satisfies Meta<typeof AstrosRemoteButton>;

export default meta;

type Story = StoryObj<typeof meta>;

const demoScripts = [
  { id: '1', name: 'Open Dome' },
  { id: '2', name: 'Close Dome' },
  { id: '3', name: 'Start Tracking' },
];

const demoPlaylists = [
  { id: 'p_1', name: 'Parade Mode' },
  { id: 'p_2', name: 'Idle Animations' },
];

export const Empty: Story = {
  args: {
    buttonNumber: 1,
    currentValue: { id: '0', name: 'None', type: 'none' },
    scripts: demoScripts,
    playlists: demoPlaylists,
  },
};

export const WithScript: Story = {
  args: {
    buttonNumber: 2,
    currentValue: { id: '1', name: 'Open Dome', type: 'script' },
    scripts: demoScripts,
    playlists: demoPlaylists,
  },
};

export const WithPlaylist: Story = {
  args: {
    buttonNumber: 3,
    currentValue: { id: 'p_1', name: 'Parade Mode', type: 'playlist' },
    scripts: demoScripts,
    playlists: demoPlaylists,
  },
};
