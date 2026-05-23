# Phase 2a — Store CRUD Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` (inline, recommended for store work — fast, single-file scope) or `superpowers:subagent-driven-development` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend `useRemoteControlStore` with the page-CRUD methods, `selectedIdx`, and `isDirty` flag that the Phase 2b/2c/2d UI components consume. No UI changes.

**Architecture:** All work confined to `astros_vue/src/stores/remoteControl.ts` + its `__tests__/remoteControl.spec.ts`. The store gains 2 reactive refs (`selectedIdx`, `isDirty`) and 5 methods (`addPage`, `duplicatePage`, `deletePage`, `renamePage`, `selectPage`). `loadRemoteControl` resets `selectedIdx` to 0 and clears `isDirty` on success; `saveRemoteControl` drops the all-empty filter and clears `isDirty` on success. Dirty tracking is a plain flag (not snapshot comparison) per design Decision 3 & 10.

**Tech Stack:** Pinia (composition-API style), Vue 3 `ref`, Vitest, TypeScript.

**Spec:** `.docs/plans/specs/2026-05-21-phase2-editor-design.md` Sections 2 (decisions), 4 (interface), 5 (data flow), 8 (file inventory). Refer to it for any signature/intent question.

**Tracker:** `.docs/plans/current_project.md` — check off "Phase 2 / 2a" when this plan completes.

---

## Pre-flight context

