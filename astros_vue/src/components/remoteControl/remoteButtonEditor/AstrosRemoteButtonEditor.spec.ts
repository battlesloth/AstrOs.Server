import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import AstrosRemoteButtonEditor from './AstrosRemoteButtonEditor.vue';
import type { PageButton } from '@/models/remoteControl/pageButton';
import enUS from '@/locales/enUS.json';

// Use the real enUS.json so any missing key surfaces as a test failure.
const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  messages: { 'en-US': enUS },
});

const SCRIPTS = [
  { id: 's1', name: 'Wave Hello' },
  { id: 's2', name: 'Bow' },
];
const PLAYLISTS = [
  { id: 'p1', name: 'Morning Routine' },
  { id: 'p2', name: 'Performance Set' },
];

function mkNoneButton(): PageButton {
  return { id: '0', name: 'None', type: 'none' };
}

function mkScriptButton(id = 's1', name = 'Wave Hello'): PageButton {
  return { id, name, type: 'script' };
}

function mkPlaylistButton(id = 'p1', name = 'Morning Routine'): PageButton {
  return { id, name, type: 'playlist' };
}

describe('AstrosRemoteButtonEditor', () => {
  it('opens with the script tab when current value is type:none', () => {
    const wrapper = mount(AstrosRemoteButtonEditor, {
      global: { plugins: [i18n] },
      props: {
        buttonNumber: 5,
        currentValue: mkNoneButton(),
        scripts: SCRIPTS,
        playlists: PLAYLISTS,
      },
    });
    expect(wrapper.text()).toContain('Wave Hello');
  });

  it('opens with the playlist tab when current value is type:playlist', () => {
    const wrapper = mount(AstrosRemoteButtonEditor, {
      global: { plugins: [i18n] },
      props: {
        buttonNumber: 5,
        currentValue: mkPlaylistButton(),
        scripts: SCRIPTS,
        playlists: PLAYLISTS,
      },
    });
    expect(wrapper.text()).toContain('Morning Routine');
  });

  it('switches to playlist tab on click and shows playlist items', async () => {
    const wrapper = mount(AstrosRemoteButtonEditor, {
      global: { plugins: [i18n] },
      props: {
        buttonNumber: 5,
        currentValue: mkNoneButton(),
        scripts: SCRIPTS,
        playlists: PLAYLISTS,
      },
    });
    await wrapper.get('[data-testid="editor-tab-playlist"]').trigger('click');
    expect(wrapper.text()).toContain('Morning Routine');
    expect(wrapper.text()).not.toContain('Wave Hello');
  });

  it('filters results case-insensitively as user types in search', async () => {
    const wrapper = mount(AstrosRemoteButtonEditor, {
      global: { plugins: [i18n] },
      props: {
        buttonNumber: 5,
        currentValue: mkNoneButton(),
        scripts: SCRIPTS,
        playlists: PLAYLISTS,
      },
    });
    await wrapper.get('[data-testid="editor-search"]').setValue('WAV');
    expect(wrapper.text()).toContain('Wave Hello');
    expect(wrapper.text()).not.toContain('Bow');
  });

  it('renders an empty-state message when filter has no matches', async () => {
    const wrapper = mount(AstrosRemoteButtonEditor, {
      global: { plugins: [i18n] },
      props: {
        buttonNumber: 5,
        currentValue: mkNoneButton(),
        scripts: SCRIPTS,
        playlists: PLAYLISTS,
      },
    });
    await wrapper.get('[data-testid="editor-search"]').setValue('xyzzy');
    expect(wrapper.find('[data-testid="editor-empty"]').exists()).toBe(true);
  });

  it('treats a whitespace-only query as empty (pins the .trim() in items)', async () => {
    // A query of '   ' should render all items, not the empty state.
    // Without .trim() in the items computed, three spaces become a real
    // filter and no item names contain three consecutive spaces.
    const wrapper = mount(AstrosRemoteButtonEditor, {
      global: { plugins: [i18n] },
      props: {
        buttonNumber: 5,
        currentValue: mkNoneButton(),
        scripts: SCRIPTS,
        playlists: PLAYLISTS,
      },
    });
    await wrapper.get('[data-testid="editor-search"]').setValue('   ');
    expect(wrapper.text()).toContain('Wave Hello');
    expect(wrapper.text()).toContain('Bow');
    expect(wrapper.find('[data-testid="editor-empty"]').exists()).toBe(false);
  });

  it('preserves the search query when the user switches tabs', async () => {
    // Pins the current behavior: tab switch does NOT clear the search query.
    // The query filters whichever tab's list is active at filter time.
    const wrapper = mount(AstrosRemoteButtonEditor, {
      global: { plugins: [i18n] },
      props: {
        buttonNumber: 5,
        currentValue: mkNoneButton(),
        scripts: SCRIPTS,
        playlists: [...PLAYLISTS, { id: 'p3', name: 'Wave Routine' }],
      },
    });
    await wrapper.get('[data-testid="editor-search"]').setValue('wave');
    expect(wrapper.text()).toContain('Wave Hello');

    await wrapper.get('[data-testid="editor-tab-playlist"]').trigger('click');

    expect(wrapper.text()).toContain('Wave Routine');
    expect(wrapper.text()).not.toContain('Morning Routine');
    expect(wrapper.text()).not.toContain('Wave Hello');
  });

  it('tab switch does NOT auto-clear current value', async () => {
    // Pins the no-auto-clear behavior so a future "clear on tab switch" change
    // can't slip through silently.
    const wrapper = mount(AstrosRemoteButtonEditor, {
      global: { plugins: [i18n] },
      props: {
        buttonNumber: 5,
        currentValue: mkScriptButton(),
        scripts: SCRIPTS,
        playlists: PLAYLISTS,
      },
    });
    await wrapper.get('[data-testid="editor-tab-playlist"]').trigger('click');
    expect(wrapper.emitted('change')).toBeUndefined();
  });

  it('emits change with the selected item and the current tab type', async () => {
    const wrapper = mount(AstrosRemoteButtonEditor, {
      global: { plugins: [i18n] },
      props: {
        buttonNumber: 5,
        currentValue: mkNoneButton(),
        scripts: SCRIPTS,
        playlists: PLAYLISTS,
      },
    });
    await wrapper.get('[data-testid="editor-item-s2"]').trigger('click');

    const events = wrapper.emitted('change');
    expect(events).toHaveLength(1);
    expect(events![0]![0]).toEqual({ id: 's2', name: 'Bow', type: 'script' });
  });

  it('emits change with type:playlist when a playlist item is picked', async () => {
    const wrapper = mount(AstrosRemoteButtonEditor, {
      global: { plugins: [i18n] },
      props: {
        buttonNumber: 5,
        currentValue: mkNoneButton(),
        scripts: SCRIPTS,
        playlists: PLAYLISTS,
      },
    });
    await wrapper.get('[data-testid="editor-tab-playlist"]').trigger('click');
    await wrapper.get('[data-testid="editor-item-p1"]').trigger('click');

    expect(wrapper.emitted('change')![0]![0]).toEqual({
      id: 'p1',
      name: 'Morning Routine',
      type: 'playlist',
    });
  });

  it('emits change with the None sentinel when None row is clicked', async () => {
    const wrapper = mount(AstrosRemoteButtonEditor, {
      global: { plugins: [i18n] },
      props: {
        buttonNumber: 5,
        currentValue: mkScriptButton(),
        scripts: SCRIPTS,
        playlists: PLAYLISTS,
      },
    });
    await wrapper.get('[data-testid="editor-none"]').trigger('click');

    expect(wrapper.emitted('change')![0]![0]).toEqual({ id: '0', name: 'None', type: 'none' });
  });

  it('emits close when × button is clicked', async () => {
    const wrapper = mount(AstrosRemoteButtonEditor, {
      global: { plugins: [i18n] },
      props: {
        buttonNumber: 5,
        currentValue: mkNoneButton(),
        scripts: SCRIPTS,
        playlists: PLAYLISTS,
      },
    });
    await wrapper.get('[data-testid="editor-close"]').trigger('click');

    expect(wrapper.emitted('close')).toHaveLength(1);
  });

  it('emits close on Escape keydown from the editor root', async () => {
    const wrapper = mount(AstrosRemoteButtonEditor, {
      attachTo: document.body,
      global: { plugins: [i18n] },
      props: {
        buttonNumber: 5,
        currentValue: mkNoneButton(),
        scripts: SCRIPTS,
        playlists: PLAYLISTS,
      },
    });
    await wrapper.trigger('keydown', { key: 'Escape' });

    expect(wrapper.emitted('close')).toHaveLength(1);
    wrapper.unmount();
  });

  it('emits close on Escape pressed while focus is in the search input', async () => {
    // The search input gets typed-into; Escape from there must also close.
    // type="text" (not "search") avoids the browser's native "first Escape
    // clears input" consumption that would otherwise make this fragile.
    const wrapper = mount(AstrosRemoteButtonEditor, {
      attachTo: document.body,
      global: { plugins: [i18n] },
      props: {
        buttonNumber: 5,
        currentValue: mkNoneButton(),
        scripts: SCRIPTS,
        playlists: PLAYLISTS,
      },
    });
    await wrapper.get('[data-testid="editor-search"]').trigger('keydown', { key: 'Escape' });

    expect(wrapper.emitted('close')).toHaveLength(1);
    wrapper.unmount();
  });
});
