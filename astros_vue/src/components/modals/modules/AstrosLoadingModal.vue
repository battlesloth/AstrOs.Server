<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import { useLocationStore } from '@/stores/location';
import { useControllerStore } from '@/stores/controller';
import { storeToRefs } from 'pinia';

interface Props {
  skipControllerLoading?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  skipControllerLoading: false,
});

const emit = defineEmits(['loaded']);

const locationStore = useLocationStore();
const controllerStore = useControllerStore();

const { isSyncing } = storeToRefs(controllerStore);

const message = ref('modals.loading.loading');
const locationsLoaded = ref(false);
const controllersLoaded = ref(false);
const loadingComplete = ref(false);
const loadError = ref(false);

watch(isSyncing, (inProgress) => {
  controllersLoaded.value = !inProgress;
});

watch(controllersLoaded, (loaded) => {
  if (loaded && locationsLoaded.value) {
    onLoadComplete();
  }
});

watch(locationsLoaded, (loaded) => {
  if (loaded && controllersLoaded.value) {
    onLoadComplete();
  }
});

onMounted(async () => {
  // Load locations
  const locationsResult = await locationStore.loadLocationsFromApi();

  if (locationsResult.success) {
    locationsLoaded.value = true;
    console.log('Locations loaded successfully');
  } else {
    console.error('Failed to load locations');
    loadError.value = true;
    message.value = 'modals.loading.request_failed';
    return;
  }

  // Handle controller sync
  if (props.skipControllerLoading) {
    message.value = 'modals.loading.skipping';
    controllersLoaded.value = true;
  } else {
    message.value = 'modals.loading.syncing';
    const controllerResult = await controllerStore.syncControllers();

    if (!controllerResult.success) {
      console.error('Failed to sync controllers:', controllerResult.error);
      loadError.value = true;
      message.value = 'modals.loading.sync_failed';
      controllersLoaded.value = true;
    }
  }
});

function onLoadComplete() {
  loadingComplete.value = true;

  if (!loadError.value && !controllerStore.syncError) {
    message.value = 'modals.loading.complete';
    setTimeout(() => {
      emit('loaded');
    }, 500);
  } else {
    loadError.value = true;
    message.value = controllerStore.syncError
      ? controllerStore.syncError
      : 'modals.loading.request_failed';
  }
}
</script>

<template>
  <dialog
    data-testid="loading-modal"
    class="modal modal-open"
  >
    <div class="modal-box">
      <h3 class="font-bold text-lg">{{ $t('modals.loading.title') }}</h3>

      <div class="py-8">
        <div class="flex flex-col items-center gap-4">
          <span
            v-if="!loadingComplete"
            class="loading loading-spinner loading-lg"
          ></span>
          <div class="text-center">{{ $t(message) }}</div>
        </div>
      </div>

      <div
        class="modal-action"
        v-if="loadError"
      >
        <button
          data-testid="loading-modal-close"
          class="btn btn-primary"
          @click="emit('loaded')"
        >
          {{ $t('modals.loading.continue') }}
        </button>
      </div>
    </div>
  </dialog>
</template>
