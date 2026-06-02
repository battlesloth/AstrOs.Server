# Change Password (Utility page)

Add a "Change Password" feature to the Utility page: a labeled row with a button that
launches a modal collecting current / new / confirm passwords, with Cancel and Accept
buttons. Changes the single `admin` account's password.

## Design decisions

- **Validation:** new password requires **length ≥ 8 only** (no upper/lower/digit
  complexity rule). Confirm must equal new. Old password verified server-side.
- **Endpoint home:** `authentication_controller.ts` (conceptually an auth op).
- **Modal:** dedicated reusable component, presentational + self-validating; the view
  owns the API call (mirrors `AuthView`/`AstrosLogin`).
- **Success UX:** close modal + reuse the existing Alert modal to show "Password updated".

## Tasks

- [x] **Backend repo + endpoint (TDD):** add `UserRepository.updatePassword(user)`;
      add authenticated `POST /api/changePassword` in `authentication_controller.ts`
      (wrong old → 403, new < 8 / non-string → 400, success persists fresh hash); thread
      `auth`+`db` into `registerAuthRoutes` and update the `api_server.ts` call site.
      Tests: repo update + endpoint behaviors (in-memory DB). 403 (not 401) so the
      frontend's global 401-logout interceptor doesn't sign the user out mid-change.
- [x] **`AstrosFieldPassword` enhancement:** optional backward-compatible `placeholder`,
      `ariaLabel`, `inputId` props (default to current values) so three fields have
      distinct accessible names and label associations.
- [x] **`AstrosChangePasswordModal` component (+ stories, types, spec):** three labeled
      password fields, client validation (old non-empty, new ≥ 8, confirm === new),
      inline `role="alert"` errors, `errorMessage` prop for server errors, emits
      `cancel` / `accept({ oldPassword, newPassword })` / `dirty`. Frontend test:
      validation + emits + error display.
- [x] **`UtilityView.vue` wiring + endpoint const + i18n:** add `CHANGE_PASSWORD` to
      `endpoints.ts`; add the Change Password row + modal toggle + POST handler
      (success → close + Alert "Password updated"; failure → error into modal); add
      `utility_view.*` i18n keys to `enUS.json`.
- [x] **QA plan:** add `.docs/qa/change-password.md`.

## Verification

- `astros_api`: `npm run prettier:write` + `npm run lint:fix` + `npm run build` + `npx vitest run`.
- `astros_vue`: `npm run lint` + `npm run build` + `npm run test:unit`.
- Code review on the diff before each implementation commit; `/pr-review-toolkit:review-pr`
  on the full branch before push.
