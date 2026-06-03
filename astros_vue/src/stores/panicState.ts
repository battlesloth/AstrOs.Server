import { ref } from 'vue';
import { defineStore } from 'pinia';
import apiService from '@/api/apiService';
import { PANIC_STATE } from '@/api/endpoints';
import type { PanicState } from '@/models';

export const usePanicStateStore = defineStore('panicState', () => {
  const inPanicStop = ref(false);

  function setState(state: PanicState) {
    inPanicStop.value = state.inPanicStop;
  }

  async function fetchPanicState(): Promise<void> {
    // HTTP hydrate closes the cold-mount / deep-link window before the WS
    // on-connect snapshot arrives; both paths converge on setState with the
    // server's authoritative AnimationQueue state. Mirrors jobLock.fetchLockState.
    try {
      const response = (await apiService.get(PANIC_STATE)) as PanicState;
      setState(response);
    } catch (error) {
      console.warn('panicState.fetchPanicState failed', error);
    }
  }

  return { inPanicStop, setState, fetchPanicState };
});
