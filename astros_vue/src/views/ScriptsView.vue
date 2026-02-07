<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import { AstrosLayout, AstrosScriptRow } from '@/components';
import { useToast } from '@/composables/useToast';
import { useScriptsStore } from '@/stores/scripts';
import { UploadStatus, Location } from '@/enums';
import AstrosFieldFilter from '@/components/common/fields/AstrosFieldFilter.vue';

const router = useRouter();
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
    success('Script deleted successfully');
  } else {
    error('Failed to delete script');
  }
  closeDeleteModal();
};

const runScript = async (id: string) => {
  const result = await scriptStore.runScript(id);
  if (result.success) {
    success('Script run queued!');
  } else {
    error('Error requesting upload. Check logs.');
  }
};

const copyScript = async (id: string) => {
  const result = await scriptStore.copyScript(id);
  if (result.success) {
    success('Script copied successfully!');
  } else {
    error('Error copying script. Check logs.');
  }
};

const uploadScript = async (id: string) => {
  const result = await scriptStore.uploadScript(id);
  if (result.success) {
    setUploadingStatus(id);
    success('Script upload started!');
  } else {
    error('Error requesting upload. Check logs.');
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
        <button
          data-testid="save_module_settings"
          class="btn btn-primary w-24"
          @click="newScript"
        >
          {{ $t('scripts_view.new') }}
        </button>
      </div>
      <div class="flex flex-row flex-nowrap">
        <div class="grow"></div>
        <div class="px-5 max-w-250 grow-20">
          <table class="table w-full">
            <thead class="text-2xl bg-primary text-white rounded-t-lg">
              <tr>
                <th class="w-1/3 first:rounded-tl-lg">Script Name</th>
                <th class="w-2/3">Description</th>
                <th class="text-center">Status</th>
                <th class="text-center last:rounded-tr-lg">Actions</th>
              </tr>
            </thead>
            <tbody>
              <AstrosScriptRow
                v-for="script in filteredScripts"
                :key="script.id"
                :script="script"
                :locations="locations"
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
          <h3 class="font-bold text-lg">Delete Script</h3>
          <p class="py-4">Are you sure you want to delete script "{{ deleteScriptName }}"?</p>
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
