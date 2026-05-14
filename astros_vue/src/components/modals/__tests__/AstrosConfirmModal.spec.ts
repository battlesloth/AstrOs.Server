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

  it('close (cancel) button stays enabled even during a flash — operator must always be able to dismiss', async () => {
    // Cancel/Close paths are intentionally NOT lock-aware: an operator who
    // hits Confirm by mistake and lands on a modal during a flash should
    // always be able to back out. The close button stays as a raw <button>.
    useJobLockStore().setState({
      locked: true,
      owner: 'flash:other',
      since: '2026-05-14T08:00:00.000Z',
    });
    const wrapper = mountModal();
    await nextTick();
    const close = wrapper.find('[data-testid="modal-close"]');
    expect(close.attributes('disabled')).toBeUndefined();
  });
});
