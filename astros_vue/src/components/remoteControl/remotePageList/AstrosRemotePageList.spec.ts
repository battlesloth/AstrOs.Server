import { describe, it, expect } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
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

describe('AstrosRemotePageList — action icons', () => {
  it('renders rename / duplicate / delete buttons on every row', () => {
    const wrapper = mount(AstrosRemotePageList, {
      global: { plugins: [i18n], stubs: { 'v-icon': true } },
      props: { pages: PAGES_3, selectedIdx: 0 },
    });
    const rows = wrapper.findAll('[data-testid="page-list-row"]');
    for (const row of rows) {
      expect(row.find('[data-testid="page-list-rename"]').exists()).toBe(true);
      expect(row.find('[data-testid="page-list-duplicate"]').exists()).toBe(true);
      expect(row.find('[data-testid="page-list-delete"]').exists()).toBe(true);
    }
  });

  it('emits duplicate(idx) when the duplicate icon is clicked', async () => {
    const wrapper = mount(AstrosRemotePageList, {
      global: { plugins: [i18n], stubs: { 'v-icon': true } },
      props: { pages: PAGES_3, selectedIdx: 0 },
    });
    await wrapper
      .findAll('[data-testid="page-list-row"]')[1]!
      .find('[data-testid="page-list-duplicate"]')
      .trigger('click');

    expect(wrapper.emitted('duplicate')![0]).toEqual([1]);
  });

  it('emits delete(idx) when the delete icon is clicked', async () => {
    const wrapper = mount(AstrosRemotePageList, {
      global: { plugins: [i18n], stubs: { 'v-icon': true } },
      props: { pages: PAGES_3, selectedIdx: 0 },
    });
    await wrapper
      .findAll('[data-testid="page-list-row"]')[2]!
      .find('[data-testid="page-list-delete"]')
      .trigger('click');

    expect(wrapper.emitted('delete')![0]).toEqual([2]);
  });

  it('action click does NOT also emit select (stopPropagation guard)', async () => {
    const wrapper = mount(AstrosRemotePageList, {
      global: { plugins: [i18n], stubs: { 'v-icon': true } },
      props: { pages: PAGES_3, selectedIdx: 0 },
    });
    await wrapper
      .findAll('[data-testid="page-list-row"]')[2]!
      .find('[data-testid="page-list-duplicate"]')
      .trigger('click');

    expect(wrapper.emitted('select')).toBeUndefined();
  });

  it('disables the delete button when pages.length === 1', () => {
    const wrapper = mount(AstrosRemotePageList, {
      global: { plugins: [i18n], stubs: { 'v-icon': true } },
      props: { pages: [mkPage('only', 'Only Page')], selectedIdx: 0 },
    });
    const del = wrapper.get('[data-testid="page-list-delete"]');
    expect(del.attributes('disabled')).toBeDefined();
  });

  it('does NOT emit delete when the delete button is disabled (length === 1)', async () => {
    const wrapper = mount(AstrosRemotePageList, {
      global: { plugins: [i18n], stubs: { 'v-icon': true } },
      props: { pages: [mkPage('only', 'Only Page')], selectedIdx: 0 },
    });
    await wrapper.get('[data-testid="page-list-delete"]').trigger('click');

    expect(wrapper.emitted('delete')).toBeUndefined();
  });
});

