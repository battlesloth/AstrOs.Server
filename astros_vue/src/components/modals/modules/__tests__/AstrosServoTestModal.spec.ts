import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import { nextTick } from 'vue';
import enUS from '@/locales/enUS.json';
import AstrosServoTestModal from '@/components/modals/modules/AstrosServoTestModal.vue';
import { useJobLockStore } from '@/stores/jobLock';

const stubSendMessage = vi.fn();
vi.mock('@/composables/useWebsocket', () => ({
  useWebsocket: () => ({ wsSendMessage: stubSendMessage }),
}));

function createTestI18n() {
  return createI18n({
    legacy: false,
    locale: 'enUS',
    fallbackLocale: 'enUS',
    messages: { enUS },
  });
}

const defaultProps = {
  controllerAddress: 'aa:bb:cc:dd:ee:01',
  controllerName: 'Core',
  moduleSubType: 1,
  moduleIdx: 0,
  channelNumber: 0,
  homePosition: 1500,
};

function mountModal(): VueWrapper {
  return mount(AstrosServoTestModal, {
    props: defaultProps,
    global: { plugins: [createTestI18n()] },
  });
}

describe('AstrosServoTestModal — CR-5 lock-aware gating', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    stubSendMessage.mockClear();
  });

  it('renders normally and allows enabling when not locked', async () => {
    const wrapper = mountModal();
    const btn = wrapper.find('[data-testid="enable-test-button"]');
    expect(btn.attributes('disabled')).toBeUndefined();
    await btn.trigger('click');
    expect(stubSendMessage).toHaveBeenCalledTimes(1);
  });

  it('disables the Enable Test button when jobLock.locked is true', async () => {
    const lockStore = useJobLockStore();
    lockStore.setState({
      locked: true,
      owner: 'flash:job-A',
      since: '2026-05-14T08:00:00Z',
    });
    const wrapper = mountModal();
    await nextTick();
    const btn = wrapper.find('[data-testid="enable-test-button"]');
    expect(btn.attributes('disabled')).toBeDefined();
  });

  it('does NOT send servoTest when enableTest is invoked while locked', async () => {
    const lockStore = useJobLockStore();
    lockStore.setState({
      locked: true,
      owner: 'flash:job-A',
      since: '2026-05-14T08:00:00Z',
    });
    const wrapper = mountModal();
    await nextTick();
    const btn = wrapper.find('[data-testid="enable-test-button"]');
    await btn.trigger('click');
    expect(stubSendMessage).not.toHaveBeenCalled();
  });

  it('renders the lock-active notice region with role=status when locked', async () => {
    const lockStore = useJobLockStore();
    lockStore.setState({
      locked: true,
      owner: 'flash:job-A',
      since: '2026-05-14T08:00:00Z',
    });
    const wrapper = mountModal();
    await nextTick();
    const notice = wrapper.find('[data-testid="lock-active-notice"]');
    expect(notice.exists()).toBe(true);
    expect(notice.attributes('role')).toBe('status');
    expect(notice.attributes('aria-live')).toBe('polite');
  });

  it('disables the slider when locked', async () => {
    const lockStore = useJobLockStore();
    lockStore.setState({
      locked: true,
      owner: 'flash:job-A',
      since: '2026-05-14T08:00:00Z',
    });
    const wrapper = mountModal();
    await nextTick();
    const slider = wrapper.find('input[type="range"]');
    expect(slider.attributes('disabled')).toBeDefined();
  });

  it('auto-disables an active test if a lock acquires mid-session', async () => {
    const wrapper = mountModal();
    const btn = wrapper.find('[data-testid="enable-test-button"]');
    // Enable test while unlocked
    await btn.trigger('click');
    expect(stubSendMessage).toHaveBeenCalledTimes(1);
    stubSendMessage.mockClear();
    // Lock acquires
    const lockStore = useJobLockStore();
    lockStore.setState({
      locked: true,
      owner: 'flash:job-A',
      since: '2026-05-14T08:00:00Z',
    });
    await nextTick();
    // Slider change should be a no-op now
    const slider = wrapper.find('input[type="range"]');
    await slider.trigger('input');
    expect(stubSendMessage).not.toHaveBeenCalled();
  });
});
