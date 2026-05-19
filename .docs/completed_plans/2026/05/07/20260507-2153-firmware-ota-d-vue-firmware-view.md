# Phase d — Vue Firmware View (master roadmap)

## Context

The AstrOs firmware-OTA feature is complete on the server side: `c.0`–`c.6c.2` shipped via PRs #72–#77, the integration harness merged, and operators can drive a flash via `curl` against `/api/firmware/flash`. The only remaining piece in the master decomposition (`./20260427-2202-firmware-ota-decomposition.md`) is **§d — Vue UI**. The QA plan (`../qa/firmware-ota-flash.md:75`) explicitly notes the UI is "not yet wired."

Phase d closes the user-facing loop: a top-level `/firmware` route lets an operator pick a source (GitHub release or local upload), pick controllers, see a live topology + per-controller stage progression, and react to success/failure — without leaving the app or hitting the API directly. The design source of truth is `../design_handoff_firmware_update/` (Direction C, the topology console).

Server-side WS events + HTTP routes already exist and are stable. **Exception: a server-side firmware-upload route does not yet exist.** Only `POST/DELETE/GET /api/firmware/flash` is registered; the flash route accepts `source: { kind: 'upload' }` but expects an upload to already be on disk. Building that route is being broken out as its own **pre-d phase** (separate plan, separate PR) and is a prerequisite for Upload mode to be functional. Phase d will design the Upload-mode UI in d.2 but it ships decoratively until pre-d lands.

This roadmap covers all of phase d. Each PR has its own focused plan file (`20260507-XXXX-firmware-ota-d-N-...md`) committed to its own feature branch. This file lives on `develop` and serves as the cross-PR reference.

---

## Phase split — 6 PRs

CLAUDE.md scope guard says >8 tasks or 3+ layers should be split. Phase d has ~10 task-units across 4 layers; further splitting into Storybook-friendly slices keeps each PR review window small and concentrates the WS-lifecycle hazards into a single final PR (d.6) where the pre-push branch review can be applied rigorously.

| Phase | What ships | Layer focus | Risk surface | Branch |
|---|---|---|---|---|
| **d.1** | Route + nav + chrome + design tokens + i18n + empty `FirmwareView` | UI scaffold | Tiny | `feature/firmware-ota-d-1-page-chrome` |
| **d.2** | `SourceStrip` + `FwBtn` + GitHub releases API call + Storybook | Presentational | Low | `feature/firmware-ota-d-2-source-strip` |
| **d.3** | `Topology` SVG + CSS keyframes + Storybook | Presentational | Low | `feature/firmware-ota-d-3-topology` |
| **d.4** | `ControllersPanel` + `ControllerRow` + `VersionDelta` + `compareTags` + `FwStatusPill` + Storybook | Presentational + tiny logic | Low | `feature/firmware-ota-d-4-controllers-panel` |
| **d.5** | `StagesList` + `ConfirmModal` + page assembly + skeleton `firmwareStore` (UI-state only) + flash POST + Storybook | Page integration with mocked store | Medium (HTTP errors, modal a11y) | `feature/firmware-ota-d-5-page-assembly` |
| **d.6** | WS dispatcher + live `firmwareStore` + late-join replay + lock-aware `AstrosWriteButton` + lock banner + e2e test | WS lifecycle + concurrency | High — the FMI surface | `feature/firmware-ota-d-6-live-wiring` |

Each PR ≤ ~5–8 files. d.1–d.4 are pure presentational; reviewers sign off on Storybook stories alone. d.5 is the first PR where the page is end-to-end demoable, but only against mocked store state — no harness setup needed for review. d.6 is the only PR with WS lifecycle hazards; run `/pr-review-toolkit:review-pr` before pushing it.

---

## WebSocket event contract (verified against server)

Source: `astros_api/src/firmware/flash_orchestrator.ts:323-344` (the `FlashOrchestratorWsMessage` discriminated union) + `astros_api/src/models/enums.ts:82` (TransmissionType numeric values).

| `type` (numeric) | Name | Envelope | Payload |
|---|---|---|---|
| 11 | `flashJobActive` | flat | rejection echo for write-class WS messages sent during a flash; UI doesn't subscribe |
| 12 | `flashJobStarted` | `{type, data}` | `FlashJobState` — `{ jobId, source, controllers[], startedAt, endedAt?, abortReason? }` |
| 13 | `flashControllerUpdate` | `{type, data}` | `ControllerFlashState` — discriminated union by `stage` |
| 14 | `flashControllerResult` | `{type, data}` | `{ jobId, controller: ControllerFlashState }` |
| 15 | `flashJobDone` | `{type, data}` | `{ jobId, endedAt }` |
| 16 | `flashJobFailed` | `{type, data}` | `FlashJobFailedData` — `{ jobId, reason, endedAt, abortReason?, detail? }` |

