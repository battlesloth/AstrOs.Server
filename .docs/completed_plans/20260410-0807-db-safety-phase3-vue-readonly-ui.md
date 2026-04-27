# DB Safety — Phase 3: Vue Read-Only UI

Part 3 of 3 of the DB Migration Safety Net feature. Companion phases:

- Phase 1 — `20260410-0807-db-safety-phase1-backup-readonly.md` (**must ship first**)
- Phase 2 — `20260410-0807-db-safety-phase2-schema-migrations.md` (independent of this phase)

## Context

Phase 1 gives the backend the ability to enter read-only mode and expose that state over HTTP + WebSocket. This phase makes the state visible to the user and disables write-intent controls in the Vue frontend, so an operator logging in immediately sees what's happening and doesn't bounce their head against "save" buttons that silently fail.

## Goal

A persistent read-only banner at the top of the app, disabled save/delete controls in write-intent views, and a graceful 503 handler in the API service layer that surfaces a toast when a write slips through.

## Tasks

- [x] Add `SYSTEM_STATUS` endpoint to `astros_vue/src/api/endpoints.ts`:
  ```typescript
  export const SYSTEM_STATUS = '/system/status';
  ```

- [x] Create `astros_vue/src/stores/systemStatus.ts`:
  - Pinia store with `readOnly: Ref<boolean>`, `reasonCode: Ref<ReadOnlyReasonCode | null>`, `enteredAt: Ref<string | null>`.
  - `ReadOnlyReasonCode` is the same string-union type as the API:
    `'STARTUP_OPEN_FAILED' | 'BACKUP_FAILED' | 'MIGRATION_FAILED_NO_BACKUP' | 'MIGRATION_FAILED_RESTORE_FAILED'`.
  - `fetchStatus()` — GET `/system/status`, updates refs.
  - `setStatus(state)` — used by WebSocket message handler and by the API interceptor.
  - Expose `readOnly`, `reasonCode`, `enteredAt`, `fetchStatus`, `setStatus`.

- [x] Update `astros_vue/src/composables/useWebsocket.ts` (or wherever `handleMessage` dispatches) to handle `SYSTEM_STATUS` messages and forward them to `systemStatusStore.setStatus()`. Add the new type to the existing discriminator.

- [x] Update `astros_vue/src/App.vue` mount hook to call `systemStatusStore.fetchStatus()` once before the WebSocket connects. (The WebSocket will also push initial state on connect — this is belt-and-braces for the window between HTTP load and WS handshake.)

- [x] Create `astros_vue/src/components/common/SystemStatusBanner.vue`:
  ```vue
  <template>
    <div
      v-if="systemStatusStore.readOnly"
      class="alert alert-warning rounded-none"
      role="status"
      aria-live="polite"
    >
      <span class="font-bold">{{ $t('systemStatus.readOnly.title') }}</span>
      <span>
        {{ $t(`systemStatus.reasonCode.${systemStatusStore.reasonCode || 'UNKNOWN'}`) }}
      </span>
    </div>
  </template>
  ```
  - Map the API's structured `reasonCode` to a human-readable, localized
    string at render time. Unknown codes fall back to `UNKNOWN`.
  - DaisyUI `alert-warning` matches existing toast patterns.
  - `role="status"` + `aria-live="polite"` for screen readers (per CLAUDE.md a11y rules).
  - Full-width, `rounded-none` so it reads as chrome, not a card.
  - **Persistent — no dismiss button.** When the banner goes away, the mode really ended (via a container restart).

- [x] Mount `SystemStatusBanner` at the top of `astros_vue/src/components/common/layout/AstrosLayout.vue`, above the navbar. It should push content down when visible without layout jank.

- [x] Update `astros_vue/src/api/apiService.ts` axios response interceptor to detect `503` responses that carry a read-only payload (`{ message, reasonCode }` shape from `write_guard.ts`):
  - Call `systemStatusStore.setStatus({ readOnly: true, reasonCode })`.
  - Surface a toast: `useToast().warning(t('systemStatus.readOnly.requestBlocked'))`.
  - Reject the promise so the calling code sees the failure and can bail out cleanly.

- [x] Disable write-intent buttons in primary views when `systemStatusStore.readOnly === true`:
  - Scripts view (save, delete, copy)
  - Scripter view (save)
  - Playlists view (save, delete, copy, run)
  - Playlist editor (save)
  - Remote view (save)
  - Modules view (save, reconfigure)
  - Utility view (sync controllers, deploy, format SD, direct command)
  - Settings view (save)

  **Pattern:** view imports `useSystemStatusStore`, destructures `readOnly`, binds to button `:disabled="readOnly"`. Add `:title="readOnly ? $t('systemStatus.readOnly.disabled') : ''"` for tooltip.

- [x] Add i18n keys to `astros_vue/src/locales/enUS.json`:
  ```json
  "systemStatus": {
    "readOnly": {
      "title": "Read-only mode",
      "disabled": "This action is disabled while the system is in read-only mode.",
      "requestBlocked": "The server is in read-only mode. Your change was not saved."
    },
    "reasonCode": {
      "STARTUP_OPEN_FAILED": "The database could not be opened at startup. The server is running on a temporary in-memory database with no data.",
      "BACKUP_FAILED": "A pre-migration backup could not be written. The schema upgrade was skipped.",
      "MIGRATION_FAILED_NO_BACKUP": "A schema migration failed and there was no prior backup to restore from. The database may be in a partially-migrated state.",
      "MIGRATION_FAILED_RESTORE_FAILED": "A schema migration failed and the automatic restore also failed. Manual recovery is required.",
      "UNKNOWN": "The database is currently unavailable for writes."
    }
  }
  ```

