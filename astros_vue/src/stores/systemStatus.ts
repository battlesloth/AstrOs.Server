import { ref } from 'vue';
import { defineStore } from 'pinia';
import apiService from '@/api/apiService';
import { SYSTEM_STATUS } from '@/api/endpoints';

export type ReadOnlyReasonCode =
  | 'STARTUP_OPEN_FAILED'
  | 'BACKUP_FAILED'
  | 'MIGRATION_FAILED_NO_BACKUP'
  | 'MIGRATION_FAILED_RESTORED'
  | 'MIGRATION_FAILED_RESTORE_FAILED';

export interface SystemStatusPayload {
  readOnly: boolean;
  reasonCode?: ReadOnlyReasonCode | null;
  enteredAt?: string | null;
}

export const useSystemStatusStore = defineStore('systemStatus', () => {
  const readOnly = ref(false);
  const reasonCode = ref<ReadOnlyReasonCode | null>(null);
  const enteredAt = ref<string | null>(null);

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
      // and on a healthy system always responds; a network error here is
      // transient and another fetch (or the WebSocket push on connect) will
      // bring us back up to date.
      console.warn('systemStatus.fetchStatus failed', error);
    }
  }

  return {
    readOnly,
    reasonCode,
    enteredAt,
    setStatus,
    fetchStatus,
  };
});
