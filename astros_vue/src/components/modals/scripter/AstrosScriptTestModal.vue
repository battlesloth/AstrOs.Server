<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { TransmissionStatus } from '@/enums/transmissionStatus';
import { UploadStatus, Location } from '@/enums';
import { useScriptsStore } from '@/stores/scripts';
import { useScripterStore } from '@/stores/scripter';
import { useLocationStore } from '@/stores/location';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

interface Caption {
  str: string;
}

const props = defineProps<{
  scriptId: string | undefined;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

// Local state
const uploadInProgress = ref(true);
const runDisabled = ref(true);
const status = ref(t('modals.script_test.uploading'));

const coreUpload = ref<TransmissionStatus>(TransmissionStatus.SENDING);
const domeUpload = ref<TransmissionStatus>(TransmissionStatus.SENDING);
const bodyUpload = ref<TransmissionStatus>(TransmissionStatus.SENDING);

const coreCaption = ref<Caption>({ str: t('modals.script_test.uploading_status') });
const domeCaption = ref<Caption>({ str: t('modals.script_test.uploading_status') });
const bodyCaption = ref<Caption>({ str: t('modals.script_test.uploading_status') });

const locationsStore = useLocationStore();
const scriptStore = useScriptsStore();
const scripterStore = useScripterStore();

const canRun = computed(() => {
  return !uploadInProgress.value && !runDisabled.value;
});

const convertUploadStatusToTransmission = (
  uploadStatus: UploadStatus | undefined,
): TransmissionStatus => {
  if (uploadStatus === undefined) return TransmissionStatus.FAILED;

  switch (uploadStatus) {
    case UploadStatus.NOT_UPLOADED:
      return TransmissionStatus.FAILED;
    case UploadStatus.UPLOADING:
      return TransmissionStatus.SENDING;
    case UploadStatus.UPLOADED:
      return TransmissionStatus.SUCCESS;
    default:
      return TransmissionStatus.FAILED;
  }
};

// Watch the scripter's script deployment status and update UI accordingly
watch(
  () => scripterStore.script?.deploymentStatus,
  (deploymentStatus) => {
    if (!deploymentStatus) return;

    // Update Body status
    const bodyStatus = deploymentStatus[Location.BODY];
    if (bodyStatus) {
      bodyUpload.value = convertUploadStatusToTransmission(bodyStatus.value);
      setCaption(bodyCaption.value, bodyUpload.value);
    }

    // Update Core status
    const coreStatus = deploymentStatus[Location.CORE];
    if (coreStatus) {
      coreUpload.value = convertUploadStatusToTransmission(coreStatus.value);
      setCaption(coreCaption.value, coreUpload.value);
    }

    // Update Dome status
    const domeStatus = deploymentStatus[Location.DOME];
    if (domeStatus) {
      domeUpload.value = convertUploadStatusToTransmission(domeStatus.value);
      setCaption(domeCaption.value, domeUpload.value);
    }

    // Check if all uploads are complete
    if (
      coreUpload.value > TransmissionStatus.SENDING &&
      domeUpload.value > TransmissionStatus.SENDING &&
      bodyUpload.value > TransmissionStatus.SENDING
    ) {
      status.value = t('modals.script_test.upload_complete');
      uploadInProgress.value = false;
      if (
        coreUpload.value + domeUpload.value + bodyUpload.value >=
        TransmissionStatus.SUCCESS * 3
      ) {
        runDisabled.value = false;
      }
    }
  },
  { deep: true, immediate: true },
);

const setInitialUploadStatus = (hasBody: boolean, hasCore: boolean, hasDome: boolean) => {
  if (hasBody) {
    bodyUpload.value = TransmissionStatus.SENDING;
    bodyCaption.value.str = t('modals.script_test.uploading_status');
  } else {
    bodyUpload.value = TransmissionStatus.SUCCESS;
    bodyCaption.value.str = t('modals.script_test.not_assigned');
  }

  if (hasCore) {
    coreUpload.value = TransmissionStatus.SENDING;
    coreCaption.value.str = t('modals.script_test.uploading_status');
  } else {
    coreUpload.value = TransmissionStatus.SUCCESS;
    coreCaption.value.str = t('modals.script_test.not_assigned');
  }

  if (hasDome) {
    domeUpload.value = TransmissionStatus.SENDING;
    domeCaption.value.str = t('modals.script_test.uploading_status');
  } else {
    domeUpload.value = TransmissionStatus.SUCCESS;
    domeCaption.value.str = t('modals.script_test.not_assigned');
  }
};

const setCaption = (caption: Caption, uploadStatus: TransmissionStatus) => {
  switch (uploadStatus) {
    case TransmissionStatus.SUCCESS:
      caption.str = t('modals.script_test.success');
      break;
    case TransmissionStatus.FAILED:
      caption.str = t('modals.script_test.failed');
      break;
    case TransmissionStatus.SENDING:
      caption.str = t('modals.script_test.uploading_status');
      break;
  }
};

onMounted(async () => {
  const hasBody = !!locationsStore.bodyLocation?.controller.address;
  const hasCore = !!locationsStore.coreLocation?.controller.address;
  const hasDome = !!locationsStore.domeLocation?.controller.address;

  setInitialUploadStatus(hasBody, hasCore, hasDome);

  if (props.scriptId) {
    try {
      await scriptStore.uploadScript(props.scriptId);
    } catch (err) {
      console.error(err);
      status.value = t('modals.script_test.failed');
      coreUpload.value = TransmissionStatus.FAILED;
      coreCaption.value.str = t('modals.script_test.failed');
      domeUpload.value = TransmissionStatus.FAILED;
      domeCaption.value.str = t('modals.script_test.failed');
      bodyUpload.value = TransmissionStatus.FAILED;
      bodyCaption.value.str = t('modals.script_test.failed');
    }
  } else {
    status.value = t('modals.script_test.failed');
  }
});

const runClicked = async () => {
  console.log(`Running script: ${props.scriptId}`);
  await scriptStore.runScript(props.scriptId!);
  closeModal();
};

const closeModal = () => {
  emit('close');
};
</script>

<template>
  <dialog class="modal modal-open">
    <div class="modal-box w-100 max-w-md">
      <h1 class="text-2xl font-bold mb-4">{{ $t('modals.script_test.title') }}</h1>

      <div class="py-4 flex flex-row">
        <div class="grow"></div>
        <div class="w-75">
          <div class="mb-4 text-center text-lg">
            {{ status }}
          </div>

          <div class="mb-2 text-lg">
            <span>{{ $t('modals.script_test.body') }}: {{ bodyCaption.str }}</span>
          </div>

          <div class="mb-2 text-lg">
            <span>{{ $t('modals.script_test.core') }}: {{ coreCaption.str }}</span>
          </div>

          <div class="mb-2 text-lg">
            <span>{{ $t('modals.script_test.dome') }}: {{ domeCaption.str }}</span>
          </div>
        </div>
        <div class="grow"></div>
      </div>

      <div class="modal-action justify-center mt-5">
        <button
          class="btn btn-primary w-24 text-lg"
          data-testid="run-button"
          :disabled="!canRun"
          @click="runClicked"
        >
          {{ $t('run') }}
        </button>
        <button
          class="btn w-24 text-lg"
          data-testid="cancel-button"
          @click="closeModal"
        >
          {{ $t('cancel') }}
        </button>
      </div>
    </div>
    <div class="modal-backdrop"></div>
  </dialog>
</template>
