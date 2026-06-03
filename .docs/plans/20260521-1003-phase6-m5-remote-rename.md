# Phase 6 — Backend M5 → Remote rename + DB key migration

**Date:** 2026-05-21
**Tier:** Light plan (per CLAUDE.md Planning section)
**Parent project:** [`current_project.md`](./current_project.md) — Remote Control Redesign + Mobile Remote
**Branch:** `feature/phase6-m5-remote-rename`

## Goal

Drop the historical `M5*` prefix from the backend remote-config types now that M5Stack is no
longer the only consumer of `/remotecontrolsync` (Phase 4's mobile web remote will hit the
same endpoint). Rename `M5Page` / `M5Button` / `M5ScriptList` to `RemotePage` /
`RemoteButton` / `RemoteScriptList`, matching the frontend's already-generic naming
(`RemoteControlPage`, `PageButton`). Migrate the `remote_config.type` DB string key from
`astrOsScreen` to `remoteConfig`. M5Stack hardware behavior is unchanged because the wire
shape on `/remotecontrolsync` is determined by the JSON serialization of `M5ScriptList`'s
structural shape — renaming the TypeScript type does not change the JSON keys, and the
endpoint URL itself is out of scope.

## Failure-mode inventory

Not required. The DB migration is a single `UPDATE` against a `UNIQUE NOT NULL` column with
no schema change, no orphaned-FK risk, no concurrency surface (server is single-process and
single-tenant at boot). No filesystem state, no network recovery. Pure type rename + a
load-time data update.

## Hidden gotchas surfaced during planning

1. **`remote_config.type` is `UNIQUE NOT NULL`** (migration_0.ts:35). The rename must be a
   single atomic `UPDATE`, not INSERT-new + DELETE-old — the latter would either fail the
   uniqueness check on the new row or leave both rows around if the transaction is split.
2. **Migration ordering on fresh installs.** Migration_0 currently seeds the row with
   `type = 'astrOsScreen'`. If we leave that seed and add migration_7, a fresh install
   inserts the old key and immediately rewrites it on the same boot. Cleaner: update
   migration_0's seed to `'remoteConfig'` AND add migration_7. Editing migration_0 only
   affects databases that have never run migrations (the migrations table tracks
   completion); existing installs go through migration_7's `UPDATE` instead.
3. **Two stale comment-only "M5 firmware" references** remain in the Vue store after
   Phase 1: `astros_vue/src/stores/remoteControl.ts:50` and
   `astros_vue/src/stores/__tests__/remoteControl.spec.ts:86`. Both describe the wire
   contract using the term "M5 firmware" — now factually wrong as soon as the mobile
   remote ships in Phase 4. Sweep them to "remote firmware" / "remote consumer" while
   we're already touching the area.
4. **The `M5Page` class export is mixed** (`models/index.ts:43`). `M5Page` and
   `PageButton` are exported as runtime classes (`export { M5Page, PageButton }`), while
   `M5Button` and `M5ScriptList` are type-only exports. The barrel update must preserve
   that distinction — `RemotePage` and `PageButton` stay value exports.

## Tasks

- [x] **Task 1 — Backend type rename: files, symbols, barrel exports.** Rename
      `astros_api/src/models/remotes/M5Page.ts` → `RemotePage.ts`,
      `M5Button.ts` → `RemoteButton.ts`, `M5ScriptList.ts` → `RemoteScriptList.ts`, and
      the Phase-1-added `M5Page.test.ts` → `RemotePage.test.ts`. Inside each file rename
      the class/interface (`M5Page` → `RemotePage`, etc.) and update the `BUTTON_KEYS`
      `keyof Omit<...>` constraint accordingly. Update `models/index.ts` exports — keep
      `RemotePage` and `PageButton` as value exports (class re-export), keep
      `RemoteButton` and `RemoteScriptList` as type-only. Update
      `controllers/remote_config_controller.ts` imports and all usages
      (`Array<M5Page>` → `Array<RemotePage>`, `M5ScriptList` → `RemoteScriptList`,
      `new Array<M5Button>()` → `new Array<RemoteButton>()`).
