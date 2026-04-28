import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import enUS from '@/locales/enUS.json';
import AstrosWriteButton from '@/components/common/AstrosWriteButton.vue';
import { useSystemStatusStore } from '@/stores/systemStatus';

function createTestI18n() {
  return createI18n({
    legacy: false,
    locale: 'enUS',
    fallbackLocale: 'enUS',
    messages: { enUS },
  });
}

function mountButton(
  opts: {
    attrs?: Record<string, unknown>;
    props?: Record<string, unknown>;
    slot?: string;
  } = {},
) {
  return mount(AstrosWriteButton, {
    attrs: opts.attrs,
    props: opts.props,
    slots: { default: opts.slot ?? 'Save' },
    global: { plugins: [createTestI18n()] },
  });
}

describe('AstrosWriteButton', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('renders slot content as the button label', () => {
    const wrapper = mountButton({ slot: 'Custom Label' });
    expect(wrapper.find('button').text()).toBe('Custom Label');
  });

  it('is enabled when readOnly is false and no disabled prop', () => {
    const wrapper = mountButton();
    const button = wrapper.find('button');
    expect(button.attributes('disabled')).toBeUndefined();
  });

  it('is disabled when systemStatus.readOnly is true', async () => {
    const store = useSystemStatusStore();
    store.setStatus({ readOnly: true, reasonCode: 'BACKUP_FAILED' });

    const wrapper = mountButton();
    await wrapper.vm.$nextTick();

    expect(wrapper.find('button').attributes('disabled')).toBeDefined();
  });

  it('is disabled when caller passes disabled prop true even if readOnly is false', () => {
    const wrapper = mountButton({ props: { disabled: true } });
    expect(wrapper.find('button').attributes('disabled')).toBeDefined();
  });

  it('applies the tooltip class to the wrapper only when readOnly is true', async () => {
    // Not read-only: no tooltip class.
    let wrapper = mountButton();
    expect(wrapper.find('div').classes()).not.toContain('tooltip');

    // Read-only: tooltip class present.
    setActivePinia(createPinia());
    useSystemStatusStore().setStatus({ readOnly: true, reasonCode: 'BACKUP_FAILED' });
    wrapper = mountButton();
    await wrapper.vm.$nextTick();
    expect(wrapper.find('div').classes()).toContain('tooltip');
  });

  it('forwards data-testid onto the inner button (not the wrapper)', () => {
    const wrapper = mountButton({ attrs: { 'data-testid': 'save-button' } });
    const button = wrapper.find('button');
    expect(button.attributes('data-testid')).toBe('save-button');
    // Wrapper div should NOT carry the testid.
    expect(wrapper.find('div').attributes('data-testid')).toBeUndefined();
  });

  it('forwards class onto the inner button (not the wrapper)', () => {
    const wrapper = mountButton({ attrs: { class: 'btn btn-primary w-24' } });
    const button = wrapper.find('button');
    expect(button.classes()).toContain('btn');
    expect(button.classes()).toContain('btn-primary');
    expect(button.classes()).toContain('w-24');
  });

  it('emits click events from the underlying button when enabled', async () => {
    const wrapper = mountButton();
    await wrapper.find('button').trigger('click');
    expect(wrapper.emitted('click')).toBeTruthy();
    expect(wrapper.emitted('click')).toHaveLength(1);
  });

  it('does not emit click when the button is disabled by readOnly', async () => {
    useSystemStatusStore().setStatus({ readOnly: true, reasonCode: 'BACKUP_FAILED' });
    const wrapper = mountButton();
    await wrapper.vm.$nextTick();
    await wrapper.find('button').trigger('click');
    // Browsers suppress click on disabled buttons; jsdom respects this too.
    expect(wrapper.emitted('click')).toBeUndefined();
  });
});
