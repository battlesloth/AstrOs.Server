import { ref } from 'vue';
import { defineStore } from 'pinia';
import type { ControllerModule } from '@/models/controllers/modules/controlModule';
import apiService from '@/api/apiService';
import { SYNC_CONTROLLERS } from '@/api/enpoints';

export const useControllerStore = defineStore('controller', () => {
  const controllers = ref<ControllerModule[]>([]);
  const isSyncing = ref(false);
  const syncError = ref<string | null>(null);
  const lastSyncTime = ref<Date | null>(null);

  async function syncControllers() {
    isSyncing.value = true;
    syncError.value = null;

    try {
      // Trigger the sync - this sends a message to serial worker
      const response = await apiService.get(SYNC_CONTROLLERS);

      // TODO: Setup websocket listener to receive ControllersResponse
      // For now, just mark as successful
      // The actual controllers will come via websocket TransmissionType.controllers message

      lastSyncTime.value = new Date();
      return { success: true, data: response };
    } catch (error) {
      console.error('Failed to sync controllers:', error);
      syncError.value = 'Failed to sync controllers';
      return { success: false, error };
    } finally {
      isSyncing.value = false;
    }
  }

  function setControllers(newControllers: ControllerModule[]) {
    controllers.value = newControllers;
  }

  function clearControllers() {
    controllers.value = [];
  }

  return {
    controllers,
    isSyncing,
    syncError,
    lastSyncTime,
    syncControllers,
    setControllers,
    clearControllers,
  };
});
