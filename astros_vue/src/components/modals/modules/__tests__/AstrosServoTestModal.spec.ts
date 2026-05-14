import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import { nextTick } from 'vue';
import enUS from '@/locales/enUS.json';
import AstrosServoTestModal from '@/components/modals/modules/AstrosServoTestModal.vue';
import { useJobLockStore } from '@/stores/jobLock';
import { useSystemStatusStore } from '@/stores/systemStatus';

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

describe('AstrosServoTestModal — write-blocked gating (jobLock + readOnly)', () => {
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

  it('disables both the slider and the number input when locked', async () => {
    const lockStore = useJobLockStore();
    lockStore.setState({
      locked: true,
      owner: 'flash:job-A',
      since: '2026-05-14T08:00:00Z',
    });
    const wrapper = mountModal();
    await nextTick();
    const slider = wrapper.find('input[type="range"]');
    const numberInput = wrapper.find('input[type="number"]');
    expect(slider.attributes('disabled')).toBeDefined();
    expect(numberInput.attributes('disabled')).toBeDefined();
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

  it('keeps slider/number input disabled when readOnly flips on AFTER the test is enabled', async () => {
    // This test exercises the writesBlocked widening directly. Without the
    // `|| systemStatusReadOnly.value` clause, the initial disabled=true
    // ref already keeps both inputs disabled at mount, so a naive "disabled
    // when readonly is true" assertion passes vacuously. We instead enable
    // the test first (disabled flips to false), then flip readOnly true and
    // assert both inputs go back to disabled — which only holds if
    // writesBlocked feeds the :disabled bindings.
    const wrapper = mountModal();
    const btn = wrapper.find('[data-testid="enable-test-button"]');
    await btn.trigger('click');

    const slider = wrapper.find('input[type="range"]');
    const numberInput = wrapper.find('input[type="number"]');
    expect(slider.attributes('disabled')).toBeUndefined();
    expect(numberInput.attributes('disabled')).toBeUndefined();

    const systemStatus = useSystemStatusStore();
    systemStatus.setStatus({ readOnly: true, reasonCode: 'BACKUP_FAILED' });
    await nextTick();

    expect(slider.attributes('disabled')).toBeDefined();
    expect(numberInput.attributes('disabled')).toBeDefined();
  });

  it('does NOT send servoTest when enableTest is invoked while readonly', async () => {
    const systemStatus = useSystemStatusStore();
    systemStatus.setStatus({ readOnly: true, reasonCode: 'BACKUP_FAILED' });
    const wrapper = mountModal();
    await nextTick();
    const btn = wrapper.find('[data-testid="enable-test-button"]');
    await btn.trigger('click');
    expect(stubSendMessage).not.toHaveBeenCalled();
  });

  it('does NOT render the firmware-flash notice region when readonly-only (no jobLock)', async () => {
    const systemStatus = useSystemStatusStore();
    systemStatus.setStatus({ readOnly: true, reasonCode: 'BACKUP_FAILED' });
    const wrapper = mountModal();
    await nextTick();
    // The notice copy is firmware-flash-specific (firmware_view.lock_active).
    // AstrosWriteButton's own tooltip already explains readonly to the user;
    // we don't want a misleading "flash active" notice when there's no flash.
    const notice = wrapper.find('[data-testid="lock-active-notice"]');
    expect(notice.exists()).toBe(false);
  });

  it('after a mid-session lock the active test stays disabled even after the lock releases', async () => {
    // Pins the watcher's lock-release UX guarantee: when a flash interrupts an
    // active servo test, the slider must not auto-fire when the lock later
    // releases — the operator has to explicitly re-Enable. Without the
    // watcher at writesBlocked-true (which resets disabled.value to true +
    // label to 'enable_test'), this guarantee breaks because the handler-body
    // early-return guard `disabled.value || writesBlocked.value` evaluates to
    // false after the lock releases (both are false again), so the next slider
    // input fires a SERVO_TEST. The other existing tests don't catch this
    // because they only assert behavior during the locked window, when the
    // writesBlocked half of the guard short-circuits.
    const wrapper = mountModal();
    const btn = wrapper.find('[data-testid="enable-test-button"]');
    await btn.trigger('click');
    stubSendMessage.mockClear();

    const lockStore = useJobLockStore();
    lockStore.setState({
      locked: true,
      owner: 'flash:job-A',
      since: '2026-05-14T08:00:00Z',
    });
    await nextTick();
    lockStore.setState({ locked: false, owner: null, since: null });
    await nextTick();

    const slider = wrapper.find('input[type="range"]');
    await slider.trigger('input');
    expect(stubSendMessage).not.toHaveBeenCalled();
    // Label should also have reset to 'enable_test' (the watcher resets both).
    expect(btn.text()).toContain('Enable');
  });

  it('auto-disables an active test if readOnly flips on mid-session', async () => {
    const wrapper = mountModal();
    const btn = wrapper.find('[data-testid="enable-test-button"]');
    await btn.trigger('click');
    expect(stubSendMessage).toHaveBeenCalledTimes(1);
    stubSendMessage.mockClear();

    const systemStatus = useSystemStatusStore();
    systemStatus.setStatus({ readOnly: true, reasonCode: 'BACKUP_FAILED' });
    await nextTick();

    const slider = wrapper.find('input[type="range"]');
    await slider.trigger('input');
    expect(stubSendMessage).not.toHaveBeenCalled();
  });
});
