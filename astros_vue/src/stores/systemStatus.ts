import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import apiService from '@/api/apiService';
import { SYSTEM_STATUS } from '@/api/endpoints';
import type { ReadOnlyReasonCode, SystemStatusPayload } from '@/types/systemStatus';

export const useSystemStatusStore = defineStore('systemStatus', () => {
  const readOnly = ref(false);
  const reasonCode = ref<ReadOnlyReasonCode | null>(null);
  const enteredAt = ref<string | null>(null);
  // The database belongs to a newer server: App.vue replaces the router view
  // with a notice, since every API route but GET /system/status answers 503.
  const dbIncompatible = computed(
    () => readOnly.value && reasonCode.value === 'DB_NEWER_THAN_SERVER',
  );

  function setStatus(state: SystemStatusPayload) {
    readOnly.value = state.readOnly;
    if (state.readOnly) {
      reasonCode.value = state.reasonCode ?? null;
      enteredAt.value = state.enteredAt ?? null;
    } else {
      reasonCode.value = null;
      enteredAt.value = null;
    }
  }

  async function fetchStatus(): Promise<void> {
    try {
      const response = (await apiService.get(SYSTEM_STATUS)) as SystemStatusPayload;
      setStatus(response);
    } catch (error) {
      // Leave state unchanged. The /api/system/status endpoint is unauthenticated
      // and answers in every mode, including DB_NEWER_THAN_SERVER; a network
      // error here is transient and the WebSocket push on (re)connect brings
      // us back up to date. Nothing re-fetches.
      console.warn('systemStatus.fetchStatus failed', error);
    }
  }

  return {
    readOnly,
    reasonCode,
    enteredAt,
    dbIncompatible,
    setStatus,
    fetchStatus,
  };
});
