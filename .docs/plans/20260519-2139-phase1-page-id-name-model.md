# Phase 1 — Page id/name data model

**Date:** 2026-05-19
**Tier:** Light plan (per CLAUDE.md Planning section)
**Parent project:** [`current_project.md`](./current_project.md) — Remote Control Redesign + Mobile Remote
**Branch:** `feature/phase1-page-id-name-model`

## Goal

Give each `RemoteControlPage` (frontend) and `M5Page` (backend) a stable `id` (UUID) and a
human-readable `name`, with a load-time migration that backfills both fields for any legacy
pages already stored in `astrOsScreen`. The new fields are required at the type level so the
TypeScript compiler catches every page-creation site. Existing M5Stack hardware behavior is
unchanged because `/remotecontrolsync` derives `M5ScriptList` from the buttons only — page
metadata never reaches the M5.

## Failure-mode inventory

Not required. No filesystem state, no concurrency, no network-recovery surface, no
crash-recovery semantics. Pure type addition + a synchronous load-time migration.

## Hidden gotchas surfaced during planning

These two iteration bugs already exist in the codebase and would silently break once new
fields land on the page object. They MUST be fixed as part of this phase, not deferred:

1. **`M5Page.hasSettings()`** (`astros_api/src/models/remotes/M5Page.ts:24-34`) iterates
   `for (const key in this)` and casts every value to `PageButton`. After adding `id`/`name`,
   the loop would compare a UUID string's `.id` (`undefined`) against `'0'`, return true,
   and break the "is this page empty?" check.
2. **`saveRemoteControl()` filter** (`astros_vue/src/stores/remoteControl.ts:68-70`) does
   `Object.values(page).some((button) => button.id !== '0')`. Same bug pattern — page-level
   id/name would be treated as buttons and the filter would retain every page.

Fix: introduce a single source-of-truth `BUTTON_KEYS` const (`['button1' ... 'button9']`)
and use it for both sites instead of reflection. Same const can be reused by `migratePage`
to iterate only buttons.

## Tasks

- [ ] **Task 1 — Frontend: types + button-keys helper + migration + filter fix.** Extend
      `RemoteControlPage` with `id: string` and `name: string`. Add `BUTTON_KEYS` const to
      `astros_vue/src/models/remoteControl/pageButton.ts` (or a sibling). Update
      `stores/remoteControl.ts`: `createDefaultPage(idx)` takes an index for naming; new
      `migratePage(page, idx)` backfills missing id/name via `crypto.randomUUID()` and
      `Page ${idx + 1}` while delegating button migration as today; `saveRemoteControl()`
      filter switches to iterating `BUTTON_KEYS` only. Update the local `createEmptyPage()`
      in `components/remoteControl/AstrosRemoteControl.vue` (Phase 2 will rewrite it, but
      TS will fail without id/name today). Pages pushed by `pageForward()` get a fresh id
      and an index-derived name.
- [ ] **Task 2 — Backend: M5Page id/name fields + hasSettings() fix.** Add `id: string`
      and `name: string` to `M5Page` with constructor params and sensible defaults
      (`crypto.randomUUID()` and an empty name — backend construction is rare; the editor
      is the source of truth for names). Rewrite `hasSettings()` to iterate over an
      explicit `BUTTON_KEYS` list (defined locally on the class or in
      `astros_api/src/models/remotes/M5Page.ts`). `remote_config_controller.ts` is
      unchanged — it never references id/name on the page (only on buttons).
- [ ] **Task 3 — Tests: migratePage + save filter (frontend).** New
      `astros_vue/src/stores/__tests__/remoteControl.spec.ts` covering:
      - `migratePage` adds id (UUID-shaped) and name (`Page N`) when missing.
      - `migratePage` preserves existing id/name (does not overwrite).
      - `migratePage` still migrates buttons.
      - `loadRemoteControl` with empty server response seeds one default page that has id/name.
      - `saveRemoteControl` retains a page that has at least one non-`'0'` button.
      - `saveRemoteControl` drops a page where all 9 buttons are `'0'` — even if the page's
        id/name are populated strings. **This is the vacuous-fix guard:** if the filter
        regresses to `Object.values(page).some(...)`, this test must fail. Per memory rule,
        revert the fix locally once and confirm the test fails before keeping the fix in.
- [ ] **Task 4 — Backend test: M5Page.hasSettings().** New
      `astros_api/src/models/remotes/M5Page.test.ts` covering: default page (id+name set,
      all buttons `'0'`) → `hasSettings() === false`. Page with one non-default button →
      `true`. **Vacuous-fix guard:** revert the loop fix and confirm the false-case test fails.
- [ ] **Task 5 — Manual M5Stack sync bench test (owner: Jeff).** After implementation but
      before merge: with the bench rig, sync the updated config to a real M5 device via
      `/remotecontrolsync` and confirm the existing buttons still render and fire. No
      automated coverage — this is the only step that proves nothing in the M5 firmware
      tripped over the schema change. If this fails, the plan goes back to Task 2.

## Out of scope

- Page rename UI (lands in Phase 2 with the editor rebuild).
- Page reordering (Phase 5).
- Any UI use of `name` beyond defaulting it on creation.

## Verification

- `npm run build` (vue + api) succeeds — id/name being required fields catches every
  call site at compile time. If a site is silently widened to `id?: string`, that's the
  signal that we drifted from the plan.
- `npx vitest run` clean on both packages.
- `npm run lint:fix` clean.
- Manual: bench M5 sync per Task 5.

## Critical files touched

- `astros_vue/src/models/remoteControl/remoteControlPage.ts`
- `astros_vue/src/models/remoteControl/pageButton.ts` (or sibling) — `BUTTON_KEYS`
- `astros_vue/src/stores/remoteControl.ts`
- `astros_vue/src/components/remoteControl/AstrosRemoteControl.vue` (minimal — just the
  local helper that TS will complain about)
- `astros_api/src/models/remotes/M5Page.ts`
- `astros_vue/src/stores/__tests__/remoteControl.spec.ts` (new)
- `astros_api/src/models/remotes/M5Page.test.ts` (new)
