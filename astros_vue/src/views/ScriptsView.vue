<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import AstrosLayout from '@/components/common/layout/AstrosLayout.vue';
import { useToast } from '@/composables/useToast';
import type { Script } from '@/models/scripts/script';
import { useScriptsStore } from '@/stores/scripts';
import { UploadStatus } from '@/enums/scripts/uploadStatus';
import AstrosScriptRow from '@/components/scripts/AstrosScriptRow.vue';

const router = useRouter();
const { success, error } = useToast();

const scriptStore = useScriptsStore();

const showDeleteModal = ref(false);
const deleteScriptId = ref('');
const deleteScriptName = ref('');

const locations = ['body', 'core', 'dome'];

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
      status.value = UploadStatus.uploading;
    }
  }
};

const getUploadStatus = (script: Script, locationId: string) => {
  let dateString = 'Not Uploaded';
  let statusClass = 'bg-red-900 text-white';

  console.log('scrip', script);

  const status = script.deploymentStatus[locationId];

  if (!status) {
    return { class: statusClass, text: dateString };
  }

  let uploadStatus = status.value;

  if (status.value) {
    const uploaddate = new Date(status.date || '1970-01-01T00:00:00Z');
    const scriptdate = new Date(script.lastSaved);
    if (uploaddate < scriptdate) {
      uploadStatus = UploadStatus.notUploaded;
      dateString = 'Out of date';
    } else {
      dateString = uploaddate.toLocaleDateString(navigator.language, {
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
      });
    }
  }

  switch (uploadStatus) {
    case UploadStatus.uploaded:
      statusClass = 'bg-green-600 text-white';
      break;
    case UploadStatus.uploading:
      statusClass = 'bg-yellow-600 text-black';
      dateString = 'Uploading...';
      break;
    case UploadStatus.notUploaded:
    default:
      statusClass = 'bg-red-900 text-white';
      break;
  }

  return { class: statusClass, text: dateString };
};

const editScript = (id: string) => {
  router.push(`/scripter/${id}`);
};
</script>

<template>
  <AstrosLayout>
    <template v-slot:main>
      <div class="flex flex-row flex-nowrap">
        <div class="grow"></div>
        <div class="px-5 max-w-250 grow-20">
          <!-- Header Bar -->
          <div class="flex flex-row h-13.5 leading-13.5">
            <div class="w-50 text-3xl font-bold">Scripts</div>
            <div class="grow"></div>
            <div class="float-right">
              <button
                class="btn btn-primary text-xl"
                @click="newScript"
              >
                New
              </button>
            </div>
          </div>

          <table class="table w-full">
            <thead>
              <tr>
                <th class="w-1/3">Script Name</th>
                <th class="w-2/3">Description</th>
                <th class="text-center">Status</th>
                <th class="text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              <AstrosScriptRow
                v-for="script in scriptStore.scripts"
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
