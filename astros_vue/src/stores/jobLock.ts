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
    // HTTP hydrate closes the cold-mount / deep-link window before the WS
    // handshake's on-connect snapshot arrives (the server emits the snapshot
    // inside its `ws.on('connection', ...)` handler in api_server.ts; it
    // surfaces client-side via `useWebsocket.handleLockStateChanged`). Both
    // paths converge on `setState` with the same authoritative `JobLock`
    // state from the server, so whichever resolves last wins and the result
    // is the same. Mirrors systemStatus.fetchStatus.
    try {
      const response = (await apiService.get(FIRMWARE_LOCK_STATE)) as LockState;
      setState(response);
    } catch (error) {
      // Leave state unchanged. The lockStateChanged WS push on (re)connect,
      // or the next acquire/release transition, will bring us back up to
      // date — assuming the WS path also works. If both paths fail, the UI
      // stays at the default unlocked state and the operator only learns
      // writes are blocked when they actually attempt one: writeGuard's 423
      // response on a write-class request falls through to the caller's
      // own per-call-site .catch(). Unlike the 503 readonly response, the
      // codebase has no global 423 interceptor that surfaces a toast or
      // updates this store — that's a separate follow-up worth filing if
      // the gap matters in practice.
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
