import { describe, it, expect, beforeEach, vi } from 'vitest';
import { nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import enUS from '@/locales/enUS.json';
import AstrosConfirmModal from '@/components/modals/AstrosConfirmModal.vue';
import { useJobLockStore } from '@/stores/jobLock';

function createTestI18n() {
  return createI18n({
    legacy: false,
    locale: 'enUS',
    fallbackLocale: 'enUS',
    messages: { enUS },
  });
}

function mountModal(overrides: Record<string, unknown> = {}) {
  return mount(AstrosConfirmModal, {
    props: {
      message: 'modals.confirm.title',
      onClose: vi.fn(),
      onConfirm: vi.fn(),
      ...overrides,
    },
    global: { plugins: [createTestI18n()] },
  });
}

describe('AstrosConfirmModal — lock-aware primary action', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('confirm button is enabled when no flash job is active', () => {
    const wrapper = mountModal();
    const btn = wrapper.find('[data-testid="modal-confirm"]');
    expect(btn.attributes('disabled')).toBeUndefined();
  });

  it('confirm button is disabled when jobLock.locked is true', async () => {
    useJobLockStore().setState({
      locked: true,
      owner: 'flash:other',
      since: '2026-05-14T08:00:00.000Z',
    });
    const wrapper = mountModal();
    await nextTick();
    const btn = wrapper.find('[data-testid="modal-confirm"]');
    expect(btn.attributes('disabled')).toBeDefined();
  });

  it('does NOT call onConfirm when clicked while locked', async () => {
    useJobLockStore().setState({
      locked: true,
      owner: 'flash:other',
      since: '2026-05-14T08:00:00.000Z',
    });
    const onConfirm = vi.fn();
    const wrapper = mountModal({ onConfirm });
    await nextTick();
    await wrapper.find('[data-testid="modal-confirm"]').trigger('click');
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('close (cancel) button stays enabled and still fires onClose during a flash — operator must always be able to dismiss', async () => {
    // Cancel/Close paths are intentionally NOT lock-aware: an operator who
    // hits Confirm by mistake and lands on a modal during a flash should
    // always be able to back out. The close button stays as a raw <button>
    // AND its callback must actually fire — the disabled-absence check on
    // its own can't catch a future refactor that adds an in-callback
    // `if (locked) return;` short-circuit.
    useJobLockStore().setState({
      locked: true,
      owner: 'flash:other',
      since: '2026-05-14T08:00:00.000Z',
    });
    const onClose = vi.fn();
    const wrapper = mountModal({ onClose });
    await nextTick();
    const close = wrapper.find('[data-testid="modal-close"]');
    expect(close.attributes('disabled')).toBeUndefined();
    await close.trigger('click');
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('AstrosConfirmModal — message rendering branches', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('renders $t(message) directly when messageParams is undefined (legacy callers)', () => {
    // modals.confirm.title resolves to "Confirm" in enUS.json — verify the
    // no-params branch resolves the i18n key without interpolation.
    const wrapper = mountModal({ message: 'modals.confirm.title' });
    // Body has the resolved message. Title (h2) also says "Confirm" (same
    // key) — assert the resolved text appears in the body specifically.
    const body = wrapper.find('.modal-body');
    expect(body.text()).toContain('Confirm');
  });

  it('interpolates messageParams into the i18n key when provided', () => {
    // Use a real locale key with a {name} placeholder so we're testing the
    // actual vue-i18n path, not a lookup-miss fallback.
    const wrapper = mountModal({
      message: 'remote_control_config.deleteModal.message',
      messageParams: { name: 'Performance' },
    });
    expect(wrapper.text()).toContain('Performance');
    expect(wrapper.text()).toContain('Delete');
    // The placeholder itself must NOT survive into the rendered text — that
    // would indicate the params weren't threaded through to $t.
    expect(wrapper.text()).not.toContain('{name}');
  });

  it('renders interpolated message reactively when params update', async () => {
    const wrapper = mountModal({
      message: 'remote_control_config.deleteModal.message',
      messageParams: { name: 'Before' },
    });
    expect(wrapper.text()).toContain('Before');

    await wrapper.setProps({ messageParams: { name: 'After' } });
    expect(wrapper.text()).toContain('After');
    expect(wrapper.text()).not.toContain('Before');
  });
});