- [x] **Task 2 — DB key call-site update + migration_7.** Switch the three
      `repo.getConfig('astrOsScreen')` / `repo.saveConfig('astrOsScreen', ...)` call sites
      in `remote_config_controller.ts` to `'remoteConfig'`. Add
      `astros_api/src/dal/migrations/migration_7.ts` that runs `UPDATE remote_config SET
      type = 'remoteConfig' WHERE type = 'astrOsScreen'` on `up` and the reverse on `down`
      (single-row update, trivially reversible — different policy from migration_6 which
      throws on down because the rename-dance is hard to undo). Register migration_7 in
      `migrations/index.ts` and in both migration providers in `dal/database.ts` (look for
      the `'6_add_foreign_keys'` line — copy the pattern). Update migration_0's seed
      `type: 'astrOsScreen'` → `type: 'remoteConfig'` so fresh installs land clean.
- [x] **Task 3 — Migration test.** New
      `astros_api/src/dal/migrations/migration_7.test.ts` following the pattern from
      `migration_6.test.ts` (build a v6 provider with migrations 0–6, apply, seed an
      `astrOsScreen` row, then apply a v7 provider with migration_7 added). Cover:
      (a) the existing `astrOsScreen` row is renamed to `remoteConfig` with `value`
      preserved; (b) `down` reverses it back to `astrOsScreen`; (c) idempotency — running
      `up` when no `astrOsScreen` row exists is a no-op (fresh-install path where
      migration_0's new seed already produced `remoteConfig`); (d) **vacuous-fix guard:**
      revert the `WHERE` clause to a typo (`'astroScreen'`) locally and confirm test (a)
      fails — per memory rule, prevents a green-but-broken migration.
- [x] **Task 4 — Vue comment sweep.** Update the two stale "M5 firmware" comment-only
      references at `astros_vue/src/stores/remoteControl.ts:50` and
      `astros_vue/src/stores/__tests__/remoteControl.spec.ts:86` to "remote firmware" or
      "remote consumer" — whichever reads naturally in context. Comment-only; no logic
      change.
- [x] **Task 5 — Verification + pre-push toolkit.** Pre-push toolkit run
      (5 agents) returned 1 Critical (syncRemoteConfig forEach on `'{}'` seed) +
      3 Important (over-broad-WHERE test gap, missing wire-shape e2e test,
      past-tense Phase 4 comment). All four landed in commit 80c3a81. Manual M5
      smoke test pending push.
      - `npm run prettier:write` + `npm run lint:fix` on both packages.
      - `npm run build` (vue + api) succeeds.
      - `npx vitest run` clean on both packages — migration_7 test passes; existing
        migration_6 test still passes (didn't regress provider construction).
      - Invoke `superpowers:requesting-code-review` on each implementation commit.
      - Manual: smoke test that an existing install with an `astrOsScreen` row migrates
        on boot to `remoteConfig` and `/remotecontrolsync` still returns the same JSON.
        Bench-test on the real M5 if convenient (the wire shape didn't change, so
        regression risk is low).
      - Run `/pr-review-toolkit:review-pr` on the full branch diff vs `develop` before
        push (mandatory per CLAUDE.md).

## Out of scope

- Renaming the endpoint URL `/remotecontrolsync` — would break the M5 firmware which has
  the path baked in. URL stays; only internal types and the DB key change.
- Frontend type renames — frontend already uses generic names (`RemoteControlPage`,
  `PageButton`).
- Anything in `models/control_module/`, `models/scripts/`, or other unrelated subtrees.

## Verification gates

- Build clean on both packages.
- Vitest clean on both packages including the new migration_7 test.
- Manual smoke per Task 5.
- Pre-push toolkit clean (Critical/Important findings addressed).

## Critical files touched

- `astros_api/src/models/remotes/RemotePage.ts` (renamed from M5Page.ts)
- `astros_api/src/models/remotes/RemoteButton.ts` (renamed from M5Button.ts)
- `astros_api/src/models/remotes/RemoteScriptList.ts` (renamed from M5ScriptList.ts)
- `astros_api/src/models/remotes/RemotePage.test.ts` (renamed from M5Page.test.ts)
- `astros_api/src/models/index.ts`
- `astros_api/src/controllers/remote_config_controller.ts`
- `astros_api/src/dal/migrations/migration_0.ts` (seed value only)
- `astros_api/src/dal/migrations/migration_7.ts` (new)
- `astros_api/src/dal/migrations/migration_7.test.ts` (new)
- `astros_api/src/dal/migrations/index.ts`
- `astros_api/src/dal/database.ts` (migration provider registration)
- `astros_vue/src/stores/remoteControl.ts` (comment-only)
- `astros_vue/src/stores/__tests__/remoteControl.spec.ts` (comment-only)
