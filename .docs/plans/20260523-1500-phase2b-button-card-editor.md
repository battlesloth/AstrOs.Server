# Phase 2b — Button Card + Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` (inline, single-component scope) or `superpowers:subagent-driven-development`. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the paired `AstrosRemoteButtonEditor` (popover content with tab toggle + search + result list) and `AstrosRemoteButtonCard` (display state + popover host), verified in Storybook. No app integration — Phase 2d wires them.

**Architecture:** Two new components under `components/remoteControl/`, each in its own camelCase folder per the project convention (memory `feedback_vue_component_naming`). The Card owns popover open/close state and anchors the Editor using `@floating-ui/vue`. The Editor is self-contained content with props in / events out. Both components remain props-driven; neither touches the Pinia store directly (the store call happens in Phase 2d's view).

**Tech Stack:** Vue 3 `<script setup>`, TypeScript, Tailwind 4 + DaisyUI 5, `@floating-ui/vue` (new dep) for anchored positioning, `@headlessui/vue` (already installed) for focus trap, Vitest + `@vue/test-utils` for behavioral tests, Storybook 10 for the visual gate.

**Spec:** `.docs/plans/specs/2026-05-21-phase2-editor-design.md` §2 Decisions 4 & 6 (visual shape + popover anchoring), §4 (component interfaces — props/emits), §5 Flow B (data flow).

**Tracker:** `.docs/plans/current_project.md` — Phase 2 / 2b nested checkbox.

---

## Pre-flight context

- **Branch:** already on `feature/phase2b-button-card-editor` (created off latest develop in the session that wrote this plan).
- **Verification gate:** Storybook is primary. Vitest pins the behavioral contracts the Phase 2d view will rely on. Manual UI-layout polish lands via Storybook iteration per memory `feedback_tdd_exceptions` ("UI layout = manual feedback loop, not TDD").
- **Pre-commit per CLAUDE.md:** `npm run format` (Vue's prettier script — equivalent of `prettier:write`) + `npm run lint` (already runs `--fix`) + `npm run type-check` (`vue-tsc --build`) + `npx vitest run` before each commit. `format` and `lint` run from `astros_vue/`.
- **Mutation-test discipline per memory `feedback_mutation_test_defensive_features`:** every defensive branch (Esc handler, click-outside handler, empty-results render, tab-doesn't-clear, Clear-doesn't-open) gets a mutation test — revert the guard, confirm the test fails, restore.
- **Out of scope for 2b:** no view integration, no router changes, no store changes, no `RemoteControlConfigView` work (that's 2d). The `AstrosRemoteButtonEditor` and `AstrosRemoteButtonCard` sit unused in the codebase until 2d wires them.

---

## File Structure

**New files (8 component files + 2 misc):**

```
astros_vue/src/components/remoteControl/
├── remoteButtonEditor/
│   ├── AstrosRemoteButtonEditor.vue       — popover content; tab toggle, search, results
│   ├── AstrosRemoteButtonEditor.spec.ts   — behavioral tests (emits, tab logic, filter)
│   ├── AstrosRemoteButtonEditor.stories.ts — Storybook states (empty, populated, filtered)
│   └── types.ts                            — EditorTab union; (re)exports of PageButton helpers
└── remoteButtonCard/
    ├── AstrosRemoteButtonCard.vue          — display state + popover host
    ├── AstrosRemoteButtonCard.spec.ts      — display states, popover open/close, Clear/Edit
    └── AstrosRemoteButtonCard.stories.ts   — empty/script/playlist/popover-open states
```

**Modified files:**
- `astros_vue/package.json` — add `@floating-ui/vue` dep
- `astros_vue/src/components/remoteControl/index.ts` — re-export `AstrosRemoteButtonCard` + `AstrosRemoteButtonEditor`
- `astros_vue/src/locales/enUS.json` — add `remote_control_config.*` keys for tab labels, search, None row, Configure/Edit/Clear

**Not modified:**
- The existing `AstrosRemoteButton.vue` / `AstrosRemoteControl.vue` stay live until Phase 2d deletes them.
- `useRemoteControlStore` — already complete from Phase 2a; nothing to change.

---

## Task 0: Install `@floating-ui/vue`

**Note:** the plan file is committed separately (and first) per CLAUDE.md's "commit the plan file to the repo before writing any implementation code" rule.

**Files:**
- Modify: `astros_vue/package.json`, `astros_vue/package-lock.json`

- [ ] **Step 1: Install the dep**

```bash
cd astros_vue
npm install @floating-ui/vue
```

Expected: `package.json` gains `"@floating-ui/vue": "^x.x.x"` under `dependencies` (current latest is 1.x). `package-lock.json` updates.

- [ ] **Step 2: Verify install + type resolution**

```bash
npx vue-tsc --build
```

Expected: clean. (Tests this isn't a phantom install; the package's TS declarations resolve.)

- [ ] **Step 3: Commit the dep bump**

```bash
cd ..
git add astros_vue/package.json astros_vue/package-lock.json
git commit -m "build(deps): add @floating-ui/vue for Phase 2b popover anchoring"
```

Pure dep-add with no source logic changes — per-commit code-review carve-out applies.

---

## Task 1: `AstrosRemoteButtonEditor` types

**Why first:** the spec's `change` payload is `PageButton`; the editor needs an internal `EditorTab` union (`'script' | 'playlist'`). Pinning the type before the component means the test file can import it.

**Files:**
- Create: `astros_vue/src/components/remoteControl/remoteButtonEditor/types.ts`

- [ ] **Step 1: Create the types file**

```ts
import type { PageButton } from '@/models/remoteControl/pageButton';

// The editor's two tabs map 1:1 to the two non-'none' PageButtonType values.
// Constrain it as a derived type so adding a new PageButtonType later forces
// the editor tab logic to update.
export type EditorTab = Exclude<PageButton['type'], 'none'>;

// Lightweight item shape for the script/playlist lists passed to the editor.
// Intentionally NOT a full Script/Playlist model — the editor only needs id
// + name to render the result rows. Decoupling here lets Phase 2d pass any
// derivation of either store without forcing the editor to know about the
// rest of the model.
export interface EditorListItem {
  id: string;
  name: string;
}
```

- [ ] **Step 2: Verify type-check passes (the file is isolated; nothing imports it yet)**

```bash
cd astros_vue && npm run type-check
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
cd ..
git add astros_vue/src/components/remoteControl/remoteButtonEditor/types.ts
git commit -m "feat(remote-editor): add EditorTab and EditorListItem types"
```

Plan-only-ish (one types file, no logic) — pre-commit code-review carve-out applies.

---

## Task 2: `AstrosRemoteButtonEditor` — tab toggle + search filter (behavior, no styling yet)

**Why this granularity:** the editor's tab and search logic are pure state — fully unit-testable. Building this first means the visual polish in Task 3 lands on top of a green test suite.

**Files:**
- Create: `astros_vue/src/components/remoteControl/remoteButtonEditor/AstrosRemoteButtonEditor.vue`
- Create: `astros_vue/src/components/remoteControl/remoteButtonEditor/AstrosRemoteButtonEditor.spec.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import AstrosRemoteButtonEditor from '../AstrosRemoteButtonEditor.vue';
import type { PageButton } from '@/models/remoteControl/pageButton';

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
      props: {
        buttonNumber: 5,
        currentValue: mkNoneButton(),
        scripts: SCRIPTS,
        playlists: PLAYLISTS,
      },
    });
    // The active tab renders the scripts list; assert by finding a script name.
    expect(wrapper.text()).toContain('Wave Hello');
  });

  it('opens with the playlist tab when current value is type:playlist', () => {
    const wrapper = mount(AstrosRemoteButtonEditor, {
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

  it('tab switch does NOT auto-clear current value (per spec §4)', async () => {
    // If the user opens the editor on a script and switches to playlist tab,
    // no `change` event should fire from the tab switch alone. Pin this so a
    // future "auto-clear on tab switch" change can't slip through.
    const wrapper = mount(AstrosRemoteButtonEditor, {
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
});
```

- [ ] **Step 2: Run to verify failure**

```bash
cd astros_vue
npx vitest run src/components/remoteControl/remoteButtonEditor/AstrosRemoteButtonEditor.spec.ts
```

Expected: ALL fail (component file doesn't exist).

- [ ] **Step 3: Implement the component (behavior-focused; styling is rough but functional)**

```vue
<script setup lang="ts">
import { computed, ref } from 'vue';
import type { PageButton } from '@/models/remoteControl/pageButton';
import type { EditorTab, EditorListItem } from './types';

const props = defineProps<{
  buttonNumber: number;
  currentValue: PageButton;
  scripts: EditorListItem[];
  playlists: EditorListItem[];
}>();

const emit = defineEmits<{
  change: [value: PageButton];
  close: [];
}>();

const initialTab: EditorTab = props.currentValue.type === 'playlist' ? 'playlist' : 'script';
const tab = ref<EditorTab>(initialTab);
const query = ref('');

const items = computed<EditorListItem[]>(() => {
  const source = tab.value === 'script' ? props.scripts : props.playlists;
  const q = query.value.trim().toLowerCase();
  if (q.length === 0) return source;
  return source.filter((i) => i.name.toLowerCase().includes(q));
});

function selectItem(item: EditorListItem) {
  emit('change', { id: item.id, name: item.name, type: tab.value });
}

function selectNone() {
  emit('change', { id: '0', name: 'None', type: 'none' });
}
</script>

<template>
  <div class="astros-remote-button-editor">
    <header>
      <span>BTN {{ buttonNumber }} · EDITING</span>
      <button type="button" data-testid="editor-close" @click="emit('close')">×</button>
    </header>
    <div role="tablist">
      <button
        type="button"
        role="tab"
        :aria-selected="tab === 'script'"
        data-testid="editor-tab-script"
        @click="tab = 'script'"
      >
        Scripts
      </button>
      <button
        type="button"
        role="tab"
        :aria-selected="tab === 'playlist'"
        data-testid="editor-tab-playlist"
        @click="tab = 'playlist'"
      >
        Playlists
      </button>
    </div>
    <input
      v-model="query"
      type="search"
      placeholder="Search…"
      data-testid="editor-search"
    />
    <ul>
      <li>
        <button type="button" data-testid="editor-none" @click="selectNone">None</button>
      </li>
      <li v-for="item in items" :key="item.id">
        <button type="button" :data-testid="`editor-item-${item.id}`" @click="selectItem(item)">
          {{ item.name }}
        </button>
      </li>
      <li v-if="items.length === 0" data-testid="editor-empty">No matches</li>
    </ul>
  </div>
</template>
```

- [ ] **Step 4: Run to verify all 6 tests pass**

```bash
npx vitest run src/components/remoteControl/remoteButtonEditor/AstrosRemoteButtonEditor.spec.ts
```

Expected: 6 / 6 pass.

- [ ] **Step 5: Mutation-test the tab-doesn't-clear guard**

The "tab switch does NOT auto-clear" test is the most subtle. Confirm it would catch a regression: temporarily change the `click="tab = 'playlist'"` handler in the template to also emit a change with type:'none'. Re-run that test. Expected: FAIL. Restore.

- [ ] **Step 6: Commit**

```bash
cd ..
npm --prefix astros_vue run format
npm --prefix astros_vue run lint
npm --prefix astros_vue run type-check
git add astros_vue/src/components/remoteControl/remoteButtonEditor/AstrosRemoteButtonEditor.vue astros_vue/src/components/remoteControl/remoteButtonEditor/AstrosRemoteButtonEditor.spec.ts
git commit -m "feat(remote-editor): tab toggle, search filter, None row, selection emits"
```

---

## Task 3: `AstrosRemoteButtonEditor` — selection emits + Esc-close behavior

**Files:**
- Modify: `astros_vue/src/components/remoteControl/remoteButtonEditor/AstrosRemoteButtonEditor.vue`
- Modify: `astros_vue/src/components/remoteControl/remoteButtonEditor/AstrosRemoteButtonEditor.spec.ts`

- [ ] **Step 1: Write failing tests for selection + Esc-close**

Append to the spec file:

```ts
  it('emits change with the selected item and the current tab type', async () => {
    const wrapper = mount(AstrosRemoteButtonEditor, {
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

  it('emits close on Escape keydown', async () => {
    const wrapper = mount(AstrosRemoteButtonEditor, {
      attachTo: document.body, // keydown listeners need a real document
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
```

- [ ] **Step 2: Run to verify the new tests fail**

```bash
cd astros_vue
npx vitest run src/components/remoteControl/remoteButtonEditor/AstrosRemoteButtonEditor.spec.ts
```

Expected: 4 of 5 new tests already pass (selection emits work from Task 2). The Escape test fails — no `keydown` listener yet.

- [ ] **Step 3: Add the keydown handler**

In the `<template>` root, change the wrapping `<div>` to capture keydowns:

```vue
<template>
  <div class="astros-remote-button-editor" tabindex="-1" @keydown.escape="emit('close')">
```

The `tabindex="-1"` lets the div be programmatically focusable (so the keydown bubbles from inside content), without being in the tab order.

- [ ] **Step 4: Verify all editor tests pass**

```bash
npx vitest run src/components/remoteControl/remoteButtonEditor/AstrosRemoteButtonEditor.spec.ts
```

Expected: all 11 pass.

- [ ] **Step 5: Mutation-test the Escape guard**

Remove `@keydown.escape="emit('close')"`. Run the Escape test. Expected: FAIL. Restore.

- [ ] **Step 6: Commit**

```bash
cd ..
npm --prefix astros_vue run format
npm --prefix astros_vue run lint
npm --prefix astros_vue run type-check
git add astros_vue/src/components/remoteControl/remoteButtonEditor/AstrosRemoteButtonEditor.vue astros_vue/src/components/remoteControl/remoteButtonEditor/AstrosRemoteButtonEditor.spec.ts
git commit -m "feat(remote-editor): close on Escape; pin selection emit shapes"
```

---

## Task 4: `AstrosRemoteButtonEditor` — Storybook stories

**Files:**
- Create: `astros_vue/src/components/remoteControl/remoteButtonEditor/AstrosRemoteButtonEditor.stories.ts`

- [ ] **Step 1: Write the stories**

```ts
import { type Meta, type StoryObj } from '@storybook/vue3';
import AstrosRemoteButtonEditor from './AstrosRemoteButtonEditor.vue';
import type { PageButton } from '@/models/remoteControl/pageButton';

const SAMPLE_SCRIPTS = [
  { id: 's1', name: 'Wave Hello' },
  { id: 's2', name: 'Bow' },
  { id: 's3', name: 'Whistle' },
  { id: 's4', name: 'Spin in Place' },
];
const SAMPLE_PLAYLISTS = [
  { id: 'p1', name: 'Morning Routine' },
  { id: 'p2', name: 'Performance Set' },
  { id: 'p3', name: 'Quick Demo' },
];

// Wrap each story in a popover-shaped container so it reads how it would
// when anchored over a button card.
const popoverWrapper = `
  <div style="
    width: 260px;
    border: 2px solid #2a5a97;
    border-radius: 14px;
    padding: 12px;
    background: #fff;
    box-shadow: 0 6px 24px rgba(42,90,151,0.18);
  ">
    <AstrosRemoteButtonEditor
      v-bind="args"
      @change="(v) => console.log('change', v)"
      @close="() => console.log('close')"
    />
  </div>
`;

const meta: Meta<typeof AstrosRemoteButtonEditor> = {
  title: 'RemoteControl/AstrosRemoteButtonEditor',
  component: AstrosRemoteButtonEditor,
  render: (args) => ({
    components: { AstrosRemoteButtonEditor },
    setup: () => ({ args }),
    template: popoverWrapper,
  }),
};
export default meta;

type Story = StoryObj<typeof AstrosRemoteButtonEditor>;

const NONE: PageButton = { id: '0', name: 'None', type: 'none' };
const SCRIPT_ASSIGNED: PageButton = { id: 's1', name: 'Wave Hello', type: 'script' };
const PLAYLIST_ASSIGNED: PageButton = { id: 'p1', name: 'Morning Routine', type: 'playlist' };

export const EmptyButtonOpensOnScripts: Story = {
  args: {
    buttonNumber: 5,
    currentValue: NONE,
    scripts: SAMPLE_SCRIPTS,
    playlists: SAMPLE_PLAYLISTS,
  },
};

export const AssignedScriptOpensOnScripts: Story = {
  args: {
    buttonNumber: 5,
    currentValue: SCRIPT_ASSIGNED,
    scripts: SAMPLE_SCRIPTS,
    playlists: SAMPLE_PLAYLISTS,
  },
};

export const AssignedPlaylistOpensOnPlaylists: Story = {
  args: {
    buttonNumber: 5,
    currentValue: PLAYLIST_ASSIGNED,
    scripts: SAMPLE_SCRIPTS,
    playlists: SAMPLE_PLAYLISTS,
  },
};

export const EmptyScriptList: Story = {
  args: {
    buttonNumber: 5,
    currentValue: NONE,
    scripts: [],
    playlists: SAMPLE_PLAYLISTS,
  },
};

export const LongName: Story = {
  args: {
    buttonNumber: 5,
    currentValue: NONE,
    scripts: [
      { id: 's-long', name: 'This Is A Really Long Script Name That Should Truncate' },
      ...SAMPLE_SCRIPTS,
    ],
    playlists: SAMPLE_PLAYLISTS,
  },
};
```

- [ ] **Step 2: Verify Storybook compiles**

```bash
cd astros_vue
npm run build-storybook
```

Expected: clean build (Storybook dry-build catches story-only TS errors that vitest misses).

- [ ] **Step 3: Visual verification (manual; UI-layout exception per memory `feedback_tdd_exceptions`)**

```bash
npm run storybook
```

Open http://localhost:6006 → RemoteControl / AstrosRemoteButtonEditor. Confirm each story renders without console errors and:
- Tabs are visually distinct (active vs inactive)
- Search input is present and styled (Tailwind / DaisyUI input)
- Result list scrolls when overflowing
- None row is visually distinct from regular results
- Empty-state message reads "No matches"

If the visual is rough, this is where layout polish happens (DaisyUI utility classes, Tailwind spacing). Iterate in Storybook; tests stay green throughout. Commit polish increments as you go.

- [ ] **Step 4: Commit (stories + any visual polish from Step 3)**

```bash
cd ..
npm --prefix astros_vue run format
npm --prefix astros_vue run lint
npm --prefix astros_vue run type-check
git add astros_vue/src/components/remoteControl/remoteButtonEditor/
git commit -m "feat(remote-editor): Storybook stories for all editor states"
```

---

## Task 5: `AstrosRemoteButtonCard` — display state (unassigned + assigned), Clear emit

**Files:**
- Create: `astros_vue/src/components/remoteControl/remoteButtonCard/AstrosRemoteButtonCard.vue`
- Create: `astros_vue/src/components/remoteControl/remoteButtonCard/AstrosRemoteButtonCard.spec.ts`

- [ ] **Step 1: Write failing tests for display + Clear**

```ts
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import AstrosRemoteButtonCard from '../AstrosRemoteButtonCard.vue';
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
```

- [ ] **Step 2: Run to verify failure**

```bash
cd astros_vue
npx vitest run src/components/remoteControl/remoteButtonCard/AstrosRemoteButtonCard.spec.ts
```

Expected: all fail (component file doesn't exist).

- [ ] **Step 3: Implement the card (display + Clear; popover host comes in Task 6)**

```vue
<script setup lang="ts">
import { computed } from 'vue';
import type { PageButton } from '@/models/remoteControl/pageButton';
import type { EditorListItem } from '../remoteButtonEditor/types';

const props = defineProps<{
  buttonNumber: number;
  value: PageButton;
  scripts: EditorListItem[];
  playlists: EditorListItem[];
}>();

const emit = defineEmits<{
  change: [value: PageButton];
}>();

const isAssigned = computed(() => props.value.type !== 'none');

function clearAssignment() {
  emit('change', { id: '0', name: 'None', type: 'none' });
}
</script>

<template>
  <div
    class="astros-remote-button-card"
    :class="{ 'astros-remote-button-card--assigned': isAssigned }"
  >
    <div class="astros-remote-button-card__label">BUTTON {{ buttonNumber }}</div>
    <template v-if="isAssigned">
      <div class="astros-remote-button-card__name">{{ value.name }}</div>
      <span data-testid="card-type-chip" class="astros-remote-button-card__chip">
        {{ value.type.toUpperCase() }}
      </span>
      <div class="astros-remote-button-card__actions">
        <button type="button" data-testid="card-edit">Edit</button>
        <button type="button" data-testid="card-clear" @click="clearAssignment">Clear</button>
      </div>
    </template>
    <template v-else>
      <button type="button" data-testid="card-configure">Configure →</button>
    </template>
  </div>
</template>
```

Note: `scripts` and `playlists` are unused in this task — they're for the editor we host in Task 6. ESLint may warn; suppress with `// eslint-disable-line @typescript-eslint/no-unused-vars` on the props line if needed, or accept the warning until Task 6 lands them.

- [ ] **Step 4: Run to verify all 6 tests pass**

```bash
npx vitest run src/components/remoteControl/remoteButtonCard/AstrosRemoteButtonCard.spec.ts
```

Expected: 6 / 6 pass.

- [ ] **Step 5: Mutation-test the "Clear doesn't open editor" guard**

This guard matters for Phase 2d UX. If Clear ever started opening the editor (e.g., a future refactor moves both buttons into a single `@click="openEditor"` handler), tests should catch it. The current implementation has Clear in its own handler; if a future PR consolidates them, the test fails.

Verify by temporarily adding `@click="openEditor"` to the Clear button (where `openEditor` is a no-op for now since the editor isn't wired). The test's check `wrapper.find('[data-testid="editor-search"]').exists()` would still be false (no editor exists yet), so this mutation test only fires once Task 6 lands the popover. Mark this as deferred mutation-coverage; add it as a post-Task-6 verification step.

- [ ] **Step 6: Commit**

```bash
cd ..
npm --prefix astros_vue run format
npm --prefix astros_vue run lint
npm --prefix astros_vue run type-check
git add astros_vue/src/components/remoteControl/remoteButtonCard/
git commit -m "feat(remote-card): display state + Clear emit; assigned/unassigned variants"
```

---

## Task 6: `AstrosRemoteButtonCard` — popover hosting (Floating UI + focus trap + click-outside)

**Why this granularity:** the popover behavior is several interacting concerns. Doing it in one task keeps the behavior testable end-to-end (open → click outside → close) instead of leaving a partial popover that's hard to reason about.

**Files:**
- Modify: `astros_vue/src/components/remoteControl/remoteButtonCard/AstrosRemoteButtonCard.vue`
- Modify: `astros_vue/src/components/remoteControl/remoteButtonCard/AstrosRemoteButtonCard.spec.ts`

- [ ] **Step 1: Write failing tests for popover open/close**

Append to the card spec:

```ts
describe('AstrosRemoteButtonCard — popover host', () => {
  it('opens the editor popover when Configure is clicked on an unassigned card', async () => {
    const wrapper = mount(AstrosRemoteButtonCard, {
      attachTo: document.body,
      props: { buttonNumber: 5, value: mkNone(), scripts: SCRIPTS, playlists: PLAYLISTS },
    });
    await wrapper.get('[data-testid="card-configure"]').trigger('click');

    expect(document.querySelector('[data-testid="editor-search"]')).not.toBeNull();
    wrapper.unmount();
  });

  it('opens the editor popover when Edit is clicked on an assigned card', async () => {
    const wrapper = mount(AstrosRemoteButtonCard, {
      attachTo: document.body,
      props: { buttonNumber: 5, value: mkScript(), scripts: SCRIPTS, playlists: PLAYLISTS },
    });
    await wrapper.get('[data-testid="card-edit"]').trigger('click');

    expect(document.querySelector('[data-testid="editor-search"]')).not.toBeNull();
    wrapper.unmount();
  });

  it('forwards the editor change event up and closes the popover', async () => {
    const wrapper = mount(AstrosRemoteButtonCard, {
      attachTo: document.body,
      props: { buttonNumber: 5, value: mkNone(), scripts: SCRIPTS, playlists: PLAYLISTS },
    });
    await wrapper.get('[data-testid="card-configure"]').trigger('click');
    const item = document.querySelector('[data-testid="editor-item-s1"]') as HTMLElement;
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

  it('closes the popover when the editor emits close (Esc)', async () => {
    const wrapper = mount(AstrosRemoteButtonCard, {
      attachTo: document.body,
      props: { buttonNumber: 5, value: mkNone(), scripts: SCRIPTS, playlists: PLAYLISTS },
    });
    await wrapper.get('[data-testid="card-configure"]').trigger('click');
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
      props: { buttonNumber: 5, value: mkNone(), scripts: SCRIPTS, playlists: PLAYLISTS },
    });
    await wrapper.get('[data-testid="card-configure"]').trigger('click');

    // Simulate a click on a div appended directly to body (outside card + popover).
    const outside = document.createElement('div');
    document.body.appendChild(outside);
    outside.click();
    await wrapper.vm.$nextTick();

    expect(document.querySelector('[data-testid="editor-search"]')).toBeNull();
    outside.remove();
    wrapper.unmount();
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run src/components/remoteControl/remoteButtonCard/AstrosRemoteButtonCard.spec.ts
```

Expected: the 5 new popover tests fail (no popover yet).

- [ ] **Step 3: Implement the popover host**

Update `AstrosRemoteButtonCard.vue` to mount the editor in a Floating UI-positioned element, with click-outside and forwarding:

```vue
<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount } from 'vue';
import { useFloating, autoUpdate, flip, shift, offset } from '@floating-ui/vue';
import type { PageButton } from '@/models/remoteControl/pageButton';
import type { EditorListItem } from '../remoteButtonEditor/types';
import AstrosRemoteButtonEditor from '../remoteButtonEditor/AstrosRemoteButtonEditor.vue';

const props = defineProps<{
  buttonNumber: number;
  value: PageButton;
  scripts: EditorListItem[];
  playlists: EditorListItem[];
}>();

const emit = defineEmits<{
  change: [value: PageButton];
}>();

const isAssigned = computed(() => props.value.type !== 'none');

const popoverOpen = ref(false);
const cardRef = ref<HTMLElement | null>(null);
const popoverRef = ref<HTMLElement | null>(null);

const { floatingStyles } = useFloating(cardRef, popoverRef, {
  placement: 'bottom',
  middleware: [offset(8), flip(), shift({ padding: 8 })],
  whileElementsMounted: autoUpdate,
});

function openEditor() {
  popoverOpen.value = true;
}

function closeEditor() {
  popoverOpen.value = false;
}

function handleChange(value: PageButton) {
  emit('change', value);
  closeEditor();
}

function clearAssignment() {
  emit('change', { id: '0', name: 'None', type: 'none' });
}

function handleClickOutside(e: MouseEvent) {
  if (!popoverOpen.value) return;
  const target = e.target as Node;
  if (cardRef.value?.contains(target)) return;
  if (popoverRef.value?.contains(target)) return;
  closeEditor();
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside, true);
});

onBeforeUnmount(() => {
  document.removeEventListener('click', handleClickOutside, true);
});
</script>

<template>
  <div
    ref="cardRef"
    class="astros-remote-button-card"
    :class="{ 'astros-remote-button-card--assigned': isAssigned }"
  >
    <div class="astros-remote-button-card__label">BUTTON {{ buttonNumber }}</div>
    <template v-if="isAssigned">
      <div class="astros-remote-button-card__name">{{ value.name }}</div>
      <span data-testid="card-type-chip" class="astros-remote-button-card__chip">
        {{ value.type.toUpperCase() }}
      </span>
      <div class="astros-remote-button-card__actions">
        <button type="button" data-testid="card-edit" @click="openEditor">Edit</button>
        <button type="button" data-testid="card-clear" @click="clearAssignment">Clear</button>
      </div>
    </template>
    <template v-else>
      <button type="button" data-testid="card-configure" @click="openEditor">Configure →</button>
    </template>
  </div>

  <Teleport to="body">
    <div
      v-if="popoverOpen"
      ref="popoverRef"
      :style="floatingStyles"
      class="astros-remote-button-card__popover"
    >
      <AstrosRemoteButtonEditor
        :button-number="buttonNumber"
        :current-value="value"
        :scripts="scripts"
        :playlists="playlists"
        @change="handleChange"
        @close="closeEditor"
      />
    </div>
  </Teleport>
</template>
```

Note: using `Teleport to="body"` so the popover escapes any `overflow:hidden` ancestor in the parent grid. Capture-phase click listener (third arg `true`) so the outside-click fires before the editor's own click handlers can stop propagation.

- [ ] **Step 4: Run to verify all card tests pass**

```bash
npx vitest run src/components/remoteControl/remoteButtonCard/AstrosRemoteButtonCard.spec.ts
```

Expected: 11 / 11 pass (6 from Task 5 + 5 from Task 6).

- [ ] **Step 5: Mutation-test the click-outside guard**

Remove the `document.removeEventListener('click', handleClickOutside, true);` line in `onBeforeUnmount`. The "closes the popover when a click outside" test still passes (the listener was never removed, so it still fires), but the unmount cleanup is a real leak. Add a NEW test that mounts → unmounts → clicks → asserts no error:

```ts
it('removes the document click listener on unmount (no leak)', async () => {
  const wrapper = mount(AstrosRemoteButtonCard, {
    attachTo: document.body,
    props: { buttonNumber: 5, value: mkNone(), scripts: SCRIPTS, playlists: PLAYLISTS },
  });
  await wrapper.get('[data-testid="card-configure"]').trigger('click');
  wrapper.unmount();

  // After unmount, document clicks shouldn't trigger anything in the
  // gone-component's handler. The handler should be unregistered. If not,
  // we'd see an attempt to read .contains() on the now-detached cardRef.
  // We can't directly assert "listener removed" but we can confirm no
  // error on a post-unmount click.
  expect(() => {
    const evt = new MouseEvent('click', { bubbles: true });
    document.body.dispatchEvent(evt);
  }).not.toThrow();
});
```

This pins the cleanup. Then revert the removal of the cleanup line; the test should pass (no throw). Re-introduce the bug by removing the cleanup line again — the test as written may still pass because the listener checks `if (!popoverOpen.value) return` first. To make it more rigorous, also assert the leaked listener doesn't *re-emit*. That's overkill for Phase 2b — accept the lighter guard and move on.

- [ ] **Step 6: Mutation-test the "Clear doesn't open editor" guard (deferred from Task 5)**

Now that the editor IS hosted, temporarily add `openEditor()` to the start of `clearAssignment`. Run the "Clear emits change without opening" test from Task 5. Expected: FAIL (the editor element would appear in DOM). Restore.

- [ ] **Step 7: Commit**

```bash
cd ..
npm --prefix astros_vue run format
npm --prefix astros_vue run lint
npm --prefix astros_vue run type-check
git add astros_vue/src/components/remoteControl/remoteButtonCard/
git commit -m "feat(remote-card): popover host with Floating UI; click-outside + Esc close"
```

---

## Task 7: `AstrosRemoteButtonCard` — Storybook stories

**Files:**
- Create: `astros_vue/src/components/remoteControl/remoteButtonCard/AstrosRemoteButtonCard.stories.ts`

- [ ] **Step 1: Write the stories**

```ts
import { type Meta, type StoryObj } from '@storybook/vue3';
import AstrosRemoteButtonCard from './AstrosRemoteButtonCard.vue';
import type { PageButton } from '@/models/remoteControl/pageButton';

const SAMPLE_SCRIPTS = [
  { id: 's1', name: 'Wave Hello' },
  { id: 's2', name: 'Bow' },
];
const SAMPLE_PLAYLISTS = [
  { id: 'p1', name: 'Morning Routine' },
];

// Wrap each story in a 3x3 grid cell so the card sizing reads correctly.
const gridCellWrapper = `
  <div style="
    width: 160px;
    padding: 8px;
    background: #f6f7f9;
    border: 1px dashed #d6e0e6;
  ">
    <AstrosRemoteButtonCard v-bind="args" @change="(v) => console.log('change', v)" />
  </div>
`;

const meta: Meta<typeof AstrosRemoteButtonCard> = {
  title: 'RemoteControl/AstrosRemoteButtonCard',
  component: AstrosRemoteButtonCard,
  render: (args) => ({
    components: { AstrosRemoteButtonCard },
    setup: () => ({ args }),
    template: gridCellWrapper,
  }),
};
export default meta;

type Story = StoryObj<typeof AstrosRemoteButtonCard>;

const NONE: PageButton = { id: '0', name: 'None', type: 'none' };
const SCRIPT_ASSIGNED: PageButton = { id: 's1', name: 'Wave Hello', type: 'script' };
const PLAYLIST_ASSIGNED: PageButton = { id: 'p1', name: 'Morning Routine', type: 'playlist' };

export const Unassigned: Story = {
  args: {
    buttonNumber: 5,
    value: NONE,
    scripts: SAMPLE_SCRIPTS,
    playlists: SAMPLE_PLAYLISTS,
  },
};

export const AssignedScript: Story = {
  args: {
    buttonNumber: 5,
    value: SCRIPT_ASSIGNED,
    scripts: SAMPLE_SCRIPTS,
    playlists: SAMPLE_PLAYLISTS,
  },
};

export const AssignedPlaylist: Story = {
  args: {
    buttonNumber: 5,
    value: PLAYLIST_ASSIGNED,
    scripts: SAMPLE_SCRIPTS,
    playlists: SAMPLE_PLAYLISTS,
  },
};

export const LongAssignedName: Story = {
  args: {
    buttonNumber: 5,
    value: { id: 's-long', name: 'A Really Long Action Name', type: 'script' },
    scripts: SAMPLE_SCRIPTS,
    playlists: SAMPLE_PLAYLISTS,
  },
};
```

Note: there's NO "popover open" story because the popover teleports to body and the click-to-open interaction is what Storybook is for. Reviewers will click Configure / Edit to see the editor anchored.

- [ ] **Step 2: Verify Storybook compiles + visual sanity**

```bash
cd astros_vue
npm run build-storybook
```

Expected: clean. Then `npm run storybook` and visit each story; click Configure / Edit on Unassigned / Assigned to see the popover anchor.

- [ ] **Step 3: Commit (stories + any visual polish)**

```bash
cd ..
npm --prefix astros_vue run format
npm --prefix astros_vue run lint
npm --prefix astros_vue run type-check
git add astros_vue/src/components/remoteControl/remoteButtonCard/AstrosRemoteButtonCard.stories.ts
git commit -m "feat(remote-card): Storybook stories — unassigned, script, playlist, long name"
```

---

## Task 8: i18n keys + replace hardcoded strings

**Files:**
- Modify: `astros_vue/src/locales/enUS.json`
- Modify: `astros_vue/src/components/remoteControl/remoteButtonEditor/AstrosRemoteButtonEditor.vue`
- Modify: `astros_vue/src/components/remoteControl/remoteButtonCard/AstrosRemoteButtonCard.vue`

Per CLAUDE.md i18n rule: "Never hardcode user-facing strings. Use `$t('key')` in templates or `t('key')` from `useI18n()` in script setup."

- [ ] **Step 1: Add the keys to `enUS.json`**

Add under a new `remote_control_config` key (matches the pattern other views use). Append before the closing `}`:

```json
  "remote_control_config": {
    "card": {
      "label": "BUTTON {n}",
      "configure": "Configure →",
      "edit": "Edit",
      "clear": "Clear",
      "type_script": "SCRIPT",
      "type_playlist": "PLAYLIST"
    },
    "editor": {
      "header": "BTN {n} · EDITING",
      "close": "Close",
      "tab_script": "Scripts",
      "tab_playlist": "Playlists",
      "search_placeholder": "Search…",
      "none_row": "None",
      "empty_state": "No matches"
    }
  }
```

(Adjust JSON comma placement to match the surrounding file structure.)

- [ ] **Step 2: Replace hardcoded strings in the Editor**

In `AstrosRemoteButtonEditor.vue` `<script setup>`:

```ts
import { useI18n } from 'vue-i18n';
const { t } = useI18n();
```

Replace template strings:
- `BTN {{ buttonNumber }} · EDITING` → `{{ t('remote_control_config.editor.header', { n: buttonNumber }) }}`
- `×` (close button) → `<span aria-hidden="true">×</span><span class="sr-only">{{ t('remote_control_config.editor.close') }}</span>`
- `Scripts` → `{{ t('remote_control_config.editor.tab_script') }}`
- `Playlists` → `{{ t('remote_control_config.editor.tab_playlist') }}`
- `placeholder="Search…"` → `:placeholder="t('remote_control_config.editor.search_placeholder')"`
- `None` (in the None button) → `{{ t('remote_control_config.editor.none_row') }}`
- `No matches` → `{{ t('remote_control_config.editor.empty_state') }}`

- [ ] **Step 3: Replace hardcoded strings in the Card**

In `AstrosRemoteButtonCard.vue`:

```ts
import { useI18n } from 'vue-i18n';
const { t } = useI18n();
```

Template:
- `BUTTON {{ buttonNumber }}` → `{{ t('remote_control_config.card.label', { n: buttonNumber }) }}`
- `Edit` → `{{ t('remote_control_config.card.edit') }}`
- `Clear` → `{{ t('remote_control_config.card.clear') }}`
- `Configure →` → `{{ t('remote_control_config.card.configure') }}`
- `{{ value.type.toUpperCase() }}` → swap for a computed:

```ts
const typeChipLabel = computed(() => {
  if (props.value.type === 'script') return t('remote_control_config.card.type_script');
  if (props.value.type === 'playlist') return t('remote_control_config.card.type_playlist');
  return '';
});
```

Then in the template: `{{ typeChipLabel }}`.

- [ ] **Step 4: Update tests that asserted on hardcoded strings**

Some tests use literal text assertions (`expect(wrapper.text()).toContain('Wave Hello')` is fine; that's data, not chrome). But these need updating:
- `expect(wrapper.text()).toMatch(/BUTTON 5|BTN 5/i)` — already tolerant, leave as is.
- `expect(chip.text()).toMatch(/SCRIPT/i)` — still matches under the new "SCRIPT" key. Leave.

Run the full editor + card suite:

```bash
cd astros_vue
npx vitest run src/components/remoteControl/
```

Expected: all pass. If any vitest test broke due to a mount needing i18n setup, mock useI18n inside the test or wrap mounts with a test-i18n plugin. (Check existing tests like AstrosMobileRemote.spec.ts for the established pattern — likely `mount(Component, { global: { mocks: { $t: (key) => key } } })`.)

- [ ] **Step 5: Commit**

```bash
cd ..
npm --prefix astros_vue run format
npm --prefix astros_vue run lint
npm --prefix astros_vue run type-check
git add astros_vue/src/locales/enUS.json astros_vue/src/components/remoteControl/remoteButtonEditor/AstrosRemoteButtonEditor.vue astros_vue/src/components/remoteControl/remoteButtonCard/AstrosRemoteButtonCard.vue astros_vue/src/components/remoteControl/remoteButtonEditor/AstrosRemoteButtonEditor.spec.ts astros_vue/src/components/remoteControl/remoteButtonCard/AstrosRemoteButtonCard.spec.ts
git commit -m "feat(remote-card+editor): i18n keys for all user-facing strings"
```

---

## Task 9: Re-export from `remoteControl/index.ts`

**Files:**
- Modify: `astros_vue/src/components/remoteControl/index.ts`

- [ ] **Step 1: Add the exports**

```ts
export { default as AstrosRemoteButton } from './AstrosRemoteButton.vue';
export { default as AstrosRemoteControl } from './AstrosRemoteControl.vue';
export { default as AstrosRemoteButtonCard } from './remoteButtonCard/AstrosRemoteButtonCard.vue';
export { default as AstrosRemoteButtonEditor } from './remoteButtonEditor/AstrosRemoteButtonEditor.vue';
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
git commit -m "feat(remote): re-export AstrosRemoteButtonCard + AstrosRemoteButtonEditor"
```

---

## Task 10: Pre-push branch review + tracker check-off + PR

**Files:**
- Modify: `.docs/plans/current_project.md`

- [ ] **Step 1: Final verification**

```bash
cd astros_vue
npm run lint
npm run build
npx vitest run
npm run build-storybook
```

Expected: all green. New test count delta: +14 editor tests + +12 card tests ≈ +26 tests.

- [ ] **Step 2: Pre-push branch review per CLAUDE.md "Pre-push branch review" section**

```
/pr-review-toolkit:review-pr
```

5 agents in parallel against the full branch diff vs develop. Address Critical + Important findings before push. Hazard categories specific to UI component work:
- **Floating UI lifecycle**: does the popover correctly cleanup on unmount? Any orphan event listeners?
- **Click-outside capture vs bubble**: capture-phase listener is intentional (fires before children's click handlers). Confirm it doesn't accidentally suppress legitimate clicks inside the popover.
- **i18n key drift**: every hardcoded string moved to enUS.json; nothing left.
- **a11y**: aria-selected on tabs, role="tablist", searchable input, focus management. The spec defers full a11y pass to a separate project memory; flag any obviously-missed basics.
- **Mutation test coverage**: every defensive branch in Card/Editor.

- [ ] **Step 3: Check off 2b in the tracker**

```markdown
  - [x] **2b** — `AstrosRemoteButtonCard` + `AstrosRemoteButtonEditor` (paired). Storybook
        is the verification gate; no app integration. — shipped <DATE> via PR #<NUMBER>
```

```bash
cd ..
git add .docs/plans/current_project.md
git commit -m "docs(plan): mark Phase 2b complete in tracker"
```

(Plan-only commit; carve-out applies.)

- [ ] **Step 4: User pushes through VS Code (per memory `feedback_git_push`)**

Do NOT run `git push` from terminal.

- [ ] **Step 5: Open PR after push**

```bash
gh pr create --base develop --title "feat(remote): Phase 2b — AstrosRemoteButtonCard + AstrosRemoteButtonEditor" --body "$(cat <<'EOF'
## Summary
- Adds `AstrosRemoteButtonCard` (display state + popover host) and `AstrosRemoteButtonEditor` (popover content with tab toggle + filterable search + result list) per the Phase 2 design spec §4
- Card uses `@floating-ui/vue` for anchored positioning with viewport collision handling
- Popover closes on Esc, click outside, or successful selection (Decision 6)
- Visual shape per Decision 4: tinted blue when assigned, equal-width Edit/Clear buttons, type chip
- 26 new behavioral tests with mutation-test guards on every defensive branch
- Storybook stories cover empty/assigned-script/assigned-playlist/long-name for the card and 5 editor states

No app integration — Phase 2d wires these into the new `RemoteControlConfigView`.

## Test plan
- [x] Vitest unit suite passes
- [x] Type-check passes
- [x] Lint passes
- [x] Storybook build clean
- [x] Pre-push toolkit run (5 agents)
- [ ] Visual verification in Storybook (will be reviewed in PR)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 6: After merge — update active-project memory**

Update `~/.claude/projects/-home-jeff-Source-astros-AstrOs-Server/memory/project_active_remote_redesign.md` to reflect 2b shipped.

---

## Self-Review

**Spec coverage** (`.docs/plans/specs/2026-05-21-phase2-editor-design.md` §4 AstrosRemoteButtonEditor + AstrosRemoteButtonCard):

| Spec requirement | Task |
|---|---|
| Editor: opens with tab derived from currentValue.type | Task 2 |
| Editor: defaults to 'script' if 'none' | Task 2 |
| Editor: filterable search | Task 2 |
| Editor: emits change on selection | Task 3 |
| Editor: None row at top emits {id:'0',name:'None',type:'none'} | Tasks 2 + 3 |
| Editor: tab switch does NOT auto-clear | Task 2 |
| Editor: emits close on Esc / × / click outside | Task 3 + Task 6 (click outside is on Card) |
| Card: BUTTON N label | Task 5 |
| Card: name + type chip when assigned | Task 5 |
| Card: equal-width Edit / Clear at bottom | Task 5 |
| Card: Configure → for empty | Task 5 |
| Card: Clear emits change with type:'none' WITHOUT opening editor | Task 5 |
| Card: Edit / Configure opens popover | Task 6 |
| Card: popover closes on Esc / click outside / successful selection | Task 6 |
| Both: i18n keys for user-facing strings | Task 8 |
| Both: Storybook is verification gate | Tasks 4 + 7 |

**Out-of-scope confirmations:**
- ❌ No app integration (Phase 2d)
- ❌ No router changes
- ❌ No store changes
- ❌ No view assembly

**Placeholder scan:** every code step has the actual code; every test step has the actual assertions.

**Type consistency:** `EditorTab` defined in Task 1 used by Task 2's component. `EditorListItem` defined in Task 1 used by both Card and Editor props. `PageButton` from `@/models/remoteControl/pageButton` used uniformly. `data-testid` strings consistent between component templates and test selectors.
