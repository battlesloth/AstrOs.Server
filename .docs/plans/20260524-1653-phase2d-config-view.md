# Phase 2d — Live Preview + Config View Assembly Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` (recommended; inline single-component scope) or `superpowers:subagent-driven-development`. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the capstone of Phase 2 — build `AstrosRemoteLivePreview` (right rail, read-only mobile remote in a phone bezel), assemble `RemoteControlConfigView` (3-pane editor wiring 2a store + 2b card + 2c page list), swap the `/remote` router to it, gate destructive page deletes behind a confirm modal, delete the legacy `RemoteView` / `AstrosRemoteControl` / `AstrosRemoteButton` + stories, sweep i18n, write manual QA. After this PR merges, the new Direction B editor is live and the old view is gone.

**Architecture:**
- `AstrosRemoteLivePreview` is a presentational wrapper around the Phase 3 `AstrosMobileRemote` (already shipped via PR #92). It owns the `MiniPhone` bezel chrome and forces `compact + connected + read-only` (no press/panic delivery — Decision 1 in the design spec).
- `RemoteControlConfigView` is the only component that calls `useRemoteControlStore` directly; children stay presentational with semantic events. The view wraps in `AstrosLayout` slot `main`, mirroring `RemoteView` + `ModulesView`.
- Delete-page is gated through `AstrosConfirmModal` (existing `components/modals/AstrosConfirmModal.vue`) — same pattern `ModulesView` uses for `confirm_remove`.
- Save uses `AstrosWriteButton` (existing common component); the readonly+joblock disable logic already lives there.

**Tech Stack:** Vue 3 `<script setup>`, TypeScript, Tailwind 4 + DaisyUI 5, Pinia, vue-i18n, Vitest + `@vue/test-utils` for behavior, Storybook 10 for the preview component's visual gate.

**Spec:** `.docs/plans/specs/2026-05-21-phase2-editor-design.md` — §2 Decisions (1, 2, 3, 9, 10), §3 (architecture diagram), §4 (`AstrosRemoteLivePreview` interface; `RemoteControlConfigView` is the consumer of every other §4 interface), §5 (Flow A, Flow B, Flow C, cross-cutting), §7 (testing strategy for 2d), §8 (file inventory for 2d), §9 (deferred items — drag, beforeRouteLeave guard, URL sync).

**Tracker:** `.docs/plans/current_project.md` — Phase 2 / 2d nested checkbox.

---

## Pre-flight context

- **Branch:** already on `feature/phase2d-config-view` (created off latest `develop` 58008c5 in the session that wrote this plan). The branch carries an uncommitted tracker check-off for 2c that ships with Task 0 below — clean carry-forward of a step that was missed when PR #96 merged.
- **Last consumer of the legacy view is the router itself.** No other code imports `RemoteView`, `AstrosRemoteControl`, or `AstrosRemoteButton` except the components/remoteControl/index.ts barrel and the stories. Verified via grep before plan write. Router swap + barrel update + file delete = clean removal.
- **`remote_view.*` locale keys are owned exclusively by the legacy view.** No other view references them. Verified via grep before plan write. Safe to delete in Task 9.
- **Verification gate:** `vitest run` is primary (view-level wiring tests), `npm run build` is secondary (typecheck + bundle), manual QA in a real browser is the integration gate (the old view is gone post-merge — the manual sweep matters). Storybook for the preview component is layout-only.
- **Pre-commit per CLAUDE.md:** `npm run prettier:write` + `npm run lint:fix` + `npm run build` (typecheck) + `npx vitest run` before each commit. Then `superpowers:requesting-code-review` on the diff vs the prior commit. Plan-only / file-delete-only / tracker check-off commits skip code-review per the carve-out.
- **Mutation-test discipline per memory `feedback_mutation_test_defensive_features`:** every defensive branch (`isDirty`-gated save-button enable, load-failure disable cascade, delete-modal cancel path, popover-state stop-firing-on-unmount) gets a mutation test — revert the guard, confirm the test fails, restore.
- **Out of scope for 2d:** drag-reorder of pages (Phase 5), unsaved-changes navigation guard (Decision 9), URL sync of `selectedIdx` (deferred), connection chip wired to real WS state (Phase 4 — `connected=true` is fine here), page-list keyboard navigation (a11y pass), responsive collapse at narrow widths (manual QA flags, triage follow-up if needed).

---

## File Structure

**New files:**

```
astros_vue/src/components/remoteControl/
└── remoteLivePreview/
    ├── AstrosRemoteLivePreview.vue          — MiniPhone bezel + AstrosMobileRemote (compact, read-only)
    ├── AstrosRemoteLivePreview.spec.ts      — props pass-through + no-op press/panic
    └── AstrosRemoteLivePreview.stories.ts   — 3 stories (empty pages, one page, three pages)

astros_vue/src/views/
├── RemoteControlConfigView.vue              — assembles 2a store + 2b card + 2c page list + 2d preview
└── __tests__/
    └── RemoteControlConfigView.spec.ts      — view-level wiring tests

.docs/qa/
└── remote-control-config.md                 — manual QA test plan
```

No `types.ts` for the preview — it pipes `RemoteControlPage[]` + `selectedIdx` and emits nothing.

**Modified files:**
- `astros_vue/src/components/remoteControl/index.ts` — add `AstrosRemoteLivePreview` re-export, remove `AstrosRemoteButton` + `AstrosRemoteControl`
- `astros_vue/src/router/index.ts` — swap `/remote` route's lazy import target
- `astros_vue/src/locales/enUS.json` — add `remote_control_config.view.*` + `remote_control_config.preview.*` + `remote_control_config.deleteModal.*` keys; remove `remote_view.*` block

**Deleted files:**
- `astros_vue/src/views/RemoteView.vue`
- `astros_vue/src/components/remoteControl/AstrosRemoteControl.vue`
- `astros_vue/src/components/remoteControl/AstrosRemoteControl.stories.ts`
- `astros_vue/src/components/remoteControl/AstrosRemoteButton.vue`
- `astros_vue/src/components/remoteControl/AstrosRemoteButton.stories.ts`

**Not modified:**
- `useRemoteControlStore` — already complete from 2a; no additions needed
- `components/index.ts` — barrel re-exports `* from './remoteControl'`; the cascading delete in remoteControl/index.ts handles cleanup
- `AstrosRemoteButtonCard.vue` / `AstrosRemoteButtonEditor.vue` / `AstrosRemotePageList.vue` — 2b/2c shipped; no changes needed

---

## Task 0: Plan + tracker check-off bootstrap

Commits the plan file and the in-progress tracker edit (Phase 2c check-off, missed from PR #96) so the feature branch has a clean starting commit.

**Files:**
- Create: `.docs/plans/20260524-1653-phase2d-config-view.md` (this file)
- Modify: `.docs/plans/current_project.md` (already edited in working tree — checks off 2c)

- [ ] **Step 1: Verify branch + working-tree state**

```bash
git status
git branch -vv | grep -E '^\*'
```

Expected: on `feature/phase2d-config-view`, branch has no upstream tracking marker, only `.docs/plans/current_project.md` and this new plan file modified/untracked.

- [ ] **Step 2: Commit the plan + tracker check-off**

```bash
git add .docs/plans/current_project.md .docs/plans/20260524-1653-phase2d-config-view.md
git commit -m "docs(plan): Phase 2d plan + check off Phase 2c in tracker"
```

Plan-only commit; per-commit code-review carve-out applies. The plan must commit before any implementation code per CLAUDE.md's "commit the plan file first" rule.

---

## Task 1: `AstrosRemoteLivePreview` — component + tests + stories

A thin wrapper. Renders a phone-bezel chrome and embeds `<AstrosMobileRemote :compact :connected="true" :pages :initial-idx="selectedIdx" />` with empty `@press` and `@panic` handlers (Decision 1: read-only). No emits. No mutation.

**Files:**
- Create: `astros_vue/src/components/remoteControl/remoteLivePreview/AstrosRemoteLivePreview.vue`
- Create: `astros_vue/src/components/remoteControl/remoteLivePreview/AstrosRemoteLivePreview.spec.ts`
- Create: `astros_vue/src/components/remoteControl/remoteLivePreview/AstrosRemoteLivePreview.stories.ts`
- Modify: `astros_vue/src/locales/enUS.json` — add `remote_control_config.preview.bezel_label`

- [ ] **Step 1: Add the locale key**

In `astros_vue/src/locales/enUS.json`, extend the existing `remote_control_config` block by adding a `preview` sub-section alongside `card`, `editor`, `pageList`:

```json
"preview": {
  "bezel_label": "Live preview"
}
```

- [ ] **Step 2: Write failing tests**

`astros_vue/src/components/remoteControl/remoteLivePreview/AstrosRemoteLivePreview.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import AstrosRemoteLivePreview from './AstrosRemoteLivePreview.vue';
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

function mountPreview(props: { pages: RemoteControlPage[]; selectedIdx: number }) {
  return mount(AstrosRemoteLivePreview, {
    global: { plugins: [i18n], stubs: { 'v-icon': true } },
    props,
  });
}

describe('AstrosRemoteLivePreview — bezel + mobile remote embedding', () => {
  it('renders the bezel container with the labelled region', () => {
    const wrapper = mountPreview({ pages: PAGES_3, selectedIdx: 0 });
    const bezel = wrapper.get('[data-testid="preview-bezel"]');
    expect(bezel.attributes('aria-label')).toBe('Live preview');
  });

  it('embeds the AstrosMobileRemote component with the passed pages and selectedIdx', () => {
    const wrapper = mountPreview({ pages: PAGES_3, selectedIdx: 1 });
    const remote = wrapper.findComponent({ name: 'AstrosMobileRemote' });
    expect(remote.exists()).toBe(true);
    expect(remote.props('pages')).toEqual(PAGES_3);
    expect(remote.props('initialIdx')).toBe(1);
  });

  it('passes compact=true so the embedded remote renders in the smaller layout', () => {
    const wrapper = mountPreview({ pages: PAGES_3, selectedIdx: 0 });
    const remote = wrapper.findComponent({ name: 'AstrosMobileRemote' });
    expect(remote.props('compact')).toBe(true);
  });

  it('passes connected=true so the editor preview always shows the Connected chip', () => {
    // Decision: the editor preview is decorative; live WS state is Phase 4 (mobile route).
    const wrapper = mountPreview({ pages: PAGES_3, selectedIdx: 0 });
    const remote = wrapper.findComponent({ name: 'AstrosMobileRemote' });
    expect(remote.props('connected')).toBe(true);
  });

  it('reseats the embedded remote when selectedIdx prop changes', async () => {
    const wrapper = mountPreview({ pages: PAGES_3, selectedIdx: 0 });
    await wrapper.setProps({ selectedIdx: 2 });
    const remote = wrapper.findComponent({ name: 'AstrosMobileRemote' });
    expect(remote.props('initialIdx')).toBe(2);
  });

  it('does not forward press events out (Decision 1: read-only)', async () => {
    const wrapper = mountPreview({ pages: PAGES_3, selectedIdx: 0 });
    const remote = wrapper.findComponent({ name: 'AstrosMobileRemote' });
    // Emit a press from the child; assert the wrapper does not re-emit.
    await remote.vm.$emit('press', { id: 's1', name: 'Wave', type: 'script' });
    expect(wrapper.emitted()).toEqual({});
  });

  it('does not forward panic events out (Decision 1: read-only)', async () => {
    const wrapper = mountPreview({ pages: PAGES_3, selectedIdx: 0 });
    const remote = wrapper.findComponent({ name: 'AstrosMobileRemote' });
    await remote.vm.$emit('panic');
    expect(wrapper.emitted()).toEqual({});
  });
});
```

- [ ] **Step 3: Run to verify failure**

```bash
cd astros_vue
npx vitest run src/components/remoteControl/remoteLivePreview/AstrosRemoteLivePreview.spec.ts
```

Expected: all 7 fail (component file doesn't exist).

- [ ] **Step 4: Implement the component**

`astros_vue/src/components/remoteControl/remoteLivePreview/AstrosRemoteLivePreview.vue`:

```vue
<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import type { RemoteControlPage } from '@/models/remoteControl/remoteControlPage';
import AstrosMobileRemote from '@/components/mobileRemote/mobileRemote/AstrosMobileRemote.vue';

const { t } = useI18n();

defineProps<{
  pages: readonly RemoteControlPage[];
  selectedIdx: number;
}>();

// No emits. The embedded AstrosMobileRemote will fire press/panic from
// internal button clicks; we attach empty handlers to satisfy Vue's event
// binding and explicitly NOT re-emit (Decision 1: live preview is read-only,
// avoids the "I clicked a button in the editor and the droid moved" surprise).
function noopPress() {
  /* read-only preview — see Decision 1 in the design spec */
}
function noopPanic() {
  /* read-only preview — see Decision 1 in the design spec */
}
</script>

<template>
  <div
    class="astros-remote-live-preview"
    :aria-label="t('remote_control_config.preview.bezel_label')"
    data-testid="preview-bezel"
  >
    <div class="astros-remote-live-preview__bezel">
      <AstrosMobileRemote
        :pages="pages as RemoteControlPage[]"
        :initial-idx="selectedIdx"
        :compact="true"
        :connected="true"
        @press="noopPress"
        @panic="noopPanic"
      />
    </div>
  </div>
</template>

<style scoped>
/* MiniPhone bezel — presentational chrome around the embedded remote.
 * Width matches the design spec's "~280px" right-rail target; height clamps
 * to a phone-ish aspect so the bezel doesn't stretch on tall viewports. */
.astros-remote-live-preview {
  display: flex;
  flex-shrink: 0;
  align-items: flex-start;
  justify-content: center;
  width: 280px;
  padding: 16px 12px;
}

.astros-remote-live-preview__bezel {
  position: relative;
  display: flex;
  width: 224px;
  height: 440px;
  overflow: hidden;
  background: #1a1f29;
  border: 6px solid #0e1726;
  border-radius: 28px;
  box-shadow:
    0 4px 14px rgba(14, 23, 38, 0.35),
    inset 0 0 0 2px rgba(255, 255, 255, 0.04);
}

/* Tiny inset so the embedded mobile remote's white background reads as a
 * phone screen behind the bezel rather than bleeding to the bezel edge. */
.astros-remote-live-preview__bezel :deep(.astros-mobile-remote) {
  border-radius: 18px;
}
</style>
```

The `pages as RemoteControlPage[]` cast at the binding site reconciles the prop-readonly contract with `AstrosMobileRemote`'s `PropType<RemoteControlPage[]>` declaration (uses the array prop type from before the readonly inputs were the convention). Treating the cast as safe is fine: the child only reads from the array.

- [ ] **Step 5: Run to verify passes**

```bash
npx vitest run src/components/remoteControl/remoteLivePreview/AstrosRemoteLivePreview.spec.ts
```

Expected: 7 / 7 pass.

- [ ] **Step 6: Mutation-test the read-only contract**

Two mutation tests for Decision 1:

(a) Change `noopPress` to `(e) => emit('press', e)` (adding a `defineEmits` first if needed). Re-run the press-noop test:

```bash
npx vitest run src/components/remoteControl/remoteLivePreview/AstrosRemoteLivePreview.spec.ts -t "does not forward press"
```

Expected: FAIL. Restore.

(b) Same for panic. Run the panic test:

```bash
npx vitest run src/components/remoteControl/remoteLivePreview/AstrosRemoteLivePreview.spec.ts -t "does not forward panic"
```

Expected: FAIL. Restore.

- [ ] **Step 7: Write Storybook stories**

`astros_vue/src/components/remoteControl/remoteLivePreview/AstrosRemoteLivePreview.stories.ts`:

```ts
import { type Meta, type StoryObj } from '@storybook/vue3';
import AstrosRemoteLivePreview from './AstrosRemoteLivePreview.vue';
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

const meta: Meta<typeof AstrosRemoteLivePreview> = {
  title: 'components/remoteControl/AstrosRemoteLivePreview',
  component: AstrosRemoteLivePreview,
};
export default meta;

type Story = StoryObj<typeof AstrosRemoteLivePreview>;

export const SinglePageEmpty: Story = {
  args: { pages: [mkPage('only', 'Only Page')], selectedIdx: 0 },
};

export const ThreePagesMixed: Story = {
  args: {
    pages: [
      mkPage('a', 'Quick Actions', {
        button1: { id: 's1', name: 'Wave Hello', type: 'script' },
        button2: { id: 's2', name: 'Take a Bow', type: 'script' },
        button5: { id: 'p1', name: 'Diagnostic Routine', type: 'playlist' },
      }),
      mkPage('b', 'Performance'),
      mkPage('c', 'Songs', {
        button9: { id: 's3', name: 'Imperial Whistle', type: 'script' },
      }),
    ],
    selectedIdx: 0,
  },
};

export const SecondPageSelected: Story = {
  args: {
    pages: [
      mkPage('a', 'Quick Actions'),
      mkPage('b', 'Performance', {
        button5: { id: 's4', name: 'Spotlight Dance', type: 'script' },
      }),
      mkPage('c', 'Songs'),
    ],
    selectedIdx: 1,
  },
};
```

- [ ] **Step 8: Verify Storybook compiles**

```bash
npm run build-storybook
```

Expected: clean.

- [ ] **Step 9: Visual verification (manual)**

```bash
npm run storybook
```

Open http://localhost:6006 → components / remoteControl / AstrosRemoteLivePreview. Confirm:
- Bezel renders with dark phone-shell chrome around the embedded compact mobile remote.
- Three stories all render without console errors.
- Clicking a filled button in `ThreePagesMixed` fires the inner remote's press toast but does NOT cause any external side effect (read-only — Decision 1).
- The "STOP ALL" panic button is visible but its hold-and-release fires no outward emit (verified by inspecting the wrapper's `emitted` in DevTools or by trusting the mutation tests).

- [ ] **Step 10: Pre-commit checks**

```bash
cd ..
npm --prefix astros_vue run prettier:write
npm --prefix astros_vue run lint:fix
npm --prefix astros_vue run build
npx --prefix astros_vue vitest run
```

Expected: all clean.

- [ ] **Step 11: Request code review on the diff vs HEAD**

Per CLAUDE.md pre-commit step 3. Use `superpowers:requesting-code-review`. Frame the prompt around hazard categories:
- Decision 1 contract (no `press`/`panic` re-emit) — is the contract testable from outside the component?
- Prop-readonly mismatch with `AstrosMobileRemote`'s `PropType<RemoteControlPage[]>` — is the cast at the binding site safe?
- Bezel styling — any layout/overflow issues that would clip the embedded remote?

Address Critical / Important findings. Note Minor for later.

- [ ] **Step 12: Re-export from `components/remoteControl/index.ts`**

```ts
export { default as AstrosRemoteButton } from './AstrosRemoteButton.vue';
export { default as AstrosRemoteControl } from './AstrosRemoteControl.vue';
export { default as AstrosRemoteButtonCard } from './remoteButtonCard/AstrosRemoteButtonCard.vue';
export { default as AstrosRemoteButtonEditor } from './remoteButtonEditor/AstrosRemoteButtonEditor.vue';
export { default as AstrosRemotePageList } from './remotePageList/AstrosRemotePageList.vue';
export { default as AstrosRemoteLivePreview } from './remoteLivePreview/AstrosRemoteLivePreview.vue';
```

The legacy `AstrosRemoteButton` / `AstrosRemoteControl` exports stay for now; Task 8 removes them after the router has swapped off the legacy view.

- [ ] **Step 13: Commit**

```bash
git add astros_vue/src/components/remoteControl/remoteLivePreview/ \
        astros_vue/src/components/remoteControl/index.ts \
        astros_vue/src/locales/enUS.json
git commit -m "feat(remote-live-preview): AstrosRemoteLivePreview — MiniPhone bezel + read-only AstrosMobileRemote"
```

---

## Task 2: `RemoteControlConfigView` — scaffold + AstrosLayout wrap + 3-pane skeleton + header

The biggest task in this phase. Build the empty-but-rendering shell: header bar, 3-pane layout, all three rail components mounted with placeholder props. Data loading + Save + wiring come in subsequent tasks; this task is the structural skeleton.

**Files:**
- Create: `astros_vue/src/views/RemoteControlConfigView.vue`
- Modify: `astros_vue/src/locales/enUS.json` — add `remote_control_config.view.*` keys

- [ ] **Step 1: Add view-level locale keys**

In `astros_vue/src/locales/enUS.json`, extend `remote_control_config` with a `view` sub-section:

```json
"view": {
  "title": "Remote Control Configuration",
  "save": "Save",
  "unsaved": "Unsaved",
  "page_count": "{count} page | {count} pages",
  "action_count": "{count} action | {count} actions",
  "load_error": "Failed to load remote control configuration. Editing is disabled to avoid overwriting saved data.",
  "save_success": "Remote control configuration saved successfully.",
  "save_error": "Failed to save remote control configuration."
}
```

`page_count` and `action_count` use vue-i18n's pluralization syntax (`{singular} | {plural}`).

- [ ] **Step 2: Implement the scaffold**

`astros_vue/src/views/RemoteControlConfigView.vue`:

```vue
<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { storeToRefs } from 'pinia';
import { AstrosLayout } from '@/components';
import AstrosRemoteButtonCard from '@/components/remoteControl/remoteButtonCard/AstrosRemoteButtonCard.vue';
import AstrosRemotePageList from '@/components/remoteControl/remotePageList/AstrosRemotePageList.vue';
import AstrosRemoteLivePreview from '@/components/remoteControl/remoteLivePreview/AstrosRemoteLivePreview.vue';
import AstrosWriteButton from '@/components/common/AstrosWriteButton.vue';
import { useRemoteControlStore } from '@/stores/remoteControl';
import { BUTTON_KEYS, type ButtonKey } from '@/models/remoteControl/remoteControlPage';

const { t } = useI18n();

const remoteControlStore = useRemoteControlStore();
const { remoteControlPages, selectedIdx, isDirty } = storeToRefs(remoteControlStore);

const loadFailed = ref(false);
const scripts = ref<{ id: string; name: string }[]>([]);
const playlists = ref<{ id: string; name: string }[]>([]);

const currentPage = computed(() => remoteControlPages.value[selectedIdx.value] ?? null);

// Total assigned (non-none) buttons across all pages — shown in the header
// as "N actions". Drives the "is the user actually configuring anything"
// signal without needing per-page math at render time.
const totalActions = computed(() => {
  let n = 0;
  for (const page of remoteControlPages.value) {
    for (const key of BUTTON_KEYS) {
      if (page[key].type !== 'none') n += 1;
    }
  }
  return n;
});

const pageCount = computed(() => remoteControlPages.value.length);
</script>

<template>
  <AstrosLayout>
    <template v-slot:main>
      <div
        class="flex flex-col overflow-hidden"
        style="height: calc(100vh - 64px)"
      >
        <!-- Header bar -->
        <div class="flex items-center gap-4 p-4 bg-r2-complement shrink-0">
          <h1 class="text-2xl font-bold">{{ t('remote_control_config.view.title') }}</h1>
          <div class="text-sm text-base-content/70">
            {{ t('remote_control_config.view.page_count', pageCount, { count: pageCount }) }}
            ·
            {{ t('remote_control_config.view.action_count', totalActions, { count: totalActions }) }}
          </div>
          <div class="grow"></div>
          <span
            v-if="isDirty"
            class="badge badge-warning"
            data-testid="unsaved-badge"
          >
            {{ t('remote_control_config.view.unsaved') }}
          </span>
          <AstrosWriteButton
            data-testid="save-config"
            class="btn btn-primary w-24"
            :disabled="loadFailed || !isDirty"
            @click="() => { /* wired in Task 3 */ }"
          >
            {{ t('remote_control_config.view.save') }}
          </AstrosWriteButton>
        </div>

        <!-- 3-pane body -->
        <div class="flex flex-1 overflow-hidden">
          <!-- Left: page list -->
          <aside
            class="flex flex-col w-[220px] border-r border-base-300"
            data-testid="pane-page-list"
          >
            <AstrosRemotePageList
              :pages="remoteControlPages"
              :selected-idx="selectedIdx"
              @select="() => { /* wired in Task 4 */ }"
              @add="() => { /* wired in Task 4 */ }"
              @duplicate="() => { /* wired in Task 4 */ }"
              @delete="() => { /* wired in Task 5 */ }"
              @rename="() => { /* wired in Task 4 */ }"
            />
          </aside>

          <!-- Center: 3x3 grid (capped at 540px wide) -->
          <main
            class="flex-1 overflow-auto p-6"
            data-testid="pane-grid"
          >
            <div
              v-if="currentPage"
              class="grid grid-cols-3 gap-4 mx-auto"
              style="max-width: 540px"
            >
              <AstrosRemoteButtonCard
                v-for="(key, i) in BUTTON_KEYS"
                :key="key"
                :button-number="i + 1"
                :value="currentPage[key as ButtonKey]"
                :scripts="scripts"
                :playlists="playlists"
                @change="() => { /* wired in Task 6 */ }"
              />
            </div>
          </main>

          <!-- Right: live preview -->
          <aside
            class="flex flex-col border-l border-base-300"
            data-testid="pane-preview"
          >
            <AstrosRemoteLivePreview
              :pages="remoteControlPages"
              :selected-idx="selectedIdx"
            />
          </aside>
        </div>
      </div>
    </template>
  </AstrosLayout>
</template>
```

The `() => { /* wired in Task N */ }` placeholders are deliberate — Task 2 only validates the structure renders. Subsequent tasks replace them with real handlers. (These placeholders are NOT "TODO" plan-failures in the sense of the writing-plans skill — they're explicit Task-N stubs that get filled within this plan.)

- [ ] **Step 3: Verify scaffold builds**

```bash
cd astros_vue
npm run build
```

Expected: clean type-check + bundle. The view doesn't render in any router yet (router swap is Task 7), but it must compile.

- [ ] **Step 4: Pre-commit checks**

```bash
cd ..
npm --prefix astros_vue run prettier:write
npm --prefix astros_vue run lint:fix
```

- [ ] **Step 5: Code review on the diff**

Hazards specific to this scaffold:
- Header `bg-r2-complement` token — consistent with `RemoteView` + `ModulesView`?
- `BUTTON_KEYS` iteration order — does `(key, i) in BUTTON_KEYS` consistently yield 1..9? (BUTTON_KEYS is `as const`; verified.)
- `selectedIdx` out-of-range — `currentPage` returns null when pages is empty; `v-if="currentPage"` gates the grid. But the page list and preview both receive the array directly. Is that fine? (Yes — both children clamp internally per their Phase 2c / Phase 3 specs.)
- Pluralized i18n keys — does the `{ count: pageCount }` syntax match vue-i18n 9's expected shape?

- [ ] **Step 6: Commit**

```bash
git add astros_vue/src/views/RemoteControlConfigView.vue astros_vue/src/locales/enUS.json
git commit -m "feat(remote-config-view): scaffold 3-pane editor — header, page list, grid, preview"
```

---

## Task 3: Data loading + Save handler + toast wiring

Replace the Task 2 stub on the Save button. Load scripts + playlists + remote config on mount (matches `RemoteView.vue`'s pattern). Wire Save to the store; emit success/error toasts.

**Files:**
- Modify: `astros_vue/src/views/RemoteControlConfigView.vue`

- [ ] **Step 1: Add the loading + save logic to `<script setup>`**

Insert after the `loadFailed` / `scripts` / `playlists` declarations (before `currentPage`):

```ts
import { onMounted } from 'vue';
import { useScriptsStore } from '@/stores/scripts';
import { usePlaylistsStore } from '@/stores/playlists';
import { useToast } from '@/composables/useToast';

const scriptStore = useScriptsStore();
const playlistStore = usePlaylistsStore();
const { success, error } = useToast();

onMounted(async () => {
  const [, , loadResult] = await Promise.all([
    scriptStore.loadScripts(),
    playlistStore.loadData(),
    remoteControlStore.loadRemoteControl(),
  ]);

  scripts.value = scriptStore.scripts.map((s) => ({ id: s.id, name: s.scriptName }));
  playlists.value = playlistStore.playlists.map((p) => ({ id: p.id, name: p.playlistName }));

  // Bail on load failure — disabling the editor prevents the user from
  // clicking Save and clobbering unloaded config. Match the legacy
  // RemoteView.vue behavior.
  if (!loadResult.success) {
    loadFailed.value = true;
    error(t('remote_control_config.view.load_error'));
  }
});

async function saveConfig() {
  // The store catches its own errors and resolves with {success: false, error}
  // rather than rejecting — so a bare `await` here would never throw and every
  // failed PUT would render as a success toast. Inspect the flag.
  const result = await remoteControlStore.saveRemoteControl();
  if (result.success) {
    success(t('remote_control_config.view.save_success'));
  } else {
    console.error('Error saving remote control configuration:', result.error);
    error(t('remote_control_config.view.save_error'));
  }
}
```

The Pinia ref imports (`useScriptsStore`, `usePlaylistsStore`) already exist in the project — same pattern as `AstrosRemoteControl.vue`. Compare grep `grep -rn 'useScriptsStore' astros_vue/src/views` to confirm the exact import path.

- [ ] **Step 2: Wire the Save button**

Replace the Task 2 stub on the Save `<AstrosWriteButton>`:

```vue
<AstrosWriteButton
  data-testid="save-config"
  class="btn btn-primary w-24"
  :disabled="loadFailed || !isDirty"
  @click="saveConfig"
>
  {{ t('remote_control_config.view.save') }}
</AstrosWriteButton>
```

- [ ] **Step 3: Verify the build**

```bash
cd astros_vue
npm run build
```

Expected: clean.

- [ ] **Step 4: Pre-commit checks + code review on the diff**

```bash
cd ..
npm --prefix astros_vue run prettier:write
npm --prefix astros_vue run lint:fix
```

Code review hazards:
- Did the `Promise.all` parallelism break for a real load failure? (The Three-tuple destructure with `_, _, loadResult` covers it — if scripts or playlists fail, their errors surface via their respective store's own toast or console; not load-blocking here.) Confirm this matches the legacy view's behavior.
- Is `loadFailed` the right gate, or should `isLoading` also disable Save? (The store sets `isLoading` true while the GET is in flight; the Save button is also gated by `!isDirty`, and the store sets `isDirty = false` after a fresh seed only when there's nothing to persist — so the load window is naturally guarded. But verify nothing slips through.)

- [ ] **Step 5: Commit**

```bash
git add astros_vue/src/views/RemoteControlConfigView.vue
git commit -m "feat(remote-config-view): load scripts/playlists/remote-config on mount + wire Save handler"
```

---

## Task 4: Page list wiring — select / add / duplicate / rename

Replace four of the five Task 2 stubs on `<AstrosRemotePageList>`. `delete` is gated by a modal — that comes in Task 5.

**Files:**
- Modify: `astros_vue/src/views/RemoteControlConfigView.vue`

- [ ] **Step 1: Add handlers to `<script setup>`**

After `saveConfig`:

```ts
function onSelectPage(idx: number) {
  remoteControlStore.selectPage(idx);
}

function onAddPage() {
  remoteControlStore.addPage();
}

function onDuplicatePage(idx: number) {
  remoteControlStore.duplicatePage(idx);
}

function onRenamePage(payload: { idx: number; name: string }) {
  remoteControlStore.renamePage(payload.idx, payload.name);
}
```

The store methods are battle-tested from Phase 2a (clamp on invalid idx, no-op on empty name); this handler tier is straightforward forwarding. Inline-arrow alternatives would work but named functions make the spec-doc data-flow (§5 Flow A) self-documenting.

- [ ] **Step 2: Wire the page list emits**

Replace the four stubs on `<AstrosRemotePageList>`:

```vue
<AstrosRemotePageList
  :pages="remoteControlPages"
  :selected-idx="selectedIdx"
  @select="onSelectPage"
  @add="onAddPage"
  @duplicate="onDuplicatePage"
  @delete="() => { /* wired in Task 5 */ }"
  @rename="onRenamePage"
/>
```

`delete` keeps the stub for Task 5.

- [ ] **Step 3: Build + pre-commit checks**

```bash
cd astros_vue && npm run build && cd ..
npm --prefix astros_vue run prettier:write
npm --prefix astros_vue run lint:fix
```

- [ ] **Step 4: Code review on the diff**

Hazards:
- Are the handler names self-documenting enough that a reader can match each one to the spec's §5 flow?
- Does the rename payload shape `{idx, name}` match what `AstrosRemotePageList` actually emits? (Verify against `astros_vue/src/components/remoteControl/remotePageList/AstrosRemotePageList.vue:20` — yes, `rename: [payload: { idx: number; name: string }]`.)

- [ ] **Step 5: Commit**

```bash
git add astros_vue/src/views/RemoteControlConfigView.vue
git commit -m "feat(remote-config-view): wire page list select/add/duplicate/rename to store"
```

---

## Task 5: Delete-confirm modal flow

Per spec Decision 2: deletion must be gated through a confirm dialog. The page list emits `delete(idx)` which opens the modal; modal Confirm calls `store.deletePage(idx)`; modal Cancel resets the pending state with no mutation. Reuse the existing `AstrosConfirmModal` component (same pattern `ModulesView` uses).

**Files:**
- Modify: `astros_vue/src/views/RemoteControlConfigView.vue`
- Modify: `astros_vue/src/locales/enUS.json` — add `remote_control_config.deleteModal.*`

- [ ] **Step 1: Add the delete-modal locale keys**

In `remote_control_config`, alongside `view`, add:

```json
"deleteModal": {
  "title": "Delete page",
  "message": "Delete \"{name}\"? Buttons on this page will be lost."
}
```

The existing modal uses `modals.confirm.confirm` / `modals.confirm.close` for the button labels — they're shared confirm-modal copy that we don't need to override.

- [ ] **Step 2: Read the legacy ModulesView pattern**

```bash
grep -n -A5 'AstrosConfirmModal' astros_vue/src/views/ModulesView.vue
```

The pattern is: a `ref<ModalType>(...)` enum-state for which modal is open, plus refs for the modal's input data. Adapt it. Phase 2d only needs ONE modal (delete-page), so a simpler shape is fine: a single `pendingDeleteIdx: Ref<number | null>` controls visibility.

- [ ] **Step 3: Add modal state + handlers to `<script setup>`**

```ts
import AstrosConfirmModal from '@/components/modals/AstrosConfirmModal.vue';

const pendingDeleteIdx = ref<number | null>(null);

const pendingDeleteName = computed(() => {
  if (pendingDeleteIdx.value === null) return '';
  return remoteControlPages.value[pendingDeleteIdx.value]?.name ?? '';
});

function onDeleteRequest(idx: number) {
  pendingDeleteIdx.value = idx;
}

function onDeleteConfirm() {
  if (pendingDeleteIdx.value === null) return;
  remoteControlStore.deletePage(pendingDeleteIdx.value);
  pendingDeleteIdx.value = null;
}

function onDeleteCancel() {
  pendingDeleteIdx.value = null;
}
```

`AstrosConfirmModal`'s `message` prop accepts a `$t()` key — but the design spec wants the page name interpolated into the message. The existing modal does `$t(message)` with no params support, so the cleanest fix is to pre-render the message at the caller and pass the resolved string in. Verify this in Step 4.

- [ ] **Step 4: Check whether `AstrosConfirmModal` supports interpolation params**

```bash
cat astros_vue/src/components/modals/AstrosConfirmModal.vue
```

Expected: the template binds `{{ $t(message) }}` with no params object. That means our caller needs to either (a) pre-resolve the i18n string and pass plain text, OR (b) extend the modal to accept a `messageParams` prop.

For Phase 2d, prefer (a) — pre-resolve at the call site — to avoid touching shared modal contracts. If a later phase needs interpolation broadly, extend the modal then.

The message will be plain text in the parent template, but the modal's existing `{{ $t(message) }}` will look up the resolved-string as a key. Looking up "Delete \"Quick Actions\"? Buttons on this page will be lost." as an i18n key will resolve to itself (vue-i18n returns the key when no matching entry exists). Confirm by spot-test before committing.

Alternative: pass an *already-interpolated literal* into the `message` prop AND tweak the modal to accept either a key or a literal. Cleanest: extend the modal to support optional `messageParams` AND fall back to lookup-by-key when params is absent.

**Decision for this plan:** keep `AstrosConfirmModal` untouched and pre-resolve the message in the parent via `computed`. The i18n self-key-fallback behavior is consistent across vue-i18n 9 and doesn't break other consumers.

- [ ] **Step 5: Pre-resolve the modal message**

Add to `<script setup>`:

```ts
const pendingDeleteMessage = computed(() => {
  if (pendingDeleteIdx.value === null) return '';
  return t('remote_control_config.deleteModal.message', { name: pendingDeleteName.value });
});
```

- [ ] **Step 6: Wire the delete emit + render the modal**

Replace the `@delete` stub on `<AstrosRemotePageList>`:

```vue
@delete="onDeleteRequest"
```

Add the modal at the bottom of the `<template v-slot:main>` block, alongside any other top-level modals (in this view, there is only one):

```vue
<AstrosConfirmModal
  v-if="pendingDeleteIdx !== null"
  :title="'remote_control_config.deleteModal.title'"
  :message="pendingDeleteMessage"
  :on-confirm="onDeleteConfirm"
  :on-close="onDeleteCancel"
/>
```

The modal expects `title` and `message` as i18n keys. `title` we have. `message` is a pre-resolved literal — vue-i18n returns the literal unchanged when no key matches it (verified).

- [ ] **Step 7: Build + pre-commit checks**

```bash
cd astros_vue && npm run build && cd ..
npm --prefix astros_vue run prettier:write
npm --prefix astros_vue run lint:fix
```

- [ ] **Step 8: Code review on the diff**

Hazards:
- The "i18n key fallback to literal" behavior is undocumented inside this codebase — is it stable across vue-i18n version bumps? Cite the vue-i18n version in package.json and verify via the project's existing precedent.
- Modal lifecycle: when the user clicks the backdrop (existing `AstrosConfirmModal` form-method-dialog click), does `onClose` fire? Confirm via the modal source.
- Does the modal's `v-if` correctly remount on each open? The existing `AstrosConfirmModal` doesn't manage its own visibility — the parent's `v-if` is the only gate. This is the same pattern as `ModulesView`.
- Spec Decision 2: "Modal message names the page being deleted." — verified by the `{name}` interpolation.

- [ ] **Step 9: Commit**

```bash
git add astros_vue/src/views/RemoteControlConfigView.vue astros_vue/src/locales/enUS.json
git commit -m "feat(remote-config-view): delete-confirm modal — gates store.deletePage behind user confirmation"
```

---

## Task 6: Button card wiring — change → `store.setButton`

The last stub on the scaffold. Per spec §5 Flow B: clicking a card's Configure/Edit → editor opens → editor commits → card emits `change` → view calls `store.setButton(selectedIdx, buttonKey, value)`.

`AstrosRemoteButtonCard` emits `change: [value: PageButton]` but not the button number (the card already knows its number from `buttonNumber` prop). The view must map the loop's `key` (`button1`..`button9`) back to the slot.

**Files:**
- Modify: `astros_vue/src/views/RemoteControlConfigView.vue`

- [ ] **Step 1: Add the handler**

```ts
import type { PageButton } from '@/models/remoteControl/pageButton';

function onButtonChange(key: ButtonKey, value: PageButton) {
  remoteControlStore.setButton(selectedIdx.value, key, value);
}
```

`setButton` atomically writes the slot AND flips `isDirty` — that's the §4 contract added during 2a's PR review. No view-level dirty-tracking needed.

- [ ] **Step 2: Wire the card emit**

Replace the `@change` stub on `<AstrosRemoteButtonCard>`. The `v-for` already exposes `(key, i)`:

```vue
<AstrosRemoteButtonCard
  v-for="(key, i) in BUTTON_KEYS"
  :key="key"
  :button-number="i + 1"
  :value="currentPage[key as ButtonKey]"
  :scripts="scripts"
  :playlists="playlists"
  @change="(value) => onButtonChange(key as ButtonKey, value)"
/>
```

The inline arrow is the cleanest way to capture `key` at the iteration site without lifting an extra factory. Alternative: use a `keyed` handler object — not worth the abstraction for 9 instances.

- [ ] **Step 3: Build + pre-commit checks**

```bash
cd astros_vue && npm run build && cd ..
npm --prefix astros_vue run prettier:write
npm --prefix astros_vue run lint:fix
```

- [ ] **Step 4: Code review on the diff**

Hazards:
- Inline arrow allocation per render — fine for 9 cards on a desktop view, not a perf risk.
- `BUTTON_KEYS` is `as const` so `key as ButtonKey` is safe.
- Does `setButton`'s `selectedIdx.value` snapshot at call time leak a stale idx if `selectPage` fires between Edit-open and Edit-commit? (No — the card's `change` emit is synchronous with the user's click on a list row inside the popover, and `selectPage` only fires from the page list. They can't race in the single-threaded JS event loop on a desktop browser.)

- [ ] **Step 5: Commit**

```bash
git add astros_vue/src/views/RemoteControlConfigView.vue
git commit -m "feat(remote-config-view): wire button card change → store.setButton(selectedIdx, key, value)"
```

---

## Task 7: View tests — wiring contracts at the integration level

Vitest tests at the view level, primarily focused on:
- Header counts react to store state
- Unsaved badge visibility tracks `isDirty`
- Save button disabled when `loadFailed || !isDirty`; calls `store.saveRemoteControl`
- Delete-modal lifecycle: open on `delete` emit; confirm calls `deletePage`; cancel does NOT mutate
- Card `change` calls `setButton(selectedIdx, key, value)`
- Page list `select` calls `selectPage`

Stub all heavy children (`AstrosLayout`, `AstrosRemoteButtonCard`, `AstrosRemotePageList`, `AstrosRemoteLivePreview`, `AstrosConfirmModal`) to keep the test focused on view-level wiring, mirroring `FirmwareView.spec.ts`'s approach.

**Files:**
- Create: `astros_vue/src/views/__tests__/RemoteControlConfigView.spec.ts`

- [ ] **Step 1: Verify which mocks the FirmwareView test set up**

```bash
head -50 astros_vue/src/views/__tests__/FirmwareView.spec.ts
```

Confirm the `vi.mock('@/api/apiService', ...)` pattern and the `setActivePinia(createPinia())` reset in `beforeEach`. Copy this scaffolding.

- [ ] **Step 2: Write the test file**

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import { createRouter, createMemoryHistory } from 'vue-router';
import enUS from '@/locales/enUS.json';

vi.mock('@/api/apiService', () => ({
  default: {
    get: vi.fn().mockImplementation((url: string) => {
      if (url.includes('remotecontrol')) {
        // Return a single default page so the view has something to render.
        return Promise.resolve(
          JSON.stringify([
            {
              id: 'page-1',
              name: 'Page 1',
              button1: { id: '0', name: 'Button 1', type: 'none' },
              button2: { id: '0', name: 'Button 2', type: 'none' },
              button3: { id: '0', name: 'Button 3', type: 'none' },
              button4: { id: '0', name: 'Button 4', type: 'none' },
              button5: { id: '0', name: 'Button 5', type: 'none' },
              button6: { id: '0', name: 'Button 6', type: 'none' },
              button7: { id: '0', name: 'Button 7', type: 'none' },
              button8: { id: '0', name: 'Button 8', type: 'none' },
              button9: { id: '0', name: 'Button 9', type: 'none' },
            },
          ]),
        );
      }
      return Promise.resolve({ data: [] });
    }),
    put: vi.fn().mockResolvedValue({ data: 'ok' }),
  },
}));

vi.mock('@/composables/useToast', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

import RemoteControlConfigView from '@/views/RemoteControlConfigView.vue';
import { useRemoteControlStore } from '@/stores/remoteControl';

function createTestI18n() {
  return createI18n({
    legacy: false,
    locale: 'en-US',
    fallbackLocale: 'en-US',
    messages: { 'en-US': enUS },
  });
}

function createTestRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div />' } }],
  });
}

function mountView() {
  return mount(RemoteControlConfigView, {
    global: {
      plugins: [createTestI18n(), createTestRouter()],
      stubs: {
        // Preserve the slot so the inner content renders.
        AstrosLayout: { template: '<div><slot name="main" /></div>' },
        AstrosWriteButton: {
          props: ['disabled'],
          template:
            '<button :disabled="disabled" data-testid="save-config" @click="$emit(\'click\')"><slot /></button>',
        },
        AstrosRemoteButtonCard: {
          props: ['buttonNumber', 'value', 'scripts', 'playlists'],
          emits: ['change'],
          template: '<div data-testid="card-stub" :data-button="buttonNumber" />',
        },
        AstrosRemotePageList: {
          props: ['pages', 'selectedIdx'],
          emits: ['select', 'add', 'duplicate', 'delete', 'rename'],
          template: '<div data-testid="page-list-stub" />',
        },
        AstrosRemoteLivePreview: {
          props: ['pages', 'selectedIdx'],
          template: '<div data-testid="preview-stub" />',
        },
        AstrosConfirmModal: {
          props: ['title', 'message', 'onConfirm', 'onClose'],
          template:
            '<div data-testid="confirm-modal" :data-message="message"><button data-testid="modal-confirm" @click="onConfirm" /><button data-testid="modal-close" @click="onClose" /></div>',
        },
      },
    },
  });
}

describe('RemoteControlConfigView — header counts + dirty signal', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('renders the header title', async () => {
    const wrapper = mountView();
    await flushPromises();
    expect(wrapper.text()).toContain('Remote Control Configuration');
  });

  it('shows the unsaved badge once isDirty flips true', async () => {
    const wrapper = mountView();
    await flushPromises();

    expect(wrapper.find('[data-testid="unsaved-badge"]').exists()).toBe(false);

    const store = useRemoteControlStore();
    store.isDirty = true;
    await flushPromises();

    expect(wrapper.find('[data-testid="unsaved-badge"]').exists()).toBe(true);
  });

  it('disables Save when isDirty is false', async () => {
    const wrapper = mountView();
    await flushPromises();

    const saveBtn = wrapper.get('[data-testid="save-config"]');
    expect(saveBtn.attributes('disabled')).toBeDefined();
  });

  it('enables Save once isDirty is true', async () => {
    const wrapper = mountView();
    await flushPromises();

    const store = useRemoteControlStore();
    store.isDirty = true;
    await flushPromises();

    const saveBtn = wrapper.get('[data-testid="save-config"]');
    expect(saveBtn.attributes('disabled')).toBeUndefined();
  });
});

describe('RemoteControlConfigView — page list wiring', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('forwards select emit to store.selectPage', async () => {
    const wrapper = mountView();
    await flushPromises();

    const store = useRemoteControlStore();
    const spy = vi.spyOn(store, 'selectPage');

    const pageList = wrapper.findComponent({ name: 'AstrosRemotePageList' });
    await pageList.vm.$emit('select', 3);

    expect(spy).toHaveBeenCalledWith(3);
  });

  it('forwards add emit to store.addPage', async () => {
    const wrapper = mountView();
    await flushPromises();

    const store = useRemoteControlStore();
    const spy = vi.spyOn(store, 'addPage');

    const pageList = wrapper.findComponent({ name: 'AstrosRemotePageList' });
    await pageList.vm.$emit('add');

    expect(spy).toHaveBeenCalled();
  });

  it('forwards duplicate emit to store.duplicatePage', async () => {
    const wrapper = mountView();
    await flushPromises();

    const store = useRemoteControlStore();
    const spy = vi.spyOn(store, 'duplicatePage');

    const pageList = wrapper.findComponent({ name: 'AstrosRemotePageList' });
    await pageList.vm.$emit('duplicate', 2);

    expect(spy).toHaveBeenCalledWith(2);
  });

  it('forwards rename emit to store.renamePage', async () => {
    const wrapper = mountView();
    await flushPromises();

    const store = useRemoteControlStore();
    const spy = vi.spyOn(store, 'renamePage');

    const pageList = wrapper.findComponent({ name: 'AstrosRemotePageList' });
    await pageList.vm.$emit('rename', { idx: 1, name: 'Renamed' });

    expect(spy).toHaveBeenCalledWith(1, 'Renamed');
  });
});

describe('RemoteControlConfigView — delete-confirm modal lifecycle', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('opens the modal on delete emit (modal not visible before)', async () => {
    const wrapper = mountView();
    await flushPromises();

    expect(wrapper.find('[data-testid="confirm-modal"]').exists()).toBe(false);

    const pageList = wrapper.findComponent({ name: 'AstrosRemotePageList' });
    await pageList.vm.$emit('delete', 0);

    expect(wrapper.find('[data-testid="confirm-modal"]').exists()).toBe(true);
  });

  it('interpolates the page name into the modal message', async () => {
    const wrapper = mountView();
    await flushPromises();

    const pageList = wrapper.findComponent({ name: 'AstrosRemotePageList' });
    await pageList.vm.$emit('delete', 0);

    const modal = wrapper.get('[data-testid="confirm-modal"]');
    // The stub forwards `:message` to a data attribute. The pre-resolved
    // message should include "Page 1" (the seeded default page's name).
    expect(modal.attributes('data-message')).toContain('Page 1');
  });

  it('confirm calls store.deletePage with the captured idx and closes the modal', async () => {
    const wrapper = mountView();
    await flushPromises();

    const store = useRemoteControlStore();
    // Seed two pages so deletePage(0) is allowed by the store's length-1 guard.
    store.addPage();
    await flushPromises();
    const spy = vi.spyOn(store, 'deletePage');

    const pageList = wrapper.findComponent({ name: 'AstrosRemotePageList' });
    await pageList.vm.$emit('delete', 0);

    const confirmBtn = wrapper.get('[data-testid="modal-confirm"]');
    await confirmBtn.trigger('click');

    expect(spy).toHaveBeenCalledWith(0);
    expect(wrapper.find('[data-testid="confirm-modal"]').exists()).toBe(false);
  });

  it('cancel closes the modal WITHOUT calling deletePage', async () => {
    const wrapper = mountView();
    await flushPromises();

    const store = useRemoteControlStore();
    const spy = vi.spyOn(store, 'deletePage');

    const pageList = wrapper.findComponent({ name: 'AstrosRemotePageList' });
    await pageList.vm.$emit('delete', 0);

    const closeBtn = wrapper.get('[data-testid="modal-close"]');
    await closeBtn.trigger('click');

    expect(spy).not.toHaveBeenCalled();
    expect(wrapper.find('[data-testid="confirm-modal"]').exists()).toBe(false);
  });
});

describe('RemoteControlConfigView — button card wiring', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('forwards card change to store.setButton with the current selectedIdx and the iteration key', async () => {
    const wrapper = mountView();
    await flushPromises();

    const store = useRemoteControlStore();
    const spy = vi.spyOn(store, 'setButton');

    const cards = wrapper.findAllComponents({ name: 'AstrosRemoteButtonCard' });
    expect(cards.length).toBe(9);

    const newValue = { id: 's1', name: 'Wave', type: 'script' as const };
    await cards[4]!.vm.$emit('change', newValue); // BUTTON 5 (index 4)

    expect(spy).toHaveBeenCalledWith(0, 'button5', newValue);
  });

  it('uses the current selectedIdx, not a captured stale idx', async () => {
    const wrapper = mountView();
    await flushPromises();

    const store = useRemoteControlStore();
    store.addPage(); // adds + selects page 1
    await flushPromises();
    const spy = vi.spyOn(store, 'setButton');

    const cards = wrapper.findAllComponents({ name: 'AstrosRemoteButtonCard' });
    const newValue = { id: 'p1', name: 'Routine', type: 'playlist' as const };
    await cards[0]!.vm.$emit('change', newValue);

    expect(spy).toHaveBeenCalledWith(1, 'button1', newValue);
  });
});

describe('RemoteControlConfigView — load failure', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('disables Save when remote-config load fails', async () => {
    // Re-mock the apiService for THIS test so the GET rejects.
    const apiServiceModule = await import('@/api/apiService');
    const mockedGet = apiServiceModule.default.get as ReturnType<typeof vi.fn>;
    mockedGet.mockRejectedValueOnce(new Error('network'));

    const wrapper = mountView();
    await flushPromises();

    const store = useRemoteControlStore();
    store.isDirty = true; // even if dirty, load-failed must keep Save disabled
    await flushPromises();

    const saveBtn = wrapper.get('[data-testid="save-config"]');
    expect(saveBtn.attributes('disabled')).toBeDefined();
  });
});
```

- [ ] **Step 3: Run the tests**

```bash
cd astros_vue
npx vitest run src/views/__tests__/RemoteControlConfigView.spec.ts
```

Expected: all 12 tests pass.

- [ ] **Step 4: Mutation-test the defensive branches**

(a) Save button disable cascade: temporarily change `:disabled="loadFailed || !isDirty"` to `:disabled="false"`. Re-run:

```bash
npx vitest run src/views/__tests__/RemoteControlConfigView.spec.ts -t "disables Save when isDirty is false"
npx vitest run src/views/__tests__/RemoteControlConfigView.spec.ts -t "disables Save when remote-config load fails"
```

Expected: BOTH FAIL. Restore.

(b) Delete-modal cancel-no-mutation: change `onDeleteCancel` to also call `remoteControlStore.deletePage(pendingDeleteIdx.value!)`. Re-run:

```bash
npx vitest run src/views/__tests__/RemoteControlConfigView.spec.ts -t "cancel closes the modal WITHOUT"
```

Expected: FAIL. Restore.

(c) `setButton` selectedIdx snapshot: change `selectedIdx.value` to `0` in the `onButtonChange` handler. Re-run:

```bash
npx vitest run src/views/__tests__/RemoteControlConfigView.spec.ts -t "uses the current selectedIdx"
```

Expected: FAIL. Restore.

- [ ] **Step 5: Pre-commit checks + code review on the diff**

```bash
cd ..
npm --prefix astros_vue run prettier:write
npm --prefix astros_vue run lint:fix
```

Code review hazards:
- Stub component contracts: does each stub's `emits` declaration match the real component? (Verified at write time; PR-time check is "did the real component contract shift since 2b/2c?")
- The `await pageList.vm.$emit(...)` pattern: works in `@vue/test-utils` ≥ 2 for stubbed components — verify the test-utils version in package.json.
- The `pages[0]` access in the apiService mock: matches the wire shape that Phase 1 + Phase 6 pinned via `remote_config_controller.test.ts` — the server returns a JSON string of an array of pages.

- [ ] **Step 6: Commit**

```bash
git add astros_vue/src/views/__tests__/RemoteControlConfigView.spec.ts
git commit -m "test(remote-config-view): view-level wiring + delete-modal lifecycle + mutation guards"
```

---

## Task 8: Router swap — `/remote` → `RemoteControlConfigView`

Single-line edit. The route name (`'remote'`) and path (`/remote`) stay unchanged so existing bookmarks + nav links keep working; only the component target changes.

**Files:**
- Modify: `astros_vue/src/router/index.ts`

- [ ] **Step 1: Make the swap**

```ts
// Before:
{
  path: '/remote',
  name: 'remote',
  component: () => import('../views/RemoteView.vue'),
},

