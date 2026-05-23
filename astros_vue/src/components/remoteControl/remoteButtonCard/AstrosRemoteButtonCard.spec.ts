import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import AstrosRemoteButtonCard from './AstrosRemoteButtonCard.vue';
import type { PageButton } from '@/models/remoteControl/pageButton';
import enUS from '@/locales/enUS.json';

// Use the real enUS.json so any missing key surfaces as a test failure.
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
function mkScript(): PageButton {
  return { id: 's1', name: 'Wave Hello', type: 'script' };
}
function mkPlaylist(): PageButton {
  return { id: 'p1', name: 'Morning Routine', type: 'playlist' };
}

describe('AstrosRemoteButtonCard — display state', () => {
  it('renders BUTTON N label in unassigned state', () => {
    const wrapper = mount(AstrosRemoteButtonCard, {
      global: { plugins: [i18n] },
      props: { buttonNumber: 5, value: mkNone(), scripts: SCRIPTS, playlists: PLAYLISTS },
    });
    expect(wrapper.text()).toMatch(/BUTTON 5|BTN 5/i);
  });

  it('shows a Configure button when value.type is none', () => {
    const wrapper = mount(AstrosRemoteButtonCard, {
      global: { plugins: [i18n] },
      props: { buttonNumber: 5, value: mkNone(), scripts: SCRIPTS, playlists: PLAYLISTS },
    });
    expect(wrapper.find('[data-testid="card-configure"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="card-edit"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="card-clear"]').exists()).toBe(false);
  });

  it('shows assigned name and Edit/Clear buttons when value is a script', () => {
    const wrapper = mount(AstrosRemoteButtonCard, {
      global: { plugins: [i18n] },
      props: { buttonNumber: 5, value: mkScript(), scripts: SCRIPTS, playlists: PLAYLISTS },
    });
    expect(wrapper.text()).toContain('Wave Hello');
    expect(wrapper.find('[data-testid="card-edit"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="card-clear"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="card-configure"]').exists()).toBe(false);
  });

  it('renders a SCRIPT type chip on a script-typed value', () => {
    const wrapper = mount(AstrosRemoteButtonCard, {
      global: { plugins: [i18n] },
      props: { buttonNumber: 5, value: mkScript(), scripts: SCRIPTS, playlists: PLAYLISTS },
    });
    const chip = wrapper.find('[data-testid="card-type-chip"]');
    expect(chip.exists()).toBe(true);
    expect(chip.text()).toMatch(/SCRIPT/i);
  });

  it('renders a PLAYLIST type chip on a playlist-typed value', () => {
    const wrapper = mount(AstrosRemoteButtonCard, {
      global: { plugins: [i18n] },
      props: { buttonNumber: 5, value: mkPlaylist(), scripts: SCRIPTS, playlists: PLAYLISTS },
    });
    const chip = wrapper.find('[data-testid="card-type-chip"]');
    expect(chip.text()).toMatch(/PLAYLIST/i);
  });

  it('Clear emits change with the none sentinel WITHOUT opening the editor', async () => {
    const wrapper = mount(AstrosRemoteButtonCard, {
      global: { plugins: [i18n] },
      props: { buttonNumber: 5, value: mkScript(), scripts: SCRIPTS, playlists: PLAYLISTS },
    });
    await wrapper.get('[data-testid="card-clear"]').trigger('click');

    expect(wrapper.emitted('change')![0]![0]).toEqual({ id: '0', name: 'None', type: 'none' });
    // The editor popover must NOT have rendered (no editor element in DOM).
    expect(document.querySelector('[data-testid="editor-search"]')).toBeNull();
  });
});