`FwStage` enum (string literals): `'QUEUED' | 'UPLOADING_TO_MASTER' | 'SENDING' | 'VERIFYING' | 'REBOOTING' | 'VERSION_CONFIRMED' | 'FAILED'`.

`lockStateChanged` (type=10) is already wired and is **flat** (`{type, locked, owner, since}`) — no change.

Late-join: `astros_api/src/api_server.ts:654-669` sends one `flashJobStarted` snapshot on connect when a job is in flight; `firmwareStore.applyJobStarted` must be idempotent.

---

## firmwareStore shape (Pinia composition) — d.5 + d.6

```ts
// Server-pushed state (WS is the single writer in d.6; in d.5 these are mock-set)
currentJob: ref<FlashJobState | null>(null)
controllerStates: ref<Map<string, ControllerFlashState>>(new Map())
phase: ref<'idle' | 'select' | 'flashing' | 'done' | 'failed'>('idle')
abortReason: ref<string | null>(null)
lastError: ref<{ reason?: string, detail?: string } | null>(null)

// UI selection state
sourceMode: ref<'github' | 'upload'>('github')
selectedReleaseVersion: ref<string | null>(null)
uploadedFilename: ref<string | null>(null)
selectedControllerIds: ref<Set<string>>(new Set())
releases: ref<ReleaseSummary[]>([])
confirmOpen: ref(false)

// Getters
target: computed(...)
canFlash: computed(...)
isJobInFlight: computed(...)

// WS handlers (stubs in d.5, real in d.6)
applyJobStarted, applyControllerUpdate, applyControllerResult, applyJobDone, applyJobFailed
resetToSelect()

// HTTP actions
async fetchReleases(): Promise<void>             // d.2
async startFlash(): Promise<void>                // d.5
async cancelFlash(reason: string): Promise<void> // d.5
async fetchCurrentJob(): Promise<void>           // d.6 — cold-load resync
```

**Hard rule (enforced from d.6):** WS dispatcher is the sole writer of server-pushed fields. HTTP responses surface only synchronous validation; WS is the truth source for in-flight state.

---

## Server-stage to UI-stage mapping (d.6)

Server `FwStage` has 7 values; design handoff defines 5 stages (download / transfer / flash / verify / reboot). Define `mapServerStageToUiStage(stage: FwStage): UiStageKey` in `firmwareStore` (with unit tests in d.6):

| Server `FwStage` | UI stage key | Notes |
|---|---|---|
| `QUEUED` | (no UI stage; row shows status pill `queued`) | |
| `UPLOADING_TO_MASTER` | `download` | "Master receives file" |
| `SENDING` | `transfer` (and implicitly `flash` during send) | |
| `VERIFYING` | `verify` | |
| `REBOOTING` | `reboot` | |
| `VERSION_CONFIRMED` | (terminal success — all stages checked) | |
| `FAILED` | (terminal failure — current stage shows `!`) | UI-stage derived from per-controller `error` + last-known stage progression |

Don't add a "flash" stage to the server enum.

---

## Lock-aware UI integration (d.6)

- No global lock-banner component exists today; write-blocking is per-button via `AstrosWriteButton` reading `systemStatus.readOnly`.
- d.6 extends `AstrosWriteButton` to OR-in `useJobLockStore().locked`. Tooltip key: `firmware_view.lock_active`. Existing `systemStatus.readOnly` test must keep passing; new test asserts disable when only `jobLock.locked` is true.
- d.6 adds a passive page-level banner in `AstrosLayout.vue` (next to existing system-status banner) that appears when `useJobLockStore().locked === true` reading "Firmware update in progress — write actions disabled."
- `FirmwareView`: when `lockStore.locked` and the lock owner doesn't match our in-flight job, render a `role="alert"` region with the lock owner; disable Flash button. When the lock owner matches, the flashing UI takes over.

---

## FMI inventory (d.6 surface)

All concurrency hazards land in d.6. Apply `/pr-review-toolkit:review-pr` before pushing.