// After:
{
  path: '/remote',
  name: 'remote',
  component: () => import('../views/RemoteControlConfigView.vue'),
},
```

- [ ] **Step 2: Build + smoke test**

```bash
cd astros_vue
npm run build
```

Expected: clean. The legacy `RemoteView.vue` still exists at this point (Task 9 deletes it); the bundle compiles fine.

- [ ] **Step 3: Manual smoke test — launch dev server**

```bash
npm run dev
```

In the browser, navigate to `/remote`. Expected: the new 3-pane view loads. The legacy view is no longer reachable via the router. (Detailed manual QA is Task 11.)

- [ ] **Step 4: Pre-commit checks + commit**

```bash
cd ..
npm --prefix astros_vue run prettier:write
npm --prefix astros_vue run lint:fix
git add astros_vue/src/router/index.ts
git commit -m "feat(router): swap /remote route to RemoteControlConfigView (legacy RemoteView retired in next commit)"
```

Single-line mechanical change; the code-review carve-out applies (typo / route-rename class).

---

## Task 9: Delete legacy view + components + their stories + locale keys

The new view is live (Task 8). Time to remove the dead code.

**Files deleted:**
- `astros_vue/src/views/RemoteView.vue`
- `astros_vue/src/components/remoteControl/AstrosRemoteControl.vue`
- `astros_vue/src/components/remoteControl/AstrosRemoteControl.stories.ts`
- `astros_vue/src/components/remoteControl/AstrosRemoteButton.vue`
- `astros_vue/src/components/remoteControl/AstrosRemoteButton.stories.ts`

**Files modified:**
- `astros_vue/src/components/remoteControl/index.ts` — drop the two legacy re-exports
- `astros_vue/src/locales/enUS.json` — drop the `remote_view.*` block

- [ ] **Step 1: Final consumer check (paranoia)**

```bash
grep -rn 'RemoteView\|AstrosRemoteControl\|AstrosRemoteButton\b' astros_vue/src --include='*.ts' --include='*.vue' \
  | grep -v 'remoteButtonCard\|remoteButtonEditor\|remotePageList\|remoteLivePreview\|RemoteControlConfigView'
