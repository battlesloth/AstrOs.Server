import type { Meta, StoryObj } from '@storybook/vue3';
import { fn } from 'storybook/test';
import AstrosPlaylistEditor from './AstrosPlaylistEditor.vue';
import { createPinia } from 'pinia';
import { usePlaylistsStore } from '@/stores/playlists';
import { createMockPlaylists, createMockScripts } from '@/mocks/handlers/playlistsMockData';
import { TrackType } from '@/enums/playlists/trackType';
import { v4 as uuid } from 'uuid';
import type { Playlist } from '@/models/playlists/playlist';
import { ref } from 'vue';

function createSamplePlaylist(trackCount: number = 0): Playlist {
  const id = uuid();
  return {
    id,
    playlistName: 'Sneaky Periscope',
    description: 'Periscope playlist for sneaky observations',
    durationDS: 0,
    tracks: Array.from({ length: trackCount }, (_, i) => ({
      id: uuid(),
      playlistId: id,
      idx: i,
      durationDS: 100,
      trackType: TrackType.Script,
      trackId: uuid(),
      trackName: `Track ${i + 1}`,
    })),
  };
}

const meta = {
  title: 'Components/Playlists/PlaylistEditor',
  component: AstrosPlaylistEditor,
  render: (args: any) => ({
    components: { AstrosPlaylistEditor },
    setup() {
      const pinia = createPinia();
      const playlistsStore = usePlaylistsStore(pinia);
      playlistsStore.playlists = createMockPlaylists() as any;
      playlistsStore.scripts = createMockScripts() as any;
      const playlist = ref(args.playlist);
      return { args, pinia, playlist };
    },
    template: '<AstrosPlaylistEditor v-model:playlist="playlist" v-bind="args" />',
  }),
  args: {
    onSave: fn(),
    onCancel: fn(),
    playlist: createSamplePlaylist(),
  },
  tags: ['autodocs'],
} satisfies Meta<typeof AstrosPlaylistEditor>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty playlist with no tracks */
export const Default: Story = {
  args: {
    playlist: createSamplePlaylist(),
  },
};

/** Playlist with several tracks to demonstrate reordering */
export const WithTracks: Story = {
  args: {
    playlist: createSamplePlaylist(5),
  },
};
