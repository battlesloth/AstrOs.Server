import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import enUS from '@/locales/enUS.json';
import AstrosLockStateBanner from '@/components/common/lockStateBanner/AstrosLockStateBanner.vue';
import { useJobLockStore } from '@/stores/jobLock';
import { useFirmwareStore } from '@/stores/firmware';

function createTestI18n() {
  return createI18n({
    legacy: false,
    locale: 'enUS',
    fallbackLocale: 'enUS',
    messages: { enUS },
  });
}

function mountBanner() {
  return mount(AstrosLockStateBanner, {
    global: {
      plugins: [createTestI18n()],
    },
  });
}

describe('AstrosLockStateBanner', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('renders nothing when the job lock is idle (no flash in flight)', () => {
    const wrapper = mountBanner();
    expect(wrapper.find('[role="status"]').exists()).toBe(false);
    expect(wrapper.text()).toBe('');
  });

  it('renders the ambient banner with role="status" when the lock is held by another view', async () => {
    // Pin role="status" (not role="alert") — this banner is ambient cross-page
    // context, not an interrupt. The FirmwareView's in-page lock-conflict
    // region uses role="alert"; doubling up would be screen-reader noise.
    const lockStore = useJobLockStore();
    lockStore.locked = true;

    const wrapper = mountBanner();
    await wrapper.vm.$nextTick();

    const banner = wrapper.find('[role="status"]');
    expect(banner.exists()).toBe(true);
    expect(banner.attributes('aria-live')).toBe('polite');
    expect(banner.text()).toContain('Firmware update in progress');
  });

  it('hides the banner when the lock is held by the firmware view itself (isOwnJob)', async () => {
    // The FirmwareView surfaces its own in-context job UI; the ambient banner
    // would be redundant there. Verify the suppression actually fires when
    // currentJob.jobId matches ownJobId.
    const lockStore = useJobLockStore();
    lockStore.locked = true;
    const firmwareStore = useFirmwareStore();
    firmwareStore.applyJobStarted({
      jobId: 'own-job',
      source: { kind: 'github', version: 'v1.4.2' },
      controllers: [],
      startedAt: '2026-05-12T00:00:00.000Z',
    });
    firmwareStore.ownJobId = 'own-job';

    const wrapper = mountBanner();
    await wrapper.vm.$nextTick();

    expect(wrapper.find('[role="status"]').exists()).toBe(false);
  });
});