describe('AstrosRemoteButtonCard — popover host', () => {
  it('opens the editor popover when Configure is clicked on an unassigned card', async () => {
    const wrapper = mount(AstrosRemoteButtonCard, {
      attachTo: document.body,
      global: { plugins: [i18n] },
      props: { buttonNumber: 5, value: mkNone(), scripts: SCRIPTS, playlists: PLAYLISTS },
    });
    await wrapper.get('[data-testid="card-configure"]').trigger('click');

    expect(document.querySelector('[data-testid="editor-search"]')).not.toBeNull();
    wrapper.unmount();
  });

  it('opens the editor popover when Edit is clicked on an assigned card', async () => {
    const wrapper = mount(AstrosRemoteButtonCard, {
      attachTo: document.body,
      global: { plugins: [i18n] },
      props: { buttonNumber: 5, value: mkScript(), scripts: SCRIPTS, playlists: PLAYLISTS },
    });
    await wrapper.get('[data-testid="card-edit"]').trigger('click');

    expect(document.querySelector('[data-testid="editor-search"]')).not.toBeNull();
    wrapper.unmount();
  });

  it('forwards the editor change event up and closes the popover', async () => {
    const wrapper = mount(AstrosRemoteButtonCard, {
      attachTo: document.body,
      global: { plugins: [i18n] },
      props: { buttonNumber: 5, value: mkNone(), scripts: SCRIPTS, playlists: PLAYLISTS },
    });
    await wrapper.get('[data-testid="card-configure"]').trigger('click');
    await wrapper.vm.$nextTick();
    const item = document.querySelector('[data-testid="editor-item-s1"]') as HTMLElement;
    expect(item).not.toBeNull();
    item.click();
    await wrapper.vm.$nextTick();

    expect(wrapper.emitted('change')![0]![0]).toEqual({
      id: 's1',
      name: 'Wave Hello',
      type: 'script',
    });
    expect(document.querySelector('[data-testid="editor-search"]')).toBeNull();
    wrapper.unmount();
  });

  it('closes the popover when Escape is pressed (focus-on-open routes the keydown to the editor)', async () => {
    // Integration check for the editor's onMounted focus + the @keydown.escape
    // handler on the editor root. If focus-on-mount stops working, Escape
    // pressed by a user who just clicked Edit/Configure would no-op because
    // focus would still be on the card button, not the editor.
    const wrapper = mount(AstrosRemoteButtonCard, {
      attachTo: document.body,
      global: { plugins: [i18n] },
      props: { buttonNumber: 5, value: mkNone(), scripts: SCRIPTS, playlists: PLAYLISTS },
    });
    await wrapper.get('[data-testid="card-configure"]').trigger('click');
    await wrapper.vm.$nextTick();
    expect(document.querySelector('[data-testid="editor-search"]')).not.toBeNull();

    const escEvent = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
    (document.activeElement ?? document.body).dispatchEvent(escEvent);
    await wrapper.vm.$nextTick();

    expect(document.querySelector('[data-testid="editor-search"]')).toBeNull();
    wrapper.unmount();
  });

  it('closes the popover when the editor emits close (× button)', async () => {
    const wrapper = mount(AstrosRemoteButtonCard, {
      attachTo: document.body,
      global: { plugins: [i18n] },
      props: { buttonNumber: 5, value: mkNone(), scripts: SCRIPTS, playlists: PLAYLISTS },
    });
    await wrapper.get('[data-testid="card-configure"]').trigger('click');
    await wrapper.vm.$nextTick();
    expect(document.querySelector('[data-testid="editor-search"]')).not.toBeNull();

    const close = document.querySelector('[data-testid="editor-close"]') as HTMLElement;
    close.click();
    await wrapper.vm.$nextTick();

    expect(document.querySelector('[data-testid="editor-search"]')).toBeNull();
    wrapper.unmount();
  });

  it('closes the popover when a click outside both card and popover happens', async () => {
    const wrapper = mount(AstrosRemoteButtonCard, {
      attachTo: document.body,
      global: { plugins: [i18n] },
      props: { buttonNumber: 5, value: mkNone(), scripts: SCRIPTS, playlists: PLAYLISTS },
    });
    await wrapper.get('[data-testid="card-configure"]').trigger('click');

    const outside = document.createElement('div');
    document.body.appendChild(outside);
    outside.click();
    await wrapper.vm.$nextTick();

    expect(document.querySelector('[data-testid="editor-search"]')).toBeNull();
    outside.remove();
    wrapper.unmount();
  });

  it('removes the EXACT document click listener registered on mount (proves cleanup actually ran)', async () => {
    // The previous "doesn't throw on post-unmount click" form was vacuous —
    // the handler has no throwable path even when leaked. Spying on
    // add/removeEventListener and comparing handler identity proves the
    // listener was actually unregistered, AND pins the capture-phase third arg.
    const addSpy = vi.spyOn(document, 'addEventListener');
    const removeSpy = vi.spyOn(document, 'removeEventListener');

    const wrapper = mount(AstrosRemoteButtonCard, {
      attachTo: document.body,
      global: { plugins: [i18n] },
      props: { buttonNumber: 5, value: mkNone(), scripts: SCRIPTS, playlists: PLAYLISTS },
    });
    const addCall = addSpy.mock.calls.find(([type, , opts]) => type === 'click' && opts === true);
    expect(addCall).toBeDefined();
    const installedHandler = addCall![1];

    wrapper.unmount();

    expect(removeSpy).toHaveBeenCalledWith('click', installedHandler, true);
  });

  it('closes the popover via capture phase even when an outside element stops bubble propagation', async () => {
    // Pins the capture-phase contract. If the outside-click listener were
    // (incorrectly) on bubble phase, a stopPropagation in an outside child
    // would prevent the close. Capture phase fires before any child handler,
    // so it still closes the popover.
    const wrapper = mount(AstrosRemoteButtonCard, {
      attachTo: document.body,
      global: { plugins: [i18n] },
      props: { buttonNumber: 5, value: mkNone(), scripts: SCRIPTS, playlists: PLAYLISTS },
    });
    await wrapper.get('[data-testid="card-configure"]').trigger('click');
    await wrapper.vm.$nextTick();

    const outside = document.createElement('button');
    outside.addEventListener('click', (e) => e.stopPropagation(), false);
    document.body.appendChild(outside);
    outside.click();
    await wrapper.vm.$nextTick();

    expect(document.querySelector('[data-testid="editor-search"]')).toBeNull();
    outside.remove();
    wrapper.unmount();
  });

  it('can re-open the popover after a click-outside close (open→close→open lifecycle)', async () => {
    const wrapper = mount(AstrosRemoteButtonCard, {
      attachTo: document.body,
      global: { plugins: [i18n] },
      props: { buttonNumber: 5, value: mkNone(), scripts: SCRIPTS, playlists: PLAYLISTS },
    });
    await wrapper.get('[data-testid="card-configure"]').trigger('click');
    await wrapper.vm.$nextTick();
    expect(document.querySelector('[data-testid="editor-search"]')).not.toBeNull();

    const outside = document.createElement('div');
    document.body.appendChild(outside);
    outside.click();
    await wrapper.vm.$nextTick();
    expect(document.querySelector('[data-testid="editor-search"]')).toBeNull();

    await wrapper.get('[data-testid="card-configure"]').trigger('click');
    await wrapper.vm.$nextTick();
    expect(document.querySelector('[data-testid="editor-search"]')).not.toBeNull();

    outside.remove();
    wrapper.unmount();
  });

  it('reactively switches from unassigned to assigned display when value prop changes', async () => {
    const wrapper = mount(AstrosRemoteButtonCard, {
      global: { plugins: [i18n] },
      props: { buttonNumber: 5, value: mkNone(), scripts: SCRIPTS, playlists: PLAYLISTS },
    });
    expect(wrapper.find('[data-testid="card-configure"]').exists()).toBe(true);

    await wrapper.setProps({ value: mkScript() });

    expect(wrapper.find('[data-testid="card-configure"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="card-edit"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="card-type-chip"]').text()).toMatch(/SCRIPT/i);
    expect(wrapper.text()).toContain('Wave Hello');
  });
});
