<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { PlaylistTrack } from '@/models/playlists/playlistTrack';
import { TrackType } from '@/enums/playlists/trackType';
import { PlaylistType } from '@/enums/playlists/playlistType';
import { v4 as uuid } from 'uuid';
import AstrosPlaylistSettings from './AstrosPlaylistSettings.vue';
import AstrosPlaylistTrack from './AstrosPlaylistTrack.vue';
import { usePlaylistsStore } from '@/stores/playlists';
import { useRoute, useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';
import { AstrosHtmlModal } from '@/components/modals';
import { ModalType } from '@/enums';
import { useI18n } from 'vue-i18n';
import { useToast } from '@/composables/useToast';

const { t } = useI18n();
const { success, error } = useToast();

const route = useRoute();
const router = useRouter();
const playlistStore = usePlaylistsStore();
const { selectedPlaylist } = storeToRefs(playlistStore);
const playlist = computed(() => selectedPlaylist.value!);

onMounted(async () => {
  const id = route.params.id as string;

  if (id === '0') {
    await playlistStore.createNewPlaylist();
  } else {
    const result = await playlistStore.loadPlaylist(id);
    if (!result.success) {
      router.push('/playlists');
    }
  }
});

const sortedTracks = computed(() => [...playlist.value.tracks].sort((a, b) => a.idx - b.idx));

const dragFromIdx = ref<number | null>(null);
const dragOverIdx = ref<number | null>(null);
const showModal = ref(ModalType.CLOSE_ALL);

function showHelp() {
  showModal.value = ModalType.HELP;
}

function generateHelpMessage(): string {
  return `<div class="flex flex-col gap-4 min-h-30 max-h-100 overflow-y-scroll overflow-x-hidden">
    <p>${t('playlist_editor_view.help_body')}</p>
    <div><span class="text-lg font-semibold">${t('playlist_editor_view.sequential')}</span><br/>${t('playlist_editor_view.help_sequential')}</div>
    <div><span class="text-lg font-semibold">${t('playlist_editor_view.sequentialinterruptible')}</span><br/>${t('playlist_editor_view.help_sequentialinterruptible')}</div>
    <div><span class="text-lg font-semibold">${t('playlist_editor_view.sequentialrepeatable')}</span><br/>${t('playlist_editor_view.help_sequentialrepeatable')}</div>
    <div><span class="text-lg font-semibold">${t('playlist_editor_view.shuffle')}</span><br/>${t('playlist_editor_view.help_shuffle')}</div>
    <div><span class="text-lg font-semibold">${t('playlist_editor_view.shufflewithrepeat')}</span><br/>${t('playlist_editor_view.help_shufflewithrepeat')}</div>
    <div><span class="text-lg font-semibold">${t('playlist_editor_view.shufflewithdelay')}</span><br/>${t('playlist_editor_view.help_shufflewithdelay')}</div>
    <div><span class="text-lg font-semibold">${t('playlist_editor_view.shufflewithdelayandrepeat')}</span><br/>${t('playlist_editor_view.help_shufflewithdelayandrepeat')}</div>
    </div>
    `;
}

function addTrack() {
  const newTrack: PlaylistTrack = {
    id: uuid(),
    playlistId: playlist.value.id,
    idx: playlist.value.tracks.length,
    durationDS: 0,
    randomWait: false,
    durationMaxDS: 0,
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

async function save() {
  try {
    const result = await playlistStore.saveSelectedPlaylist();

    if (!result.success) {
      error(t('playlist_editor_view.save_error'));
      return;
    }

    success(t('playlist_editor_view.save_success'));
  } catch (e: unknown) {
    console.error('Error saving playlist:', e);
    error(t('playlist_editor_view.save_error'));
  }
}
</script>

<template>
  <div
    v-if="selectedPlaylist"
    class="flex flex-col w-full h-full overflow-hidden"
  >
    <div class="flex items-center gap-4 p-4 bg-r2-complement shrink-0">
      <h1 class="text-2xl font-bold">{{ $t('playlist_editor_view.title') }}</h1>
      <div class="grow"></div>
      <button
        data-testid="save_module_settings"
        class="btn btn-primary w-24"
        @click="save"
      >
        {{ $t('playlist_editor_view.save') }}
      </button>
    </div>
    <div class="min-h-0 flex-1 flex">
      <div class="grow"></div>
      <div class="px-5 max-w-250 grow-20 flex flex-col border border-base-300 rounded-lg">
        <div class="shrink-0 p-4">
          <div class="flex items-center justify-between">
            <div class="grow flex flex-col gap-2">
              <div class="flex items-center gap-4">
                <input
                  v-model="playlist.playlistName"
                  data-testid="playlist-name"
                  type="text"
                  :placeholder="$t('playlist_editor_view.title')"
                  class="input input-bordered input-sm w-full text-lg font-semibold"
                />
                <select
                  v-model="playlist.playlistType"
                  class="select select-sm w-86"
                >
                  <option
                    v-for="type in Object.values(PlaylistType)"
                    :key="type"
                    :value="type"
                  >
                    {{ $t(`playlist_editor_view.${type.toLowerCase()}`) }}
                  </option>
                </select>
                <button
                  data-testid="playlist-help"
                  @click="showHelp()"
                  class=""
                >
                  <v-icon
                    name="io-help-circle-outline"
                    scale="1.75"
                    class="cursor-pointer opacity-70 hover:opacity-100 transition-opacity"
                  />
                </button>
                <button
                  data-testid="playlist-add-track"
                  class="btn btn-primary btn-sm"
                  @click="addTrack"
                >
                  <v-icon
                    name="io-add"
                    class="icon-white"
                  />
                  {{ $t('playlist_editor_view.add_track') }}
                </button>
              </div>
              <div class="flex items-center gap-2">
                <input
                  v-model="playlist.description"
                  data-testid="playlist-description"
                  type="text"
                  :placeholder="$t('playlist_editor_view.description')"
                  class="input input-bordered input-sm w-full"
                />
              </div>
              <!-- playlist settings-->
              <div>
                <AstrosPlaylistSettings
                  v-model="playlist.settings"
                  :playlist-type="playlist.playlistType"
                />
              </div>
            </div>
          </div>

          <div class="divider my-0"></div>
        </div>

        <!-- Track List -->
        <div class="flex flex-col gap-3 overflow-y-auto min-h-0 flex-1 p-4 pt-0">
          <div
            v-for="track in sortedTracks"
            :key="track.id"
            :class="[
              'flex items-start gap-2 rounded-lg border border-base-300 p-3 transition-colors',
              {
                'opacity-50': dragFromIdx === track.idx,
                'border-primary': dragOverIdx === track.idx && dragFromIdx !== track.idx,
              },
            ]"
            @dragover="onDragOver($event, track.idx)"
            @drop="onDrop($event, track.idx)"
            @dragend="onDragEnd"
          >
            <!-- Reorder buttons -->
            <div class="flex flex-col items-center justify-between self-stretch">
              <button
                :data-testid="`playlist-track-${track.idx}-up`"
                class="btn btn-ghost btn-xs btn-square"
                :disabled="track.idx === 0"
                @click="moveUp(track.idx)"
              >
                <v-icon name="io-chevron-up" />
              </button>
              <div
                draggable="true"
                class="cursor-grab active:cursor-grabbing px-1"
                @dragstart="onDragStart($event, track.idx)"
              >
                <v-icon name="md-draghandle" />
              </div>
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
            {{ $t('playlist_editor_view.no_tracks') }}
          </div>
        </div>
      </div>
      <div class="grow"></div>
    </div>
    <div class="shrink-0 h-9"></div>
  </div>
  <AstrosHtmlModal
    v-if="showModal === ModalType.HELP"
    :title="$t('playlist_editor_view.help_title')"
    :content="generateHelpMessage()"
    @close="showModal = ModalType.CLOSE_ALL"
  />
</template>

<style scoped>
.icon-white :deep(path) {
  stroke: white !important;
}
</style>
