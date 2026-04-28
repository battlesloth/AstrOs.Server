import { ref } from 'vue';
import { defineStore } from 'pinia';
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

  return {
    locked,
    owner,
    since,
    setState,
  };
});