| Hazard | Risk | Coverage |
|---|---|---|
| **Concurrency: late-join + cold-load fetch race** | Both `firmwareStore.fetchCurrentJob()` (HTTP GET on mount) and the WS replay `flashJobStarted` could fire on view enter | `applyJobStarted` is idempotent; HTTP GET sets state only if `currentJob === null`; explicit unit test |
| **Concurrency: WS reconnect during flash** | `useWebsocket` reconnects every 3s; server sends `flashJobStarted` snapshot on reconnect | `applyJobStarted` *replaces* (not merges) `controllerStates`; explicit unit test |
| **Resource lifecycle: tab-close mid-flash** | Browser navigation/close is NOT a flash-cancel signal — server holds the lock until heartbeat or 15s timer | UI must NOT trigger cancel on `beforeunload`; on return, WS state remains authoritative; FirmwareView mount/unmount test |
| **Resource lifecycle: stale `controllerStates` after job ends** | After `flashJobDone`/`flashJobFailed`, the next flash could inherit stale per-controller stages | `resetToSelect()` clears `controllerStates`; called when operator clicks "Done" in result bar |
| **Operability: enum drift between Vue and server** | Vue's `WebsocketMessageType` is a hand-maintained mirror; if server adds a value, the Vue switch silently misroutes | Comment cross-reference at top of Vue enum; runtime `default:` warn-on-unknown in `handleMessage` (already present) |
| **Operability: WS handler errors swallow real bugs** | Existing handlers catch+log; firmware handlers must follow that pattern but also reset `phase` to `idle` on `flashJobFailed` so the UI doesn't lock | Explicit unit test that `applyJobFailed` clears `currentJob` + sets `lastError` even if payload is malformed |

---

## Risks / open questions

1. **Inter font scope.** Design specifies Inter; existing app uses DaisyUI's default sans-system stack. **Default in d.1: scope Inter to `.firmware-view` selector via `@fontsource/inter`**, not globally. Revisit if it looks visually inconsistent next to the rest of the app.

2. **Server-stage mapping is approximate.** Resolution: `mapServerStageToUiStage` helper in `firmwareStore` with unit tests in d.6.

3. **Decomposition mentions `POST /firmware/jobs`** at line 366; shipped path is `POST /firmware/flash`. Already accounted for.

4. **`ConfirmModal` focus management isn't specified in the design handoff.** CLAUDE.md a11y rules require focus trap + ESC + restore. d.5 must add this; visual design unaffected.

5. **Topology stroke animation prefixing.** Verify Vite's autoprefixer is enabled before assuming WebKit/Safari work without `-webkit-` prefixes (check during d.3).

6. **Pre-d phase (server-side upload route) is a prerequisite for Upload mode functionality.** d.2 ships Upload mode UI as decorative; the route is broken out as a separate plan + PR. d.2 will render Upload mode but clicking "Browse files…" won't post anywhere yet.

---

## Critical files

- **Server-side WS contract (read-only):** `astros_api/src/firmware/flash_orchestrator.ts:323-344`, `astros_api/src/models/firmware/flash_job_state.ts`, `astros_api/src/models/enums.ts:82`.
- **Server-side HTTP contract (read-only):** `astros_api/src/controllers/firmware_flash_controller.ts`.
- **Late-join entry point (read-only):** `astros_api/src/api_server.ts:654-669`.
- **Vue patterns to mirror:** `astros_vue/src/stores/jobLock.ts`, `astros_vue/src/composables/useWebsocket.ts`, `astros_vue/src/views/ModulesView.vue` (chrome).
- **Design source of truth:** `../design_handoff_firmware_update/README.md` + `firmwareDirectionC.jsx` + `firmwareShared.jsx`.
- **Existing lock-aware button:** `astros_vue/src/components/common/AstrosWriteButton.vue` (extension point for d.6).

---

## Per-PR plan files

- d.1 → `20260507-XXXX-firmware-ota-d-1-page-chrome.md`
- d.2 → `20260507-XXXX-firmware-ota-d-2-source-strip.md`
- d.3 → `20260507-XXXX-firmware-ota-d-3-topology.md`
- d.4 → `20260507-XXXX-firmware-ota-d-4-controllers-panel.md`
- d.5 → `20260507-XXXX-firmware-ota-d-5-page-assembly.md`
- d.6 → `20260507-XXXX-firmware-ota-d-6-live-wiring.md`

(Filenames will be assigned at the time each PR is started; timestamps reflect creation, not roadmap commit time.)
