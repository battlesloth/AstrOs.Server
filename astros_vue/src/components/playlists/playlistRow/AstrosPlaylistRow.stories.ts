import type { Meta, StoryObj } from '@storybook/vue3';
import { fn } from 'storybook/test';
import AstrosPlaylistRow from './AstrosPlaylistRow.vue';

const meta = {
  title: 'Components/Playlists/PlaylistRow',
  component: AstrosPlaylistRow,
  parameters: {
    layout: 'padded',
  },
  decorators: [
    () => ({
      template: `
        <table class="table w-full">
          <thead>
            <tr>
              <th class="w-1/3">Playlist Name</th>
              <th class="w-2/3">Description</th>
              <th class="text-center">Actions</th>
            </tr>
          </thead>
          <tbody>
            <story />
          </tbody>
        </table>
      `,
    }),
  ],
  args: {
    onEdit: fn(),
    onCopy: fn(),
    onDelete: fn(),
  },
  tags: ['autodocs'],
} satisfies Meta<typeof AstrosPlaylistRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    playlist: {
      id: '1',
      playlistName: 'Sneaky Periscope',
      description: 'Pariscope playlist for sneaky observations',
    },
  },
};
