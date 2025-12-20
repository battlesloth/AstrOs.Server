import { ref } from 'vue';
import { defineStore } from 'pinia';
import type { ControllerModule } from '@/models/controllers/modules/controlModule';
import apiService from '@/api/apiService';
import { SYNC_CONTROLLERS } from '@/api/endpoints';
import type { ControllerSync } from '@/models/websocket/controllerSync';
import { ControllerStatus } from '@/enums/controllerStatus';

export const useControllerStore = defineStore('controller', () => {
  const controllers = ref<ControllerModule[]>([]);
  const isSyncing = ref(false);
  const syncError = ref<string | null>(null);
  const lastSyncTime = ref<Date | null>(null);

  const domeStatus = ref<ControllerStatus>(ControllerStatus.DOWN);
  const coreStatus = ref<ControllerStatus>(ControllerStatus.DOWN);
  const bodyStatus = ref<ControllerStatus>(ControllerStatus.DOWN);

  async function syncControllers() {
    isSyncing.value = true;
    syncError.value = null;

    try {
      const response = await apiService.get(SYNC_CONTROLLERS);
      lastSyncTime.value = new Date();
      return { success: true, data: response };
    } catch (error) {
      console.error('Failed to sync controllers:', error);
      syncError.value = 'Failed to sync controllers';
      isSyncing.value = false;
      return { success: false, error };
    }
  }

  function setControllers(newControllers: ControllerModule[]) {
    controllers.value = newControllers;
  }

  function controllerSyncResponse(message: ControllerSync) {
    try {
      controllers.value = message.controllers;
      lastSyncTime.value = new Date();
      if (!message.success) {
        console.error('Controller sync failed:', message.message);
        syncError.value = message.message || 'error.controller_sync_failed';
        return;
      } else {
        syncError.value = null;
      }
    } catch (error) {
      console.error('Error processing controller sync response:', error);
      syncError.value = 'error.controller_sync_error';
    } finally {
      isSyncing.value = false;
    }
  }

  function clearControllers() {
    controllers.value = [];
  }

  return {
    controllers,
    isSyncing,
    syncError,
    lastSyncTime,
    domeStatus,
    coreStatus,
    bodyStatus,
    syncControllers,
    setControllers,
    controllerSyncResponse,
    clearControllers,
  };
});
