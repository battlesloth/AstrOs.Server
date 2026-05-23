import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import AstrosRemotePageList from './AstrosRemotePageList.vue';
import type { RemoteControlPage } from '@/models/remoteControl/remoteControlPage';
import { BUTTON_KEYS } from '@/models/remoteControl/remoteControlPage';
import { makeNoneButton, type PageButton } from '@/models/remoteControl/pageButton';
import enUS from '@/locales/enUS.json';

function mkScriptBtn(): PageButton {
  return { id: 's1', name: 'Wave', type: 'script' };
}
function mkPlaylistBtn(): PageButton {
  return { id: 'p1', name: 'Routine', type: 'playlist' };
}

const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  messages: { 'en-US': enUS },
});

function mkPage(id: string, name: string): RemoteControlPage {
  return {
    id,
    name,
    button1: makeNoneButton(),
    button2: makeNoneButton(),
    button3: makeNoneButton(),
    button4: makeNoneButton(),
    button5: makeNoneButton(),
    button6: makeNoneButton(),
    button7: makeNoneButton(),
    button8: makeNoneButton(),
    button9: makeNoneButton(),
  };
}

const PAGES_3 = [mkPage('a', 'Quick Actions'), mkPage('b', 'Performance'), mkPage('c', 'Songs')];

describe('AstrosRemotePageList — header + rows', () => {
  it('renders one row per page', () => {
    const wrapper = mount(AstrosRemotePageList, {
      global: { plugins: [i18n], stubs: { 'v-icon': true } },
      props: { pages: PAGES_3, selectedIdx: 0 },
    });
    expect(wrapper.findAll('[data-testid="page-list-row"]')).toHaveLength(3);
  });

  it('renders the page name in each row', () => {
    const wrapper = mount(AstrosRemotePageList, {
      global: { plugins: [i18n], stubs: { 'v-icon': true } },
      props: { pages: PAGES_3, selectedIdx: 0 },
    });
    const text = wrapper.text();
    expect(text).toContain('Quick Actions');
    expect(text).toContain('Performance');
    expect(text).toContain('Songs');
  });

  it('marks the selected row with aria-selected="true"', () => {
    const wrapper = mount(AstrosRemotePageList, {
      global: { plugins: [i18n], stubs: { 'v-icon': true } },
      props: { pages: PAGES_3, selectedIdx: 1 },
    });
    const rows = wrapper.findAll('[data-testid="page-list-row"]');
    expect(rows[0]!.attributes('aria-selected')).toBe('false');
    expect(rows[1]!.attributes('aria-selected')).toBe('true');
    expect(rows[2]!.attributes('aria-selected')).toBe('false');
  });

  it('renders the sticky header with an Add button', () => {
    const wrapper = mount(AstrosRemotePageList, {
      global: { plugins: [i18n], stubs: { 'v-icon': true } },
      props: { pages: PAGES_3, selectedIdx: 0 },
    });
    expect(wrapper.find('[data-testid="page-list-add"]').exists()).toBe(true);
  });

  it('puts the full page name in a title attribute for truncation tooltips', () => {
    const wrapper = mount(AstrosRemotePageList, {
      global: { plugins: [i18n], stubs: { 'v-icon': true } },
      props: {
        pages: [mkPage('a', 'A Really Quite Long Page Name That Will Truncate')],
        selectedIdx: 0,
      },
    });
    const nameEl = wrapper.get('[data-testid="page-list-name"]');
    expect(nameEl.attributes('title')).toBe('A Really Quite Long Page Name That Will Truncate');
  });
});

describe('AstrosRemotePageList — select + add emits', () => {
  it('emits select(idx) when a row is clicked', async () => {
    const wrapper = mount(AstrosRemotePageList, {
      global: { plugins: [i18n], stubs: { 'v-icon': true } },
      props: { pages: PAGES_3, selectedIdx: 0 },
    });
    await wrapper.findAll('[data-testid="page-list-row"]')[2]!.trigger('click');

    expect(wrapper.emitted('select')).toHaveLength(1);
    expect(wrapper.emitted('select')![0]).toEqual([2]);
  });

  it('emits add() when the Add button is clicked', async () => {
    const wrapper = mount(AstrosRemotePageList, {
      global: { plugins: [i18n], stubs: { 'v-icon': true } },
      props: { pages: PAGES_3, selectedIdx: 0 },
    });
    await wrapper.get('[data-testid="page-list-add"]').trigger('click');

    expect(wrapper.emitted('add')).toHaveLength(1);
    expect(wrapper.emitted('add')![0]).toEqual([]);
  });

  it('emits select on every click (consumer dedupes if needed)', async () => {
    const wrapper = mount(AstrosRemotePageList, {
      global: { plugins: [i18n], stubs: { 'v-icon': true } },
      props: { pages: PAGES_3, selectedIdx: 0 },
    });
    await wrapper.findAll('[data-testid="page-list-row"]')[0]!.trigger('click');
    await wrapper.findAll('[data-testid="page-list-row"]')[0]!.trigger('click');

    expect(wrapper.emitted('select')).toHaveLength(2);
    expect(wrapper.emitted('select')![0]).toEqual([0]);
    expect(wrapper.emitted('select')![1]).toEqual([0]);
  });
});

describe('AstrosRemotePageList — mini 3x3 preview', () => {
  it('renders a 9-dot preview per row, one dot per button slot', () => {
    const wrapper = mount(AstrosRemotePageList, {
      global: { plugins: [i18n], stubs: { 'v-icon': true } },
      props: { pages: PAGES_3, selectedIdx: 0 },
    });
    const dotsInFirstRow = wrapper
      .findAll('[data-testid="page-list-row"]')[0]!
      .findAll('[data-testid="page-list-dot"]');
    expect(dotsInFirstRow).toHaveLength(9);
  });

  it('uses the script class on script-typed slots, playlist on playlist-typed, none on empty', () => {
    const mixed: RemoteControlPage = {
      ...mkPage('mixed', 'Mixed'),
      button1: mkScriptBtn(),
      button5: mkPlaylistBtn(),
    };
    const wrapper = mount(AstrosRemotePageList, {
      global: { plugins: [i18n], stubs: { 'v-icon': true } },
      props: { pages: [mixed], selectedIdx: 0 },
    });
    const dots = wrapper.findAll('[data-testid="page-list-dot"]');
    expect(dots[0]!.attributes('data-type')).toBe('script');
    expect(dots[4]!.attributes('data-type')).toBe('playlist');
    expect(dots[1]!.attributes('data-type')).toBe('none');
  });

  it('iterates BUTTON_KEYS in order (positions 3 + 7 reach the right slots)', () => {
    const mixed: RemoteControlPage = {
      ...mkPage('mixed', 'Mixed'),
      button3: mkScriptBtn(),
      button7: mkPlaylistBtn(),
    };
    const wrapper = mount(AstrosRemotePageList, {
      global: { plugins: [i18n], stubs: { 'v-icon': true } },
      props: { pages: [mixed], selectedIdx: 0 },
    });
    const dots = wrapper.findAll('[data-testid="page-list-dot"]');
    expect(dots[2]!.attributes('data-type')).toBe('script');
    expect(dots[6]!.attributes('data-type')).toBe('playlist');
    expect(dots.length).toBe(BUTTON_KEYS.length);
  });
});