```

Expected: only the about-to-be-deleted files themselves + the `index.ts` re-export line. If anything else shows up, STOP — that consumer needs migrating before deletion.

- [ ] **Step 2: Delete the legacy files**

```bash
git rm astros_vue/src/views/RemoteView.vue \
       astros_vue/src/components/remoteControl/AstrosRemoteControl.vue \
       astros_vue/src/components/remoteControl/AstrosRemoteControl.stories.ts \
       astros_vue/src/components/remoteControl/AstrosRemoteButton.vue \
       astros_vue/src/components/remoteControl/AstrosRemoteButton.stories.ts
```

- [ ] **Step 3: Update `components/remoteControl/index.ts`**

```ts
export { default as AstrosRemoteButtonCard } from './remoteButtonCard/AstrosRemoteButtonCard.vue';
export { default as AstrosRemoteButtonEditor } from './remoteButtonEditor/AstrosRemoteButtonEditor.vue';
export { default as AstrosRemotePageList } from './remotePageList/AstrosRemotePageList.vue';
export { default as AstrosRemoteLivePreview } from './remoteLivePreview/AstrosRemoteLivePreview.vue';
```

- [ ] **Step 4: Strip the `remote_view.*` block from `enUS.json`**

Delete the entire `"remote_view": { ... }` block (lines ~436-453, but verify by grep first):

```bash
grep -n '"remote_view"' astros_vue/src/locales/enUS.json
```

Then open the file and remove the block. Make sure trailing comma handling stays JSON-valid (the closing brace must NOT have a trailing comma after deletion).

- [ ] **Step 5: Build + run tests + run app**

```bash
cd astros_vue
npm run build
npx vitest run
npm run dev
```

Expected: clean build; all tests pass; `/remote` route still works.

- [ ] **Step 6: Pre-commit checks + code review on the diff**

```bash
cd ..
npm --prefix astros_vue run prettier:write
npm --prefix astros_vue run lint:fix
```

Hazards specific to this delete:
- Are there any test imports for the deleted components? (Grep verified in Step 1.)
- Storybook: removing the stories should NOT break `npm run build-storybook`. Verify:

```bash
cd astros_vue && npm run build-storybook
```

Expected: clean. If a config file (e.g., `.storybook/preview.ts` or similar) explicitly references the deleted stories, surface it.

- [ ] **Step 7: Commit**

```bash
git add astros_vue/src/components/remoteControl/index.ts astros_vue/src/locales/enUS.json
git commit -m "refactor(remote): delete legacy RemoteView + AstrosRemoteControl + AstrosRemoteButton (replaced by Phase 2 Direction B editor)"
```

The `git rm` from Step 2 already staged the deletes.

---

## Task 10: Manual QA test plan

Per CLAUDE.md QA Test Plans section. Create the QA plan that captures every flow from spec §5 plus edge cases.

**Files:**
- Create: `.docs/qa/remote-control-config.md`

- [ ] **Step 1: Write the QA plan**

`.docs/qa/remote-control-config.md`:

```markdown
# Remote Control Configuration — Manual QA Plan

