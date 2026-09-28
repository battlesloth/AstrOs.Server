import { describe, it, expect, afterEach } from 'vitest';
import { mount, enableAutoUnmount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import AstrosPlaylistSettings from './AstrosPlaylistSettings.vue';
import { PlaylistType } from '@/enums/playlists/playlistType';
import type { PlaylistSettings } from '@/models/playlists/playlistSettings';
import enUS from '@/locales/enUS.json';

enableAutoUnmount(afterEach);

const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  messages: { 'en-US': enUS },
});

function mountSettings(playlistType: PlaylistType, settings: PlaylistSettings) {
  return mount(AstrosPlaylistSettings, {
    props: { playlistType, modelValue: settings },
    global: { plugins: [i18n] },
  });
}

// Stored settings survive a type change (nothing resets them), e.g.
// "Sequential, Repeatable" + "Repeat - Infinite" switched to "Sequential".
function staleInfiniteRepeat(): PlaylistSettings {
  return { repeat: true, repeatCount: -1, randomDelay: false, delayMin: 0, delayMax: 0 };
}

function repeatSelect(wrapper: ReturnType<typeof mountSettings>) {
  return wrapper.find('select').element as HTMLSelectElement;
}

function countInput(wrapper: ReturnType<typeof mountSettings>) {
  return wrapper.find('input[placeholder="Count"]').element as HTMLInputElement;
}

describe('AstrosPlaylistSettings repeat display', () => {
  it('shows "none" in a disabled dropdown for a type that cannot repeat, whatever is stored', () => {
    const wrapper = mountSettings(PlaylistType.Sequential, staleInfiniteRepeat());

    expect(repeatSelect(wrapper).value).toBe('none');
    expect(repeatSelect(wrapper).disabled).toBe(true);
  });

  it('shows an empty count for a type that cannot repeat, whatever is stored', () => {
    const wrapper = mountSettings(PlaylistType.Sequential, {
      ...staleInfiniteRepeat(),
      repeatCount: 3,
    });

    expect(countInput(wrapper).value).toBe('');
  });

  it('shows the stored mode for a type that can repeat', () => {
    const wrapper = mountSettings(PlaylistType.SequentialRepeatable, staleInfiniteRepeat());

    expect(repeatSelect(wrapper).value).toBe('infinite');
    expect(repeatSelect(wrapper).disabled).toBe(false);
  });

  it('shows the stored count for a type that can repeat', () => {
    const wrapper = mountSettings(PlaylistType.SequentialRepeatable, {
      ...staleInfiniteRepeat(),
      repeatCount: 3,
    });

    expect(repeatSelect(wrapper).value).toBe('count');
    expect(countInput(wrapper).value).toBe('3');
  });

  it('switches to "none" when a repeating playlist is changed to a type that cannot repeat', async () => {
    const settings = staleInfiniteRepeat();
    const wrapper = mountSettings(PlaylistType.SequentialRepeatable, settings);
    expect(repeatSelect(wrapper).value).toBe('infinite');

    await wrapper.setProps({ playlistType: PlaylistType.Sequential });

    expect(repeatSelect(wrapper).value).toBe('none');
    expect(repeatSelect(wrapper).disabled).toBe(true);
    expect(settings).toEqual(staleInfiniteRepeat());
  });

  it('does not modify the stored settings on mount or on a type change', async () => {
    const settings = staleInfiniteRepeat();
    const wrapper = mountSettings(PlaylistType.Sequential, settings);

    await wrapper.setProps({ playlistType: PlaylistType.SequentialRepeatable });

    // Switching back to a repeat type shows the stored mode again.
    expect(repeatSelect(wrapper).value).toBe('infinite');
    expect(settings).toEqual(staleInfiniteRepeat());
  });
});
