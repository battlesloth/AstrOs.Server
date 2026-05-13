import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import { createRouter, createMemoryHistory } from 'vue-router';
import enUS from '@/locales/enUS.json';

// Stub all API/auth-touching modules at the top so FirmwareView's onMounted
// hooks don't try to hit the network during the test.
vi.mock('@/api/apiService', () => ({
  default: { get: vi.fn().mockResolvedValue({ data: null }) },
  apiClient: {
    get: vi.fn().mockResolvedValue({ data: null }),
    post: vi.fn(),
    delete: vi.fn(),
  },
}));

import FirmwareView from '@/views/FirmwareView.vue';
import { useFirmwareStore } from '@/stores/firmware';
import { useJobLockStore } from '@/stores/jobLock';

function createTestI18n() {
  return createI18n({
    legacy: false,
    locale: 'enUS',
    fallbackLocale: 'enUS',
    messages: { enUS },
  });
}

function createTestRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div />' } }],
  });
}

function mountFirmwareView() {
  return mount(FirmwareView, {
    global: {
      plugins: [createTestI18n(), createTestRouter()],
      // Stub the heavy children so we focus on the view's own template/state
      // gating logic rather than the firmware component graph. The stubs
      // preserve element identity for selector-based assertions.
      stubs: {
        AstrosLayout: { template: '<div><slot name="main" /></div>' },
        AstrosFirmwareSourceStrip: { template: '<div data-test="source-strip" />' },
        AstrosFirmwareTopology: { template: '<div data-test="topology" />' },
        AstrosFirmwareStagesList: { template: '<div data-test="stages-list" />' },
        AstrosFirmwareControllersPanel: { template: '<div data-test="controllers-panel" />' },
        AstrosFirmwareConfirmModal: { template: '<div data-test="confirm-modal" />' },
      },
    },
  });
}

describe('FirmwareView lock-conflict gating (I7)', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('shows the in-page role="alert" lock-conflict region when lock is held by another operator', async () => {
    // lockStore.locked = true and firmwareStore.isOwnJob = false → the
    // operator is locked out by a foreign flash; the alert region must
    // render. Inverting `!isOwnJob` in the source would silently let the
    // operator interact with a foreign-owned flash UI.
    const lockStore = useJobLockStore();
    lockStore.locked = true;
    // isOwnJob is false because firmwareStore.currentJob is null.

    const wrapper = mountFirmwareView();
    await wrapper.vm.$nextTick();

    const alert = wrapper.find('[role="alert"]');
    expect(alert.exists()).toBe(true);
    expect(alert.text()).toContain('Firmware update in progress');
  });

  it('hides the source-strip and grid while the lock-conflict alert is shown', async () => {
    const lockStore = useJobLockStore();
    lockStore.locked = true;
    const firmwareStore = useFirmwareStore();
    firmwareStore.setPhase('select');

    const wrapper = mountFirmwareView();
    await wrapper.vm.$nextTick();

    expect(wrapper.find('[data-test="source-strip"]').exists()).toBe(false);
  });

  it('does NOT show the lock-conflict region when the firmware view owns the active job', async () => {
    // lockStore.locked = true BUT isOwnJob = true (ownJobId matches currentJob)
    // → the operator started this flash; the in-page UI shows progress, not
    // a lockout alert. Pin: isOwnJob suppresses the alert.
    const lockStore = useJobLockStore();
    lockStore.locked = true;
    const firmwareStore = useFirmwareStore();
    firmwareStore.applyJobStarted({
      jobId: 'own-job',
      source: { kind: 'github', version: 'v1.4.2' },
      controllers: [],
      startedAt: '2026-05-13T08:00:00Z',
    });
    firmwareStore.ownJobId = 'own-job';

    const wrapper = mountFirmwareView();
    await wrapper.vm.$nextTick();

    const alert = wrapper.find('[role="alert"]');
    expect(alert.exists()).toBe(false);
  });

  it('does NOT show the lock-conflict region when the lock is idle', async () => {
    // Both flags false → no alert. Negative-branch baseline.
    const wrapper = mountFirmwareView();
    await wrapper.vm.$nextTick();

    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
  });
});
