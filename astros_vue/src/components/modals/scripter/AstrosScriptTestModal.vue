<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { TransmissionStatus } from '@/enums/transmissionStatus';
import type { DeploymentLocation, ScriptResponse } from '@/models/scripts/scriptTest';
import { AstrOsConstants } from '@/models/scripts/scriptTest';

interface Caption {
  str: string;
}

const locations = ref<DeploymentLocation[]>([]);

async function onUploadScript(scriptId: string): Promise<void> {
  // Placeholder function for uploading script
  console.log(`Uploading script with ID: ${scriptId}`);
}

async function onRunScript(scriptId: string): Promise<void> {
  // Placeholder function for running script
  console.log(`Running script with ID: ${scriptId}`);
}

const props = defineProps<{
  scriptId: string;
  //locations: DeploymentLocation[];
  //onUploadScript?: (scriptId: string) => Promise<void>;
  //onRunScript?: (scriptId: string) => Promise<void>;
  //websocketMessages?: any; // Observable or event emitter for websocket messages
}>();

const emit = defineEmits<{
  run: [scriptId: string];
  close: [];
}>();

// Local state
const uploadInProgress = ref(true);
const runDisabled = ref(true);
const status = ref('Uploading script...');

const coreUpload = ref<TransmissionStatus>(TransmissionStatus.sending);
const domeUpload = ref<TransmissionStatus>(TransmissionStatus.sending);
const bodyUpload = ref<TransmissionStatus>(TransmissionStatus.sending);

const coreCaption = ref<Caption>({ str: 'Uploading' });
const domeCaption = ref<Caption>({ str: 'Uploading' });
const bodyCaption = ref<Caption>({ str: 'Uploading' });

let websocketSubscription: any = null;

const canRun = computed(() => {
  return !uploadInProgress.value && !runDisabled.value;
});

const setInitialUploadStatus = (hasBody: boolean, hasCore: boolean, hasDome: boolean) => {
  if (hasBody) {
    bodyUpload.value = TransmissionStatus.sending;
    bodyCaption.value.str = 'Uploading';
  } else {
    bodyUpload.value = TransmissionStatus.success;
    bodyCaption.value.str = 'Not Assigned';
  }

  if (hasCore) {
    coreUpload.value = TransmissionStatus.sending;
    coreCaption.value.str = 'Uploading';
  } else {
    coreUpload.value = TransmissionStatus.success;
    coreCaption.value.str = 'Not Assigned';
  }

  if (hasDome) {
    domeUpload.value = TransmissionStatus.sending;
    domeCaption.value.str = 'Uploading';
  } else {
    domeUpload.value = TransmissionStatus.success;
    domeCaption.value.str = 'Not Assigned';
  }
};

const setCaption = (caption: Caption, uploadStatus: TransmissionStatus) => {
  switch (uploadStatus) {
    case TransmissionStatus.success:
      caption.str = 'Success';
      break;
    case TransmissionStatus.failed:
      caption.str = 'Failed';
      break;
  }
};

const statusUpdate = (msg: ScriptResponse) => {
  console.log('message', msg);

  const location = locations.value.find((loc) => loc.id === msg.locationId);

  if (!location) {
    console.warn(`Location with ID ${msg.locationId} not found.`);
    return;
  }

  switch (location.id) {
    case AstrOsConstants.BODY:
      bodyUpload.value = msg.status;
      setCaption(bodyCaption.value, msg.status);
      break;
    case AstrOsConstants.CORE:
      coreUpload.value = msg.status;
      setCaption(coreCaption.value, msg.status);
      break;
    case AstrOsConstants.DOME:
      domeUpload.value = msg.status;
      setCaption(domeCaption.value, msg.status);
      break;
  }

  if (
    coreUpload.value > TransmissionStatus.sending &&
    domeUpload.value > TransmissionStatus.sending &&
    bodyUpload.value > TransmissionStatus.sending
  ) {
    status.value = 'Upload Complete.';
    uploadInProgress.value = false;
    if (coreUpload.value + domeUpload.value + bodyUpload.value >= TransmissionStatus.success * 3) {
      runDisabled.value = false;
    }
  }
};

onMounted(async () => {
  let hasBody = false;
  let hasCore = false;
  let hasDome = false;

  locations.value.forEach((location: DeploymentLocation) => {
    switch (location.name) {
      case AstrOsConstants.BODY:
        hasBody = true;
        break;
      case AstrOsConstants.CORE:
        hasCore = true;
        break;
      case AstrOsConstants.DOME:
        hasDome = true;
        break;
    }
  });

  setInitialUploadStatus(hasBody, hasCore, hasDome);

  // Subscribe to websocket messages if provided
  /*if (websocketMessages) {
    websocketSubscription = props.websocketMessages.subscribe((msg: any) => {
      if (msg && typeof msg === 'object' && 'type' in msg) {
        // Assuming TransmissionType.script is 0
        if (msg.type === 0) {
          statusUpdate(msg as ScriptResponse);
        }
      }
    
    
   });
  }
  */
  // Upload the script
  if (props.scriptId) {
    try {
      await onUploadScript(props.scriptId);
    } catch (err) {
      console.error(err);
      status.value = 'Error requesting Script Upload';
      coreUpload.value = TransmissionStatus.failed;
      coreCaption.value.str = 'Failed';
      domeUpload.value = TransmissionStatus.failed;
      domeCaption.value.str = 'Failed';
      bodyUpload.value = TransmissionStatus.failed;
      bodyCaption.value.str = 'Failed';
    }
  } else {
    status.value = 'Script ID missing, close dialog to continue.';
  }
});

onUnmounted(() => {
  if (websocketSubscription) {
    websocketSubscription.unsubscribe();
  }
});

const runClicked = async () => {
  console.log(`Running script: ${props.scriptId}`);
  await onRunScript(props.scriptId);

  emit('run', props.scriptId);
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
