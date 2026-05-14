import { describe, it, expect, beforeEach } from 'vitest';
import { nextTick } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import enUS from '@/locales/enUS.json';
import AstrosAddModuleModal from '@/components/modals/modules/AstrosAddModuleModal.vue';
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

// The Add button in this modal emits an event consumed by ModulesView, which
// pushes to local Pinia state only. The actual server write happens at the
// view's "Save Module Settings" button, which is already lock-aware via
// AstrosWriteButton from d.6. So this spec covers form-validation behavior
// only — no lock-state assertions belong here.

describe('AstrosAddModuleModal — form validation', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('add button is disabled when no module subtype is selected', () => {
    const wrapper = mountModal();
    const btn = wrapper.find('[data-testid="modal-add-module"]');
    expect(btn.attributes('disabled')).toBeDefined();
  });

  it('add button becomes enabled once a subtype is selected', async () => {
    const wrapper = mountModal();
    await selectSubType(wrapper, ModuleSubType.KANGAROO);
    const btn = wrapper.find('[data-testid="modal-add-module"]');
    expect(btn.attributes('disabled')).toBeUndefined();
  });

  it('emits add event with the selected subtype when the button is clicked', async () => {
    const wrapper = mountModal();
    await selectSubType(wrapper, ModuleSubType.KANGAROO);
    await wrapper.find('[data-testid="modal-add-module"]').trigger('click');
    const emitted = wrapper.emitted('add');
    expect(emitted).toHaveLength(1);
    expect(emitted?.[0]?.[0]).toMatchObject({
      locationId: Location.BODY,
      moduleType: ModuleType.UART,
      moduleSubType: ModuleSubType.KANGAROO,
    });
  });
});