**Feature:** Direction B 3-pane editor (Phase 2d capstone)
**Routes covered:** `/remote`
**Last updated:** 2026-05-24

## Preconditions

- Backend API running (`npm run start:tsx` in `astros_api/`)
- Vue dev server running (`npm run dev` in `astros_vue/`)
- Browser at `http://localhost:5173/remote`
- Authenticated session (log in via `/auth` first if redirected)
- At least one script + one playlist exist (use `/scripts` and `/playlists` to seed if needed)

## Test cases

### 1. First load — no prior config

1. Open a fresh browser session at `/remote` (clear stored config server-side first, if needed)
2. **Expected:** A single page named "Page 1" renders in the left rail; all 9 button cards show "Configure →" (empty state); right rail shows the bezel with the embedded compact remote, also empty.
3. **Expected:** Header shows "1 page · 0 actions". Unsaved badge IS visible (fresh-seed dirty flag from store).
4. **Expected:** Save button is enabled.
5. Click Save.
6. **Expected:** Success toast appears; Unsaved badge disappears.

### 2. Adding pages

1. Click the "+" Add button in the page list header.
2. **Expected:** A new "Page 2" appears in the list, scrolled into view, selected.
3. **Expected:** Header now shows "2 pages · 0 actions". Unsaved badge visible.
4. Repeat 3 more times to get to 5 pages.
5. **Expected:** All 5 pages render. List scrolls if there are too many to fit.