- Branch off the latest `origin/develop`. The previous branch name `feature/phase2a-store-crud-foundation` is burned (PR #93 already used it).
- Per memory `feedback_safe_feature_branch_creation`: **do NOT** use `git checkout -b feature/phase2a-store-crud-impl origin/develop` — that form makes the branch track `develop` and VS Code will push commits straight to develop. Use `git fetch origin && git switch develop && git pull && git switch -c feature/phase2a-store-crud-impl` (no upstream argument — the branch ends up with no upstream, which is what we want).
- Per memory `feedback_prettier_pre_commit`: `npm run format` (the Vue project's prettier script — equivalent to the API's `prettier:write`) runs **before** every commit, alongside `npm run lint` (Vue's lint script already runs eslint with `--fix`).
- Per memory `feedback_mutation_test_defensive_features`: for every defensive guard added (`deletePage`'s `pages.length <= 1`, `renamePage`'s trim/empty check, `selectPage`'s clamp, `addPage`'s `selectedIdx` invariant, the `isDirty=false` clears in load/save), revert the guard, re-run the relevant test, confirm it FAILS, then restore the guard. The plan calls this out per-task.
- All test commands run from `astros_vue/`. The watch-mode default (`npm run test:unit`) is fine for local iteration; the plan uses `npx vitest run path/to/spec.ts -t "test name"` for one-shot runs and verification.

---

## File Structure

**Modified files only — no new files in 2a:**
- `astros_vue/src/stores/remoteControl.ts` — add state + methods; modify `loadRemoteControl` and `saveRemoteControl`
- `astros_vue/src/stores/__tests__/remoteControl.spec.ts` — add ~25 tests across 6 new `describe` blocks; **invert** the existing `drops a page where all 9 buttons are id="0"` test (it currently asserts the filter; after Decision 3 it must assert non-filtering)

**Out of scope for 2a (lands in later sub-phases):**
- No new components
- No view changes
- No router changes
- No i18n keys
- No backend changes

---

## Task 0: Branch setup

**Files:**
- None (git operations only)

- [ ] **Step 1: Fetch latest develop and confirm clean state**

```bash
git fetch origin
git status
```
Expected: working tree clean; on branch `develop`. If not, stop and stash/commit before proceeding.

- [ ] **Step 2: Sync local develop**

```bash
git switch develop
git pull --ff-only
```
Expected: fast-forward to `origin/develop` HEAD (currently `fafe331`).

- [ ] **Step 3: Create the feature branch WITHOUT tracking develop**

```bash
git switch -c feature/phase2a-store-crud-impl
```
Expected: branch created, no upstream set. Verify with `git status` — should say "On branch feature/phase2a-store-crud-impl" with no "Your branch is up to date with…" line. (If it says tracking, the branch was created the wrong way — delete and redo without the `origin/develop` argument.)

- [ ] **Step 4: Commit this plan file**

```bash
git add .docs/plans/20260523-1200-phase2a-store-crud-impl.md
git commit -m "docs(plan): Phase 2a store CRUD implementation plan"
```

This is a plan-only commit — per CLAUDE.md carve-outs, no pre-commit toolkit required.

---

## Task 1: Add `isDirty` flag + clear on load success

**Why first:** Every subsequent mutation method needs to set this flag, and the load-success test pins the "flag clears" baseline. Doing isDirty first means later mutation tasks can each assert `isDirty === true` post-mutation without bootstrapping the flag separately.

**Files:**
- Modify: `astros_vue/src/stores/remoteControl.ts`
- Test: `astros_vue/src/stores/__tests__/remoteControl.spec.ts`

- [ ] **Step 1: Write failing tests**

Add a new `describe` block in `remoteControl.spec.ts`, after the existing `saveRemoteControl` block:

```ts
describe('isDirty flag', () => {
  it('starts false on a fresh store', () => {
    const store = useRemoteControlStore();
    expect(store.isDirty).toBe(false);
  });

  it('stays false after a successful load', async () => {
    apiGet.mockResolvedValue(JSON.stringify([]));
    const store = useRemoteControlStore();
    await store.loadRemoteControl();
    expect(store.isDirty).toBe(false);
  });

  it('clears to false when a successful load follows a dirty state', async () => {
    apiGet.mockResolvedValue(JSON.stringify([]));
    const store = useRemoteControlStore();
    // Simulate a prior mutation having flipped the flag. We poke the ref
    // directly here because the mutation methods that flip it land in
    // later tasks; this isolates the "load clears it" behavior.
    (store as unknown as { isDirty: boolean }).isDirty = true;
    await store.loadRemoteControl();
    expect(store.isDirty).toBe(false);
  });

  it('does NOT clear isDirty when load fails (network)', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    apiGet.mockRejectedValue(new Error('network down'));
    const store = useRemoteControlStore();
    (store as unknown as { isDirty: boolean }).isDirty = true;
    await store.loadRemoteControl();
    expect(store.isDirty).toBe(true);
    errSpy.mockRestore();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd astros_vue
npx vitest run src/stores/__tests__/remoteControl.spec.ts -t "isDirty flag"
```
Expected: 4 tests fail with `Cannot read properties of undefined` or `expected undefined to be false` (because `store.isDirty` doesn't exist yet).

- [ ] **Step 3: Add the `isDirty` ref and clear-on-success in loadRemoteControl**

In `remoteControl.ts`, inside the `defineStore` callback, after `const isLoading = ref(false);`:

```ts
const isDirty = ref(false);
```

In `loadRemoteControl`, immediately after the successful page assignment branch (after the `if (result.length > 0) { … } else { … }` block, before `isLoading.value = false;`):

```ts
isDirty.value = false;
```

Then in the `return { … }` at the bottom, add `isDirty` to the exposed object:

```ts
return {
  remoteControlPages,
  isLoading,
  isDirty,
  loadRemoteControl,
  saveRemoteControl,
};
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/stores/__tests__/remoteControl.spec.ts -t "isDirty flag"
```
Expected: 4 tests pass.

- [ ] **Step 5: Mutation-test the "clear on load success" branch**

Per memory `feedback_mutation_test_defensive_features`: revert the fix and confirm the test fails. Comment out the `isDirty.value = false;` line inside `loadRemoteControl`. Run:

```bash
npx vitest run src/stores/__tests__/remoteControl.spec.ts -t "clears to false when a successful load"
```
Expected: FAIL (`expected true to be false`). This proves the test actually exercises the clearing logic — not a vacuous assertion.

Restore the line.

- [ ] **Step 6: Full test pass + commit**

```bash
npx vitest run src/stores/__tests__/remoteControl.spec.ts
npm run format
npm run lint
git add astros_vue/src/stores/remoteControl.ts astros_vue/src/stores/__tests__/remoteControl.spec.ts
git commit -m "feat(remote-store): add isDirty flag cleared on load success"
```

---

## Task 2: Add `selectedIdx` + `selectPage`

**Why:** Selection is independent of dirtiness (Decision 7) and the simplest mutation. Tests pin the clamp invariant before later tasks rely on it for `deletePage`'s clamp behavior.

**Files:**
- Modify: `astros_vue/src/stores/remoteControl.ts`
- Test: `astros_vue/src/stores/__tests__/remoteControl.spec.ts`

- [ ] **Step 1: Write failing tests**

Add this `describe` block after the `isDirty flag` block:

```ts
describe('selectedIdx + selectPage', () => {
  it('starts at 0', () => {
    const store = useRemoteControlStore();
    expect(store.selectedIdx).toBe(0);
  });

  it('selectPage(2) sets selectedIdx to 2 when 3 pages exist', async () => {
    apiGet.mockResolvedValue(JSON.stringify([legacyPage(), legacyPage(), legacyPage()]));
    const store = useRemoteControlStore();
    await store.loadRemoteControl();

    store.selectPage(2);

    expect(store.selectedIdx).toBe(2);
  });

  it('clamps selectPage(99) to last index when out of range high', async () => {
    apiGet.mockResolvedValue(JSON.stringify([legacyPage(), legacyPage()]));
    const store = useRemoteControlStore();
    await store.loadRemoteControl();

    store.selectPage(99);

    expect(store.selectedIdx).toBe(1);
  });

  it('clamps selectPage(-3) to 0 when negative', async () => {
    apiGet.mockResolvedValue(JSON.stringify([legacyPage(), legacyPage()]));
    const store = useRemoteControlStore();
    await store.loadRemoteControl();

    store.selectPage(-3);

    expect(store.selectedIdx).toBe(0);
  });

  it('does NOT set isDirty', async () => {
    apiGet.mockResolvedValue(JSON.stringify([legacyPage(), legacyPage()]));
    const store = useRemoteControlStore();
    await store.loadRemoteControl();

    store.selectPage(1);

    expect(store.isDirty).toBe(false);
  });

  it('loadRemoteControl resets selectedIdx to 0', async () => {
    apiGet.mockResolvedValue(JSON.stringify([legacyPage(), legacyPage(), legacyPage()]));
    const store = useRemoteControlStore();
    await store.loadRemoteControl();
    store.selectPage(2);

    // Reload simulates a re-entry into the view.
    apiGet.mockResolvedValue(JSON.stringify([legacyPage()]));
    await store.loadRemoteControl();

    expect(store.selectedIdx).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/stores/__tests__/remoteControl.spec.ts -t "selectedIdx \\+ selectPage"
```
Expected: 6 tests fail (`store.selectPage is not a function`, `store.selectedIdx === undefined`).

- [ ] **Step 3: Implement selectedIdx + selectPage**

In `remoteControl.ts`, after `const isDirty = ref(false);`:

```ts
const selectedIdx = ref(0);
```

After the existing `saveRemoteControl` function definition (or anywhere before the `return` at the bottom — match the file's existing function-then-return ordering):

```ts
function selectPage(idx: number) {
  if (remoteControlPages.value.length === 0) {
    selectedIdx.value = 0;
    return;
  }
  const lastIdx = remoteControlPages.value.length - 1;
  selectedIdx.value = Math.min(Math.max(idx, 0), lastIdx);
}
```

In `loadRemoteControl`, alongside the `isDirty.value = false;` line added in Task 1 (on success):

```ts
selectedIdx.value = 0;
```

Add `selectedIdx` and `selectPage` to the return object:

```ts
return {
  remoteControlPages,
  isLoading,
  isDirty,
  selectedIdx,
  loadRemoteControl,
  saveRemoteControl,
  selectPage,
};
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/stores/__tests__/remoteControl.spec.ts -t "selectedIdx \\+ selectPage"
```
Expected: 6 tests pass.

- [ ] **Step 5: Mutation-test the clamp**

Comment out the `Math.min(Math.max(...))` clamp and replace with `selectedIdx.value = idx;`. Run:

```bash
npx vitest run src/stores/__tests__/remoteControl.spec.ts -t "clamps selectPage"
```
Expected: both "clamps" tests FAIL. Restore the clamp.

- [ ] **Step 6: Full test pass + commit**

```bash
npx vitest run src/stores/__tests__/remoteControl.spec.ts
npm run format
npm run lint
git add astros_vue/src/stores/remoteControl.ts astros_vue/src/stores/__tests__/remoteControl.spec.ts
git commit -m "feat(remote-store): add selectedIdx with clamping selectPage and load reset"
```

---

## Task 3: Add `addPage`

**Files:**
- Modify: `astros_vue/src/stores/remoteControl.ts`
- Test: `astros_vue/src/stores/__tests__/remoteControl.spec.ts`

- [ ] **Step 1: Write failing tests**

Add this `describe` block after `selectedIdx + selectPage`:

```ts
describe('addPage', () => {
  it('appends a default page with auto-numbered name', async () => {
    apiGet.mockResolvedValue(JSON.stringify([legacyPage()]));
    const store = useRemoteControlStore();
    await store.loadRemoteControl();

    store.addPage();

    expect(store.remoteControlPages).toHaveLength(2);
    expect(store.remoteControlPages[1]!.name).toBe('Page 2');
    expect(store.remoteControlPages[1]!.id).toMatch(UUID_LIKE);
  });

  it('selects the newly added page', async () => {
    apiGet.mockResolvedValue(JSON.stringify([legacyPage()]));
    const store = useRemoteControlStore();
    await store.loadRemoteControl();

    store.addPage();

    expect(store.selectedIdx).toBe(1);
  });

  it('flips isDirty to true', async () => {
    apiGet.mockResolvedValue(JSON.stringify([legacyPage()]));
    const store = useRemoteControlStore();
    await store.loadRemoteControl();
    expect(store.isDirty).toBe(false);

    store.addPage();

    expect(store.isDirty).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/stores/__tests__/remoteControl.spec.ts -t "addPage"
```
Expected: 3 tests fail (`store.addPage is not a function`).

- [ ] **Step 3: Implement addPage**

In `remoteControl.ts`, add this function after `selectPage`:

```ts
function addPage() {
  const newIdx = remoteControlPages.value.length;
  remoteControlPages.value.push(createDefaultPage(newIdx));
  selectedIdx.value = newIdx;
  isDirty.value = true;
}
```

Add `addPage` to the return object.

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/stores/__tests__/remoteControl.spec.ts -t "addPage"
```
Expected: 3 tests pass.

- [ ] **Step 5: Mutation-test the isDirty flip**

Comment out the `isDirty.value = true;` line in `addPage`. Run:

```bash
npx vitest run src/stores/__tests__/remoteControl.spec.ts -t "flips isDirty to true"
```
Expected: that test FAILS. Restore.

- [ ] **Step 6: Commit**

```bash
npx vitest run src/stores/__tests__/remoteControl.spec.ts
npm run format
npm run lint
git add astros_vue/src/stores/remoteControl.ts astros_vue/src/stores/__tests__/remoteControl.spec.ts
git commit -m "feat(remote-store): add addPage method"
```

---

## Task 4: Add `duplicatePage`

**Files:**
- Modify: `astros_vue/src/stores/remoteControl.ts`
- Test: `astros_vue/src/stores/__tests__/remoteControl.spec.ts`

- [ ] **Step 1: Write failing tests**

Add this `describe` block after `addPage`:

```ts
describe('duplicatePage', () => {
  it('splices a copy right after the source index with a fresh id', async () => {
    apiGet.mockResolvedValue(JSON.stringify([legacyPage(), legacyPage()]));
    const store = useRemoteControlStore();
    await store.loadRemoteControl();
    const srcId = store.remoteControlPages[0]!.id;

    store.duplicatePage(0);

    expect(store.remoteControlPages).toHaveLength(3);
    expect(store.remoteControlPages[1]!.id).not.toBe(srcId);
    expect(store.remoteControlPages[1]!.id).toMatch(UUID_LIKE);
  });

  it('names the copy "<src> (copy)"', async () => {
    apiGet.mockResolvedValue(JSON.stringify([
      { ...legacyPage(), name: 'Performance' },
    ]));
    const store = useRemoteControlStore();
    await store.loadRemoteControl();

    store.duplicatePage(0);

    expect(store.remoteControlPages[1]!.name).toBe('Performance (copy)');
  });

  it('deep-copies button slots (mutating original does not affect copy)', async () => {
    apiGet.mockResolvedValue(JSON.stringify([legacyPage()]));
    apiPut.mockResolvedValue(undefined);
    const store = useRemoteControlStore();
    await store.loadRemoteControl();
    store.remoteControlPages[0]!.button1 = { id: 's1', name: 'Wave', type: 'script' };

    store.duplicatePage(0);
    // Mutate the source AFTER duplicating.
    store.remoteControlPages[0]!.button1 = { id: 's2', name: 'Bow', type: 'script' };

    expect(store.remoteControlPages[1]!.button1).toEqual({ id: 's1', name: 'Wave', type: 'script' });
  });

  it('selects the copy', async () => {
    apiGet.mockResolvedValue(JSON.stringify([legacyPage(), legacyPage()]));
    const store = useRemoteControlStore();
    await store.loadRemoteControl();

    store.duplicatePage(0);

    expect(store.selectedIdx).toBe(1);
  });

  it('flips isDirty to true', async () => {
    apiGet.mockResolvedValue(JSON.stringify([legacyPage()]));
    const store = useRemoteControlStore();
    await store.loadRemoteControl();

    store.duplicatePage(0);

    expect(store.isDirty).toBe(true);
  });

  it('no-ops on out-of-range index (negative or beyond end)', async () => {
    apiGet.mockResolvedValue(JSON.stringify([legacyPage()]));
    const store = useRemoteControlStore();
    await store.loadRemoteControl();

    store.duplicatePage(-1);
    store.duplicatePage(99);

    expect(store.remoteControlPages).toHaveLength(1);
    expect(store.isDirty).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/stores/__tests__/remoteControl.spec.ts -t "duplicatePage"
```
Expected: 6 tests fail (`store.duplicatePage is not a function`).

- [ ] **Step 3: Implement duplicatePage**

In `remoteControl.ts`, after `addPage`:

```ts
function duplicatePage(idx: number) {
  const src = remoteControlPages.value[idx];
  if (!src) return;
  const copy: RemoteControlPage = {
    ...src,
    id: crypto.randomUUID(),
    name: `${src.name} (copy)`,
  };
  // Deep-copy each button so subsequent edits to the source don't bleed in.
  for (const key of BUTTON_KEYS) {
    copy[key] = { ...src[key] };
  }
  remoteControlPages.value.splice(idx + 1, 0, copy);
  selectedIdx.value = idx + 1;
  isDirty.value = true;
}
```

Add `duplicatePage` to the return object.

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/stores/__tests__/remoteControl.spec.ts -t "duplicatePage"
```
Expected: 6 tests pass.

- [ ] **Step 5: Mutation-test the out-of-range guard**

Comment out `if (!src) return;`. Run:

```bash
npx vitest run src/stores/__tests__/remoteControl.spec.ts -t "no-ops on out-of-range"
```
Expected: that test FAILS (either with a thrown TypeError when accessing `src.name`, or with `expect(...).toHaveLength(1)` failing because a phantom page was spliced). Restore.

Also mutation-test the deep-copy: replace the `for (const key of BUTTON_KEYS)` loop with nothing (just rely on the `...src` spread, which would share button references). Run:

```bash
npx vitest run src/stores/__tests__/remoteControl.spec.ts -t "deep-copies button slots"
```
Expected: that test FAILS. Restore the loop.

- [ ] **Step 6: Commit**

```bash
npx vitest run src/stores/__tests__/remoteControl.spec.ts
npm run format
npm run lint
git add astros_vue/src/stores/remoteControl.ts astros_vue/src/stores/__tests__/remoteControl.spec.ts
git commit -m "feat(remote-store): add duplicatePage with deep button copy"
```

---

## Task 5: Add `deletePage` with single-page guard + selectedIdx clamp

**Files:**
- Modify: `astros_vue/src/stores/remoteControl.ts`
- Test: `astros_vue/src/stores/__tests__/remoteControl.spec.ts`

- [ ] **Step 1: Write failing tests**

Add this `describe` block:

```ts
describe('deletePage', () => {
  it('removes the page at the given index', async () => {
    apiGet.mockResolvedValue(JSON.stringify([
      { ...legacyPage(), name: 'A' },
      { ...legacyPage(), name: 'B' },
      { ...legacyPage(), name: 'C' },
    ]));
    const store = useRemoteControlStore();
    await store.loadRemoteControl();

    store.deletePage(1);

    expect(store.remoteControlPages).toHaveLength(2);
    expect(store.remoteControlPages.map((p) => p.name)).toEqual(['A', 'C']);
  });

  it('no-ops when only one page remains', async () => {
    apiGet.mockResolvedValue(JSON.stringify([legacyPage()]));
    const store = useRemoteControlStore();
    await store.loadRemoteControl();

    store.deletePage(0);

    expect(store.remoteControlPages).toHaveLength(1);
    expect(store.isDirty).toBe(false);
  });

  it('clamps selectedIdx when deleting the currently-selected last page', async () => {
    apiGet.mockResolvedValue(JSON.stringify([legacyPage(), legacyPage(), legacyPage()]));
    const store = useRemoteControlStore();
    await store.loadRemoteControl();
    store.selectPage(2);

    store.deletePage(2);

    expect(store.selectedIdx).toBe(1);
  });

  it('keeps selectedIdx when deleting a page below the current selection', async () => {
    apiGet.mockResolvedValue(JSON.stringify([legacyPage(), legacyPage(), legacyPage()]));
    const store = useRemoteControlStore();
    await store.loadRemoteControl();
    store.selectPage(2);

    store.deletePage(0);

    // Was idx 2 ('C'), now at idx 1 because A was removed and B/C shifted down.
    expect(store.selectedIdx).toBe(1);
  });

  it('keeps selectedIdx unchanged when deleting a page above the current selection', async () => {
    apiGet.mockResolvedValue(JSON.stringify([legacyPage(), legacyPage(), legacyPage()]));
    const store = useRemoteControlStore();
    await store.loadRemoteControl();
    store.selectPage(0);

    store.deletePage(2);

    expect(store.selectedIdx).toBe(0);
  });

  it('flips isDirty to true', async () => {
    apiGet.mockResolvedValue(JSON.stringify([legacyPage(), legacyPage()]));
    const store = useRemoteControlStore();
    await store.loadRemoteControl();

    store.deletePage(0);

    expect(store.isDirty).toBe(true);
  });

  it('no-ops on out-of-range idx without changing pages or isDirty', async () => {
    apiGet.mockResolvedValue(JSON.stringify([legacyPage(), legacyPage()]));
    const store = useRemoteControlStore();
    await store.loadRemoteControl();

    store.deletePage(-1);
    store.deletePage(99);

    expect(store.remoteControlPages).toHaveLength(2);
    expect(store.isDirty).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/stores/__tests__/remoteControl.spec.ts -t "deletePage"
```
Expected: 7 tests fail.

- [ ] **Step 3: Implement deletePage**

In `remoteControl.ts`, after `duplicatePage`:

```ts
function deletePage(idx: number) {
  if (remoteControlPages.value.length <= 1) return;
  if (idx < 0 || idx >= remoteControlPages.value.length) return;
  remoteControlPages.value.splice(idx, 1);
  // Clamp selectedIdx to the new last index. If the deleted page was below
  // the selection, the selection shifts down by one; if above, unchanged;
  // if the deleted page WAS the selection at the end, clamp moves it back.
  if (selectedIdx.value > idx) {
    selectedIdx.value -= 1;
  } else if (selectedIdx.value >= remoteControlPages.value.length) {
    selectedIdx.value = remoteControlPages.value.length - 1;
  }
  isDirty.value = true;
}
```

Add `deletePage` to the return object.

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/stores/__tests__/remoteControl.spec.ts -t "deletePage"
```
Expected: 7 tests pass.

- [ ] **Step 5: Mutation-test the guards**

A) Single-page guard. Comment out `if (remoteControlPages.value.length <= 1) return;`. Run:

```bash
npx vitest run src/stores/__tests__/remoteControl.spec.ts -t "no-ops when only one page remains"
```
Expected: FAIL. Restore.

B) Out-of-range guard. Comment out `if (idx < 0 || idx >= remoteControlPages.value.length) return;`. Run:

```bash
npx vitest run src/stores/__tests__/remoteControl.spec.ts -t "no-ops on out-of-range idx without changing"
```
Expected: FAIL. Restore.

C) selectedIdx-shift-down. Comment out `if (selectedIdx.value > idx) { selectedIdx.value -= 1; }` (delete just the inner reassignment). Run:

```bash
npx vitest run src/stores/__tests__/remoteControl.spec.ts -t "keeps selectedIdx when deleting a page below"
```
Expected: FAIL. Restore.

D) selectedIdx-clamp-from-end. Comment out the `else if (selectedIdx.value >= remoteControlPages.value.length)` branch entirely. Run:

```bash
npx vitest run src/stores/__tests__/remoteControl.spec.ts -t "clamps selectedIdx when deleting the currently-selected last"
```
Expected: FAIL. Restore.

- [ ] **Step 6: Commit**

```bash
npx vitest run src/stores/__tests__/remoteControl.spec.ts
npm run format
npm run lint
git add astros_vue/src/stores/remoteControl.ts astros_vue/src/stores/__tests__/remoteControl.spec.ts
git commit -m "feat(remote-store): add deletePage with single-page guard and selectedIdx clamp"
```

---

## Task 6: Add `renamePage`

**Files:**
- Modify: `astros_vue/src/stores/remoteControl.ts`
- Test: `astros_vue/src/stores/__tests__/remoteControl.spec.ts`

- [ ] **Step 1: Write failing tests**

```ts
describe('renamePage', () => {
  it('updates the name at the given index', async () => {
    apiGet.mockResolvedValue(JSON.stringify([legacyPage()]));
    const store = useRemoteControlStore();
    await store.loadRemoteControl();

    store.renamePage(0, 'Quick Actions');

    expect(store.remoteControlPages[0]!.name).toBe('Quick Actions');
  });

  it('trims surrounding whitespace before saving', async () => {
    apiGet.mockResolvedValue(JSON.stringify([legacyPage()]));
    const store = useRemoteControlStore();
    await store.loadRemoteControl();

    store.renamePage(0, '   Performance   ');

    expect(store.remoteControlPages[0]!.name).toBe('Performance');
  });

  it('no-ops on empty string (does not overwrite existing name or set dirty)', async () => {
    apiGet.mockResolvedValue(JSON.stringify([{ ...legacyPage(), name: 'Original' }]));
    const store = useRemoteControlStore();
    await store.loadRemoteControl();

    store.renamePage(0, '');

    expect(store.remoteControlPages[0]!.name).toBe('Original');
    expect(store.isDirty).toBe(false);
  });

  it('no-ops on whitespace-only string', async () => {
    apiGet.mockResolvedValue(JSON.stringify([{ ...legacyPage(), name: 'Original' }]));
    const store = useRemoteControlStore();
    await store.loadRemoteControl();

    store.renamePage(0, '   \t  ');

    expect(store.remoteControlPages[0]!.name).toBe('Original');
    expect(store.isDirty).toBe(false);
  });

  it('no-ops on out-of-range idx', async () => {
    apiGet.mockResolvedValue(JSON.stringify([legacyPage()]));
    const store = useRemoteControlStore();
    await store.loadRemoteControl();

    store.renamePage(99, 'NewName');
    store.renamePage(-1, 'NewName');

    expect(store.remoteControlPages[0]!.name).toBe('Page 1');
    expect(store.isDirty).toBe(false);
  });

  it('flips isDirty to true on a valid rename', async () => {
    apiGet.mockResolvedValue(JSON.stringify([legacyPage()]));
    const store = useRemoteControlStore();
    await store.loadRemoteControl();

    store.renamePage(0, 'New');

    expect(store.isDirty).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/stores/__tests__/remoteControl.spec.ts -t "renamePage"
```
Expected: 6 tests fail.

- [ ] **Step 3: Implement renamePage**

In `remoteControl.ts`, after `deletePage`:

```ts
function renamePage(idx: number, name: string) {
  const target = remoteControlPages.value[idx];
  if (!target) return;
  const trimmed = name.trim();
  if (trimmed.length === 0) return;
  target.name = trimmed;
  isDirty.value = true;
}
```

Add `renamePage` to the return object.

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/stores/__tests__/remoteControl.spec.ts -t "renamePage"
```
Expected: 6 tests pass.

- [ ] **Step 5: Mutation-test the empty/whitespace guard**

Comment out `if (trimmed.length === 0) return;`. Run:

```bash
npx vitest run src/stores/__tests__/remoteControl.spec.ts -t "no-ops on empty string"
```
Expected: FAIL (target.name would become ''). Restore.

Comment out `const trimmed = name.trim();` and `if (trimmed.length === 0) return;`, and change `target.name = trimmed;` to `target.name = name;`. Run:

```bash
npx vitest run src/stores/__tests__/remoteControl.spec.ts -t "trims surrounding whitespace"
```
Expected: FAIL. Restore.

- [ ] **Step 6: Commit**

```bash
npx vitest run src/stores/__tests__/remoteControl.spec.ts
npm run format
npm run lint
git add astros_vue/src/stores/remoteControl.ts astros_vue/src/stores/__tests__/remoteControl.spec.ts
git commit -m "feat(remote-store): add renamePage with trim + empty-string no-op"
```

---

## Task 7: Remove the all-empty save filter + invert the existing test + clear isDirty on save success

**Why this is its own task:** It touches an existing test (inverts behavior), which is a different kind of change from "add new method + new test." Separating it keeps the diff per commit easy to review.

**Files:**
- Modify: `astros_vue/src/stores/remoteControl.ts`
- Modify: `astros_vue/src/stores/__tests__/remoteControl.spec.ts`

- [ ] **Step 1: Read the current test that needs inverting**

The test at `remoteControl.spec.ts:260` is currently:

```ts
it('drops a page where all 9 buttons are id="0" even when page id/name are populated strings', async () => {
  // … asserts parsed.length === 0 after saving an all-empty page
});
```

After Decision 3, the new contract is "every page in the array persists." Replace the assertion to assert `parsed.length === 1` and rename the test. Also remove the long mutation-test commentary (no longer relevant — there is no filter to mutation-test).

- [ ] **Step 2: Write the replacement test (this becomes the failing test before code changes)**

In `remoteControl.spec.ts`, REPLACE the entire existing `'drops a page where all 9 buttons are id="0"'` `it(...)` block with:

```ts
it('persists every page including ones where all 9 buttons are id="0"', async () => {
  // Decision 3 of the Phase 2 design spec: the all-empty save filter is
  // removed. Empty pages persist; users delete pages explicitly via the UI.
  apiGet.mockResolvedValue(JSON.stringify([]));
  apiPut.mockResolvedValue(undefined);
  const store = useRemoteControlStore();
  await store.loadRemoteControl();

  expect(store.remoteControlPages).toHaveLength(1);
  expect(store.remoteControlPages[0]!.id).toMatch(UUID_LIKE);
  expect(store.remoteControlPages[0]!.name).toBe('Page 1');

  await store.saveRemoteControl();

  const sent = apiPut.mock.calls[0]![1] as { config: string };
  const parsed = JSON.parse(sent.config) as RemoteControlPage[];
  expect(parsed).toHaveLength(1);
  expect(parsed[0]!.id).toBe(store.remoteControlPages[0]!.id);
  expect(parsed[0]!.name).toBe('Page 1');
});
```

Then add a second new test to the same `saveRemoteControl` block:

```ts
it('clears isDirty to false on save success', async () => {
  apiGet.mockResolvedValue(JSON.stringify([legacyPage()]));
  apiPut.mockResolvedValue(undefined);
  const store = useRemoteControlStore();
  await store.loadRemoteControl();
  store.addPage(); // flips isDirty true
  expect(store.isDirty).toBe(true);

  await store.saveRemoteControl();

  expect(store.isDirty).toBe(false);
});

it('does NOT clear isDirty when save fails', async () => {
  const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  apiGet.mockResolvedValue(JSON.stringify([legacyPage()]));
  apiPut.mockRejectedValue(new Error('save failed'));
  const store = useRemoteControlStore();
  await store.loadRemoteControl();
  store.addPage();

  await store.saveRemoteControl();

  expect(store.isDirty).toBe(true);
  errSpy.mockRestore();
});
```

- [ ] **Step 3: Run tests to verify the new ones fail and the old (now-replaced) one is gone**

```bash
npx vitest run src/stores/__tests__/remoteControl.spec.ts -t "persists every page"
npx vitest run src/stores/__tests__/remoteControl.spec.ts -t "clears isDirty to false on save success"
npx vitest run src/stores/__tests__/remoteControl.spec.ts -t "does NOT clear isDirty when save fails"
```
Expected: the first test fails (`expected 0 to be 1` — the filter still drops it), the second fails (`expected true to be false` — isDirty not cleared on save yet), the third may pass already (no clearing logic = stays true). The replaced test (`drops a page where all 9 buttons…`) should no longer appear in the run output at all.

- [ ] **Step 4: Implement the changes in saveRemoteControl**

Replace the body of `saveRemoteControl` in `remoteControl.ts` with:

```ts
async function saveRemoteControl() {
  const payload = JSON.stringify(remoteControlPages.value);

  try {
    await apiService.put(REMOTE_CONFIG, { config: payload });
    isDirty.value = false;
    return { success: true };
  } catch (error) {
    console.error('Failed to save remote control configuration:', error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}
```

Changes from before:
- Dropped the `.filter(...)` call.
- Added `isDirty.value = false;` after a successful PUT.
- Error branch leaves isDirty unchanged (per Decision 10).

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run src/stores/__tests__/remoteControl.spec.ts
```
Expected: all tests in the file pass — including the two pre-existing `saveRemoteControl` tests (`retains a page that has at least one non-default button`, `serializes id and name on retained pages`) which still hold under the new no-filter logic.

- [ ] **Step 6: Mutation-test the save-success isDirty clear**

Comment out `isDirty.value = false;` in `saveRemoteControl`. Run:

```bash
npx vitest run src/stores/__tests__/remoteControl.spec.ts -t "clears isDirty to false on save success"
```
Expected: FAIL. Restore.

- [ ] **Step 7: Commit**

```bash
npm run format
npm run lint
git add astros_vue/src/stores/remoteControl.ts astros_vue/src/stores/__tests__/remoteControl.spec.ts
git commit -m "feat(remote-store): drop all-empty save filter; clear isDirty on save success"
```

---

## Task 8: Pre-push verification + code review

**Files:** none (verification only)

- [ ] **Step 1: Full type-check + lint + test pass**

```bash
cd astros_vue
npm run lint
npm run build
npx vitest run
```
Expected: all green. Build emits no type errors; vitest reports the new test counts (Task 1: +4, Task 2: +6, Task 3: +3, Task 4: +6, Task 5: +7, Task 6: +6, Task 7: +2 new + 1 replaced; ~34 new test cases total).

- [ ] **Step 2: Pre-push branch review (per CLAUDE.md "Pre-push branch review" section)**

Invoke the multi-agent review on the full branch diff vs develop:

```
/pr-review-toolkit:review-pr
```

This dispatches 5 agents in parallel. Per memory `feedback_pr_review_toolkit_before_push`, this is required for every non-doc-only PR.

**Address findings:**
- Critical / Important: fix before push. Re-run the toolkit if substantial changes land.
- Minor: defer to a follow-up commit if appropriate.

Per CLAUDE.md "When fixing review findings (partial-fix sweep)": grep the related sites for the same drift before marking a finding "fixed."

- [ ] **Step 3: Push (user does this through VS Code)**

Per memory `feedback_git_push`: do NOT run `git push` from terminal. Tell the user the branch is ready and let them push through VS Code.

---

## Task 9: Update tracker checkbox + open PR

**Files:**
- Modify: `.docs/plans/current_project.md`

- [ ] **Step 1: Check off 2a in the tracker**

In `.docs/plans/current_project.md`, change line 24 from:

```
  - [ ] **2a** — Store CRUD foundation (addPage / duplicatePage / deletePage / renamePage /
        selectPage; isDirty flag; drop all-empty save filter). No UI changes.
```

to:

```
  - [x] **2a** — Store CRUD foundation (addPage / duplicatePage / deletePage / renamePage /
        selectPage; isDirty flag; drop all-empty save filter). No UI changes. — shipped <DATE> via PR #<NUMBER>
```

(Fill in date and PR number after merge.)

- [ ] **Step 2: Commit tracker update**

```bash
git add .docs/plans/current_project.md
git commit -m "docs(plan): mark Phase 2a complete in tracker"
```

This is a plan-only commit — no pre-commit toolkit required.

- [ ] **Step 3: Open PR**

```bash
gh pr create --base develop --title "feat(remote): Phase 2a — store CRUD foundation" --body "$(cat <<'EOF'
## Summary
- Extends `useRemoteControlStore` with `selectedIdx`, `isDirty`, and 5 page-CRUD methods (`addPage` / `duplicatePage` / `deletePage` / `renamePage` / `selectPage`) per the Phase 2 design spec
- Removes the all-empty save filter (Decision 3) — every page in the array now persists on save
- Clears `isDirty` on successful load and successful save; mutations flip it true
- ~34 new test cases including mutation-test guards on every defensive branch (single-page delete, selectedIdx clamps, renamePage trim, save-success isDirty clear)

No UI changes; the new store surface is consumed by Phase 2b/2c/2d components.

## Test plan
- [x] Vitest unit suite passes (`npx vitest run`)
- [x] Type-check passes (`npm run build`)
- [x] Lint passes (`npm run lint`)
- [x] Pre-push toolkit run (5 agents)
- [ ] Verify via Storybook in Phase 2b that the new store API matches what components expect

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

After merge, update the tracker commit with the actual PR number and merge date.

- [ ] **Step 4: Update the active-project memory after merge**

Update `~/.claude/projects/-home-jeff-Source-astros-AstrOs-Server/memory/project_active_remote_redesign.md` to reflect 2a shipped: change the Phase 2 bullet from "in flight" to reflect 2a checked, with 2b/2c/2d still queued.

---

## Self-Review

**Spec coverage** (cross-reference to `.docs/plans/specs/2026-05-21-phase2-editor-design.md` Section 4):
- ✅ `selectedIdx: Ref<number>` — Task 2
- ✅ `isDirty: Ref<boolean>` — Task 1
- ✅ `addPage` — Task 3
- ✅ `duplicatePage` — Task 4
- ✅ `deletePage` — Task 5
- ✅ `renamePage` — Task 6
- ✅ `selectPage` — Task 2
- ✅ `loadRemoteControl` clears isDirty + resets selectedIdx — Tasks 1 & 2
- ✅ `saveRemoteControl` persists ALL pages (no filter) + clears isDirty — Task 7
- ✅ Mutation-test guards on every defensive guard — Tasks 1, 2, 4, 5, 6, 7

**Out-of-scope confirmations:**
- ❌ No setButton method (spec §4: view writes directly to `pages[selectedIdx][buttonKey]` — confirmed; no method needed in 2a)
- ❌ No new components
- ❌ No router/i18n changes

**Type consistency check:** All method signatures match the spec table exactly. `RemoteControlPage` and `PageButton` come from `@/models/...` — already imported in the store file.

**Placeholder scan:** No TBDs, no "implement later" comments, no vague guidance. Every test is a complete test; every implementation snippet is the full function body.
