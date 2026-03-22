<script setup lang="ts">
import { computed } from 'vue';
import { TrackType } from '@/enums/playlists/trackType';
import type { PlaylistTrack } from '@/models/playlists/playlistTrack';
import { usePlaylistsStore } from '@/stores/playlists';
import AstrosSearchSelect from '@/components/common/searchableSelect/AstrosSearchSelect.vue';
import type { SearchSelectOption } from '@/components/common/searchableSelect/AstrosSearchSelect.vue';

const track = defineModel<PlaylistTrack>('track', { required: true });
const playlistsStore = usePlaylistsStore();

defineEmits<{
  remove: [];
}>();

const playlistOptions = computed<SearchSelectOption[]>(() =>
  playlistsStore.playlists.map((p) => ({ id: p.id, label: p.playlistName })),
);

const scriptOptions = computed<SearchSelectOption[]>(() =>
  playlistsStore.scripts.map((s) => ({ id: s.id, label: s.scriptName })),
);
</script>

<template>
  <div class="min-w-87.5 grow">
    <div class="flex items-center gap-4">
      <div class="grow">
        <select
          v-model="track.trackType"
          :data-testid="`playlist-track-type`"
          class="select select-bordered select-sm w-full"
        >
          <option
            v-for="type in Object.values(TrackType)"
            :key="type"
            :value="type"
          >
            {{ $t(`playlists_view.track_types.${type.toLowerCase()}`) }}
          </option>
        </select>
      </div>
      <button
        :data-testid="`playlist-track-remove`"
        @click="$emit('remove')"
        class="btn btn-error btn-sm"
      >
        {{ $t('remove') }}
      </button>
    </div>
    <div
      v-if="track.trackType === TrackType.Playlist"
      class="mt-3"
    >
      <AstrosSearchSelect
        v-model="track.trackId"
        :options="playlistOptions"
        data-testid="playlist-track-playlist"
      />
    </div>
    <div
      v-else-if="track.trackType === TrackType.Script"
      class="mt-3"
    >
      <AstrosSearchSelect
        v-model="track.trackId"
        :options="scriptOptions"
        data-testid="playlist-track-script"
      />
    </div>
    <div
      v-else
      class="mt-3"
    >
      <input
        v-model="track.trackName"
        :data-testid="`playlist-track-name`"
        type="text"
        placeholder="Track Name"
        class="input input-bordered input-sm w-full"
      />
      <input
        v-model="track.durationDS"
        :data-testid="`playlist-track-duration`"
        type="text"
        placeholder="Track Duration (seconds)"
        class="input input-bordered input-sm w-full mt-3"
      />
    </div>
  </div>
</template>
