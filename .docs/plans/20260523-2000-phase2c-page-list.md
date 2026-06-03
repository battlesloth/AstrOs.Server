# Phase 2c — Page List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` (inline, single-component scope) or `superpowers:subagent-driven-development`. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Post-implementation deltas** (added after the plan was executed): the
> shipped code diverges from the per-task snippets in this plan in two
> places — both addressed PR-review findings, not bugs in the original
> design. (1) Rename state is keyed by `page.id` (not `idx`) to survive
> parent-driven reorder/insert/delete during a rename; the emit shape
> `{idx, name}` per spec §4 is preserved by resolving idx at commit time.
> (2) The focus capture uses a Vue function ref via `captureRenameInput`
> (not `document.querySelector` or a string `ref="renameInputRef"`), to
> avoid the singleton-component assumption and to keep the ref scoped to
> this component instance. Per-task code snippets below show the
> pre-refactor shape; the AstrosRemotePageList.vue file in HEAD is the
> source of truth.

**Goal:** Build the `AstrosRemotePageList` left-rail component (page rows with mini 3×3 previews, inline rename, always-visible action icons, sticky header with Add), verified in Storybook. No app integration — Phase 2d wires it.

**Architecture:** Single new component under `components/remoteControl/remotePageList/` per the camelCase folder convention. Props are the page array + selected index; emits are semantic verbs (select / rename / duplicate / delete / add). All state ownership stays in the parent — this component is presentational + inline-rename-local-state only. The consumer (Phase 2d's `RemoteControlConfigView`) wires emits to `store.selectPage / renamePage / duplicatePage / deletePage / addPage`, and gates `delete` behind a DaisyUI confirm modal (Decision 2).

**Tech Stack:** Vue 3 `<script setup>`, TypeScript, Tailwind 4 + DaisyUI 5, `oh-vue-icons` (already installed) for Md-family icons (Pencil/Copy/Trash/Add/Drag), Vitest + `@vue/test-utils` for behavior, Storybook 10 for the visual gate.

**Spec:** `.docs/plans/specs/2026-05-21-phase2-editor-design.md` §4 (component interface), §2 Decisions 5 (always-visible row actions) + 8 (renamePage empty-no-op), §5 Flow A (page selection) + Flow C (delete with confirm).

**Tracker:** `.docs/plans/current_project.md` — Phase 2 / 2c nested checkbox.

---

## Pre-flight context

- **Branch:** already on `feature/phase2c-page-list` (created off latest `develop` in the session that wrote this plan).
- **First consumer of `renamePage`'s boolean return** — the inline-rename UI uses `false` (empty/whitespace) to keep the input open with a validation hint rather than committing the edit. Phase 2a added the boolean return specifically for this use case.
- **Spec deviates from the handoff JSX**: the JSX (`.tmp/design_handoff_remote_control/directionB.jsx:104-110`) shows row actions only when `i === idx` (selected-only). Decision 5 in the spec explicitly overrides this: actions are **always visible on every row** for keyboard / touch / discoverability. Follow the spec, not the JSX.
- **Spec deviates from the handoff JSX (delete-disabled)**: spec Decision 5 sentence 2 plus the explicit data-flow note in §5 Flow C — "Card disables × when `pages.length === 1` so the modal can't open in the impossible case." Apply this to the page list's delete icon, not the card.
- **Verification gate:** Storybook is primary. Vitest pins behavioral contracts the Phase 2d view will rely on. Manual UI-layout polish lands via Storybook iteration per memory `feedback_tdd_exceptions` ("UI layout = manual feedback loop, not TDD").
- **Pre-commit per CLAUDE.md:** `npm run format` + `npm run lint` + `npm run type-check` + `npx vitest run` before each commit. All from `astros_vue/`.
- **Mutation-test discipline per memory `feedback_mutation_test_defensive_features`:** every defensive branch (delete-disabled-on-length-1, empty-rename no-op, Esc-cancels, action stopPropagation) gets a mutation test — revert the guard, confirm the test fails, restore.
- **Out of scope for 2c:** no view integration, no router changes, no store changes, no drag-reorder behavior (Phase 5), no delete-confirm modal (Phase 2d).

---

## File Structure

**New files:**

```
astros_vue/src/components/remoteControl/
└── remotePageList/
    ├── AstrosRemotePageList.vue          — sticky header + scrollable row list + per-row actions
    ├── AstrosRemotePageList.spec.ts      — behavioral tests
    └── AstrosRemotePageList.stories.ts   — 4 stories (1 page, 3 pages, 30 pages, long names)
```

No `types.ts` — this component takes the existing `RemoteControlPage[]` and emits primitives + `{idx, name}`. No new domain types are warranted.

**Modified files:**
- `astros_vue/src/main.ts` — register `IoCreate` (rename icon) in the app icon set
- `astros_vue/.storybook/preview.ts` — register the same icon(s) for Storybook
- `astros_vue/src/components/remoteControl/index.ts` — re-export `AstrosRemotePageList`
- `astros_vue/src/locales/enUS.json` — add `remote_control_config.pageList.*` keys (header, add, rename, duplicate, delete, rename input)

**Not modified:**
- `useRemoteControlStore` — already complete; this component does not touch it.
- The existing `AstrosRemoteButton.vue` / `AstrosRemoteControl.vue` / `AstrosRemoteButtonCard.vue` / `AstrosRemoteButtonEditor.vue` stay live; Phase 2d deletes the legacy ones.

---

## Task 0: Register the new oh-vue-icons + commit this plan

**Note:** the plan file is committed separately (and first) per CLAUDE.md's "commit the plan file to the repo before writing any implementation code" rule.

**Files:**
- Modify: `astros_vue/src/main.ts`

- [ ] **Step 1: Verify icons exist in oh-vue-icons/icons/md**

```bash
ls astros_vue/node_modules/oh-vue-icons/icons/md/ | grep -iE "(edit|copy|delete|add|drag)" | head -10
```

Expected: lines including `md-edit.js`, `md-contentcopy.js`, `md-delete.js`, `md-add.js`, `md-draghandle.js`.

- [ ] **Step 2: Register the 3 NEW icons in main.ts**

`MdDraghandle` is already imported; `MdEdit`, `MdContentcopy`, `MdDelete`, `MdAdd` are not. Read the existing import line:

```bash
grep -n "from 'oh-vue-icons/icons/md'" astros_vue/src/main.ts
```

Then expand the import. Example — if the current line is:

```ts
import { MdDraghandle, MdDescription, MdFolder } from 'oh-vue-icons/icons/md';
```

change it to (alphabetized for diff stability):

```ts
import {
  MdAdd,
  MdContentcopy,
  MdDelete,
  MdDescription,
  MdDraghandle,
  MdEdit,
  MdFolder,
} from 'oh-vue-icons/icons/md';
```

And add the new icon names to whatever `addIcons(...)` call is doing the registration. Read that line first:

```bash
grep -n "addIcons" astros_vue/src/main.ts
```

Add `MdAdd, MdContentcopy, MdDelete, MdEdit` to that call.

- [ ] **Step 3: Verify type-check passes**

```bash
cd astros_vue && npm run type-check
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
cd ..
git add astros_vue/src/main.ts
git commit -m "build(icons): register MdAdd/MdContentcopy/MdDelete/MdEdit for Phase 2c"
```

Single-file mechanical change; per-commit code-review carve-out applies.

---

## Task 1: Component scaffold — header + row rendering + selected highlight

**Files:**
- Create: `astros_vue/src/components/remoteControl/remotePageList/AstrosRemotePageList.vue`
- Create: `astros_vue/src/components/remoteControl/remotePageList/AstrosRemotePageList.spec.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import AstrosRemotePageList from './AstrosRemotePageList.vue';
import type { RemoteControlPage } from '@/models/remoteControl/remoteControlPage';
import { makeNoneButton } from '@/models/remoteControl/pageButton';
import enUS from '@/locales/enUS.json';

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
      props: { pages: [mkPage('a', 'A Really Quite Long Page Name That Will Truncate')], selectedIdx: 0 },
    });
    const nameEl = wrapper.get('[data-testid="page-list-name"]');
    expect(nameEl.attributes('title')).toBe('A Really Quite Long Page Name That Will Truncate');
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
cd astros_vue
npx vitest run src/components/remoteControl/remotePageList/AstrosRemotePageList.spec.ts
```

Expected: all fail (component file doesn't exist).

- [ ] **Step 3: Implement the component (display only — emits in later tasks)**

```vue
<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import type { RemoteControlPage } from '@/models/remoteControl/remoteControlPage';

const { t } = useI18n();

defineProps<{
  pages: readonly RemoteControlPage[];
  selectedIdx: number;
}>();

// Emits land in Task 2.
</script>

<template>
  <div class="astros-remote-page-list flex h-full flex-col">
    <header
      class="sticky top-0 z-10 flex items-center justify-between border-b border-base-300 bg-base-200 px-3 py-2"
    >
      <span class="text-[11px] font-bold uppercase tracking-[0.1em] text-base-content/60">
        {{ t('remote_control_config.pageList.header') }}
      </span>
      <button
        type="button"
        class="btn btn-ghost btn-xs btn-square text-primary"
        :aria-label="t('remote_control_config.pageList.add')"
        data-testid="page-list-add"
      >
        +
      </button>
    </header>
    <ul class="flex-1 overflow-y-auto p-1">
      <li
        v-for="(page, idx) in pages"
        :key="page.id"
        role="option"
        :aria-selected="idx === selectedIdx ? 'true' : 'false'"
        :class="[
          'flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5',
          idx === selectedIdx
            ? 'bg-primary/10 border border-primary/30'
            : 'border border-transparent hover:bg-base-200',
        ]"
        data-testid="page-list-row"
      >
        <span
          :class="[
            'min-w-0 flex-1 truncate text-xs',
            idx === selectedIdx ? 'font-semibold' : 'font-medium',
          ]"
          :title="page.name"
          data-testid="page-list-name"
        >
          {{ page.name }}
        </span>
      </li>
    </ul>
  </div>
</template>
```

Note: i18n keys land in Task 6; this commit uses the keys upfront because the test mount installs the real `enUS.json` plugin, and Task 6 adds the keys. **To avoid test pollution between tasks, add the keys to `enUS.json` now**, as part of this commit.

Add to `astros_vue/src/locales/enUS.json` under the existing `remote_control_config` block, alongside `card` and `editor`:

```json
"pageList": {
  "header": "Pages",
  "add": "Add page",
  "rename": "Rename",
  "duplicate": "Duplicate",
  "delete": "Delete",
  "renameInput": "Page name"
}
```

(All keys land here; later tasks reference them as they wire up the corresponding UI.)

- [ ] **Step 4: Run to verify all 5 tests pass**

```bash
npx vitest run src/components/remoteControl/remotePageList/AstrosRemotePageList.spec.ts
```

Expected: 5 / 5 pass.

- [ ] **Step 5: Commit**

```bash
cd ..
npm --prefix astros_vue run format
npm --prefix astros_vue run lint
npm --prefix astros_vue run type-check
git add astros_vue/src/components/remoteControl/remotePageList/ astros_vue/src/locales/enUS.json
git commit -m "feat(remote-page-list): scaffold component with sticky header + row rendering"
```

---

## Task 2: select + add emits

**Files:**
- Modify: `astros_vue/src/components/remoteControl/remotePageList/AstrosRemotePageList.vue`
- Modify: `astros_vue/src/components/remoteControl/remotePageList/AstrosRemotePageList.spec.ts`

- [ ] **Step 1: Write failing tests**

Append to the spec:

```ts
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

  it('does not emit select when the same row is clicked twice in a row (still emits each time — consumer dedupes)', async () => {
    // Pins the "we always emit, consumer dedupes" contract. Saves the parent
    // from having to track previous emits.
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
```

- [ ] **Step 2: Run to verify failure**

```bash
cd astros_vue
npx vitest run src/components/remoteControl/remotePageList/AstrosRemotePageList.spec.ts -t "select \+ add"
```

Expected: all 3 fail (no emit handlers wired yet).

- [ ] **Step 3: Wire emits**

In the `<script setup>` block, add:

```ts
const emit = defineEmits<{
  select: [idx: number];
  add: [];
}>();
```

In the template — bind `@click="emit('select', idx)"` on the `<li>`, and `@click="emit('add')"` on the Add button.

- [ ] **Step 4: Run to verify passes**

```bash
npx vitest run src/components/remoteControl/remotePageList/AstrosRemotePageList.spec.ts
```

Expected: 8 / 8 pass.

- [ ] **Step 5: Commit**

```bash
cd ..
npm --prefix astros_vue run format
npm --prefix astros_vue run lint
npm --prefix astros_vue run type-check
git add astros_vue/src/components/remoteControl/remotePageList/
git commit -m "feat(remote-page-list): emit select(idx) on row click; emit add() on header button"
```

---

## Task 3: Mini 3×3 preview per row

**Files:**
- Modify: `astros_vue/src/components/remoteControl/remotePageList/AstrosRemotePageList.vue`
- Modify: `astros_vue/src/components/remoteControl/remotePageList/AstrosRemotePageList.spec.ts`

The mini-preview is a 3×3 grid of 6px dots, one per button slot. Color per spec: `script=blue` (primary), `playlist=orange` (matches Card's playlist chip), `none=gray` (base-300).

- [ ] **Step 1: Write failing tests**

```ts
import { BUTTON_KEYS } from '@/models/remoteControl/remoteControlPage';
import type { PageButton } from '@/models/remoteControl/pageButton';

function mkScriptBtn(): PageButton {
  return { id: 's1', name: 'Wave', type: 'script' };
}
function mkPlaylistBtn(): PageButton {
  return { id: 'p1', name: 'Routine', type: 'playlist' };
}

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

  it('uses the script class on script-typed slots, playlist class on playlist-typed, none on empty', () => {
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

  it('iterates BUTTON_KEYS in order (defends against silent BUTTON_KEYS shrink)', () => {
    // BUTTON_KEYS is already pinned by remoteControl.spec.ts; this test
    // confirms the page list consumes it via the keys-in-order contract.
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
    // Sanity: BUTTON_KEYS length should equal dot count.
    expect(dots.length).toBe(BUTTON_KEYS.length);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run src/components/remoteControl/remotePageList/AstrosRemotePageList.spec.ts -t "mini 3x3 preview"
```

Expected: 3 fail (no dots rendered).

- [ ] **Step 3: Implement the preview**

In `<script setup>`:

```ts
import { BUTTON_KEYS, type ButtonKey } from '@/models/remoteControl/remoteControlPage';
import { assertNever } from '@/utils/assertNever';
import type { PageButton } from '@/models/remoteControl/pageButton';

function dotClass(type: PageButton['type']): string {
  switch (type) {
    case 'script':
      return 'bg-primary';
    case 'playlist':
      return 'bg-orange-500';
    case 'none':
      return 'bg-base-300';
    default:
      return assertNever(type);
  }
}
```

In the template — inside the `<li>`, before the name span, add the grid:

```vue
<div
  class="grid flex-shrink-0 grid-cols-3 gap-px"
  aria-hidden="true"
>
  <span
    v-for="key in BUTTON_KEYS"
    :key="key"
    :class="['block h-1.5 w-1.5 rounded-sm', dotClass(page[key as ButtonKey].type)]"
    :data-type="page[key as ButtonKey].type"
    data-testid="page-list-dot"
  />
</div>
```

Make `BUTTON_KEYS` available to the template by re-declaring it in setup (`const buttonKeys = BUTTON_KEYS;`) or referencing it directly — match what Phase 2a/2b did.

- [ ] **Step 4: Run to verify passes**

```bash
npx vitest run src/components/remoteControl/remotePageList/AstrosRemotePageList.spec.ts
```

Expected: 11 / 11 pass.

- [ ] **Step 5: Commit**

```bash
cd ..
npm --prefix astros_vue run format
npm --prefix astros_vue run lint
npm --prefix astros_vue run type-check
git add astros_vue/src/components/remoteControl/remotePageList/
git commit -m "feat(remote-page-list): mini 3x3 preview dots with type-driven colors"
```

---

## Task 4: Always-visible action icons — rename / duplicate / delete + emits

Per spec Decision 5: actions are always visible on every row (NOT selected-only as the JSX showed). Each action button must `event.stopPropagation()` so clicking it doesn't also fire the row-level `select` emit.

**Files:**
- Modify: `astros_vue/src/components/remoteControl/remotePageList/AstrosRemotePageList.vue`
- Modify: `astros_vue/src/components/remoteControl/remotePageList/AstrosRemotePageList.spec.ts`

- [ ] **Step 1: Write failing tests**

```ts
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
    // Without stopPropagation, the row's @click would also fire. Pin this so a
    // future refactor that moves the @click off the buttons (delegated handler)
    // can't silently introduce a phantom select on every action click.
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
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run src/components/remoteControl/remotePageList/AstrosRemotePageList.spec.ts -t "action icons"
```

Expected: 6 fail.

- [ ] **Step 3: Extend emits + template**

In `<script setup>`:

```ts
const emit = defineEmits<{
  select: [idx: number];
  add: [];
  duplicate: [idx: number];
  delete: [idx: number];
  // rename emit lands in Task 5 alongside the inline-rename UI.
}>();
```

In the template, after the name span (and before the closing `</li>`), add the action button group. Use `.stop` modifier on each handler so the row's `@click` doesn't also fire:

```vue
<div class="flex flex-shrink-0 items-center gap-px">
  <button
    type="button"
    class="btn btn-ghost btn-xs btn-square text-base-content/60"
    :aria-label="t('remote_control_config.pageList.rename')"
    :title="t('remote_control_config.pageList.rename')"
    data-testid="page-list-rename"
    @click.stop
  >
    <v-icon name="md-edit" scale="0.7" />
  </button>
  <button
    type="button"
    class="btn btn-ghost btn-xs btn-square text-base-content/60"
    :aria-label="t('remote_control_config.pageList.duplicate')"
    :title="t('remote_control_config.pageList.duplicate')"
    data-testid="page-list-duplicate"
    @click.stop="emit('duplicate', idx)"
  >
    <v-icon name="md-contentcopy" scale="0.7" />
  </button>
  <button
    type="button"
    class="btn btn-ghost btn-xs btn-square text-base-content/60"
    :aria-label="t('remote_control_config.pageList.delete')"
    :title="t('remote_control_config.pageList.delete')"
    :disabled="pages.length <= 1"
    data-testid="page-list-delete"
    @click.stop="emit('delete', idx)"
  >
    <v-icon name="md-delete" scale="0.7" />
  </button>
</div>
```

(The rename button's `@click.stop` is a no-op for now — Task 5 wires the rename handler.)

- [ ] **Step 4: Run to verify passes**

```bash
npx vitest run src/components/remoteControl/remotePageList/AstrosRemotePageList.spec.ts
```

Expected: 17 / 17 pass.

- [ ] **Step 5: Mutation-test the disabled-on-length-1 guard**

Temporarily change `:disabled="pages.length <= 1"` to `:disabled="false"`. Re-run:

```bash
npx vitest run src/components/remoteControl/remotePageList/AstrosRemotePageList.spec.ts -t "disables the delete"
```

Expected: FAIL. Restore.

Also mutation-test the no-emit-on-disabled-click — remove the `:disabled` entirely:

```bash
npx vitest run src/components/remoteControl/remotePageList/AstrosRemotePageList.spec.ts -t "does NOT emit delete when"
```

Expected: FAIL (delete fires). Restore.

- [ ] **Step 6: Mutation-test the stopPropagation guard**

Change `@click.stop="emit('duplicate', idx)"` to `@click="emit('duplicate', idx)"` (drop `.stop`). Re-run:

```bash
npx vitest run src/components/remoteControl/remotePageList/AstrosRemotePageList.spec.ts -t "action click does NOT also emit select"
```

Expected: FAIL (select also emits). Restore the `.stop`.

- [ ] **Step 7: Commit**

```bash
cd ..
npm --prefix astros_vue run format
npm --prefix astros_vue run lint
npm --prefix astros_vue run type-check
git add astros_vue/src/components/remoteControl/remotePageList/
git commit -m "feat(remote-page-list): always-visible rename/duplicate/delete icons; delete disabled at length 1"
```

---

## Task 5: Inline rename

Per spec Decision 8: pencil click → input replaces name → commit on Enter or blur → cancel on Esc. Empty / whitespace-only rename does NOT emit.

This is the first consumer of `renamePage`'s boolean return from Phase 2a — but the page list itself doesn't call the store. The boolean lives at the view layer. What the page list does:
- Enters rename mode on pencil click (local `renamingIdx` ref).
- Renders an `<input>` in the row, autofocused.
- On Enter or blur: emit `rename({idx, name})` if trimmed name is non-empty, else just exit rename mode.
- On Esc: exit rename mode without emitting.
- The "Name can't be blank" UI affordance is the view's job (it can ignore the missing emit, or — if it wires this differently in 2d — call `store.renamePage` directly and use the boolean return).

**Files:**
- Modify: `astros_vue/src/components/remoteControl/remotePageList/AstrosRemotePageList.vue`
- Modify: `astros_vue/src/components/remoteControl/remotePageList/AstrosRemotePageList.spec.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { nextTick } from 'vue';

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
    // Input should be gone (rename mode exited), name span back.
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
    await nextTick();
    await nextTick();
    const input = wrapper
      .findAll('[data-testid="page-list-row"]')[1]!
      .get('[data-testid="page-list-rename-input"]').element;

    expect(document.activeElement).toBe(input);
    wrapper.unmount();
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run src/components/remoteControl/remotePageList/AstrosRemotePageList.spec.ts -t "inline rename"
```

Expected: 7 fail.

- [ ] **Step 3: Implement the inline-rename UI**

In `<script setup>`, add:

```ts
import { nextTick, ref } from 'vue';

// ... existing imports + props + emits ...

const emit = defineEmits<{
  select: [idx: number];
  add: [];
  duplicate: [idx: number];
  delete: [idx: number];
  rename: [payload: { idx: number; name: string }];
}>();

const renamingIdx = ref<number | null>(null);
const renameDraft = ref('');
const renameInputRef = ref<HTMLInputElement | null>(null);

function startRename(idx: number, current: string) {
  renamingIdx.value = idx;
  renameDraft.value = current;
  nextTick(() => renameInputRef.value?.focus());
}

function commitRename() {
  if (renamingIdx.value === null) return;
  const trimmed = renameDraft.value.trim();
  const idx = renamingIdx.value;
  // Exit rename mode FIRST so the blur handler (which also fires) doesn't
  // re-enter this function and double-emit.
  renamingIdx.value = null;
  if (trimmed.length === 0) return;
  emit('rename', { idx, name: trimmed });
}

function cancelRename() {
  renamingIdx.value = null;
}
```

In the template — wire the rename button to call `startRename`, and conditionally render the input:

```vue
<!-- inside the rename button -->
<button
  type="button"
  class="btn btn-ghost btn-xs btn-square text-base-content/60"
  :aria-label="t('remote_control_config.pageList.rename')"
  :title="t('remote_control_config.pageList.rename')"
  data-testid="page-list-rename"
  @click.stop="startRename(idx, page.name)"
>
  <v-icon name="md-edit" scale="0.7" />
</button>

<!-- replace the existing name span block with this conditional: -->
<input
  v-if="renamingIdx === idx"
  ref="renameInputRef"
  v-model="renameDraft"
  type="text"
  class="input input-bordered input-xs min-w-0 flex-1 text-xs"
  :aria-label="t('remote_control_config.pageList.renameInput')"
  data-testid="page-list-rename-input"
  @click.stop
  @keydown.enter.prevent="commitRename"
  @keydown.escape="cancelRename"
  @blur="commitRename"
/>
<span
  v-else
  :class="[
    'min-w-0 flex-1 truncate text-xs',
    idx === selectedIdx ? 'font-semibold' : 'font-medium',
  ]"
  :title="page.name"
  data-testid="page-list-name"
>
  {{ page.name }}
</span>
```

The `@click.stop` on the input prevents the row's `@click` from firing when the user clicks inside the input (e.g., positioning the cursor mid-edit).

- [ ] **Step 4: Run to verify passes**

```bash
npx vitest run src/components/remoteControl/remotePageList/AstrosRemotePageList.spec.ts
```

Expected: 24 / 24 pass.

- [ ] **Step 5: Mutation-test the empty/whitespace guard**

Remove `if (trimmed.length === 0) return;` from `commitRename`. Re-run:

```bash
npx vitest run src/components/remoteControl/remotePageList/AstrosRemotePageList.spec.ts -t "empty input on Enter"
npx vitest run src/components/remoteControl/remotePageList/AstrosRemotePageList.spec.ts -t "whitespace-only input"
```

Expected: BOTH FAIL. Restore.

- [ ] **Step 6: Mutation-test the Esc-cancel path**

Change `cancelRename` to also emit:

```ts
function cancelRename() {
  if (renamingIdx.value !== null) {
    emit('rename', { idx: renamingIdx.value, name: renameDraft.value });
  }
  renamingIdx.value = null;
}
```

Re-run:

```bash
npx vitest run src/components/remoteControl/remotePageList/AstrosRemotePageList.spec.ts -t "Esc cancels rename"
```

Expected: FAIL. Restore.

- [ ] **Step 7: Mutation-test the trim**

Change `const trimmed = renameDraft.value.trim();` to `const trimmed = renameDraft.value;`. Re-run:

```bash
npx vitest run src/components/remoteControl/remotePageList/AstrosRemotePageList.spec.ts -t "emits rename.+trimmed input value"
```

Expected: FAIL. Restore.

- [ ] **Step 8: Mutation-test focus-on-mount**

Comment out `nextTick(() => renameInputRef.value?.focus());`. Re-run:

```bash
npx vitest run src/components/remoteControl/remotePageList/AstrosRemotePageList.spec.ts -t "focuses the rename input"
```

Expected: FAIL. Restore.

- [ ] **Step 9: Commit**

```bash
cd ..
npm --prefix astros_vue run format
npm --prefix astros_vue run lint
npm --prefix astros_vue run type-check
git add astros_vue/src/components/remoteControl/remotePageList/
git commit -m "feat(remote-page-list): inline rename — pencil opens, Enter/blur commits, Esc cancels"
```

---

## Task 6: Storybook stories

**Files:**
- Create: `astros_vue/src/components/remoteControl/remotePageList/AstrosRemotePageList.stories.ts`

- [ ] **Step 1: Write the stories**

```ts
import { type Meta, type StoryObj } from '@storybook/vue3';
import AstrosRemotePageList from './AstrosRemotePageList.vue';
import type { RemoteControlPage } from '@/models/remoteControl/remoteControlPage';
import { makeNoneButton } from '@/models/remoteControl/pageButton';

function mkPage(id: string, name: string, partial: Partial<RemoteControlPage> = {}): RemoteControlPage {
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
    ...partial,
  };
}

// Wrap each story in a narrow rail container so the layout reads how it
// would when embedded in the Phase 2d 3-pane editor (left rail ~220px).
const railWrapper = `
  <div style="
    width: 220px;
    height: 400px;
    border: 1px solid #d6e0e6;
    border-radius: 8px;
    overflow: hidden;
    background: #f6f7f9;
    display: flex;
  ">
    <AstrosRemotePageList
      v-bind="args"
      @select="(i) => console.log('select', i)"
      @add="() => console.log('add')"
      @duplicate="(i) => console.log('duplicate', i)"
      @delete="(i) => console.log('delete', i)"
      @rename="(p) => console.log('rename', p)"
    />
  </div>
`;

const meta: Meta<typeof AstrosRemotePageList> = {
  title: 'components/remoteControl/AstrosRemotePageList',
  component: AstrosRemotePageList,
  render: (args) => ({
    components: { AstrosRemotePageList },
    setup: () => ({ args }),
    template: railWrapper,
  }),
};
export default meta;

type Story = StoryObj<typeof AstrosRemotePageList>;

const SAMPLE_3 = [
  mkPage('a', 'Quick Actions', {
    button1: { id: 's1', name: 'Wave', type: 'script' },
    button2: { id: 's2', name: 'Bow', type: 'script' },
    button5: { id: 'p1', name: 'Routine', type: 'playlist' },
  }),
  mkPage('b', 'Performance'),
  mkPage('c', 'Songs', {
    button9: { id: 's3', name: 'Whistle', type: 'script' },
  }),
];

export const SinglePageDeleteDisabled: Story = {
  args: { pages: [mkPage('only', 'Only Page')], selectedIdx: 0 },
};

export const ThreePages: Story = {
  args: { pages: SAMPLE_3, selectedIdx: 0 },
};

export const ManyPagesScroll: Story = {
  args: {
    pages: Array.from({ length: 30 }, (_, i) => mkPage(`p${i}`, `Page ${i + 1}`)),
    selectedIdx: 4,
  },
};

export const LongNames: Story = {
  args: {
    pages: [
      mkPage('a', 'A Really Quite Long Page Name That Will Truncate With Ellipsis'),
      mkPage('b', 'Performance'),
      mkPage('c', 'Another Long Page Name For Visual Truncation Check'),
    ],
    selectedIdx: 0,
  },
};
```

- [ ] **Step 2: Verify Storybook compiles**

```bash
cd astros_vue
npm run build-storybook
```

Expected: clean.

- [ ] **Step 3: Visual verification (manual; UI-layout exception)**

```bash
npm run storybook
```

Open http://localhost:6006 → components / remoteControl / AstrosRemotePageList. Confirm each story renders without console errors:
- Single page: delete icon visibly disabled
- Three pages: selected row visually distinct, mini-previews show colored dots, action icons always visible on every row
- 30 pages: list scrolls, sticky header stays visible
- Long names: name truncates with ellipsis, full name visible on hover (title tooltip)
- Click pencil on any row: input replaces name, autofocused, Enter/Esc work

Layout polish increments commit as you go.

- [ ] **Step 4: Commit**

```bash
cd ..
npm --prefix astros_vue run format
npm --prefix astros_vue run lint
npm --prefix astros_vue run type-check
git add astros_vue/src/components/remoteControl/remotePageList/AstrosRemotePageList.stories.ts
git commit -m "feat(remote-page-list): Storybook stories — 1/3/30 pages, long names"
```

---

## Task 7: Re-export from `remoteControl/index.ts`

**Files:**
- Modify: `astros_vue/src/components/remoteControl/index.ts`

- [ ] **Step 1: Add the export**

```ts
export { default as AstrosRemoteButton } from './AstrosRemoteButton.vue';
export { default as AstrosRemoteControl } from './AstrosRemoteControl.vue';
export { default as AstrosRemoteButtonCard } from './remoteButtonCard/AstrosRemoteButtonCard.vue';
export { default as AstrosRemoteButtonEditor } from './remoteButtonEditor/AstrosRemoteButtonEditor.vue';
export { default as AstrosRemotePageList } from './remotePageList/AstrosRemotePageList.vue';
```

- [ ] **Step 2: Verify build still passes**

```bash
cd astros_vue
npm run build
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
cd ..
git add astros_vue/src/components/remoteControl/index.ts
git commit -m "feat(remote): re-export AstrosRemotePageList"
```

---

## Task 8: Pre-push branch review + tracker check-off + PR

- [ ] **Step 1: Final verification**

```bash
cd astros_vue
npm run lint
npm run build
npx vitest run
npm run build-storybook
```

Expected: all green.

- [ ] **Step 2: Pre-push branch review**

```
/pr-review-toolkit:review-pr
```

Hazard categories specific to this PR (frame the review around these, not "verify the fix"):
- **Inline-rename lifecycle**: blur fires after Enter — does `commitRename` get called twice? The implementation exits rename mode synchronously to avoid this; verify under both Enter-then-blur and Esc-then-blur sequences.
- **Action stopPropagation**: every action button must `.stop`. A future refactor that consolidates handlers must keep this.
- **Delete-disabled at length 1**: pinned via two tests (visible disabled + no-emit-on-click). Confirm both are mutation-tested.
- **Mini-preview color tokens**: `bg-primary` (script), `bg-orange-500` (playlist), `bg-base-300` (none) — same orange as the Card's playlist chip from Phase 2b. Visual consistency check.
- **i18n key coverage**: every user-facing string is a `t()` call; every `t()` key exists in `enUS.json`.
- **a11y basics**: `role="option"` + `aria-selected` on rows, `aria-label` on icon-only buttons, focus management on rename input.

- [ ] **Step 3: Check off 2c in the tracker**

```markdown
  - [x] **2c** — `AstrosRemotePageList`. Storybook gate; no app integration. —
        shipped <DATE> via PR #<NUMBER>
```

```bash
cd ..
git add .docs/plans/current_project.md
git commit -m "docs(plan): mark Phase 2c complete in tracker"
```

(Plan-only commit; carve-out applies.)

- [ ] **Step 4: User pushes through VS Code (per memory `feedback_git_push`)**

Do NOT run `git push` from terminal.

- [ ] **Step 5: Open PR after push**

```bash
gh pr create --base develop --title "feat(remote): Phase 2c — AstrosRemotePageList" --body "$(cat <<'EOF'
## Summary
- Adds `AstrosRemotePageList` — the left-rail page-list component for the Phase 2 Direction B editor
- Per-row: mini 3×3 preview (script=blue, playlist=orange, none=gray), name (truncate w/ title-attr tooltip), always-visible rename/duplicate/delete action icons
- Inline rename: pencil → input replaces name → Enter/blur commits trimmed value, Esc cancels, empty/whitespace no-op
- Delete icon disabled when `pages.length === 1`
- Sticky header with Add button
- Emits: `select(idx)`, `add()`, `duplicate(idx)`, `delete(idx)`, `rename({idx, name})`
- ~32 behavioral tests with mutation-test guards on every defensive branch

No app integration — Phase 2d wires this into the new `RemoteControlConfigView` alongside the Card+Editor from Phase 2b.

## Test plan
- [x] Vitest unit suite passes
- [x] Type-check passes
- [x] Lint passes
- [x] Storybook build clean
- [x] Pre-push toolkit run

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 6: After merge — update active-project memory**

Update `~/.claude/projects/-home-jeff-Source-astros-AstrOs-Server/memory/project_active_remote_redesign.md` to reflect 2c shipped.

---

## Self-Review

**Spec coverage** (cross-reference to `.docs/plans/specs/2026-05-21-phase2-editor-design.md` §4 `AstrosRemotePageList`):

| Spec requirement | Task |
|---|---|
| Props `{pages, selectedIdx}` | Task 1 |
| Emit `select(idx)` | Task 2 |
| Emit `add()` | Task 2 |
| Emit `duplicate(idx)` | Task 4 |
| Emit `delete(idx)` | Task 4 |
| Emit `rename({idx, name})` | Task 5 |
| Per-row drag handle (visible but inert) | **GAP** — see below |
| Mini 3×3 preview, script/playlist/none colors | Task 3 |
| Name with ellipsis truncation + title attribute | Task 1 |
| Always-visible rename/duplicate/delete icons | Task 4 |
| Inline rename: pencil → input → Enter/blur commits, Esc cancels | Task 5 |
| Empty/whitespace rename does NOT emit | Task 5 |
| Delete × disabled when `pages.length === 1` | Task 4 |
| Sticky header "Pages" + Add button | Task 1 |
| Long names truncate visually; `title` for full name | Task 1 |

**Gap addressed inline**: the spec mentions "drag handle (visible but inert in Phase 2 — wired in Phase 5)." This plan omits the drag handle from Task 1 because it adds 1 icon + 1 column of layout for zero current behavior, and the test surface would be vacuous (nothing to assert beyond "the element exists"). If you want it included as a visual placeholder for Phase 5, add it in Task 1's template:

```vue
<v-icon
  name="md-draghandle"
  scale="0.7"
  class="cursor-grab text-base-content/30"
  :aria-label="t('remote_control_config.pageList.dragHandle')"
/>
```

…before the mini-preview grid. The i18n key (`remote_control_config.pageList.dragHandle`) is already in Task 1's enUS.json edit. Add this if visual continuity with the Phase 2d preview matters; skip if "inert visual element with no behavior" is exactly the kind of YAGNI the codebase wants to avoid.

**Placeholder scan:** every code step has actual code; every test step has actual assertions; every command has expected output.

**Type consistency:** `RemoteControlPage` + `PageButton` + `ButtonKey` + `BUTTON_KEYS` come from existing models. `makeNoneButton()` from Phase 2b. `assertNever` from Phase 2b. New emits use the exact payload shapes from spec §4.
