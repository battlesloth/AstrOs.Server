import { describe, it, expect, afterEach } from 'vitest';
import { ref } from 'vue';
import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { VueDraggable } from 'vue-draggable-plus';
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

describe('AstrosRemotePageList — drag handle + keyboard reorder', () => {
  // Pointer drag (vue-draggable-plus / SortableJS) is real DOM-drag and is
  // covered by the manual QA plan (project UI-drag TDD exception). These tests
  // pin the KEYBOARD reorder state machine and the `reorder` emit contract —
  // pure component logic the store relies on.
  function mountList(pages = PAGES_3, selectedIdx = 0) {
    return mount(AstrosRemotePageList, {
      global: { plugins: [i18n], stubs: { 'v-icon': true } },
      props: { pages, selectedIdx },
    });
  }
  const handles = (w: ReturnType<typeof mountList>) =>
    w.findAll('[data-testid="page-list-drag-handle"]');
  const rows = (w: ReturnType<typeof mountList>) => w.findAll('[data-testid="page-list-row"]');

  const SPACE = { key: ' ' };
  const ENTER = { key: 'Enter' };
  const DOWN = { key: 'ArrowDown' };
  const UP = { key: 'ArrowUp' };
  const ESC = { key: 'Escape' };

  it('renders a drag handle on every row', () => {
    const wrapper = mountList();
    expect(handles(wrapper)).toHaveLength(3);
  });

  it('grab then ArrowDown emits reorder {fromIdx:0, toIdx:1}', async () => {
    const wrapper = mountList();
    await handles(wrapper)[0]!.trigger('keydown', SPACE); // grab A (idx 0)
    await handles(wrapper)[0]!.trigger('keydown', DOWN);

    expect(wrapper.emitted('reorder')).toHaveLength(1);
    expect(wrapper.emitted('reorder')![0]).toEqual([{ fromIdx: 0, toIdx: 1 }]);
  });

  it('grab then ArrowUp emits reorder {fromIdx:1, toIdx:0}', async () => {
    const wrapper = mountList();
    await handles(wrapper)[1]!.trigger('keydown', SPACE); // grab B (idx 1)
    await handles(wrapper)[1]!.trigger('keydown', UP);

    expect(wrapper.emitted('reorder')).toHaveLength(1);
    expect(wrapper.emitted('reorder')![0]).toEqual([{ fromIdx: 1, toIdx: 0 }]);
  });

  it('does NOT emit when ArrowUp is pressed on the grabbed top row (boundary)', async () => {
    const wrapper = mountList();
    await handles(wrapper)[0]!.trigger('keydown', SPACE); // grab A (idx 0)
    await handles(wrapper)[0]!.trigger('keydown', UP); // already at top

    expect(wrapper.emitted('reorder')).toBeUndefined();
  });

  it('does NOT emit when ArrowDown is pressed on the grabbed bottom row (boundary)', async () => {
    const wrapper = mountList();
    await handles(wrapper)[2]!.trigger('keydown', SPACE); // grab C (idx 2)
    await handles(wrapper)[2]!.trigger('keydown', DOWN); // already at bottom

    expect(wrapper.emitted('reorder')).toBeUndefined();
  });

  it('does NOT emit on arrow keys when no row is grabbed', async () => {
    const wrapper = mountList();
    await handles(wrapper)[0]!.trigger('keydown', DOWN);
    await handles(wrapper)[1]!.trigger('keydown', UP);

    expect(wrapper.emitted('reorder')).toBeUndefined();
  });

  it('two ArrowDowns emit reorder twice, tracking the grabbed page across the moves', async () => {
    // The store is authoritative: each move emits, the parent applies it, and
    // the new order flows back through `pages`. Simulate that with setProps so
    // the second move computes from the page's NEW index — exactly the runtime
    // path, not a snapshot of the original order.
    const wrapper = mountList();
    await handles(wrapper)[0]!.trigger('keydown', SPACE); // grab A (idx 0)
    await handles(wrapper)[0]!.trigger('keydown', DOWN); // {0,1}

    await wrapper.setProps({ pages: [PAGES_3[1]!, PAGES_3[0]!, PAGES_3[2]!] }); // [B,A,C]; A now idx 1
    await handles(wrapper)[1]!.trigger('keydown', DOWN); // {1,2}

    expect(wrapper.emitted('reorder')).toHaveLength(2);
    expect(wrapper.emitted('reorder')![0]).toEqual([{ fromIdx: 0, toIdx: 1 }]);
    expect(wrapper.emitted('reorder')![1]).toEqual([{ fromIdx: 1, toIdx: 2 }]);
  });

  it('keeps focus on the grabbed page handle after it moves (keyboard focus-follow)', async () => {
    // The most load-bearing keyboard-reorder behavior: when the grabbed page
    // changes position, the keyed <li> DOM node (and the focused handle inside
    // it) is MOVED, not recreated, so the NEXT arrow keypress still lands on
    // the right handle. A regression that broke :key="page.id" or pulled the
    // handle out of the row would silently strand focus.
    const wrapper = mount(AstrosRemotePageList, {
      attachTo: document.body,
      global: { plugins: [i18n], stubs: { 'v-icon': true } },
      props: { pages: PAGES_3, selectedIdx: 0 },
    });
    const grabbedHandle = handles(wrapper)[0]!.element as HTMLElement;
    grabbedHandle.focus();
    expect(document.activeElement).toBe(grabbedHandle);

    await handles(wrapper)[0]!.trigger('keydown', SPACE); // grab A
    await handles(wrapper)[0]!.trigger('keydown', DOWN); // emit {0,1}
    // Parent applies the move; A now sits at index 1.
    await wrapper.setProps({ pages: [PAGES_3[1]!, PAGES_3[0]!, PAGES_3[2]!] });

    // The SAME handle element now sits at index 1 and is still focused.
    expect(handles(wrapper)[1]!.element).toBe(grabbedHandle);
    expect(document.activeElement).toBe(grabbedHandle);
  });

  it('Esc with no prior move emits nothing and ends the grab', async () => {
    const wrapper = mountList();
    await handles(wrapper)[1]!.trigger('keydown', SPACE); // grab B
    await handles(wrapper)[1]!.trigger('keydown', ESC);

    expect(wrapper.emitted('reorder')).toBeUndefined();
    // grab ended → no row carries the grabbed ring
    expect(rows(wrapper).some((r) => r.classes().includes('ring-2'))).toBe(false);
  });

  it('Esc after a move emits reorder back to the original index', async () => {
    const wrapper = mountList();
    await handles(wrapper)[0]!.trigger('keydown', SPACE); // grab A at origin 0
    await handles(wrapper)[0]!.trigger('keydown', DOWN); // {0,1}

    await wrapper.setProps({ pages: [PAGES_3[1]!, PAGES_3[0]!, PAGES_3[2]!] }); // [B,A,C]; A now idx 1
    await handles(wrapper)[1]!.trigger('keydown', ESC); // cancel → back to origin 0

    expect(wrapper.emitted('reorder')).toHaveLength(2);
    expect(wrapper.emitted('reorder')![1]).toEqual([{ fromIdx: 1, toIdx: 0 }]);
  });

  it('marks the grabbed row with a ring and clears it on drop (Space)', async () => {
    const wrapper = mountList();
    await handles(wrapper)[0]!.trigger('keydown', SPACE); // grab
    expect(rows(wrapper)[0]!.classes()).toContain('ring-2');

    await handles(wrapper)[0]!.trigger('keydown', SPACE); // drop
    expect(rows(wrapper)[0]!.classes()).not.toContain('ring-2');
  });

  it('Enter grabs and a second Enter drops (clears the ring)', async () => {
    const wrapper = mountList();
    await handles(wrapper)[1]!.trigger('keydown', ENTER); // grab
    expect(rows(wrapper)[1]!.classes()).toContain('ring-2');

    await handles(wrapper)[1]!.trigger('keydown', ENTER); // drop
    expect(rows(wrapper)[1]!.classes()).not.toContain('ring-2');
  });

  it('pressing a grab key on the handle does NOT emit select (no row-select bubble)', async () => {
    const wrapper = mountList();
    await handles(wrapper)[2]!.trigger('keydown', SPACE);
    await handles(wrapper)[0]!.trigger('keydown', ENTER);

    expect(wrapper.emitted('select')).toBeUndefined();
  });

  it('disables the drag handle on the row being renamed', async () => {
    const wrapper = mount(AstrosRemotePageList, {
      attachTo: document.body,
      global: { plugins: [i18n], stubs: { 'v-icon': true } },
      props: { pages: PAGES_3, selectedIdx: 0 },
    });
    await rows(wrapper)[1]!.find('[data-testid="page-list-rename"]').trigger('click');

    expect(handles(wrapper)[1]!.attributes('disabled')).toBeDefined();
  });

  it('does NOT grab/reorder via keyboard while any row is being renamed', async () => {
    const wrapper = mount(AstrosRemotePageList, {
      attachTo: document.body,
      global: { plugins: [i18n], stubs: { 'v-icon': true } },
      props: { pages: PAGES_3, selectedIdx: 0 },
    });
    // Begin renaming row 1; row 0's handle is still enabled.
    await rows(wrapper)[1]!.find('[data-testid="page-list-rename"]').trigger('click');
    await handles(wrapper)[0]!.trigger('keydown', SPACE);
    await handles(wrapper)[0]!.trigger('keydown', DOWN);

    expect(wrapper.emitted('reorder')).toBeUndefined();
  });

  it('announces the grabbed page in an aria-live region', async () => {
    const wrapper = mountList();
    await handles(wrapper)[0]!.trigger('keydown', SPACE); // grab "Quick Actions"
    await flushPromises();

    const live = wrapper.get('[data-testid="page-list-live"]');
    expect(live.text()).toContain('Quick Actions');
  });

  it('announces the GRABBED page on move, even after the parent applies the reorder synchronously', async () => {
    // Runtime path: emitting `reorder` synchronously runs the store splice on
    // the same array backing `pages` BEFORE the announce fires. A naive read of
    // pages[currentIdx] after the emit would name the page that shifted INTO
    // the vacated slot. This harness reproduces that synchronous round-trip
    // (the stub-parent mountList() can't — its props never change on emit).
    const Harness = {
      components: { AstrosRemotePageList },
      setup() {
        const pages = ref<RemoteControlPage[]>([...PAGES_3]);
        function onReorder({ fromIdx, toIdx }: { fromIdx: number; toIdx: number }) {
          const [p] = pages.value.splice(fromIdx, 1);
          pages.value.splice(toIdx, 0, p!);
        }
        return { pages, onReorder };
      },
      template: '<AstrosRemotePageList :pages="pages" :selected-idx="0" @reorder="onReorder" />',
    };
    const wrapper = mount(Harness, {
      global: { plugins: [i18n], stubs: { 'v-icon': true } },
    });
    const handle = () => wrapper.findAll('[data-testid="page-list-drag-handle"]')[0]!;
    await handle().trigger('keydown', SPACE); // grab "Quick Actions"
    await handle().trigger('keydown', DOWN); // move; parent splices synchronously
    await flushPromises();

    const live = wrapper.get('[data-testid="page-list-live"]');
    expect(live.text()).toContain('Quick Actions'); // the grabbed page…
    expect(live.text()).not.toContain('Performance'); // …NOT the one that shifted in
  });

  it('clears the grabbed ring when an inline rename starts on another row', async () => {
    const wrapper = mount(AstrosRemotePageList, {
      attachTo: document.body,
      global: { plugins: [i18n], stubs: { 'v-icon': true } },
      props: { pages: PAGES_3, selectedIdx: 0 },
    });
    await handles(wrapper)[0]!.trigger('keydown', SPACE); // grab row 0 → ring
    expect(rows(wrapper)[0]!.classes()).toContain('ring-2');

    await rows(wrapper)[1]!.find('[data-testid="page-list-rename"]').trigger('click');

    expect(rows(wrapper).some((r) => r.classes().includes('ring-2'))).toBe(false);
  });

  // The pointer-drag DOM mechanics (SortableJS) are manual-QA only, but the
  // `onDragEnd` handler the library calls is pure component JS and is exercised
  // here by emitting from the VueDraggable child directly.
  const draggable = (w: ReturnType<typeof mountList>) => w.findComponent(VueDraggable);

  it('@end emits reorder with the SortableJS old/new indices', async () => {
    const wrapper = mountList();
    await draggable(wrapper).vm.$emit('end', { oldIndex: 0, newIndex: 2 });

    expect(wrapper.emitted('reorder')![0]).toEqual([{ fromIdx: 0, toIdx: 2 }]);
  });

  it('@end with oldIndex === newIndex does NOT emit (no-op drop)', async () => {
    const wrapper = mountList();
    await draggable(wrapper).vm.$emit('end', { oldIndex: 1, newIndex: 1 });

    expect(wrapper.emitted('reorder')).toBeUndefined();
  });

  it('@end with missing indices does NOT emit (defensive against a malformed event)', async () => {
    const wrapper = mountList();
    await draggable(wrapper).vm.$emit('end', {});

    expect(wrapper.emitted('reorder')).toBeUndefined();
  });

  it('@end resets the visual order from props when the move is not applied (store-rejected)', async () => {
    // SortableJS splices the v-model in place during the drag; if the parent
    // never applies the reorder (store guard fails), @end must snap the list
    // back to the authoritative prop order.
    const wrapper = mountList();
    // Simulate the library's in-place splice of the v-model.
    await draggable(wrapper).vm.$emit('update:modelValue', [PAGES_3[1]!, PAGES_3[2]!, PAGES_3[0]!]);
    // @end fires, but props.pages is unchanged (parent didn't apply the move).
    await draggable(wrapper).vm.$emit('end', { oldIndex: 0, newIndex: 2 });
    await wrapper.vm.$nextTick();

    const names = wrapper.findAll('[data-testid="page-list-name"]').map((n) => n.text());
    expect(names).toEqual(['Quick Actions', 'Performance', 'Songs']);
  });
});
