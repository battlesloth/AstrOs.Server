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

const durationDisplay = computed(() => (Math.round(track.value.durationDS) / 10).toFixed(1));

const durationMaxDisplay = computed(() => (Math.round(track.value.durationMaxDS) / 10).toFixed(1));

function setDuration(e: Event) {
  const val = parseFloat((e.target as HTMLInputElement).value);
  if (!isNaN(val) && val >= 0) {
    track.value.durationDS = Math.round(val * 10);
    if (track.value.durationMaxDS < track.value.durationDS) {
      track.value.durationMaxDS = track.value.durationDS;
    }
  }
}

function setDurationMax(e: Event) {
  const val = parseFloat((e.target as HTMLInputElement).value);
  if (!isNaN(val) && val >= 0) {
    let ds = Math.round(val * 10);
    if (ds < track.value.durationDS) {
      ds = track.value.durationDS;
    }
    track.value.durationMaxDS = ds;
  }
}
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
            {{ $t(`playlist_editor_view.track_types.${type.toLowerCase()}`) }}
          </option>
        </select>
      </div>
      <button
        :data-testid="`playlist-track-remove`"
        @click="$emit('remove')"
        class="btn btn-error btn-sm"
      >
        {{ $t('playlist_editor_view.remove') }}
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
      <div class="flex items-center gap-4">
        <label class="cursor-pointer flex items-center gap-2 shrink-0">
          <span class="label-text shrink-0">{{ $t('playlist_editor_view.random_wait') }}</span>
          <input
            v-model="track.randomWait"
            type="checkbox"
            class="checkbox checkbox-sm"
            data-testid="playlist-track-random-wait"
          />
        </label>
        <div class="flex items-center gap-2">
          <span
            v-if="track.randomWait"
            class="label-text shrink-0"
            >{{ $t('playlist_editor_view.min') }}</span
          >
          <input
            :value="durationDisplay"
            @change="setDuration"
            :data-testid="`playlist-track-duration`"
            type="number"
            step="0.1"
            min="0"
            :placeholder="$t('playlist_editor_view.track_duration')"
            class="input input-bordered input-sm w-24"
          />
        </div>
        <div
          v-if="track.randomWait"
          class="flex items-center gap-2"
        >
          <span class="label-text shrink-0">{{ $t('playlist_editor_view.max') }}</span>
          <input
            :value="durationMaxDisplay"
            @change="setDurationMax"
            data-testid="playlist-track-duration-max"
            type="number"
            step="0.1"
            min="0"
            :placeholder="$t('playlist_editor_view.track_duration_max')"
            class="input input-bordered input-sm w-24"
          />
        </div>
      </div>
    </div>
  </div>
</template>