- [x] Write a Storybook story for `SystemStatusBanner` showing the hidden state and visible variants for each `reasonCode` (plus the `UNKNOWN` fallback).

## Tests

- [x] `astros_vue/src/stores/__tests__/systemStatus.spec.ts`:
  - Store state transitions (default → read-only → default on setStatus).
  - `fetchStatus` success updates refs correctly.
  - `fetchStatus` failure leaves refs at previous state, does not throw.
  - `setStatus` correctly handles partial payloads.
- [x] `astros_vue/src/components/common/__tests__/SystemStatusBanner.spec.ts`:
  - Renders nothing when `readOnly === false`.
  - Renders alert with the localized reasonCode message when `readOnly === true`.
  - Renders fallback (`UNKNOWN`) i18n string when `reasonCode` is null or unrecognized.
  - Has `role="status"` and `aria-live="polite"` attributes.
- [x] Integration/snapshot: verify `AstrosLayout` mounts the banner above the navbar.

## QA test plan

Create `docs/qa/system-readonly-mode.md`:

**Preconditions:** server running, successful login, ability to force read-only mode (via a test hook or a scripted bad migration in a dev container).

**Test cases:**
1. Force read-only mode. Verify the banner appears within ≤1s via WebSocket push.
2. Refresh the page. Verify banner still appears (from `fetchStatus` on mount).
3. Navigate to Scripts view. Verify all save/delete/copy buttons are disabled with tooltip.
4. Attempt to save a script via direct API call (devtools). Verify 503 response with `reasonCode` field and a toast surfaces.
5. Log out, log back in. Verify login works and banner reappears after login.
6. Verify `POST /panicStop` still succeeds (Utility view panic button).
7. Verify `GET /settings/logs` still works (log download).
8. Restart the container without fixing the underlying issue. Verify the banner returns.
9. Clear the underlying issue (e.g. rollback container). Verify normal mode resumes.

## Critical files

- `astros_vue/src/stores/systemStatus.ts` — new
- `astros_vue/src/components/common/SystemStatusBanner.vue` — new
- `astros_vue/src/components/common/layout/AstrosLayout.vue` — mount banner
- `astros_vue/src/api/apiService.ts` — 503 interceptor
- `astros_vue/src/api/endpoints.ts` — add `SYSTEM_STATUS`
- `astros_vue/src/composables/useWebsocket.ts` — handle `SYSTEM_STATUS` message
- `astros_vue/src/App.vue` — initial fetch on mount
- `astros_vue/src/locales/enUS.json` — new `systemStatus.*` keys
- All write-intent views listed above — `:disabled="readOnly"` bindings
- `docs/qa/system-readonly-mode.md` — new QA plan

## Verification

- `cd astros_vue && npx vitest run` — all existing + new tests pass.
- `cd astros_vue && npx vue-tsc --noEmit` — clean.
- `cd astros_vue && npx eslint src/...` on modified files — clean.
- Manual QA: follow the plan in `docs/qa/system-readonly-mode.md`.

## Plan amendment (Phase 3 startup, 2026-04-26)

The plan was authored before Phase 1 went through PR review. During that
review, the API's read-only payload was sanitized: the free-form
`reason: string` (which would have leaked filesystem paths and SQL
fragments to an unauthenticated `/api/system/status` endpoint) was replaced
with `reasonCode: ReadOnlyReasonCode` — a discriminated string union
(`STARTUP_OPEN_FAILED | BACKUP_FAILED | MIGRATION_FAILED_NO_BACKUP |
MIGRATION_FAILED_RESTORE_FAILED`). Full error details are logged
server-side only.

This amendment updates Phase 3 to consume the structured code:

  - Store holds `reasonCode`, not `reason`.
  - Banner template renders `$t(\`systemStatus.reasonCode.${code || 'UNKNOWN'}\`)`.
  - 503 interceptor reads `reasonCode` from the response body.
  - i18n keys are reorganized into `systemStatus.reasonCode.*` (one per
    code, plus `UNKNOWN` fallback) and `systemStatus.readOnly.*` (UI
    strings: title, disabled tooltip, request-blocked toast).

## Plan amendment 2: restore-success now enters read-only (2026-04-26)

Reviewing Phase 1's "locked" design call ("restore success = server
continues at pre-migration version") flagged a real issue: silent
recovery hid migration failures from operators, and writes against the
rolled-back schema could compound the underlying problem before the
fixed migration shipped. Phase 2's FK enforcement work made this
hazard concrete — a migration could fail because of orphans, restore
could roll back, and operators would never know to investigate.

Add a new `MIGRATION_FAILED_RESTORED` reason code:

  - DB is at a known-good prior version (restore worked).
  - System enters read-only anyway. Operators see the banner and know
    to investigate before redeploying.
  - Distinct from `MIGRATION_FAILED_RESTORE_FAILED` (DB possibly
    broken) and `MIGRATION_FAILED_NO_BACKUP` (DB possibly partial).

Touches API (`system_status.ts`, `database.ts`, integration test) and
Vue (store union, banner allowlist, i18n, story, banner test) — all
in this PR.

## Notes

- Match existing toast styling (see `AstrosToastContainer.vue` and `useToast.ts`) for visual consistency.
- Follow CLAUDE.md i18n rule: never hardcode user-facing strings.
- The banner is chrome — it should not block interaction with the rest of the UI. Only buttons explicitly bound to `readOnly` are disabled.
- Full design doc: `~/.claude/plans/atomic-fluttering-token.md`.
