<script setup lang="ts">
import { computed, ref } from 'vue';
import type { Playlist } from '@/models/playlists/playlist';
import type { PlaylistTrack } from '@/models/playlists/playlistTrack';
import { TrackType } from '@/enums/playlists/trackType';
import { v4 as uuid } from 'uuid';
import AstrosPlaylistTrack from './AstrosPlaylistTrack.vue';

const playlist = defineModel<Playlist>('playlist', { required: true });

defineEmits<{
  save: [];
  cancel: [];
}>();

const sortedTracks = computed(() => [...playlist.value.tracks].sort((a, b) => a.idx - b.idx));

const dragFromIdx = ref<number | null>(null);
const dragOverIdx = ref<number | null>(null);

function addTrack() {
  const newTrack: PlaylistTrack = {
    id: uuid(),
    playlistId: playlist.value.id,
    idx: playlist.value.tracks.length,
    durationDS: 0,
    trackType: TrackType.Script,
    trackId: '',
    trackName: '',
  };
  playlist.value.tracks.push(newTrack);
}

function removeTrack(trackId: string) {
  playlist.value.tracks = playlist.value.tracks
    .filter((t) => t.id !== trackId)
    .map((t, i) => ({ ...t, idx: i }));
}

function moveUp(idx: number) {
  if (idx <= 0) return;
  const tracks = playlist.value.tracks;
  const current = tracks.find((t) => t.idx === idx);
  const above = tracks.find((t) => t.idx === idx - 1);
  if (current && above) {
    current.idx = idx - 1;
    above.idx = idx;
  }
}

function moveDown(idx: number) {
  if (idx >= playlist.value.tracks.length - 1) return;
  const tracks = playlist.value.tracks;
  const current = tracks.find((t) => t.idx === idx);
  const below = tracks.find((t) => t.idx === idx + 1);
  if (current && below) {
    current.idx = idx + 1;
    below.idx = idx;
  }
}

function reorder(fromIdx: number, toIdx: number) {
  if (fromIdx === toIdx) return;
  const tracks = playlist.value.tracks;
  const direction = fromIdx < toIdx ? 1 : -1;
  const moving = tracks.find((t) => t.idx === fromIdx);
  if (!moving) return;

  for (const track of tracks) {
    if (track === moving) continue;
    if (direction === 1 && track.idx > fromIdx && track.idx <= toIdx) {
      track.idx -= 1;
    } else if (direction === -1 && track.idx < fromIdx && track.idx >= toIdx) {
      track.idx += 1;
    }
  }
  moving.idx = toIdx;
}

function onDragStart(event: DragEvent, idx: number) {
  dragFromIdx.value = idx;
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
  }
}

function onDragOver(event: DragEvent, idx: number) {
  event.preventDefault();
  dragOverIdx.value = idx;
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move';
  }
}

function onDrop(event: DragEvent, toIdx: number) {
  event.preventDefault();
  if (dragFromIdx.value !== null) {
    reorder(dragFromIdx.value, toIdx);
  }
  dragFromIdx.value = null;
  dragOverIdx.value = null;
}

function onDragEnd() {
  dragFromIdx.value = null;
  dragOverIdx.value = null;
}

function trackIndex(track: PlaylistTrack): number {
  return playlist.value.tracks.findIndex((t) => t.id === track.id);
}

function getTrack(track: PlaylistTrack): PlaylistTrack {
  return playlist.value.tracks[trackIndex(track)]!;
}

function setTrack(track: PlaylistTrack, value: PlaylistTrack) {
  const idx = trackIndex(track);
  if (idx >= 0) playlist.value.tracks[idx] = value;
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div class="grow flex flex-col gap-2">
        <input
          v-model="playlist.playlistName"
          data-testid="playlist-name"
          type="text"
          :placeholder="$t('playlists_view.title')"
          class="input input-bordered input-sm w-full text-lg font-semibold"
        />
        <input
          v-model="playlist.description"
          data-testid="playlist-description"
          type="text"
          placeholder="Description"
          class="input input-bordered input-sm w-full"
        />
      </div>
      <div class="flex gap-2 ml-4">
        <button
          data-testid="playlist-add-track"
          class="btn btn-outline btn-sm self-start"
          @click="addTrack"
        >
          <v-icon name="io-add" />
          {{ $t('playlists_view.add_track') }}
        </button>
        <button
          data-testid="playlist-save"
          class="btn btn-primary btn-sm"
          @click="$emit('save')"
        >
          {{ $t('save') }}
        </button>
        <button
          data-testid="playlist-cancel"
          class="btn btn-ghost btn-sm"
          @click="$emit('cancel')"
        >
          {{ $t('close') }}
        </button>
      </div>
    </div>

    <div class="divider my-0"></div>

    <!-- Track List -->
    <div class="flex flex-col gap-3">
      <div
        v-for="track in sortedTracks"
        :key="track.id"
        draggable="true"
        :class="[
          'flex items-start gap-2 rounded-lg border border-base-300 p-3 transition-colors cursor-grab',
          {
            'opacity-50 cursor-grabbing!': dragFromIdx === track.idx,
            'border-primary': dragOverIdx === track.idx && dragFromIdx !== track.idx,
          },
        ]"
        @dragstart="onDragStart($event, track.idx)"
        @dragover="onDragOver($event, track.idx)"
        @drop="onDrop($event, track.idx)"
        @dragend="onDragEnd"
      >
        <!-- Reorder buttons -->
        <div class="flex flex-col justify-between self-stretch">
          <button
            :data-testid="`playlist-track-${track.idx}-up`"
            class="btn btn-ghost btn-xs btn-square"
            :disabled="track.idx === 0"
            @click="moveUp(track.idx)"
          >
            <v-icon name="io-chevron-up" />
          </button>
          <button
            :data-testid="`playlist-track-${track.idx}-down`"
            class="btn btn-ghost btn-xs btn-square"
            :disabled="track.idx === sortedTracks.length - 1"
            @click="moveDown(track.idx)"
          >
            <v-icon name="io-chevron-down" />
          </button>
        </div>

        <!-- Track component -->
        <AstrosPlaylistTrack
          :track="getTrack(track)"
          @update:track="setTrack(track, $event)"
          @remove="removeTrack(track.id)"
        />
      </div>

      <div
        v-if="sortedTracks.length === 0"
        class="text-center text-sm opacity-50 py-4"
      >
        {{ $t('playlists_view.no_tracks') }}
      </div>
    </div>
  </div>
</template>
