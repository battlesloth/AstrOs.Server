<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import { AstrosLayout, AstrosScriptRow } from '@/components';
import { useToast } from '@/composables/useToast';
import { useScriptsStore } from '@/stores/scripts';
import { UploadStatus, Location } from '@/enums';
import AstrosFieldFilter from '@/components/common/fields/AstrosFieldFilter.vue';
import AstrosWriteButton from '@/components/common/AstrosWriteButton.vue';
import { useI18n } from 'vue-i18n';

const router = useRouter();
const { t } = useI18n();
const { success, error } = useToast();

const scriptStore = useScriptsStore();

const showDeleteModal = ref(false);
const deleteScriptId = ref('');
const deleteScriptName = ref('');
const filterText = ref('');

const locations: Location[] = [Location.BODY, Location.CORE, Location.DOME];

const filteredScripts = computed(() => {
  let scripts = scriptStore.scripts;

  if (filterText.value) {
    const lowerFilter = filterText.value.toLowerCase();
    scripts = scripts.filter(
      (script) =>
        script.scriptName.toLowerCase().includes(lowerFilter) ||
        script.description.toLowerCase().includes(lowerFilter),
    );
  }

  return [...scripts].sort((a, b) => a.scriptName.localeCompare(b.scriptName));
});

// Load scripts on mount
onMounted(async () => {
  await scriptStore.loadScripts();
});

const newScript = () => {
  router.push('/scripter/0');
};

const openDeleteModal = (id: string, name: string) => {
  deleteScriptId.value = id;
  deleteScriptName.value = name;
  showDeleteModal.value = true;
};

const closeDeleteModal = () => {
  showDeleteModal.value = false;
  deleteScriptId.value = '';
  deleteScriptName.value = '';
};

const confirmDelete = async () => {
  const result = await scriptStore.deleteScript(deleteScriptId.value);
  if (result.success) {
    success(t('scripts_view.delete_success'));
  } else {
    error(t('scripts_view.delete_error'));
  }
  closeDeleteModal();
};

const runScript = async (id: string) => {
  const result = await scriptStore.runScript(id);
  if (result.success) {
    success(t('scripts_view.run_success'));
  } else {
    error(t('scripts_view.run_error'));
  }
};

const copyScript = async (id: string) => {
  const result = await scriptStore.copyScript(id);
  if (result.success) {
    success(t('scripts_view.copy_success'));
  } else {
    error(t('scripts_view.copy_error'));
  }
};

const uploadScript = async (id: string) => {
  const result = await scriptStore.uploadScript(id);
  if (result.success) {
    setUploadingStatus(id);
    success(t('scripts_view.upload_success'));
  } else {
    error(t('scripts_view.upload_error'));
  }
};

const setUploadingStatus = (scriptId: string) => {
  const script = scriptStore.scripts.find((s) => s.id === scriptId);
  if (!script) return;

  for (const location of locations) {
    const status = script.deploymentStatus[location];
    if (status) {
      status.value = UploadStatus.UPLOADING;
    }
  }
};

const editScript = (id: string) => {
  router.push(`/scripter/${id}`);
};
</script>

<template>
  <AstrosLayout>
    <template v-slot:main>
      <!-- Header with buttons -->
      <!-- overflow-x-clip: in read-only or flash mode, New's hidden tooltip (up to 320 px) would
           widen the page. -->
      <div class="flex items-center gap-4 p-4 bg-r2-complement shrink-0 mb-4 overflow-x-clip">
        <h1 class="text-2xl font-bold">{{ $t('scripts_view.title') }}</h1>
        <div class="grow flex justify-center">
          <AstrosFieldFilter
            class="max-w-200"
            v-model="filterText"
          />
        </div>
        <AstrosWriteButton
          data-testid="save_module_settings"
          class="btn btn-primary w-24"
          @click="newScript"
        >
          {{ $t('scripts_view.new') }}
        </AstrosWriteButton>
      </div>
      <!-- The list scrolls here, under the title bar, so the page never does. Relies on AstrosLayout's
           .drawer-content being a 100vh flex column (flex-1 min-h-0 takes the rest of it).
           scroll-pt-16 clears the pinned header when focus moves to a row under it. -->
      <div class="flex flex-row flex-nowrap flex-1 min-h-0 overflow-auto scroll-pt-16">
        <div class="grow"></div>
        <div class="px-5 max-w-250 grow-20">
          <table class="table w-full">
            <!-- Pinned by hand: DaisyUI's table-pin-rows paints the row bg-base-100 over bg-primary.
                 z-1: above the rows' positioned badges, below their tooltip bubbles (z-index 2). -->
            <thead class="text-2xl bg-primary text-white rounded-t-lg sticky top-0 z-1">
              <tr>
                <th class="w-1/4 first:rounded-tl-lg">{{ $t('scripts_view.script_name') }}</th>
                <th class="w-2/4">{{ $t('description') }}</th>
                <th class="text-center">{{ $t('status') }}</th>
                <th class="text-center">{{ $t('scripts_view.playlists') }}</th>
                <th class="text-center last:rounded-tr-lg">{{ $t('actions') }}</th>
              </tr>
            </thead>
            <tbody>
              <AstrosScriptRow
                v-for="script in filteredScripts"
                :key="script.id"
                :script="script"
                :locations="locations"
                :playlist-count="script.playlistCount"
                @edit="editScript"
                @copy="copyScript"
                @upload="uploadScript"
                @run="runScript"
                @delete="openDeleteModal"
              >
              </AstrosScriptRow>
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
          <h3 class="font-bold text-lg">{{ $t('scripts_view.delete_title') }}</h3>
          <p class="py-4">
            <template v-if="filteredScripts.find((s) => s.id === deleteScriptId)?.playlistCount">
              {{
                $t('scripts_view.delete_confirm_with_playlists', {
                  name: deleteScriptName,
                  count: filteredScripts.find((s) => s.id === deleteScriptId)!.playlistCount,
                })
              }}
            </template>
            <template v-else>
              {{ $t('scripts_view.delete_confirm', { name: deleteScriptName }) }}
            </template>
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
