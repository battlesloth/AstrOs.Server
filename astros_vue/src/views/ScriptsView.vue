<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import { AstrosLayout, AstrosScriptRow } from '@/components';
import { useToast } from '@/composables/useToast';
import { useScriptsStore } from '@/stores/scripts';
import { useSystemStatusStore } from '@/stores/systemStatus';
import { UploadStatus, Location } from '@/enums';
import AstrosFieldFilter from '@/components/common/fields/AstrosFieldFilter.vue';
import { useI18n } from 'vue-i18n';

const router = useRouter();
const { t } = useI18n();
const { success, error } = useToast();

const scriptStore = useScriptsStore();
const systemStatusStore = useSystemStatusStore();

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
      <div class="flex items-center gap-4 p-4 bg-r2-complement shrink-0 mb-4">
        <h1 class="text-2xl font-bold">{{ $t('scripts_view.title') }}</h1>
        <div class="grow flex justify-center">
          <AstrosFieldFilter
            class="max-w-200"
            v-model="filterText"
          />
        </div>
        <div
          :class="systemStatusStore.readOnly ? 'tooltip' : ''"
          :data-tip="$t('systemStatus.readOnly.disabled')"
        >
          <button
            data-testid="save_module_settings"
            class="btn btn-primary w-24"
            :disabled="systemStatusStore.readOnly"
            @click="newScript"
          >
            {{ $t('scripts_view.new') }}
          </button>
        </div>
      </div>
      <div class="flex flex-row flex-nowrap">
        <div class="grow"></div>
        <div class="px-5 max-w-250 grow-20">
          <table class="table w-full">
            <thead class="text-2xl bg-primary text-white rounded-t-lg">
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
            <div
              :class="systemStatusStore.readOnly ? 'tooltip' : ''"
              :data-tip="$t('systemStatus.readOnly.disabled')"
            >
              <button
                class="btn btn-error"
                :disabled="systemStatusStore.readOnly"
                @click="confirmDelete"
              >
                {{ $t('delete') }}
              </button>
            </div>
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
