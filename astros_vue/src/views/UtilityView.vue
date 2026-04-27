<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { AstrosLayout } from '@/components';
import apiService from '@/api/apiService';
import type { ControllerModule } from '@/models';
import { useI18n } from 'vue-i18n';
import { useSystemStatusStore } from '@/stores/systemStatus';

const systemStatusStore = useSystemStatusStore();

interface SelectedControllerModule extends ControllerModule {
  selected: boolean;
}

// State
const apiKey = ref('');
const controllers = ref<ControllerModule[]>([]);
const showFormatModal = ref(false);
const selectedControllers = ref<SelectedControllerModule[]>([]);
const showAlert = ref(false);
const alertMessage = ref('');

const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

const { t } = useI18n();

// Load data on mount
onMounted(async () => {
  try {
    const setting = await apiService.get('/api/settings?key=apikey');
    if (setting && setting.value) {
      apiKey.value = setting.value;
    }
  } catch (error) {
    console.error('Error loading API key:', error);
  }

  try {
    const ctrlData = await apiService.get('/api/settings/controllers');
    controllers.value = ctrlData || [];
  } catch (error) {
    console.error('Error loading controllers:', error);
  }
});

// Generate API key
const generateApiKey = async () => {
  let result = '';
  const charactersLength = characters.length;
  for (let i = 0; i < 10; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }

  apiKey.value = result;

  try {
    await apiService.put('/api/settings', { key: 'apikey', value: result });
    console.log('API key saved');
  } catch (error) {
    console.error('Error saving API key:', error);
    apiKey.value = 'Failed to save API key';
  }
};

// Download logs
const downloadLogs = async () => {
  try {
    const blob = await apiService.getBlob('/api/settings/logs');
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'astros_logs.zip');
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Error downloading logs:', error);
    showAlert.value = true;
    alertMessage.value = t('utility_view.download_error');
  }
};

// Format SD card modal
const openFormatModal = () => {
  selectedControllers.value = controllers.value.map((ctrl) => ({
    id: ctrl.id,
    name: ctrl.name,
    address: ctrl.address,
    fingerprint: ctrl.fingerprint,
    selected: false,
  }));
  showFormatModal.value = true;
};

const closeFormatModal = () => {
  showFormatModal.value = false;
};

const confirmFormat = async () => {
  const controllersToFormat = selectedControllers.value
    .filter((ctrl) => ctrl.selected)
    .map((ctrl) => ({ name: ctrl.name, address: ctrl.address }));

  if (controllersToFormat.length === 0) {
    showAlert.value = true;
    alertMessage.value = t('utility_view.select_controller_error');
    return;
  }

  try {
    await apiService.post('/api/settings/formatSD', { controllers: controllersToFormat });
    showAlert.value = true;
    alertMessage.value = t('utility_view.format_queued');
    closeFormatModal();
  } catch (error) {
    console.error('Error requesting format:', error);
    showAlert.value = true;
    alertMessage.value = t('utility_view.format_error');
  }
};

const closeAlert = () => {
  showAlert.value = false;
};
</script>

<template>
  <AstrosLayout>
    <template v-slot:main>
      <!-- Header with buttons -->
      <div class="flex items-center gap-4 p-4 bg-r2-complement shrink-0 mb-4">
        <h1 class="text-2xl font-bold">{{ $t('utility_view.title') }}</h1>
        <div class="grow"></div>
      </div>
      <div class="max-w-3xl mx-auto">
        <div class="flex flex-row flex-wrap border-b-2 border-black m-5 p-2">
          <div class="text-2xl w-45">{{ $t('utility_view.api_key') }}</div>
          <div class="grow">
            <div class="flex flex-row flex-nowrap">
              <div class="grow"></div>
              <div class="w-50 text-2xl mr-4 border-2 border-black rounded text-center">
                {{ apiKey }}
              </div>
              <div class="float-right">
                <div
                  :class="systemStatusStore.readOnly ? 'tooltip' : ''"
                  :data-tip="$t('systemStatus.readOnly.disabled')"
                >
                  <button
                    class="btn btn-primary w-35 px-5 py-0.75"
                    aria-label="$t('generate')"
                    :disabled="systemStatusStore.readOnly"
                    @click="generateApiKey"
                  >
                    {{ $t('generate') }}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="flex flex-row flex-wrap border-b-2 border-black m-5 p-2">
          <div class="text-2xl w-45">{{ $t('utility_view.format_sd') }}</div>
          <div class="grow">
            <div class="flex flex-row flex-nowrap">
              <div class="grow"></div>
              <div class="float-right">
                <div
                  :class="systemStatusStore.readOnly ? 'tooltip' : ''"
                  :data-tip="$t('systemStatus.readOnly.disabled')"
                >
                  <button
                    class="btn btn-primary w-35 px-5 py-0.75"
                    aria-label="$t('format')"
                    :disabled="systemStatusStore.readOnly"
                    @click="openFormatModal"
                  >
                    {{ $t('format') }}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="flex flex-row flex-wrap border-b-2 border-black m-5 p-2">
          <div class="text-2xl w-45">{{ $t('utility_view.log_files') }}</div>
          <div class="grow">
            <div class="flex flex-row flex-nowrap">
              <div class="grow"></div>
              <div class="float-right">
                <button
                  class="btn btn-primary w-35 px-5 py-0.75"
                  aria-label="$t('download')"
                  @click="downloadLogs"
                >
                  {{ $t('download') }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Format Modal -->
      <dialog
        v-if="showFormatModal"
        class="modal modal-open"
      >
        <div class="modal-box">
          <h3 class="font-bold text-lg mb-4">{{ $t('utility_view.format_modal_title') }}</h3>
          <div class="py-5">
            <div class="max-h-96 overflow-y-auto">
              <div
                v-for="ctl in selectedControllers"
                :key="ctl.id"
                class="py-2"
              >
                <label class="cursor-pointer label">
                  <span class="label-text">{{ ctl.name }}</span>
                  <input
                    type="checkbox"
                    v-model="ctl.selected"
                    class="checkbox"
                  />
                </label>
              </div>
            </div>
          </div>
          <div class="modal-action">
            <div
              :class="systemStatusStore.readOnly ? 'tooltip' : ''"
              :data-tip="$t('systemStatus.readOnly.disabled')"
            >
              <button
                class="btn btn-primary"
                :disabled="systemStatusStore.readOnly"
                @click="confirmFormat"
              >
                {{ $t('ok') }}
              </button>
            </div>
            <button
              class="btn"
              @click="closeFormatModal"
            >
              {{ $t('close') }}
            </button>
          </div>
        </div>
        <form
          method="dialog"
          class="modal-backdrop"
          @click="closeFormatModal"
        >
          <button>{{ $t('close') }}</button>
        </form>
      </dialog>

      <!-- Alert Modal -->
      <dialog
        v-if="showAlert"
        class="modal modal-open"
      >
        <div class="modal-box">
          <h3 class="font-bold text-lg">{{ $t('modals.alert.title') }}</h3>
          <p class="py-4">{{ alertMessage }}</p>
          <div class="modal-action">
            <button
              class="btn"
              @click="closeAlert"
            >
              {{ $t('close') }}
            </button>
          </div>
        </div>
        <form
          method="dialog"
          class="modal-backdrop"
          @click="closeAlert"
        >
          <button>{{ $t('close') }}</button>
        </form>
      </dialog>
    </template>
  </AstrosLayout>
</template>
