<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useLocationStore } from '@/stores/location';
import { useControllerStore } from '@/stores/controller';

interface Props {
  skipControllerLoading?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  skipControllerLoading: false,
});

const emit = defineEmits<{
  loaded: [];
}>();

const locationStore = useLocationStore();
const controllerStore = useControllerStore();

const message = ref('Loading locations...');
const locationsLoaded = ref(false);
const controllersLoaded = ref(false);
const loadingComplete = ref(false);
const loadError = ref(false);

onMounted(async () => {
  // Load locations
  const locationsResult = await locationStore.loadLocationsFromApi();

  if (locationsResult.success) {
    locationsLoaded.value = true;
    console.log('Locations loaded successfully');
  } else {
    console.error('Failed to load locations');
    loadError.value = true;
    message.value = 'Failed to load locations from API';
    return;
  }

  // Handle controller sync
  if (props.skipControllerLoading) {
    message.value = 'Skipping controller loading...';
    controllersLoaded.value = true;
    checkLoadedState();
  } else {
    message.value = 'Syncing controllers...';
    const controllerResult = await controllerStore.syncControllers();

    if (controllerResult.success) {
      controllersLoaded.value = true;
      console.log('Controllers synced successfully');
      checkLoadedState();
    } else {
      console.error('Failed to sync controllers:', controllerResult.error);
      loadError.value = true;
      message.value = 'Failed to sync controllers, using cached values.';
      controllersLoaded.value = true;
      checkLoadedState();
    }
  }
});

function checkLoadedState() {
  if (locationsLoaded.value && controllersLoaded.value) {
    loadingComplete.value = true;
    message.value = 'Loading complete!';

    // Auto-close modal after successful load
    if (!loadError.value) {
      setTimeout(() => {
        emit('loaded');
      }, 500);
    }
  }
}
</script>

<template>
  <dialog data-testid="loading-modal" class="modal modal-open">
    <div class="modal-box">
      <h3 class="font-bold text-lg">Loading</h3>

      <div class="py-8">
        <div class="flex flex-col items-center gap-4">
          <span class="loading loading-spinner loading-lg"></span>
          <div class="text-center">{{ message }}</div>
        </div>
      </div>

      <div class="modal-action" v-if="loadError">
        <button data-testid="loading-modal-close" class="btn btn-primary" @click="emit('loaded')">
          Continue with cached values
        </button>
      </div>
    </div>
  </dialog>
</template>
