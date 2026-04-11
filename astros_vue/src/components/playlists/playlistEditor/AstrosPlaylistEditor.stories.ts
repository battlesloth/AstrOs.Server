import type { Meta, StoryObj } from '@storybook/vue3';
import { fn } from 'storybook/test';
import { provide, reactive } from 'vue';
import { createPinia } from 'pinia';
import {
  routerKey,
  routeLocationKey,
  type Router,
  type RouteLocationNormalizedLoaded,
} from 'vue-router';
import { v4 as uuid } from 'uuid';

import AstrosPlaylistEditor from './AstrosPlaylistEditor.vue';
import { usePlaylistsStore } from '@/stores/playlists';
import { PlaylistType } from '@/enums/playlists/playlistType';
import { TrackType } from '@/enums/playlists/trackType';
import type { Playlist } from '@/models/playlists/playlist';
import type { PlaylistTrack } from '@/models/playlists/playlistTrack';
import type { ScriptData } from '@/models/playlists/scriptData';

// --- sample data ---

function createSampleTrack(playlistId: string, idx: number, name: string): PlaylistTrack {
  return {
    id: uuid(),
    playlistId,
    idx,
    durationDS: 100,
    durationMaxDS: 0,
    randomWait: false,
    trackType: TrackType.Script,
    trackId: uuid(),
    trackName: name,
  };
}

function createSamplePlaylist(trackCount: number = 0): Playlist {
  const id = uuid();
  return {
    id,
    playlistName: 'Sneaky Periscope',
    description: 'Periscope playlist for sneaky observations',
    playlistType: PlaylistType.Sequential,
    tracks: Array.from({ length: trackCount }, (_, i) =>
      createSampleTrack(id, i, `Track ${i + 1}`),
    ),
    settings: {
      repeat: false,
      repeatCount: 0,
      randomDelay: false,
      delayMin: 0,
      delayMax: 0,
    },
  };
}

const sampleScripts: ScriptData[] = [
  { id: uuid(), scriptName: 'Open Dome', description: 'Opens the observatory dome' },
  { id: uuid(), scriptName: 'Close Dome', description: 'Closes the observatory dome' },
  { id: uuid(), scriptName: 'Start Tracking', description: 'Begins telescope tracking' },
  { id: uuid(), scriptName: 'Stop Tracking', description: 'Stops telescope tracking' },
];

const samplePlaylistsLibrary: Playlist[] = [createSamplePlaylist(), createSamplePlaylist()];

// --- story setup ---

/**
 * AstrosPlaylistEditor is a "smart" view component that reads its playlist
 * from usePlaylistsStore() and picks which playlist to load by reading
 * route.params.id inside onMounted. To render it in isolation we:
 *
 *   1. Create a local Pinia, pre-seed selectedPlaylist + playlists + scripts,
 *      and stub the store methods that would otherwise make API calls in
 *      onMounted.
 *   2. provide() vue-router's internal injection keys with a fake router and
 *      route so useRoute()/useRouter() resolve inside the component's setup.
 *
 * This avoids installing pinia or vue-router globally in preview.ts, which
 * would ripple into every other story that currently creates its own pinia
 * locally.
 */
type EditorStoryArgs = {
  playlist: Playlist;
};

const meta = {
  title: 'Components/Playlists/PlaylistEditor',
  component: AstrosPlaylistEditor,
  render: (args: EditorStoryArgs) => ({
    components: { AstrosPlaylistEditor },
    setup() {
      // Pinia — seed the store with the story's data and no-op the methods
      // AstrosPlaylistEditor calls in onMounted so they don't hit real APIs
      // or clobber the seeded state.
      const pinia = createPinia();
      const playlistsStore = usePlaylistsStore(pinia);
      playlistsStore.selectedPlaylist = args.playlist;
      playlistsStore.playlists = samplePlaylistsLibrary;
      playlistsStore.scripts = sampleScripts;
      playlistsStore.loadData = async () => ({ success: true });
      playlistsStore.loadPlaylist = async () => ({ success: true });
      playlistsStore.createNewPlaylist = async () => {};

      // Vue Router — provide just enough for useRoute()/useRouter() inside
      // AstrosPlaylistEditor to resolve. The component only reads
      // route.params.id and calls router.push on load failure (which can't
      // happen here because loadPlaylist is stubbed to always succeed).
      const fakeRoute = reactive({
        params: { id: args.playlist.id },
        path: `/playlists/${args.playlist.id}`,
        fullPath: `/playlists/${args.playlist.id}`,
        name: 'playlist-editor',
        hash: '',
        query: {},
        matched: [],
        meta: {},
        redirectedFrom: undefined,
      }) as unknown as RouteLocationNormalizedLoaded;

      const fakeRouter = {
        push: fn(),
        replace: fn(),
        currentRoute: { value: fakeRoute },
      } as unknown as Router;

      provide(routerKey, fakeRouter);
      provide(routeLocationKey, fakeRoute);

      return { args };
    },
    template: '<AstrosPlaylistEditor />',
  }),
  args: {
    playlist: createSamplePlaylist(),
  },
  tags: ['autodocs'],
} satisfies Meta<EditorStoryArgs>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty playlist with no tracks */
export const Empty: Story = {
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
