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
    expect(document.querySelector('[data-testid="editor-search"]')).toBeNull();
  });

  it('Clear emits a FRESH none-button object on each click (no shared identity across clicks)', async () => {
    // Anti-regression for the shared-NONE_BUTTON-sentinel hazard. If both
    // emits returned the same module-level const, an in-place mutation by
    // any downstream consumer (`page.button1.name = 'X'` — a documented
    // pattern in the store spec) would poison every other slot whose value
    // came from the same sentinel.
    const wrapper = mount(AstrosRemoteButtonCard, {
      global: { plugins: [i18n] },
      props: { buttonNumber: 5, value: mkScript(), scripts: SCRIPTS, playlists: PLAYLISTS },
    });

    await wrapper.get('[data-testid="card-clear"]').trigger('click');
    await wrapper.setProps({ value: mkPlaylist() });
    await wrapper.get('[data-testid="card-clear"]').trigger('click');

    const events = wrapper.emitted('change');
    expect(events).toHaveLength(2);
    const first = events![0]![0];
    const second = events![1]![0];
    expect(first).toEqual(second);
    expect(first).not.toBe(second);
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
    await wrapper.vm.$nextTick();
    expect(document.querySelector('[data-testid="editor-search"]')).not.toBeNull();
    // Pin the focus contract explicitly — if a future refactor drops the
    // tabindex or breaks the focus chain, this assertion fires before the
    // Escape dispatch makes the rest of the test ambiguous.
    expect(document.activeElement).not.toBe(document.body);

    const escEvent = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
    document.activeElement!.dispatchEvent(escEvent);
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

  it('removes every click+capture document listener registered on mount (proves cleanup actually ran)', async () => {
    // The previous "doesn't throw on post-unmount click" form was vacuous —
    // the handler has no throwable path even when leaked. Spy on
    // add/removeEventListener and assert every click+capture handler
    // registered is also removed. Filter-and-subset (not .find()) so a
    // future Floating UI upgrade that adds its own click+capture listener
    // doesn't silently corrupt this test by hiding behind the first match.
    const addSpy = vi.spyOn(document, 'addEventListener');
    const removeSpy = vi.spyOn(document, 'removeEventListener');

    const wrapper = mount(AstrosRemoteButtonCard, {
      attachTo: document.body,
      global: { plugins: [i18n] },
      props: { buttonNumber: 5, value: mkNone(), scripts: SCRIPTS, playlists: PLAYLISTS },
    });
    const addedHandlers = addSpy.mock.calls
      .filter(([type, , opts]) => type === 'click' && opts === true)
      .map(([, handler]) => handler);
    expect(addedHandlers.length).toBeGreaterThan(0);

    wrapper.unmount();

    const removedHandlers = removeSpy.mock.calls
      .filter(([type, , opts]) => type === 'click' && opts === true)
      .map(([, handler]) => handler);
    expect(removedHandlers).toEqual(expect.arrayContaining(addedHandlers));
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
    // Pre-assert both the Configure-visible AND chip-absent baseline so a
    // regression that renders the chip unconditionally would surface here.
    expect(wrapper.find('[data-testid="card-configure"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="card-type-chip"]').exists()).toBe(false);

    await wrapper.setProps({ value: mkScript() });

    expect(wrapper.find('[data-testid="card-configure"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="card-edit"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="card-type-chip"]').text()).toMatch(/SCRIPT/i);
    expect(wrapper.text()).toContain('Wave Hello');
  });

  it('restores keyboard focus to the trigger button when the popover closes', async () => {
    // Pins the a11y contract — without focus capture/restore, every popover
    // dismissal (Escape, close button, click outside, selection) drops
    // focus to <body> and a keyboard user has to Tab back to where they were.
    const wrapper = mount(AstrosRemoteButtonCard, {
      attachTo: document.body,
      global: { plugins: [i18n] },
      props: { buttonNumber: 5, value: mkNone(), scripts: SCRIPTS, playlists: PLAYLISTS },
    });
    const configureBtn = wrapper.get('[data-testid="card-configure"]').element as HTMLElement;
    configureBtn.focus();
    expect(document.activeElement).toBe(configureBtn);

    await configureBtn.click();
    await wrapper.vm.$nextTick();
    // Editor's focus-on-mount stole focus from the trigger.
    expect(document.activeElement).not.toBe(configureBtn);

    // Close via the editor's × button.
    const close = document.querySelector('[data-testid="editor-close"]') as HTMLElement;
    close.click();
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();

    expect(document.activeElement).toBe(configureBtn);
    wrapper.unmount();
  });
});