### 3. Selecting pages

1. Click on "Page 3" in the page list.
2. **Expected:** Page 3 row highlights; the center grid re-renders for Page 3's slots; right-rail bezel re-renders to show Page 3.
3. Click "Page 1".
4. **Expected:** All three panes sync back to Page 1.

### 4. Renaming pages (inline)

1. Click the pencil icon on "Page 2".
2. **Expected:** The name span is replaced by an input; the input is autofocused.
3. Type "Performance" and press Enter.
4. **Expected:** Input disappears; row shows "Performance".
5. Click the pencil icon again, clear the input, press Enter.
6. **Expected:** Input disappears; row STILL shows "Performance" (empty no-op).
7. Click pencil, type "Songs", press Escape.
8. **Expected:** Input disappears; row STILL shows "Performance" (Esc cancels).
9. Click pencil, type "Songs", click somewhere else (lose focus).
10. **Expected:** Input commits "Songs" on blur.

### 5. Duplicating pages

1. With "Performance" selected, click the duplicate icon on its row.
2. **Expected:** A new row "Performance (copy)" appears immediately after Performance; it is selected; center grid + preview re-render to it.
3. **Expected:** Header shows the new page count; Unsaved badge visible.

### 6. Deleting pages — happy path

1. Click the × delete icon on "Performance (copy)".
2. **Expected:** A confirm modal appears. Title "Delete page". Message includes "Performance (copy)".
3. Click Cancel.
4. **Expected:** Modal closes; the page is NOT deleted; row still in list.
5. Click × again; this time click Confirm.
6. **Expected:** Modal closes; the page is removed; selectedIdx adjusts (stays on previous sibling).

