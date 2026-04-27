import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import enUS from '@/locales/enUS.json';
import SystemStatusBanner from '@/components/common/SystemStatusBanner.vue';
import { useSystemStatusStore } from '@/stores/systemStatus';

function createTestI18n() {
  return createI18n({
    legacy: false,
    locale: 'enUS',
    fallbackLocale: 'enUS',
    messages: { enUS },
  });
}

function mountBanner() {
  return mount(SystemStatusBanner, {
    global: {
      plugins: [createTestI18n()],
    },
  });
}

describe('SystemStatusBanner', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('renders nothing when not in read-only mode', () => {
    const wrapper = mountBanner();
    expect(wrapper.find('[role="status"]').exists()).toBe(false);
    expect(wrapper.text()).toBe('');
  });

  it('renders the alert with the localized reasonCode message in read-only mode', async () => {
    const store = useSystemStatusStore();
    store.setStatus({ readOnly: true, reasonCode: 'BACKUP_FAILED' });

    const wrapper = mountBanner();
    await wrapper.vm.$nextTick();

    const alert = wrapper.find('[role="status"]');
    expect(alert.exists()).toBe(true);
    expect(alert.text()).toContain('Read-only mode');
    expect(alert.text()).toContain('pre-migration backup could not be written');
  });

  it('renders the recovered-after-failure message for MIGRATION_FAILED_RESTORED', async () => {
    const store = useSystemStatusStore();
    store.setStatus({ readOnly: true, reasonCode: 'MIGRATION_FAILED_RESTORED' });

    const wrapper = mountBanner();
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).toContain('Investigate the failed migration before redeploying');
  });

  it('falls back to UNKNOWN message when reasonCode is null', async () => {
    const store = useSystemStatusStore();
    // Force a state where readOnly is true but no reasonCode is set.
    store.setStatus({ readOnly: true });

    const wrapper = mountBanner();
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).toContain('currently unavailable for writes');
  });

  it('falls back to UNKNOWN message for unrecognized reasonCode', async () => {
    const store = useSystemStatusStore();
    // Cast through unknown to simulate a future server reason code the
    // current client doesn't know about.
    store.setStatus({
      readOnly: true,
      reasonCode: 'NOT_A_REAL_CODE' as unknown as 'STARTUP_OPEN_FAILED',
    });

    const wrapper = mountBanner();
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).toContain('currently unavailable for writes');
  });

  it('exposes role=status and aria-live=polite for screen readers', async () => {
    const store = useSystemStatusStore();
    store.setStatus({ readOnly: true, reasonCode: 'BACKUP_FAILED' });

    const wrapper = mountBanner();
    await wrapper.vm.$nextTick();

    const alert = wrapper.find('[role="status"]');
    expect(alert.attributes('aria-live')).toBe('polite');
  });
});
