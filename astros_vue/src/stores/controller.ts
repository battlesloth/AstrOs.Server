import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import type { ControllerModule, ControllerSync } from '@/models';
import apiService from '@/api/apiService';
import { SYNC_CONTROLLERS } from '@/api/endpoints';
import { ControllerStatus, Location } from '@/enums';

// Master controllers always report POLL_ACK with this MAC sentinel; padawan
// MACs are learned at LocationStatus time. See project memory
// `project_master_esp_sentinel_mac`. Used to seed body's MAC → location
// resolution on cold-load, before any LocationStatus has arrived.
const MASTER_SENTINEL_MAC = '00:00:00:00:00:00';

export const useControllerStore = defineStore('controller', () => {
  const controllers = ref<ControllerModule[]>([]);
  const isSyncing = ref(false);
  const syncError = ref<string | null>(null);
  const lastSyncTime = ref<Date | null>(null);

  const domeStatus = ref<ControllerStatus>(ControllerStatus.DOWN);
  const coreStatus = ref<ControllerStatus>(ControllerStatus.DOWN);
  const bodyStatus = ref<ControllerStatus>(ControllerStatus.DOWN);

  const domeFirmware = ref<string | undefined>();
  const coreFirmware = ref<string | undefined>();
  const bodyFirmware = ref<string | undefined>();

  // Per-location MAC tracking. Padawan MACs are learned from LocationStatus
  // messages; body's MAC is the well-known sentinel. The firmware view needs
  // this to translate WS `controllerId` (MAC) back to a slot.
  const bodyMac = ref<string>(MASTER_SENTINEL_MAC);
  const coreMac = ref<string | null>(null);
  const domeMac = ref<string | null>(null);

  /**
   * Resolve a wire-level controller id (MAC) to a Location slot. Returns null
   * for unknown MACs (fleet drift, server contract change, etc.) so callers
   * can surface a dev warning instead of silently dropping events.
   */
  const controllerIdToLocation = computed<(mac: string) => Location | null>(() => {
    const map = new Map<string, Location>();
    map.set(bodyMac.value, Location.BODY);
    if (coreMac.value !== null) map.set(coreMac.value, Location.CORE);
    if (domeMac.value !== null) map.set(domeMac.value, Location.DOME);
    return (mac: string) => map.get(mac) ?? null;
  });

  function setControllerMac(location: Location, mac: string): void {
    switch (location) {
      case Location.BODY:
        bodyMac.value = mac;
        break;
      case Location.CORE:
        coreMac.value = mac;
        break;
      case Location.DOME:
        domeMac.value = mac;
        break;
      // Location.UNKNOWN → no-op.
    }
  }

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
    domeFirmware,
    coreFirmware,
    bodyFirmware,
    bodyMac,
    coreMac,
    domeMac,
    controllerIdToLocation,
    setControllerMac,
    syncControllers,
    setControllers,
    controllerSyncResponse,
    clearControllers,
  };
});