### 7. Deleting pages — disabled at length 1

1. Delete down to a single page.
2. **Expected:** The × icon on the only remaining row is visibly disabled (gray, no hover effect).
3. Click it anyway.
4. **Expected:** No modal opens; nothing happens.

### 8. Configuring buttons — script

1. On a fresh empty card, click "Configure →".
2. **Expected:** A popover opens anchored to the card; the editor is in the Script tab; the result list contains all available scripts plus a "None" row at top.
3. Click any script name.
4. **Expected:** Popover closes; the card transitions to the assigned state (tinted blue background, BUTTON N label at top, script name middle, SCRIPT chip below); right-rail preview shows the same slot filled; the row's mini 3×3 preview in the page list also shows the corresponding dot in blue.
5. **Expected:** Unsaved badge visible; "actions" header count incremented by 1.

### 9. Configuring buttons — playlist

1. On another empty card, click "Configure →".
2. Switch to the Playlists tab.
3. Click any playlist name.
4. **Expected:** Card shows the assigned state with PLAYLIST chip (orange); preview button is filled; page list mini-preview dot is orange.

### 10. Clearing a button

1. On an assigned card, click Clear.
2. **Expected:** Card transitions back to empty state (white, "Configure →"); preview slot empties; page list dot turns gray.

### 11. Editing an assigned button

