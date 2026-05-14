import { ref } from 'vue';
import { defineStore } from 'pinia';
import apiService from '@/api/apiService';
import { FIRMWARE_LOCK_STATE } from '@/api/endpoints';
import type { LockState } from '@/models';

export const useJobLockStore = defineStore('jobLock', () => {
  const locked = ref(false);
  const owner = ref<string | null>(null);
  const since = ref<string | null>(null);

  function setState(state: LockState) {
    locked.value = state.locked;
    owner.value = state.owner;
    since.value = state.since;
  }

  async function fetchLockState(): Promise<void> {
    // HTTP hydrate is belt-and-braces alongside the lockStateChanged WS push:
    // App.vue fires both in parallel on mount, and whichever resolves last
    // wins the final setState call. On local LAN the WS snapshot from
    // onopen typically arrives first; the HTTP response then overwrites
    // with whatever the server reported at the time of the GET. Both
    // snapshots reflect the same authoritative JobLock state on the
    // server, so the residual race is millisecond-scale and benign in
    // practice. Mirrors systemStatus.fetchStatus.
    try {
      const response = (await apiService.get(FIRMWARE_LOCK_STATE)) as LockState;
      setState(response);
    } catch (error) {
      // Leave state unchanged — the WS push remains as the primary source.
      console.warn('jobLock.fetchLockState failed', error);
    }
  }

  return {
    locked,
    owner,
    since,
    setState,
    fetchLockState,
  };
});
