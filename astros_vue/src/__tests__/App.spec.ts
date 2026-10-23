// Pins two things about App.vue:
// - The onMounted hydrate call surface: systemStatusStore.fetchStatus,
//   jobLockStore.fetchLockState, panicStateStore.fetchPanicState and wsConnect
//   must all be synchronously enqueued from onMounted on every mount (the HTTP
//   fetches are fire-and-forget — actual HTTP-response-vs-WS-handshake ordering
//   is NOT pinned by this test). Without this test, a refactor that drops
//   jobLockStore.fetchLockState() silently regresses the client-mount half of
//   d.7 follow-up #1 (the server-side route placement is guarded by
//   firmware_lock_state_controller.integration.test.ts).
// - The incompatible-database swap: the notice replaces the router view while
//   dbIncompatible is true, and the toast container stays.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { nextTick, reactive } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { enableAutoUnmount, mount } from '@vue/test-utils';
import { createRouter, createMemoryHistory } from 'vue-router';

// The mocked store state below is shared and reactive: an App left mounted by
// an earlier test would re-render on every flip.
enableAutoUnmount(afterEach);

const wsConnect = vi.fn();
const wsDisconnect = vi.fn();
vi.mock('@/composables/useWebsocket', () => ({
  useWebsocket: () => ({ wsConnect, wsDisconnect }),
}));

const fetchStatusSpy = vi.fn();
const fetchLockStateSpy = vi.fn();
const fetchPanicStateSpy = vi.fn();
// Reactive so a flip after mount re-renders App, as the real store does.
const systemStatusState = reactive({ dbIncompatible: false });
vi.mock('@/stores/systemStatus', () => ({
  useSystemStatusStore: () => ({
    fetchStatus: fetchStatusSpy,
    get dbIncompatible() {
      return systemStatusState.dbIncompatible;
    },
  }),
}));
vi.mock('@/stores/jobLock', () => ({
  useJobLockStore: () => ({ fetchLockState: fetchLockStateSpy }),
}));
vi.mock('@/stores/panicState', () => ({
  usePanicStateStore: () => ({ fetchPanicState: fetchPanicStateSpy }),
}));

// AstrosToastContainer pulls in the full toast system; a stub keeps these
// tests on App itself while still showing whether App renders it.
vi.mock('@/components/common/AstrosToastContainer.vue', () => ({
  default: { name: 'AstrosToastContainer', template: '<div data-testid="toast-container" />' },
}));

import App from '@/App.vue';
import i18n from '@/i18n';
import enUS from '@/locales/enUS.json';

describe('App.vue — onMounted hydrate', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    wsConnect.mockClear();
    wsDisconnect.mockClear();
    fetchStatusSpy.mockClear();
    fetchLockStateSpy.mockClear();
    fetchPanicStateSpy.mockClear();
    systemStatusState.dbIncompatible = false;
  });

  it('fires fetchStatus, fetchLockState, fetchPanicState, and wsConnect on mount', async () => {
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
    expect(fetchPanicStateSpy).toHaveBeenCalledTimes(1);
    expect(wsConnect).toHaveBeenCalledTimes(1);
  });
});

describe('App.vue — incompatible database', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    systemStatusState.dbIncompatible = false;
  });

  async function mountApp() {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: { template: '<div />' } }],
    });
    await router.push('/');
    await router.isReady();

    return mount(App, {
      global: {
        plugins: [router, i18n],
        stubs: { RouterView: { template: '<div data-testid="router-view" />' } },
      },
    });
  }

  it('renders the incompatible-database notice instead of the router view when dbIncompatible', async () => {
    // Production order: the store starts false and flips after mount (from
    // fetchStatus, the 503 interceptor or the WS push).
    const wrapper = await mountApp();
    expect(wrapper.find('[data-testid="router-view"]').exists()).toBe(true);

    systemStatusState.dbIncompatible = true;
    await nextTick();

    const headings = wrapper.findAll('h1');
    expect(headings).toHaveLength(1);
    expect(headings[0]!.text()).toBe(enUS.systemStatus.incompatibleDatabase.title);
    expect(wrapper.get('[role="alert"]').text()).toContain(
      enUS.systemStatus.incompatibleDatabase.message,
    );
    expect(wrapper.find('[data-testid="router-view"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="toast-container"]').exists()).toBe(true);
  });

  it('renders the router view otherwise', async () => {
    const wrapper = await mountApp();

    expect(wrapper.find('[data-testid="router-view"]').exists()).toBe(true);
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
  });

  it('returns to the router view when dbIncompatible clears', async () => {
    // Recovery: the right build restarts and the WS push clears the code.
    systemStatusState.dbIncompatible = true;
    const wrapper = await mountApp();
    expect(wrapper.find('[role="alert"]').exists()).toBe(true);

    systemStatusState.dbIncompatible = false;
    await nextTick();

    expect(wrapper.find('[data-testid="router-view"]').exists()).toBe(true);
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
  });
});
