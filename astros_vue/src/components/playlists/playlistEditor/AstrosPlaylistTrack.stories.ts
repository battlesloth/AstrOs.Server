import type { Meta, StoryObj } from '@storybook/vue3';
import AstrosPlaylistTrack from './AstrosPlaylistTrack.vue';
import { TrackType } from '@/enums/playlists/trackType';
import { v4 as uuid } from 'uuid';
import type { PlaylistTrack } from '@/models/playlists/playlistTrack';
import { createPinia } from 'pinia';
import { usePlaylistsStore } from '@/stores/playlists';
import { createMockPlaylists, createMockScripts } from '@/mocks/handlers/playlistsMockData';

// Helper function to create mock playlist track
function createPlaylistTrack(
  trackName: string,
  idx: number = 0,
  durationDS: number = 100,
  trackType: TrackType = TrackType.Script,
  playlistId: string = uuid(),
): PlaylistTrack {
  return {
    id: uuid(),
    playlistId: playlistId,
    idx: idx,
    durationDS: durationDS,
    trackType: trackType,
    trackId: uuid(),
    trackName: trackName,
  };
}

const meta = {
  title: 'Components/Playlists/PlaylistEditor/PlaylistTrack',
  component: AstrosPlaylistTrack,
  render: (args: any) => ({
    components: { AstrosPlaylistTrack },
    setup() {
      const pinia = createPinia();
      const playlistsStore = usePlaylistsStore(pinia);
      playlistsStore.playlists = createMockPlaylists() as any;
      playlistsStore.scripts = createMockScripts() as any;
      return { args, pinia };
    },
    template: '<AstrosPlaylistTrack v-bind="args" />',
  }),
  args: {
    track: createPlaylistTrack('Open Dome'),
  },
  tags: ['autodocs'],
} satisfies Meta<typeof AstrosPlaylistTrack>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    track: createPlaylistTrack('Open Dome'),
  },
};
