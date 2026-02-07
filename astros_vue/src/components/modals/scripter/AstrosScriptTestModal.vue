<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { TransmissionStatus } from '@/enums/transmissionStatus';
import { UploadStatus, Location } from '@/enums';
import { useScriptsStore } from '@/stores/scripts';
import { useLocationStore } from '@/stores/location';

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
const status = ref('Uploading script...');

const coreUpload = ref<TransmissionStatus>(TransmissionStatus.SENDING);
const domeUpload = ref<TransmissionStatus>(TransmissionStatus.SENDING);
const bodyUpload = ref<TransmissionStatus>(TransmissionStatus.SENDING);

const coreCaption = ref<Caption>({ str: 'Uploading' });
const domeCaption = ref<Caption>({ str: 'Uploading' });
const bodyCaption = ref<Caption>({ str: 'Uploading' });

const locationsStore = useLocationStore();
const scriptStore = useScriptsStore();

const script = computed(() => scriptStore.scripts.find((s) => s.id === props.scriptId));

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

// Watch the script's deployment status and update UI accordingly
watch(
  () => script.value?.deploymentStatus,
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
      status.value = 'Upload Complete.';
      uploadInProgress.value = false;
      if (
        coreUpload.value + domeUpload.value + bodyUpload.value >=
        TransmissionStatus.SUCCESS * 3
      ) {
        runDisabled.value = false;
      }
    }
  },
  { deep: true },
);

const setInitialUploadStatus = (hasBody: boolean, hasCore: boolean, hasDome: boolean) => {
  if (hasBody) {
    bodyUpload.value = TransmissionStatus.SENDING;
    bodyCaption.value.str = 'Uploading';
  } else {
    bodyUpload.value = TransmissionStatus.SUCCESS;
    bodyCaption.value.str = 'Not Assigned';
  }

  if (hasCore) {
    coreUpload.value = TransmissionStatus.SENDING;
    coreCaption.value.str = 'Uploading';
  } else {
    coreUpload.value = TransmissionStatus.SUCCESS;
    coreCaption.value.str = 'Not Assigned';
  }

  if (hasDome) {
    domeUpload.value = TransmissionStatus.SENDING;
    domeCaption.value.str = 'Uploading';
  } else {
    domeUpload.value = TransmissionStatus.SUCCESS;
    domeCaption.value.str = 'Not Assigned';
  }
};

const setCaption = (caption: Caption, uploadStatus: TransmissionStatus) => {
  switch (uploadStatus) {
    case TransmissionStatus.SUCCESS:
      caption.str = 'Success';
      break;
    case TransmissionStatus.FAILED:
      caption.str = 'Failed';
      break;
    case TransmissionStatus.SENDING:
      caption.str = 'Uploading';
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
      status.value = 'Error requesting Script Upload';
      coreUpload.value = TransmissionStatus.FAILED;
      coreCaption.value.str = 'Failed';
      domeUpload.value = TransmissionStatus.FAILED;
      domeCaption.value.str = 'Failed';
      bodyUpload.value = TransmissionStatus.FAILED;
      bodyCaption.value.str = 'Failed';
    }
  } else {
    status.value = 'Script ID missing, close dialog to continue.';
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
      <h1 class="text-2xl font-bold mb-4">Script Test</h1>

      <div class="py-4 flex flex-row">
        <div class="grow"></div>
        <div class="w-75">
          <div class="mb-4 text-center text-lg">
            {{ status }}
          </div>

          <div class="mb-2 text-lg">
            <span>Body: {{ bodyCaption.str }}</span>
          </div>

          <div class="mb-2 text-lg">
            <span>Core: {{ coreCaption.str }}</span>
          </div>

          <div class="mb-2 text-lg">
            <span>Dome: {{ domeCaption.str }}</span>
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
          Run
        </button>
        <button
          class="btn w-24 text-lg"
          data-testid="cancel-button"
          @click="closeModal"
        >
          Cancel
        </button>
      </div>
    </div>
    <form
      method="dialog"
      class="modal-backdrop"
      @click="closeModal"
    >
      <button>Close</button>
    </form>
  </dialog>
</template>
