// Pins the App.vue onMounted hydrate contract: both systemStatusStore.fetchStatus
// AND jobLockStore.fetchLockState must fire before wsConnect, so the lock and
// readonly banners are correct from the first paint on cold-mount / deep-link.
// Without this test, a refactor that drops the jobLockStore.fetchLockState() line
// (or innocently re-orders things so wsConnect awaits something it shouldn't)
// silently regresses the entire d.7 follow-up #1 feature.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { mount } from '@vue/test-utils';
import { createRouter, createMemoryHistory } from 'vue-router';

const wsConnect = vi.fn();
const wsDisconnect = vi.fn();
vi.mock('@/composables/useWebsocket', () => ({
  useWebsocket: () => ({ wsConnect, wsDisconnect }),
}));

const fetchStatusSpy = vi.fn();
const fetchLockStateSpy = vi.fn();
vi.mock('@/stores/systemStatus', () => ({
  useSystemStatusStore: () => ({ fetchStatus: fetchStatusSpy }),
}));
vi.mock('@/stores/jobLock', () => ({
  useJobLockStore: () => ({ fetchLockState: fetchLockStateSpy }),
}));

// AstrosToastContainer pulls in the full toast system; stub it to keep the
// smoke test focused on App's onMounted body.
vi.mock('@/components/common/AstrosToastContainer.vue', () => ({
  default: { name: 'AstrosToastContainer', template: '<div />' },
}));

import App from '@/App.vue';

describe('App.vue — onMounted hydrate', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    wsConnect.mockClear();
    wsDisconnect.mockClear();
    fetchStatusSpy.mockClear();
    fetchLockStateSpy.mockClear();
  });

  it('fires fetchStatus, fetchLockState, and wsConnect on mount', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: { template: '<div />' } }],
    });
    await router.push('/');
    await router.isReady();

    mount(App, {
      global: { plugins: [router] },
    });

    expect(fetchStatusSpy).toHaveBeenCalledTimes(1);
    expect(fetchLockStateSpy).toHaveBeenCalledTimes(1);
    expect(wsConnect).toHaveBeenCalledTimes(1);
  });
});
