import { describe, it, expect, afterEach } from 'vitest';
import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import AstrosRemotePageList from './AstrosRemotePageList.vue';
import type { RemoteControlPage } from '@/models/remoteControl/remoteControlPage';
import { BUTTON_KEYS } from '@/models/remoteControl/remoteControlPage';
import { makeNoneButton, type PageButton } from '@/models/remoteControl/pageButton';
import enUS from '@/locales/enUS.json';

// Unmount every wrapper after each test. Several tests use
// attachTo: document.body for focus/keydown assertions; without auto-unmount
// those DOM trees would accumulate across the test worker and cause cross-test
// pollution (silent-failure agent reproduced 4 separate flaky failures in 10
// runs of the suite before this was added).
enableAutoUnmount(afterEach);

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

  it('applies the correct background class per dot type', () => {
    // data-type is bound directly from page[key].type; the visual color
    // comes from dotClass(). Asserting on the class catches a regression
    // that swapped script and playlist cases in the dotClass switch
    // (which would pass the data-type assertions above).
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
    expect(dots[0]!.classes()).toContain('bg-primary'); // script
    expect(dots[4]!.classes()).toContain('bg-r2-complement'); // playlist
    expect(dots[1]!.classes()).toContain('bg-base-300'); // none
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

  it.each([
    ['duplicate', 'page-list-duplicate'],
    ['rename', 'page-list-rename'],
    ['delete', 'page-list-delete'],
  ])(
    'clicking %s on a non-selected row does NOT emit select (stopPropagation guard)',
    async (_label, testid) => {
      const wrapper = mount(AstrosRemotePageList, {
        global: { plugins: [i18n], stubs: { 'v-icon': true } },
        props: { pages: PAGES_3, selectedIdx: 0 },
      });
      await wrapper
        .findAll('[data-testid="page-list-row"]')[2]!
        .find(`[data-testid="${testid}"]`)
        .trigger('click');

      expect(wrapper.emitted('select')).toBeUndefined();
    },
  );

  it('disables the delete button when pages.length === 1', () => {
    const wrapper = mount(AstrosRemotePageList, {
      global: { plugins: [i18n], stubs: { 'v-icon': true } },
      props: { pages: [mkPage('only', 'Only Page')], selectedIdx: 0 },
    });
    const del = wrapper.get('[data-testid="page-list-delete"]');
    expect(del.attributes('disabled')).toBeDefined();
  });

  it('does NOT emit delete OR select when the delete button is disabled (length === 1)', async () => {
    // Disabled `<button>` doesn't fire click in modern browsers, so the
    // row's @click="emit('select', idx)" also doesn't bubble. Pin both
    // halves — a future migration to a non-button (e.g. a styled div with
    // aria-disabled) would bubble and silently re-select the only row.
    const wrapper = mount(AstrosRemotePageList, {
      global: { plugins: [i18n], stubs: { 'v-icon': true } },
      props: { pages: [mkPage('only', 'Only Page')], selectedIdx: 0 },
    });
    await wrapper.get('[data-testid="page-list-delete"]').trigger('click');

    expect(wrapper.emitted('delete')).toBeUndefined();
    expect(wrapper.emitted('select')).toBeUndefined();
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
  });

  it('does NOT emit select when Space is pressed inside the rename input', async () => {
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

    await input.trigger('keydown.space');

    expect(wrapper.emitted('select')).toBeUndefined();
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
  });

  it('Enter followed by blur (input-unmount cascade) emits rename exactly once', async () => {
    // The Enter handler calls commitRename, which clears renamingIdx and
    // unmounts the input via v-if. The input's blur fires as a side effect.
    // Pins the same-row no-double-emit contract.
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
    await input.setValue('Concerts');
    await input.trigger('keydown.enter');
    // Browser fires blur naturally when the input is removed; replicate.
    await input.trigger('blur');

    expect(wrapper.emitted('rename')).toHaveLength(1);
    expect(wrapper.emitted('rename')![0]).toEqual([{ idx: 1, name: 'Concerts' }]);
  });

  it('clicking pencil on another row while editing row A does NOT emit a phantom rename for row B', async () => {
    // The cross-row hand-off used to leak: startRename(B) overwrote
    // renameDraft and then blur from A's unmounting input committed with
    // B's draft for B's idx. The forIdx parameter on commitRename guards
    // against this — the stale blur returns early because renamingIdx is
    // now B, not A.
    const wrapper = mount(AstrosRemotePageList, {
      attachTo: document.body,
      global: { plugins: [i18n], stubs: { 'v-icon': true } },
      props: { pages: PAGES_3, selectedIdx: 0 },
    });
    await wrapper
      .findAll('[data-testid="page-list-row"]')[0]!
      .find('[data-testid="page-list-rename"]')
      .trigger('click');
    const input0 = wrapper
      .findAll('[data-testid="page-list-row"]')[0]!
      .get('[data-testid="page-list-rename-input"]');
    await input0.setValue('Edited Row 0');
    // User clicks pencil on row 2 WITHOUT blurring first (e.g., via keyboard
    // shortcut, or because the new pencil receives the click first in some
    // browsers). startRename(2) runs; then the v-if unmount fires blur.
    await wrapper
      .findAll('[data-testid="page-list-row"]')[2]!
      .find('[data-testid="page-list-rename"]')
      .trigger('click');
    // Simulate the blur from the now-detached row 0 input.
    await input0.trigger('blur');

    // Row 2 must NOT have emitted a phantom rename with its own name.
    const renameEvents = wrapper.emitted('rename') ?? [];
    const row2Emits = renameEvents.filter((e) => (e[0] as { idx: number }).idx === 2);
    expect(row2Emits).toHaveLength(0);
    // Row 0's draft was overwritten by startRename(2), so its edit is gone —
    // that's a known UX tradeoff (the user clicked away before blurring).
    // Row 2 should be in rename mode now; row 0 should NOT (catches a
    // regression that mounted inputs on multiple rows simultaneously).
    const allRows = wrapper.findAll('[data-testid="page-list-row"]');
    await flushPromises();
    expect(allRows[0]!.find('[data-testid="page-list-rename-input"]').exists()).toBe(false);
    expect(allRows[2]!.find('[data-testid="page-list-rename-input"]').exists()).toBe(true);
    // Focus moved to row 2's input — the whole point of the function-ref
    // migration was to keep focus working across cross-row hand-off.
    const row2Input = allRows[2]!.get('[data-testid="page-list-rename-input"]').element;
    expect(document.activeElement).toBe(row2Input);
  });

  it('blur on row A then opening rename on row B commits row A cleanly', async () => {
    // The "happy path" hand-off: user clicks somewhere else (or tabs out),
    // blur commits row A, then they open rename on row B. Each row's rename
    // is independent.
    const wrapper = mount(AstrosRemotePageList, {
      attachTo: document.body,
      global: { plugins: [i18n], stubs: { 'v-icon': true } },
      props: { pages: PAGES_3, selectedIdx: 0 },
    });
    await wrapper
      .findAll('[data-testid="page-list-row"]')[0]!
      .find('[data-testid="page-list-rename"]')
      .trigger('click');
    const input0 = wrapper
      .findAll('[data-testid="page-list-row"]')[0]!
      .get('[data-testid="page-list-rename-input"]');
    await input0.setValue('Renamed Row 0');
    await input0.trigger('blur');

    expect(wrapper.emitted('rename')).toHaveLength(1);
    expect(wrapper.emitted('rename')![0]).toEqual([{ idx: 0, name: 'Renamed Row 0' }]);

    // Now open rename on row 2 — independent.
    await wrapper
      .findAll('[data-testid="page-list-row"]')[2]!
      .find('[data-testid="page-list-rename"]')
      .trigger('click');
    const input2 = wrapper
      .findAll('[data-testid="page-list-row"]')[2]!
      .get('[data-testid="page-list-rename-input"]');
    await input2.setValue('Renamed Row 2');
    await input2.trigger('blur');

    expect(wrapper.emitted('rename')).toHaveLength(2);
    expect(wrapper.emitted('rename')![1]).toEqual([{ idx: 2, name: 'Renamed Row 2' }]);
  });

  it('parent splicing a new page at idx 0 mid-rename: rename still commits to the correct page', async () => {
    // The rename state is keyed by page.id (not position) so the user's
    // edit follows the page across reorder. Without id-keying, a stale
    // renamingIdx would re-bind the input to whatever page now occupies
    // the old position, silently committing the user's edit to the wrong
    // page on blur.
    const pageB = mkPage('b', 'Performance');
    const wrapper = mount(AstrosRemotePageList, {
      attachTo: document.body,
      global: { plugins: [i18n], stubs: { 'v-icon': true } },
      props: { pages: [mkPage('a', 'A'), pageB, mkPage('c', 'C')], selectedIdx: 1 },
    });

    // Start renaming page B (currently at idx 1).
    await wrapper
      .findAll('[data-testid="page-list-row"]')[1]!
      .find('[data-testid="page-list-rename"]')
      .trigger('click');
    const input = wrapper
      .findAll('[data-testid="page-list-row"]')[1]!
      .get('[data-testid="page-list-rename-input"]');
    await input.setValue('Performance Edited');

    // Parent splices a new page at idx 0. Page B is now at idx 2.
    await wrapper.setProps({
      pages: [mkPage('new', 'New Page'), mkPage('a', 'A'), pageB, mkPage('c', 'C')],
      selectedIdx: 2,
    });

    // The rename input should still be on page B (now at idx 2).
    const newRows = wrapper.findAll('[data-testid="page-list-row"]');
    expect(newRows[2]!.find('[data-testid="page-list-rename-input"]').exists()).toBe(true);
    expect(newRows[1]!.find('[data-testid="page-list-rename-input"]').exists()).toBe(false);

    // Blur the input. Emit should reflect page B's NEW idx (2).
    await newRows[2]!.get('[data-testid="page-list-rename-input"]').trigger('blur');
    expect(wrapper.emitted('rename')).toHaveLength(1);
    expect(wrapper.emitted('rename')![0]).toEqual([{ idx: 2, name: 'Performance Edited' }]);
  });

  it('parent removing the page being renamed mid-rename: no emit, no error', async () => {
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
    await input.setValue('Stale Edit');

    // Parent removes the page being renamed (page 'b').
    await wrapper.setProps({ pages: [PAGES_3[0]!, PAGES_3[2]!], selectedIdx: 0 });

    // No rename input survives (the gone page no longer matches renamingId).
    expect(wrapper.find('[data-testid="page-list-rename-input"]').exists()).toBe(false);
    // No emit — consumer doesn't need a rename event for a page that's gone.
    expect(wrapper.emitted('rename')).toBeUndefined();
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
  });
});