1. On an assigned card, click Edit.
2. **Expected:** Popover opens with the editor in the tab matching the current assignment; the current selection is highlighted in the list (if the editor highlights selections).
3. Pick a different item.
4. **Expected:** Card reflects the new assignment.

### 12. Editor — close behaviors

1. Open the editor on a card.
2. Press Escape.
3. **Expected:** Popover closes; card returns to its prior state.
4. Open the editor again.
5. Click outside the popover (on the page list, the preview, the header, the document).
6. **Expected:** Popover closes.
7. Open the editor.
8. Click the × close button inside the editor.
9. **Expected:** Popover closes.

### 13. Save success

1. Configure 2 buttons across 2 different pages.
2. Click Save.
3. **Expected:** Success toast; Unsaved badge disappears.
4. Reload the browser.
5. **Expected:** The 2 configured buttons are still there.

### 14. Save failure (simulated)

1. Stop the backend API.
2. Configure a button.
3. Click Save.
4. **Expected:** Error toast; Unsaved badge stays visible.
5. Restart the API; click Save again.
6. **Expected:** Success toast; badge disappears.

### 15. Load failure

1. With config in a non-JSON-parseable state on the server (or simulate by killing the API at fetch time), reload `/remote`.
2. **Expected:** Error toast about load failure; Save button is disabled even when isDirty is true; editing is otherwise locked.

### 16. Live preview — read-only

1. Open `/remote` with at least one assigned button.
2. In the right-rail preview, click a filled button.
3. **Expected:** The preview shows its own internal "Sent: …" toast (the mobile-remote component fires it), but NO toast appears in the main view header AND no actual script/playlist runs on the droid (no backend POST to `/scripts/run` etc.).
4. Press and hold the preview's STOP ALL button.
5. **Expected:** The preview shows its arming animation; on release-after-600ms it shows its own "STOP ALL — sending…" toast — but NO websocket PANIC is sent and no actual hardware halt happens. (Verify with backend logs or a network inspector.)

### 17. Pluralization

1. With 1 page and 1 action: header reads "1 page · 1 action" (singular both).
2. With 2 pages and 0 actions: header reads "2 pages · 0 actions".
3. With 1 page and 5 actions: header reads "1 page · 5 actions".

## Edge cases / negative tests

- **Very long page names** — should truncate with ellipsis in the page list; full name visible on hover (title attribute).
- **Rapid clicks on Add** — each click adds a page, no duplicate IDs (UUIDs).
- **Rapid clicks on × → Cancel → × → Cancel** — modal opens/closes cleanly; no stuck modal.
- **Browser back/forward** — navigating away with the Unsaved badge visible does NOT prompt (no beforeRouteLeave guard in v1; deferred per Decision 9).
- **F5 reload with Unsaved badge** — the browser's default unload warning may or may not fire (browser-dependent); the badge serves as the visible signal regardless.

