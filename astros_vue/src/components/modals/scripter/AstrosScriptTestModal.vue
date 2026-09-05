<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { TransmissionStatus } from '@/enums/transmissionStatus';
import { UploadStatus, Location } from '@/enums';
import { useScriptsStore } from '@/stores/scripts';
import { useScripterStore } from '@/stores/scripter';
import { useLocationStore } from '@/stores/location';
import { useI18n } from 'vue-i18n';
import AstrosWriteButton from '@/components/common/AstrosWriteButton.vue';

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

// A location counts as assigned when it has a controller to upload to. Snapshotted
// once per run on purpose: the run tracks exactly the locations it uploads to, and
// a location assigned mid-run was not uploaded to, so it must not be waited on.
// The watcher below only tracks assigned locations: a new script seeds an entry
// for every Location, and a controller may have been removed after an earlier
// upload, so an entry alone must never override the "Not Assigned" caption.
const bodyAssigned = !!locationsStore.bodyLocation?.controller.address;
const coreAssigned = !!locationsStore.coreLocation?.controller.address;
const domeAssigned = !!locationsStore.domeLocation?.controller.address;

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

const setInitialUploadStatus = (hasBody: boolean, hasCore: boolean, hasDome: boolean) => {
  // Start every run gated. The immediate watcher may already have run against
  // the pre-reset map during setup and, when all three locations are assigned
  // and each carries a non-UPLOADING entry, flipped these three; nothing else
  // resets them.
  status.value = t('modals.script_test.uploading');
  uploadInProgress.value = true;
  runDisabled.value = true;

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

// Watch the scripter's script deployment status and update UI accordingly
watch(
  () => scripterStore.script?.deploymentStatus,
  (deploymentStatus) => {
    if (!deploymentStatus) return;

    // Update Body status
    const bodyStatus = deploymentStatus[Location.BODY];
    if (bodyStatus && bodyAssigned) {
      bodyUpload.value = convertUploadStatusToTransmission(bodyStatus.value);
      setCaption(bodyCaption.value, bodyUpload.value);
    }

    // Update Core status
    const coreStatus = deploymentStatus[Location.CORE];
    if (coreStatus && coreAssigned) {
      coreUpload.value = convertUploadStatusToTransmission(coreStatus.value);
      setCaption(coreCaption.value, coreUpload.value);
    }

    // Update Dome status
    const domeStatus = deploymentStatus[Location.DOME];
    if (domeStatus && domeAssigned) {
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

onMounted(async () => {
  setInitialUploadStatus(bodyAssigned, coreAssigned, domeAssigned);

  if (props.scriptId) {
    // Reset the assigned locations to UPLOADING BEFORE the upload request goes
    // out. The watcher re-reads every assigned location on each change, so this
    // guarantees no ack from this run is read against a stale entry from an
    // earlier upload. (Acks carry no run id: a late ack from a cancelled
    // previous run is indistinguishable — see .docs/qa/scripter-script-test.md,
    // Negative / edge.)
    const assigned: Location[] = [];
    if (bodyAssigned) assigned.push(Location.BODY);
    if (coreAssigned) assigned.push(Location.CORE);
    if (domeAssigned) assigned.push(Location.DOME);
    scripterStore.markUploading(assigned);

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
        <AstrosWriteButton
          class="btn btn-primary w-24 text-lg"
          data-testid="run-button"
          :disabled="!canRun"
          @click="runClicked"
        >
          {{ $t('run') }}
        </AstrosWriteButton>
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
