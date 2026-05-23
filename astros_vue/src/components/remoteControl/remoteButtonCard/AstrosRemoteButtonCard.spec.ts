import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import AstrosRemoteButtonCard from './AstrosRemoteButtonCard.vue';
import type { PageButton } from '@/models/remoteControl/pageButton';

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
      props: { buttonNumber: 5, value: mkNone(), scripts: SCRIPTS, playlists: PLAYLISTS },
    });
    expect(wrapper.text()).toMatch(/BUTTON 5|BTN 5/i);
  });

  it('shows a Configure button when value.type is none', () => {
    const wrapper = mount(AstrosRemoteButtonCard, {
      props: { buttonNumber: 5, value: mkNone(), scripts: SCRIPTS, playlists: PLAYLISTS },
    });
    expect(wrapper.find('[data-testid="card-configure"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="card-edit"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="card-clear"]').exists()).toBe(false);
  });

  it('shows assigned name and Edit/Clear buttons when value is a script', () => {
    const wrapper = mount(AstrosRemoteButtonCard, {
      props: { buttonNumber: 5, value: mkScript(), scripts: SCRIPTS, playlists: PLAYLISTS },
    });
    expect(wrapper.text()).toContain('Wave Hello');
    expect(wrapper.find('[data-testid="card-edit"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="card-clear"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="card-configure"]').exists()).toBe(false);
  });

  it('renders a SCRIPT type chip on a script-typed value', () => {
    const wrapper = mount(AstrosRemoteButtonCard, {
      props: { buttonNumber: 5, value: mkScript(), scripts: SCRIPTS, playlists: PLAYLISTS },
    });
    const chip = wrapper.find('[data-testid="card-type-chip"]');
    expect(chip.exists()).toBe(true);
    expect(chip.text()).toMatch(/SCRIPT/i);
  });

  it('renders a PLAYLIST type chip on a playlist-typed value', () => {
    const wrapper = mount(AstrosRemoteButtonCard, {
      props: { buttonNumber: 5, value: mkPlaylist(), scripts: SCRIPTS, playlists: PLAYLISTS },
    });
    const chip = wrapper.find('[data-testid="card-type-chip"]');
    expect(chip.text()).toMatch(/PLAYLIST/i);
  });

  it('Clear emits change with the none sentinel WITHOUT opening the editor', async () => {
    const wrapper = mount(AstrosRemoteButtonCard, {
      props: { buttonNumber: 5, value: mkScript(), scripts: SCRIPTS, playlists: PLAYLISTS },
    });
    await wrapper.get('[data-testid="card-clear"]').trigger('click');

    expect(wrapper.emitted('change')![0]![0]).toEqual({ id: '0', name: 'None', type: 'none' });
    // The editor popover must NOT have rendered (no editor element in DOM).
    expect(wrapper.find('[data-testid="editor-search"]').exists()).toBe(false);
  });
});
