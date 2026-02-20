<script setup lang="ts">
import { useToast } from '@/composables/useToast';
import { usePlaylistsStore } from '@/stores/playlists';
import { ref, onMounted, computed } from 'vue';
import { useRouter } from 'vue-router';

const router = useRouter();
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
  await playlistStore.loadPlaylists();
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
    success('Playlist deleted successfully');
  } else {
    error('Failed to delete playlist');
  }
  closeDeleteModal();
};

const copyPlaylist = async (id: string) => {
  const result = await playlistStore.copyPlaylist(id);
  if (result.success) {
    success('Playlist copied successfully!');
  } else {
    error('Error copying playlist. Check logs.');
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
        <button
          data-testid="save_module_settings"
          class="btn btn-primary w-24"
          @click="newPlaylist"
        >
          {{ $t('playlists_view.new') }}
        </button>
      </div>
      <div class="flex flex-row flex-nowrap">
        <div class="grow"></div>
        <div class="px-5 max-w-250 grow-20">
          <table class="table w-full">
            <thead class="text-2xl bg-primary text-white rounded-t-lg">
              <tr>
                <th class="w-1/3 first:rounded-tl-lg">Playlist Name</th>
                <th class="w-2/3">Description</th>
                <th class="text-center last:rounded-tr-lg">Actions</th>
              </tr>
            </thead>
            <tbody>
              <AstrosPlaylistRow
                v-for="playlist in filteredPlaylists"
                :key="playlist.id"
                :playlist="playlist"
                @edit="editPlaylist"
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
          <h3 class="font-bold text-lg">Delete Playlist</h3>
          <p class="py-4">Are you sure you want to delete playlist "{{ deletePlaylistName }}"?</p>
          <div class="modal-action">
            <button
              class="btn btn-error"
              @click="confirmDelete"
            >
              Delete
            </button>
            <button
              class="btn"
              @click="closeDeleteModal"
            >
              Cancel
            </button>
          </div>
        </div>
        <form
          method="dialog"
          class="modal-backdrop"
          @click="closeDeleteModal"
        >
          <button>Close</button>
        </form>
      </dialog>
    </template>
  </AstrosLayout>
</template>
