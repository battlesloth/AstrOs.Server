import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import AstrosRemoteButtonEditorModal from './AstrosRemoteButtonEditorModal.vue';
import type { PageButton } from '@/models/remoteControl/pageButton';
import enUS from '@/locales/enUS.json';

const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  messages: { 'en-US': enUS },
});

const SCRIPTS = [{ id: 's1', name: 'Wave Hello' }];
const PLAYLISTS = [{ id: 'p1', name: 'Morning Routine' }];

function mkNone(): PageButton {
  return { id: '0', name: 'None', type: 'none' };
}

function mountModal(currentValue: PageButton = mkNone()) {
  return mount(AstrosRemoteButtonEditorModal, {
    attachTo: document.body,
    global: { plugins: [i18n] },
    props: { buttonNumber: 3, currentValue, scripts: SCRIPTS, playlists: PLAYLISTS },
  });
}

describe('AstrosRemoteButtonEditorModal', () => {
  it('renders the editor content inside the app modal dialog shell', () => {
    const wrapper = mountModal();
    expect(wrapper.find('dialog.modal').exists()).toBe(true);
    expect(wrapper.find('.modal-box').exists()).toBe(true);
    expect(wrapper.find('.modal-backdrop').exists()).toBe(true);
    expect(wrapper.find('[data-testid="editor-search"]').exists()).toBe(true);
    // Title is supplied by the modal shell (button number is 1-based).
    expect(wrapper.text()).toContain('Configure Button 3');
    wrapper.unmount();
  });

  it('forwards the editor change event verbatim when an item is selected', async () => {
    const wrapper = mountModal();
    await wrapper.get('[data-testid="editor-item-s1"]').trigger('click');

    expect(wrapper.emitted('change')![0]![0]).toEqual({
      id: 's1',
      name: 'Wave Hello',
      type: 'script',
    });
    wrapper.unmount();
  });

  it('emits close when the footer Close button is clicked', async () => {
    const wrapper = mountModal();
    await wrapper.get('[data-testid="editor-modal-close"]').trigger('click');

    expect(wrapper.emitted('close')).toHaveLength(1);
    wrapper.unmount();
  });

  it('emits close when the modal backdrop is clicked', async () => {
    const wrapper = mountModal();
    await wrapper.get('.modal-backdrop').trigger('click');

    expect(wrapper.emitted('close')).toHaveLength(1);
    wrapper.unmount();
  });

  it('emits close on Escape (editor focuses its root on mount so the keydown lands there)', async () => {
    // Integration check for the editor's onMounted focus + its
    // @keydown.escape handler. If focus-on-mount regresses, Escape would
    // no-op because focus would sit on <body> instead of the editor root.
    const wrapper = mountModal();
    await wrapper.vm.$nextTick();
    expect(document.activeElement).not.toBe(document.body);

    document.activeElement!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    await wrapper.vm.$nextTick();

    expect(wrapper.emitted('close')).toHaveLength(1);
    wrapper.unmount();
  });
});