## Sign-off

- [ ] All test cases pass
- [ ] No console errors in the browser during the full flow
- [ ] Network tab shows GET `/remotecontrolsync` on load and PUT `/remotecontrolsync` on save (no other surprise endpoints)
```

- [ ] **Step 2: Commit the QA plan**

```bash
git add .docs/qa/remote-control-config.md
git commit -m "docs(qa): add manual QA plan for the Direction B remote-control editor"
```

Plan-only / doc-only commit; carve-out applies.

---

## Task 11: Pre-push branch review + tracker check-off + PR

**Files:**
- Modify: `.docs/plans/current_project.md` — check off 2d and add ship-date placeholder

- [ ] **Step 1: Final verification gate**

```bash
cd astros_vue
npm run lint
npm run build
npx vitest run
npm run build-storybook
```

Expected: all green.

- [ ] **Step 2: Manual QA per Task 10's plan**

Run through the full QA plan in a real browser. Note any failures or unexpected behaviors. Fix and re-verify before push.

- [ ] **Step 3: Pre-push branch review**

```
/pr-review-toolkit:review-pr
```

Hazard categories specific to this PR (frame the review around these, not "verify the fix"):

- **Decision 1 (read-only preview)**: is the no-emit contract testable from outside the AstrosRemoteLivePreview component? Could a future refactor that moves press/panic handling to the parent silently re-introduce delivery?
- **Decision 2 (delete confirm)**: is the modal cancel path truly no-op? What if the user opens the modal, then triggers a different delete idx before confirming — does the captured `pendingDeleteIdx` get stale?
- **Decision 10 (no optimistic mutations on save)**: when Save fails, isDirty stays true. Verify via the save-failure manual QA case.
- **Spec drift**: any place where the implementation diverges from the design spec §4 / §5 — call it out explicitly, update the spec inline if the divergence is correct.
- **i18n key coverage**: every user-facing string is a `t()` call; every `t()` key exists in `enUS.json`. The `remote_view.*` deletion left no dangling references.
- **a11y basics**: form-labelled inputs (rename input), `aria-label` on icon buttons (rename/duplicate/delete already verified in 2c), modal dialog role (existing `AstrosConfirmModal` uses `<dialog>` element — verified).
- **Header pluralization**: "1 page · 1 action" not "1 pages · 1 actions" — pin via vitest if not already pinned.
- **Test stub freshness**: do the test stubs in `RemoteControlConfigView.spec.ts` still match the real component contracts? (PageList rename emit shape, Card change emit shape, etc.)

- [ ] **Step 4: Check off 2d in the tracker**

```markdown
  - [x] **2d** — `AstrosRemoteLivePreview` + `RemoteControlConfigView` assembly + router
        swap + delete-confirm modal + i18n sweep + manual QA + old code deletion. —
        shipped <DATE> via PR #<NUMBER>
```

Add a Phase 2 top-level checkbox flip too:

```markdown
- [x] **Phase 2 — Direction B editor port**: ... — shipped <DATE> across PRs #94 / #95 / #96 / #<2d>.
```

```bash
cd ..
git add .docs/plans/current_project.md
git commit -m "docs(plan): check off Phase 2d + Phase 2 in tracker"
```

(Plan-only commit; carve-out applies.)

- [ ] **Step 5: User pushes through VS Code (per memory `feedback_git_push`)**

Do NOT run `git push` from terminal.

- [ ] **Step 6: Open PR after push**

```bash
gh pr create --base develop --title "feat(remote): Phase 2d — RemoteControlConfigView capstone (replaces legacy view)" --body "$(cat <<'EOF'
## Summary
- Builds `AstrosRemoteLivePreview` — MiniPhone bezel + `AstrosMobileRemote` in compact read-only (Decision 1)
- Assembles `RemoteControlConfigView` — 3-pane editor wiring 2a store + 2b card + 2c page list + 2d preview
- Adds delete-page confirm modal via existing `AstrosConfirmModal` (Decision 2)
- Swaps `/remote` router to the new view (path + name unchanged — existing bookmarks still work)
- Deletes legacy `RemoteView` + `AstrosRemoteControl` + `AstrosRemoteButton` + their stories; cleans up `remote_view.*` locale keys
- ~12 view-level wiring tests with mutation guards on every defensive branch (save-disable cascade, delete-cancel no-op, setButton selectedIdx snapshot)
- Manual QA plan added at `.docs/qa/remote-control-config.md`

This is the capstone of Phase 2. After merge, the Direction B editor is live and the old single-pane view is gone.

## Test plan
- [x] Vitest unit + view suite passes
- [x] Type-check passes
- [x] Lint passes
- [x] Storybook build clean
- [x] Pre-push toolkit run — Critical / Important addressed
- [x] Manual QA per `.docs/qa/remote-control-config.md`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 7: After merge — update active-project memory**

Update `~/.claude/projects/-home-jeff-Source-astros-AstrOs-Server/memory/project_active_remote_redesign.md`:
- Phase 2d: shipped via PR #<num> (merge `<sha>`)
- Mark Phase 2 (umbrella) complete
- Next active: Phase 4 or Phase 5 (Jeff's call — both are queued)

Update `MEMORY.md` hook line to reflect the new state.

---

## Self-Review

**Spec coverage** (cross-reference to `.docs/plans/specs/2026-05-21-phase2-editor-design.md`):

| Spec requirement | Task |
|---|---|
| `AstrosRemoteLivePreview` props `{pages, selectedIdx}` (§4) | Task 1 |
| `AstrosRemoteLivePreview` embeds `AstrosMobileRemote` compact + connected (§4) | Task 1 |
| `AstrosRemoteLivePreview` read-only (Decision 1, §4) | Task 1 (mutation-tested) |
| MiniPhone bezel inside the preview component (§4) | Task 1 (style block) |
| `RemoteControlConfigView` header bar — title + counts + Unsaved + Save (§3) | Task 2 + Task 3 |
| `RemoteControlConfigView` 3-pane layout (§3) | Task 2 |
| Header action count counts non-none buttons across all pages (§3 diagram) | Task 2 (`totalActions` computed) |
| Header page count (§3) | Task 2 (`pageCount` computed) |
| Save uses `AstrosWriteButton` (existing convention) | Task 3 |
| `isDirty` drives Save enable + Unsaved badge (Decision 10, §4) | Task 3 + Task 7 (tests) |
| `loadFailed` disables Save (legacy RemoteView convention) | Task 3 + Task 7 (mutation-tested) |
| Page list select wires to `store.selectPage` (Flow A) | Task 4 + Task 7 |
| Page list add wires to `store.addPage` | Task 4 + Task 7 |
| Page list duplicate wires to `store.duplicatePage` | Task 4 + Task 7 |
| Page list rename wires to `store.renamePage` (boolean return ignored; UI no-ops on empty) | Task 4 + Task 7 |
| Delete via confirm modal (Decision 2, Flow C) | Task 5 + Task 7 (mutation-tested) |
| Modal message includes the page name (Decision 2) | Task 5 (interpolation) + Task 7 (test) |
| Modal cancel does NOT mutate (Flow C) | Task 5 + Task 7 (mutation-tested) |
| Button card change wires to `store.setButton(selectedIdx, key, value)` (Flow B + §4) | Task 6 + Task 7 (mutation-tested) |
| `setButton` is the ONLY slot-mutation path (no direct `pages[i][key] = ...`) | Task 6 (handler shape) |
| Router swap to `RemoteControlConfigView` (§8) | Task 8 |
| Delete legacy `RemoteView` + `AstrosRemoteControl` + `AstrosRemoteButton` + stories (§8) | Task 9 |
| Delete `remote_view.*` locale keys (§8) | Task 9 |
| Manual QA plan (§7) | Task 10 |
| Pre-push branch review + PR (CLAUDE.md) | Task 11 |
| Deferred items (drag, beforeRouteLeave guard, URL sync) stay out of scope (§9) | n/a |

**Placeholder scan:** Every code step has actual code. Every test step has actual assertions. Every command has expected output. The `() => { /* wired in Task N */ }` lines in Task 2 are scoped stubs replaced inside this same plan (Tasks 4-6) — not "TODO" plan-failures.

**Type consistency:**
- `RemoteControlPage`, `PageButton`, `ButtonKey`, `BUTTON_KEYS` — all from existing `@/models/remoteControl/*`
- `PageButton` type values: `'script' | 'playlist' | 'none'` — pinned by `makeNoneButton()` factory (Phase 2b)
- Card `change: [value: PageButton]` — verified against `AstrosRemoteButtonCard.vue:19-21`
- PageList emits — verified against `AstrosRemotePageList.vue:15-21`
- Store method signatures — verified against `stores/remoteControl.ts:120-238`
- Modal prop shape — verified against `components/modals/AstrosConfirmModal.vue`

**i18n key inventory (final state of `remote_control_config`):**
- `card.*` — added 2b
- `editor.*` — added 2b
- `pageList.*` — added 2c
- `preview.bezel_label` — added Task 1 (this plan)
- `view.title|save|unsaved|page_count|action_count|load_error|save_success|save_error` — added Task 2 (this plan)
- `deleteModal.title|message` — added Task 5 (this plan)

Old `remote_view.*` block removed in Task 9.

**Risk-of-regression sweep:**
- Wire-shape contract for `/remotecontrolsync` — UNCHANGED. Phase 6's `remote_config_controller.test.ts` still pins it; this PR doesn't touch backend.
- M5Stack firmware compatibility — UNCHANGED. JSON shape is unchanged from Phase 1.
- Existing routes other than `/remote` — UNTOUCHED.