describe('AstrosRemotePageList — inline rename', () => {
  it('renders the rename input when the pencil is clicked, hides the name span', async () => {
    const wrapper = mount(AstrosRemotePageList, {
      attachTo: document.body,
      global: { plugins: [i18n], stubs: { 'v-icon': true } },
      props: { pages: PAGES_3, selectedIdx: 0 },
    });
    await wrapper
      .findAll('[data-testid="page-list-row"]')[1]!
      .find('[data-testid="page-list-rename"]')
      .trigger('click');

    const row = wrapper.findAll('[data-testid="page-list-row"]')[1]!;
    expect(row.find('[data-testid="page-list-rename-input"]').exists()).toBe(true);
    expect(row.find('[data-testid="page-list-name"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('emits rename({idx, name}) on Enter with the trimmed input value', async () => {
    const wrapper = mount(AstrosRemotePageList, {
      attachTo: document.body,
      global: { plugins: [i18n], stubs: { 'v-icon': true } },
      props: { pages: PAGES_3, selectedIdx: 0 },
    });
    await wrapper
      .findAll('[data-testid="page-list-row"]')[1]!
      .find('[data-testid="page-list-rename"]')
      .trigger('click');
    const input = wrapper
      .findAll('[data-testid="page-list-row"]')[1]!
      .get('[data-testid="page-list-rename-input"]');
    await input.setValue('  Concerts  ');
    await input.trigger('keydown.enter');

    expect(wrapper.emitted('rename')![0]).toEqual([{ idx: 1, name: 'Concerts' }]);
    wrapper.unmount();
  });

  it('emits rename on blur (commits the edit)', async () => {
    const wrapper = mount(AstrosRemotePageList, {
      attachTo: document.body,
      global: { plugins: [i18n], stubs: { 'v-icon': true } },
      props: { pages: PAGES_3, selectedIdx: 0 },
    });
    await wrapper
      .findAll('[data-testid="page-list-row"]')[0]!
      .find('[data-testid="page-list-rename"]')
      .trigger('click');
    const input = wrapper
      .findAll('[data-testid="page-list-row"]')[0]!
      .get('[data-testid="page-list-rename-input"]');
    await input.setValue('Quick Stuff');
    await input.trigger('blur');

    expect(wrapper.emitted('rename')![0]).toEqual([{ idx: 0, name: 'Quick Stuff' }]);
    wrapper.unmount();
  });

  it('Esc cancels rename and does NOT emit', async () => {
    const wrapper = mount(AstrosRemotePageList, {
      attachTo: document.body,
      global: { plugins: [i18n], stubs: { 'v-icon': true } },
      props: { pages: PAGES_3, selectedIdx: 0 },
    });
    await wrapper
      .findAll('[data-testid="page-list-row"]')[1]!
      .find('[data-testid="page-list-rename"]')
      .trigger('click');
    const input = wrapper
      .findAll('[data-testid="page-list-row"]')[1]!
      .get('[data-testid="page-list-rename-input"]');
    await input.setValue('Should Not Save');
    await input.trigger('keydown.escape');

    expect(wrapper.emitted('rename')).toBeUndefined();
    const row = wrapper.findAll('[data-testid="page-list-row"]')[1]!;
    expect(row.find('[data-testid="page-list-rename-input"]').exists()).toBe(false);
    expect(row.find('[data-testid="page-list-name"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('empty input on Enter exits rename mode WITHOUT emitting', async () => {
    const wrapper = mount(AstrosRemotePageList, {
      attachTo: document.body,
      global: { plugins: [i18n], stubs: { 'v-icon': true } },
      props: { pages: PAGES_3, selectedIdx: 0 },
    });
    await wrapper
      .findAll('[data-testid="page-list-row"]')[0]!
      .find('[data-testid="page-list-rename"]')
      .trigger('click');
    const input = wrapper
      .findAll('[data-testid="page-list-row"]')[0]!
      .get('[data-testid="page-list-rename-input"]');
    await input.setValue('');
    await input.trigger('keydown.enter');

    expect(wrapper.emitted('rename')).toBeUndefined();
    wrapper.unmount();
  });

  it('whitespace-only input on Enter exits rename mode WITHOUT emitting', async () => {
    const wrapper = mount(AstrosRemotePageList, {
      attachTo: document.body,
      global: { plugins: [i18n], stubs: { 'v-icon': true } },
      props: { pages: PAGES_3, selectedIdx: 0 },
    });
    await wrapper
      .findAll('[data-testid="page-list-row"]')[0]!
      .find('[data-testid="page-list-rename"]')
      .trigger('click');
    const input = wrapper
      .findAll('[data-testid="page-list-row"]')[0]!
      .get('[data-testid="page-list-rename-input"]');
    await input.setValue('   ');
    await input.trigger('keydown.enter');

    expect(wrapper.emitted('rename')).toBeUndefined();
    wrapper.unmount();
  });

  it('focuses the rename input on mount (so Enter/Esc work without an extra click)', async () => {
    const wrapper = mount(AstrosRemotePageList, {
      attachTo: document.body,
      global: { plugins: [i18n], stubs: { 'v-icon': true } },
      props: { pages: PAGES_3, selectedIdx: 0 },
    });
    await wrapper
      .findAll('[data-testid="page-list-row"]')[1]!
      .find('[data-testid="page-list-rename"]')
      .trigger('click');
    await flushPromises();
    const input = wrapper
      .findAll('[data-testid="page-list-row"]')[1]!
      .get('[data-testid="page-list-rename-input"]').element;

    expect(document.activeElement).toBe(input);
    wrapper.unmount();
  });
});
