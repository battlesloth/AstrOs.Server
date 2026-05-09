# d.2 — SourceStrip + FwBtn + releases API

## Context

Second slice of phase d (umbrella: `./20260507-2153-firmware-ota-d-vue-firmware-view.md`). Lands the `SourceStrip` component (the dark horizontal strip at the top of the firmware page body), the `FwBtn` button primitive used here and across d.4–d.5, and the server-side `GET /api/firmware/releases` endpoint that exposes the existing `GitHubReleaseService` to the browser.

The umbrella plan describes d.2 as presentational, but a small server-side shim is required: `GitHubReleaseService` is instantiated in `api_server.ts:451` and used internally by the flash orchestrator, but no HTTP route exposes it to the frontend yet. That gap is closed here.

Risk surface: low. Server change is a thin shim (~20 lines) over an already-tested service with documented concurrency/staleness behavior. Frontend is presentational + one store action. Reviewers sign off on Storybook stories for `FwBtn` and `SourceStrip`; no live page demo needed yet (page assembly lands in d.5).

## Scope guard

- Task count: ~9 tasks (within the 8-task scope-guard, slight overflow justified — splitting further would isolate `FwBtn` from its first consumer and produce two PRs that each fail the "independently shippable" criterion).
- Layers: 2 substantive (server endpoint + frontend component/store/Storybook).
- No FMI required — no concurrency, no crash recovery, no filesystem or network state held by this PR. Concurrency hazards in `GitHubReleaseService` are already covered by its existing tests.

## Server-side: GET /api/firmware/releases

- New `astros_api/src/controllers/firmware_releases_controller.ts` registering `GET /firmware/releases` (auth-guarded) that calls `githubReleaseService.getReleases()` and returns `{ releases: ReleaseInfo[], staleSince: string | null }`.
- 502 on cold-cache fetch failure (mirrors the flash controller's `release_lookup_failed` mapping). 200 with `staleSince` set when serving from stale cache.
- Wire in `api_server.ts` next to `registerFirmwareFlashRoutes`. The existing `githubReleaseService` instance is reused — do not construct a second one.

## Tasks

- [x] Add `astros_api/src/controllers/firmware_releases_controller.ts` + `firmware_releases_controller.test.ts` (success / stale-cache / cold-failure cases). Wire registration in `api_server.ts`. (commit `293499e`)
- [x] Move `compareTags` helper from JSX mockup into `astros_vue/src/utils/version.ts`; add unit tests covering normal compare, prerelease ordering (`v1.4.3-rc.1` < `v1.4.3`), and malformed tags. (commit `269dabb` — fixed JSX bug; 13 tests)
- [x] Add `FIRMWARE_RELEASES` constant to `astros_vue/src/api/endpoints.ts`. (commit `dabc60c`)
- [x] Create skeleton `astros_vue/src/stores/firmware.ts` with the d.2 subset of fields plus wire-protocol types in `src/types/firmware.ts`. (commit `dabc60c` — 6 tests)
- [x] Create `astros_vue/src/components/firmware/FwBtn.vue` — 4 kinds + disabled. (commit `f03a8f2`)
- [x] Create `astros_vue/src/components/firmware/SourceStrip.vue` reading from `firmwareStore`. (commit `979696c`)
- [x] Add i18n keys to `astros_vue/src/locales/enUS.json`. (commit `979696c`)
- [x] Storybook: `FwBtn.stories.ts` (7 stories — Primary/Secondary/Ghost/Danger/Disabled/FullWidth/AllKinds), `SourceStrip.stories.ts` (8 stories — github loaded/prerelease/no-selection/loading/stale/error + upload empty/selected). (commits `f03a8f2`, `979696c`)
- [x] Export `FwBtn`, `SourceStrip` from `astros_vue/src/components/index.ts`. Wire `SourceStrip` into `FirmwareView.vue` body for the `select` phase. (commits `f03a8f2`, `979696c`, `3d951a9`)
- [x] Pre-commit per `CLAUDE.md` — every implementation commit ran format + lint + build + tests + `requesting-code-review` before staging.

## Acceptance criteria

- `GET /api/firmware/releases` returns `{ releases, staleSince }` with auth guard; 502 on cold failure; controller test passes.
- `FwBtn` Storybook covers 4 kinds × default + disabled and matches design-handoff §Buttons (color/padding/radius hex-for-hex).
- `SourceStrip` Storybook renders github + upload modes correctly with realistic data and stale-cache state.
- `FirmwareView` shows `SourceStrip` in `select` phase; switching the github/upload toggle preserves each mode's state; selecting a release updates `firmwareStore.selectedReleaseVersion`.
- `compareTags` tests cover prerelease ordering and malformed tags.
- A11y: source toggle uses `role="tablist"` / `role="tab"`; release `<select>` has an associated `<label>`; upload `<input type=file>` has an associated `<label>` even though it's decoratively wired. Lighthouse a11y ≥ 95.
- No console errors in dev or in any Storybook story.

## Out of scope (lands in later PRs)

- Topology SVG → d.3.
- Controllers panel + ControllerRow + VersionDelta + FwStatusPill → d.4.
- StagesList + ConfirmModal + page assembly + flash POST + skeleton store completion → d.5.
- WS dispatcher + live `firmwareStore` + late-join replay + lock-aware `AstrosWriteButton` + e2e → d.6.
- Real Upload-mode functionality (file POST endpoint) → pre-d phase, separate plan.

## Files touched

**New:**

- `astros_api/src/controllers/firmware_releases_controller.ts`
- `astros_api/src/controllers/firmware_releases_controller.test.ts`
- `astros_vue/src/components/firmware/FwBtn.vue`
- `astros_vue/src/components/firmware/FwBtn.stories.ts`
- `astros_vue/src/components/firmware/SourceStrip.vue`
- `astros_vue/src/components/firmware/SourceStrip.stories.ts`
- `astros_vue/src/stores/firmware.ts`
- `astros_vue/src/utils/version.ts`
- `astros_vue/src/utils/__tests__/version.spec.ts`

**Modified:**

- `astros_api/src/api_server.ts` (register releases route)
- `astros_vue/src/api/endpoints.ts` (add FIRMWARE_RELEASES)
- `astros_vue/src/components/index.ts` (export FwBtn, SourceStrip)
- `astros_vue/src/locales/enUS.json` (i18n keys)
- `astros_vue/src/views/FirmwareView.vue` (mount SourceStrip in select phase)
