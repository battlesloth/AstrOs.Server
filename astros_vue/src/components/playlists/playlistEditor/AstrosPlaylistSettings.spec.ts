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
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
  });

  it('does not modify the stored settings on mount or on a type change', async () => {
    const settings = staleInfiniteRepeat();
    const wrapper = mountSettings(PlaylistType.Sequential, settings);

    await wrapper.setProps({ playlistType: PlaylistType.SequentialRepeatable });

    // Switching to a repeat type shows the stored mode again.
    expect(repeatSelect(wrapper).value).toBe('infinite');
    // Mounted without an onUpdate listener, a write through the model would
    // surface as an emit rather than a change to `settings`.
    expect(settings).toEqual(staleInfiniteRepeat());
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
  });

  // The editor swaps in another playlist's settings without remounting this
  // component (opening playlist B after A).
  it("follows a swapped-in playlist's settings", async () => {
    const wrapper = mountSettings(PlaylistType.SequentialRepeatable, staleInfiniteRepeat());
    expect(repeatSelect(wrapper).value).toBe('infinite');

    await wrapper.setProps({
      modelValue: { repeat: false, repeatCount: 0, randomDelay: false, delayMin: 0, delayMax: 0 },
    });
    expect(repeatSelect(wrapper).value).toBe('none');

    await wrapper.setProps({
      modelValue: { repeat: true, repeatCount: 3, randomDelay: false, delayMin: 0, delayMax: 0 },
    });
    expect(repeatSelect(wrapper).value).toBe('count');
    expect(countInput(wrapper).value).toBe('3');
  });

  it('shows an empty count when the stored mode is not Count', () => {
    const wrapper = mountSettings(PlaylistType.SequentialRepeatable, {
      repeat: false,
      repeatCount: 3,
      randomDelay: false,
      delayMin: 0,
      delayMax: 0,
    });

    expect(repeatSelect(wrapper).value).toBe('none');
    expect(countInput(wrapper).value).toBe('');
  });

  it.each([
    [PlaylistType.Sequential, 'none'],
    [PlaylistType.SequentialInterruptible, 'none'],
    [PlaylistType.SequentialRepeatable, 'infinite'],
    [PlaylistType.Shuffle, 'none'],
    [PlaylistType.ShuffleWithRepeat, 'infinite'],
    [PlaylistType.ShuffleWithDelay, 'none'],
    [PlaylistType.ShuffleWithDelayAndRepeat, 'infinite'],
  ])('%s with a stored infinite repeat shows %s', (type, expected) => {
    const wrapper = mountSettings(type, staleInfiniteRepeat());

    expect(repeatSelect(wrapper).value).toBe(expected);
  });
});

describe('AstrosPlaylistSettings repeat editing', () => {
  // The displayed mode is derived from the model, so a choice shows only if
  // onRepeatModeChange writes the model correctly.
  function defaults(): PlaylistSettings {
    return { repeat: false, repeatCount: 0, randomDelay: false, delayMin: 0, delayMax: 0 };
  }

  it('Count from a new playlist turns repeat on and leaves the count empty', async () => {
    const settings = defaults();
    const wrapper = mountSettings(PlaylistType.SequentialRepeatable, settings);

    await wrapper.find('select').setValue('count');

    expect(settings).toMatchObject({ repeat: true, repeatCount: 0 });
    expect(repeatSelect(wrapper).value).toBe('count');
    expect(countInput(wrapper).value).toBe('');
  });

  it('Count from Infinite sets a count of 1', async () => {
    const settings = staleInfiniteRepeat();
    const wrapper = mountSettings(PlaylistType.SequentialRepeatable, settings);

    await wrapper.find('select').setValue('count');

    expect(settings).toMatchObject({ repeat: true, repeatCount: 1 });
    expect(repeatSelect(wrapper).value).toBe('count');
    expect(countInput(wrapper).value).toBe('1');
  });

  it('Infinite and None write the model and show the choice', async () => {
    const settings = defaults();
    const wrapper = mountSettings(PlaylistType.SequentialRepeatable, settings);

    await wrapper.find('select').setValue('infinite');
    expect(settings).toMatchObject({ repeat: true, repeatCount: -1 });
    expect(repeatSelect(wrapper).value).toBe('infinite');

    await wrapper.find('select').setValue('none');
    expect(settings).toMatchObject({ repeat: false });
    expect(repeatSelect(wrapper).value).toBe('none');
  });
});
