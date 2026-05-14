import { describe, it, expect, beforeEach } from 'vitest';
import { nextTick } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import enUS from '@/locales/enUS.json';
import AstrosAddModuleModal from '@/components/modals/modules/AstrosAddModuleModal.vue';
import { useJobLockStore } from '@/stores/jobLock';
import { Location } from '@/enums/modules/Location';
import { ModuleType } from '@/enums/modules/ModuleType';
import { ModuleSubType } from '@/enums/modules/ModuleSubType';

function createTestI18n() {
  return createI18n({
    legacy: false,
    locale: 'enUS',
    fallbackLocale: 'enUS',
    messages: { enUS },
  });
}

function mountModal(): VueWrapper {
  return mount(AstrosAddModuleModal, {
    props: {
      locationId: Location.BODY,
      moduleType: ModuleType.UART,
      isOpen: true,
    },
    global: { plugins: [createTestI18n()] },
  });
}

async function selectSubType(wrapper: VueWrapper, subType: ModuleSubType) {
  const select = wrapper.find('[data-testid="modal-module-select"]');
  await select.setValue(subType);
  await nextTick();
}

describe('AstrosAddModuleModal — lock-aware primary action', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('add button is disabled when no module subtype is selected (baseline)', () => {
    // Existing constraint; AstrosWriteButton must preserve the caller-passed
    // `:disabled` semantics after conversion.
    const wrapper = mountModal();
    const btn = wrapper.find('[data-testid="modal-add-module"]');
    expect(btn.attributes('disabled')).toBeDefined();
  });

  it('add button becomes enabled when a subtype is selected and no lock is held', async () => {
    const wrapper = mountModal();
    await selectSubType(wrapper, ModuleSubType.KANGAROO);
    const btn = wrapper.find('[data-testid="modal-add-module"]');
    expect(btn.attributes('disabled')).toBeUndefined();
  });

  it('add button stays disabled when jobLock.locked is true even with a subtype selected', async () => {
    useJobLockStore().setState({
      locked: true,
      owner: 'flash:other',
      since: '2026-05-14T08:00:00.000Z',
    });
    const wrapper = mountModal();
    await selectSubType(wrapper, ModuleSubType.KANGAROO);
    const btn = wrapper.find('[data-testid="modal-add-module"]');
    expect(btn.attributes('disabled')).toBeDefined();
  });

  it('does NOT emit add event when clicked while locked', async () => {
    useJobLockStore().setState({
      locked: true,
      owner: 'flash:other',
      since: '2026-05-14T08:00:00.000Z',
    });
    const wrapper = mountModal();
    await selectSubType(wrapper, ModuleSubType.KANGAROO);
    await wrapper.find('[data-testid="modal-add-module"]').trigger('click');
    expect(wrapper.emitted('add')).toBeUndefined();
  });

  it('cancel button stays enabled while locked — operator must always be able to dismiss', async () => {
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
