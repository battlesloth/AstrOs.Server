<script setup lang="ts">
import { useToast } from '@/composables/useToast';
import { usePlaylistsStore } from '@/stores/playlists';
import { ref, onMounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { AstrosLayout, AstrosPlaylistRow } from '@/components';
import AstrosFieldFilter from '@/components/common/fields/AstrosFieldFilter.vue';
import AstrosWriteButton from '@/components/common/AstrosWriteButton.vue';

const router = useRouter();
const { t } = useI18n();
const { success, error } = useToast();

const playlistStore = usePlaylistsStore();

const showDeleteModal = ref(false);
const deletePlaylistId = ref('');
const deletePlaylistName = ref('');
const filterText = ref('');

const filteredPlaylists = computed(() => {
  let playlists = playlistStore.playlists;

  if (filterText.value) {
    const lowerFilter = filterText.value.toLowerCase();
    playlists = playlists.filter(
      (playlist) =>
        playlist.playlistName.toLowerCase().includes(lowerFilter) ||
        playlist.description.toLowerCase().includes(lowerFilter),
    );
  }

  return [...playlists].sort((a, b) => a.playlistName.localeCompare(b.playlistName));
});

// Load playlists on mount
onMounted(async () => {
  await playlistStore.loadData();
});

const newPlaylist = () => {
  router.push('/playlist/0');
};

const openDeleteModal = (id: string, name: string) => {
  deletePlaylistId.value = id;
  deletePlaylistName.value = name;
  showDeleteModal.value = true;
};

const closeDeleteModal = () => {
  showDeleteModal.value = false;
  deletePlaylistId.value = '';
  deletePlaylistName.value = '';
};

const confirmDelete = async () => {
  const result = await playlistStore.deletePlaylist(deletePlaylistId.value);
  if (result.success) {
    success(t('playlists_view.delete_success'));
  } else {
    error(t('playlists_view.delete_error'));
  }
  closeDeleteModal();
};

const runPlaylist = async (id: string) => {
  const result = await playlistStore.runPlaylist(id);
  if (result.success) {
    success(t('playlists_view.run_success'));
  } else {
    error(t('playlists_view.run_error'));
  }
};

const copyPlaylist = async (id: string) => {
  const result = await playlistStore.copyPlaylist(id);
  if (result.success) {
    success(t('playlists_view.copy_success'));
  } else {
    error(t('playlists_view.copy_error'));
  }
};

const editPlaylist = (id: string) => {
  router.push(`/playlist/${id}`);
};
</script>

<template>
  <AstrosLayout>
    <template v-slot:main>
      <!-- Header with buttons -->
      <div class="flex items-center gap-4 p-4 bg-r2-complement shrink-0 mb-4">
        <h1 class="text-2xl font-bold">{{ $t('playlists_view.title') }}</h1>
        <div class="grow flex justify-center">
          <AstrosFieldFilter
            class="max-w-200"
            v-model="filterText"
          />
        </div>
        <AstrosWriteButton
          data-testid="save_module_settings"
          class="btn btn-primary w-24"
          aria-label="$t('playlists_view.new')"
          @click="newPlaylist"
        >
          {{ $t('playlists_view.new') }}
        </AstrosWriteButton>
      </div>
      <div class="flex flex-row flex-nowrap">
        <div class="grow"></div>
        <div class="px-5 max-w-250 grow-20">
          <table class="table w-full">
            <thead class="text-2xl bg-primary text-white rounded-t-lg">
              <tr>
                <th class="w-1/3 first:rounded-tl-lg">{{ $t('playlists_view.playlist_name') }}</th>
                <th class="w-2/3">{{ $t('description') }}</th>
                <th class="text-center last:rounded-tr-lg">{{ $t('actions') }}</th>
              </tr>
            </thead>
            <tbody>
              <AstrosPlaylistRow
                v-for="playlist in filteredPlaylists"
                :key="playlist.id"
                :playlist="playlist"
                @edit="editPlaylist"
                @play="runPlaylist"
                @copy="copyPlaylist"
                @delete="openDeleteModal"
              >
              </AstrosPlaylistRow>
            </tbody>
          </table>
        </div>
        <div class="grow"></div>
      </div>

      <!-- Delete Confirmation Modal -->
      <dialog
        v-if="showDeleteModal"
        class="modal modal-open"
      >
        <div class="modal-box">
          <h3 class="font-bold text-lg">{{ $t('playlists_view.delete_title') }}</h3>
          <p class="py-4">
            {{ $t('playlists_view.delete_confirm', { name: deletePlaylistName }) }}
          </p>
          <div class="modal-action">
            <AstrosWriteButton
              class="btn btn-error"
              @click="confirmDelete"
            >
              {{ $t('delete') }}
            </AstrosWriteButton>
            <button
              class="btn"
              @click="closeDeleteModal"
            >
              {{ $t('cancel') }}
            </button>
          </div>
        </div>
        <form
          method="dialog"
          class="modal-backdrop"
          @click="closeDeleteModal"
        >
          <button>{{ $t('close') }}</button>
        </form>
      </dialog>
    </template>
  </AstrosLayout>
</template>
