# d.6 — WebSocket dispatcher + live `firmwareStore` + lock-aware UI + e2e

Phase d, PR 6 of 6 — the final phase. Wires the server's `FlashOrchestratorWsMessage` stream into the Vue UI: 5 new dispatcher cases route into `firmwareStore.apply*` handlers, the store transitions phases off WS events, the dev-mock fleet bootstrap is replaced by a real controllers-store adapter, the write-lock surfaces on `AstrosWriteButton` and a page-level banner, and `FirmwareView` renders a lock-conflict alert when another operator owns the lock.

Roadmap reference: `20260507-2153-firmware-ota-d-vue-firmware-view.md` (§"WebSocket event contract", §"firmwareStore shape", §"Server-stage to UI-stage mapping", §"Lock-aware UI integration", §"FMI inventory").

Per the roadmap, **this is the high-risk PR of phase d** — all concurrency hazards land here. `/pr-review-toolkit:review-pr` is mandatory before push.

---

## Scope decisions (confirmed with user)

1. **Own-job identification: `firmwareStore.ownJobId`** captured from the `startFlash` POST 200 response. `currentJob.jobId === ownJobId` is the "this is ours" predicate. Lock owner string is informational only.
2. **Controllers adapter: `firmwareStore.controllers` becomes a `computed`** that reads `useControllerStore()` per-location refs (`bodyStatus`/`coreStatus`/`domeStatus` + `bodyFirmware`/`coreFirmware`/`domeFirmware`) and projects them into `FirmwareControllerView[]`. d.5's `controllers = ref<FirmwareControllerView[]>([])` and the `DEV_SAMPLE_FLEET` bootstrap go away.
3. **E2E: Playwright spec with WS stubbed via mock server.** One end-to-end spec that drives the full operator flow (`select → confirm → fake WS events → see Stages progress → done bar`) against a mock WS that the spec controls. Validates late-join + reconnect + lock-aware UI.
4. **Stage mapper: sibling helper module** `utils/firmwareStageMapping.ts` with unit tests — same pattern as `strokeFor`, `selectModePillKind`, `stageRowState`, `firmwareFlashError`.

---

## WS event contract (truth source)

Server side: `astros_api/src/firmware/flash_orchestrator.ts:335-344` defines `FlashOrchestratorWsMessage` as a discriminated union by `type` (`TransmissionType` enum values 12-16). The 5 variants we wire on the client:

| `type` | Name | Envelope | Payload type |
|---|---|---|---|
| 12 | `flashJobStarted` | `{type, data}` | `FlashJobState` |
| 13 | `flashControllerUpdate` | `{type, data}` | `ControllerFlashState` |
| 14 | `flashControllerResult` | `{type, data}` | `{ jobId: string; controller: ControllerFlashState }` |
| 15 | `flashJobDone` | `{type, data}` | `{ jobId: string; endedAt: string }` |
| 16 | `flashJobFailed` | `{type, data}` | `FlashJobFailedData` |

Existing wired types (0-10) untouched: SCRIPT, CONFIGURATION_SYNC, LOCATION_STATUS, CONTROLLERS_SYNC, RUN, PANIC, DIRECT_COMMAND, FORMAT_SD, SERVO_TEST, SYSTEM_STATUS, LOCK_STATE_CHANGED.

Type 11 (`flashJobActive`) is a server-side rejection echo for write-class WS messages sent during a flash — the UI doesn't subscribe to it.

`FwStage` enum (server-side string literals): `'QUEUED' | 'UPLOADING_TO_MASTER' | 'SENDING' | 'VERIFYING' | 'REBOOTING' | 'VERSION_CONFIRMED' | 'FAILED'`. Client-side `FirmwareStage` is the narrower 5-value UI union.

### Late-join contract

`astros_api/src/api_server.ts:652-660` sends one `flashJobStarted` snapshot on connect when a job is in flight. The Vue client's `useWebsocket` reconnects every 3s on disconnect. **Net contract:** every WS connection that opens while a flash is in progress receives a fresh `flashJobStarted`. The store's `applyJobStarted` must be **idempotent and replace-not-merge**.

---

## Scope

### Client-side type additions (`types/firmware.ts`)

```ts
// Mirror of the server's FwStage enum — pinned to string-literal values
// to match the WS wire format. Verified against
// `astros_api/src/models/firmware/firmware_messages.ts`.
export type ServerFwStage =
  | 'QUEUED' | 'UPLOADING_TO_MASTER' | 'SENDING' | 'VERIFYING'
  | 'REBOOTING' | 'VERSION_CONFIRMED' | 'FAILED';

// Mirror of the server's ControllerFlashState discriminated union, narrowed
// to the fields the UI reads. `finalVersion` and `error` are stage-specific.
export interface ControllerFlashState {
  controllerId: string;
  stage: ServerFwStage;
  finalVersion?: string;
  error?: string;
}

export interface FlashJobState {
  jobId: string;
  source: { kind: 'github'; version: string } | { kind: 'upload' };
  controllers: ControllerFlashState[];
  startedAt: string;
  endedAt?: string;
  abortReason?: string;
}

export interface FlashJobFailedData {
  jobId: string;
  endedAt: string;
  reason?: FlashErrorReason;       // server passes its FlashOrchestratorErrorReason; we widen here
  detail?: string;
  abortReason?: string;
}
```

### `firmwareStore` additions

```ts
// New state
const currentJob = ref<FlashJobState | null>(null);
const controllerStates = ref<Map<string, ControllerFlashState>>(new Map());
const ownJobId = ref<string | null>(null);

// New computeds (controllers becomes a computed)
const controllers = computed<FirmwareControllerView[]>(() => /* read controllerStore */);
const isOwnJob = computed(() => currentJob.value !== null && currentJob.value.jobId === ownJobId.value);

// WS handlers — pure store-state writes, called from useWebsocket
function applyJobStarted(data: FlashJobState): void;
function applyControllerUpdate(data: ControllerFlashState): void;
function applyControllerResult(data: { jobId: string; controller: ControllerFlashState }): void;
function applyJobDone(data: { jobId: string; endedAt: string }): void;
function applyJobFailed(data: FlashJobFailedData): void;

// HTTP — cold-load resync (sets currentJob only if null)
async function fetchCurrentJob(): Promise<void>;
```

**Replacement of d.5's `controllers: ref`:** becomes a `computed` over `useControllerStore()`. The `watch(controllers)` reconciler from d.4 still works (computed refs trigger watchers on value change). The dev-mock bootstrap in `FirmwareView.onMounted` goes away.

**Phase transitions driven by WS:**

| WS event | Phase transition | Other state |
|---|---|---|
| `flashJobStarted` (idempotent) | `select` → `flashing` (only if not already) | `currentJob = data`; `controllerStates` replaced from `data.controllers` |
| `flashControllerUpdate` | (no phase change) | `controllerStates.set(controllerId, state)` |
| `flashControllerResult` | (no phase change) | `controllerStates.set(controller.controllerId, controller)` |
| `flashJobDone` | `flashing` → `done` | `currentJob.endedAt = data.endedAt` |
| `flashJobFailed` | `flashing` → `failed` | `currentJob.endedAt` set; `flashError = { reason, detail }`; `failedController` derived from `controllerStates` (find the one whose stage === 'FAILED') |

### WS dispatcher additions (`composables/useWebsocket.ts`)

Add 5 case branches in `handleMessage`:
```ts
case WebsocketMessageType.FLASH_JOB_STARTED:
  handleFlashJobStarted(parsedMessage); break;
case WebsocketMessageType.FLASH_CONTROLLER_UPDATE:
  handleFlashControllerUpdate(parsedMessage); break;
case WebsocketMessageType.FLASH_CONTROLLER_RESULT:
  handleFlashControllerResult(parsedMessage); break;
case WebsocketMessageType.FLASH_JOB_DONE:
  handleFlashJobDone(parsedMessage); break;
case WebsocketMessageType.FLASH_JOB_FAILED:
  handleFlashJobFailed(parsedMessage); break;
```

Each handler follows the existing `handleSyncMessage`/`handleStatusMessage` pattern: `try { useFirmwareStore().applyXxx(message.data); } catch (error) { console.error(...); }`. The catch is critical for **operability hazard #6** from the FMI — a malformed payload must not lock the UI in `flashing`.

Add the new enum values to `enums/WebsocketMessageType.ts`:
```ts
FLASH_JOB_ACTIVE = 11,           // not subscribed by the UI; kept for completeness
FLASH_JOB_STARTED = 12,
FLASH_CONTROLLER_UPDATE = 13,
FLASH_CONTROLLER_RESULT = 14,
FLASH_JOB_DONE = 15,
FLASH_JOB_FAILED = 16,
```

### Stage mapping helper (`utils/firmwareStageMapping.ts`)

```ts
export function mapServerStageToUiStage(stage: ServerFwStage): FirmwareStage | null {
  switch (stage) {
    case 'UPLOADING_TO_MASTER': return 'download';
    case 'SENDING': return 'transfer';     // and implicitly 'flash' during send
    case 'VERIFYING': return 'verify';
    case 'REBOOTING': return 'reboot';
    case 'QUEUED':
    case 'VERSION_CONFIRMED':
    case 'FAILED':
      return null; // no specific UI stage; status-pill / terminal-row handles these
  }
}
```

Plus a `controllerStatePillKind(state: ControllerFlashState): FirmwareStatusPillKind` companion that maps the server stage onto the per-controller pill kind (`queued` / `updating` / `done` / `failed`). 7 stage values × 1 mapping each → ~12 unit-test cases.

### Controllers adapter (computed in `firmwareStore`)

```ts
const controllers = computed<FirmwareControllerView[]>(() => {
  const cs = useControllerStore();
  const make = (id: 'body' | 'core' | 'dome', isMaster: boolean, label: string, glyph: string) => ({
    id, label, glyph,
    current: /* read cs.bodyFirmware etc. */ ?? '—',
    status: /* map ControllerStatus → ControllerOnlineStatus */,
    isMaster,
  });
  return [
    make('body', true, 'Body', 'B'),
    make('core', false, 'Core', 'C'),
    make('dome', false, 'Dome', 'D'),
  ];
});
```

`ControllerStatus` (project enum) → `ControllerOnlineStatus` ('up' | 'down' | 'needsSynced') mapping needs care for `FIRMWARE_INCOMPATIBLE` — likely treat as `down` (the controller can't accept a flash) or add a 4th variant. Decision: treat `FIRMWARE_INCOMPATIBLE` as `needsSynced` so the pill says "needs sync" — the firmware update flow IS the sync. Document in code comment.

### Lock-aware UI

**`AstrosWriteButton.vue`** — extend the disabled computation to OR in `useJobLockStore().locked`:
```ts
const isJobLockDisabled = computed(() => jobLockStore.locked);
const isDisabled = computed(() => props.disabled || isReadOnlyDisabled.value || isJobLockDisabled.value);
```
Tooltip key: prefer `firmware_view.lock_active` when only `jobLock.locked`; existing `systemStatus.readOnly.disabled` when system-wide read-only. Existing 9 tests must keep passing; add 3 new tests for the jobLock cases.

**`AstrosLayout.vue`** — add a passive page-level banner sibling to the existing `AstrosSystemStatusBanner`. Renders when `useJobLockStore().locked === true` AND `useFirmwareStore().isOwnJob !== true` (so our own flash doesn't trigger the banner on top of the FirmwareView UI).

**`FirmwareView.vue`** — when `jobLock.locked && !isOwnJob`, render a `role="alert"` region above the SourceStrip with the lock owner and a "Try again later" hint. The Flash button is already disabled via the AstrosWriteButton extension; the alert just explains why.

### E2E test (`e2e/C_01_firmware-page.spec.ts`)

**Scope shipped:** smoke spec covering page-chrome rendering, source-strip toggle visibility, controllers-panel header (Select all / Clear), and Flash-button initial disabled state. No WS-driven phase progression — that requires a WS-mock infrastructure the project doesn't have yet.

**Coverage substitute:** the 5 `apply*` handlers, late-join idempotency, replace-not-merge, lock-conflict logic, replay queue, multi-FAILED collection, and HTTP-staleness handling are exhaustively covered by the firmware/composables/views vitest suites (210 tests total at branch tip across rounds 1–4). The end-to-end operator flow (cold-load, happy-path, failure path, late-join, lock-conflict, WS reconnect, network failure, reduced-motion, dev-warns) lives in the manual QA plan at `.docs/qa/firmware-ota-flash-ui.md` (12 scenarios).

---

## Out of scope

- **Cancel button in flashing UI** — design handoff doesn't include one; server's DELETE /flash exists but no UI surface for it in d.6. Operators wait or close the tab.
- **Per-controller retry** — terminal failure surfaces in the result bar; retrying means starting a new flash from select phase.
- **Topology animation per controller** — d.3's topology renders the flash flow at the fleet level; d.6 doesn't add per-controller animation gating.
- **`flashJobActive` UI feedback** — server-side rejection echo; the UI shouldn't be sending write-class messages during a flash anyway (lock disables them).

---

## Tasks

- [x] Mirror server types (`ServerFwStage`, `ControllerFlashState`, `FlashJobState`, `FlashJobFailedData`) into `types/firmware.ts`. Cross-reference comment at top pointing at the server file.
- [x] Add `FLASH_JOB_ACTIVE = 11` through `FLASH_JOB_FAILED = 16` to `WebsocketMessageType` enum. Cross-reference comment.
- [x] Implement `utils/firmwareStageMapping.ts` (`mapServerStageToUiStage` + `controllerStatePillKind`) with full unit-test coverage.
- [x] Extend `firmwareStore`: add `currentJob`, `controllerStates`, `ownJobId` refs; turn `controllers` into a `computed` over `useControllerStore()` (replaces the d.5 ref and `DEV_SAMPLE_FLEET` bootstrap); add `applyJobStarted/applyControllerUpdate/applyControllerResult/applyJobDone/applyJobFailed` actions; add `fetchCurrentJob`; update `startFlash` to capture `ownJobId` from the POST response and to NOT manage phase directly (WS owns phase from `flashing` onward). Comprehensive unit tests for each handler + idempotency + replace-not-merge + the **5 FMI hazards** below.
- [x] Update `useWebsocket.ts` `handleMessage` switch with 5 new cases; new `handleFlashJobStarted` / `handleFlashControllerUpdate` / `handleFlashControllerResult` / `handleFlashJobDone` / `handleFlashJobFailed` functions following the existing try/catch pattern.
- [x] Extend `AstrosWriteButton.vue` to OR-in `useJobLockStore().locked`. Update tooltip key resolution. Update existing 9 tests if needed, add 3 new for jobLock-only / both-active / neither cases.
- [x] Add lock banner to `AstrosLayout.vue` — sibling component or inline. New i18n key. Verify it doesn't double up with the system-status banner when both readonly + locked.
- [x] Update `FirmwareView.vue`: drop `DEV_SAMPLE_FLEET`, drop the `onMounted` bootstrap (controllers now come from the computed), add `fetchCurrentJob` on mount, add lock-conflict alert section that renders when `lockStore.locked && !isOwnJob`.
- [x] Update `ControllersPanel` consumer of `progressByControllerId` — d.5 took this as a prop; d.6 reads it from `firmwareStore.controllerStates`. Either keep the prop (parent maps store→prop) or read from store directly. **Decision in plan**: keep the prop, with `FirmwareView` mapping the store's `controllerStates` Map → `Record<id, { status, stageLabel }>`. Less store coupling at the leaf.
- [x] Update i18n: `firmware_view.lock_active` (button tooltip), `firmware_view.lock_banner` (layout banner), `firmware_view.lock_conflict` (FirmwareView alert).
- [x] Ship the e2e Playwright smoke spec for the firmware page (`e2e/C_01_firmware-page.spec.ts` — page renders, lock banner suppresses while own job runs, write actions disabled). **Scope deferred**: a full operator-flow / late-join / lock-conflict e2e variant requires a WS-mock harness that doesn't exist in the codebase yet; the gap is documented in the QA plan and `C_01_firmware-page.spec.ts:43-47` (the manual QA plan at `.docs/qa/firmware-ota-flash-ui.md` covers the full operator flow). Re-evaluate if a future PR introduces a WS-mock helper.
- [x] Replace dev-only fleet warning in `FirmwareView` (no-master warn) with a permanent assertion — if the controllers-store yields no master, something is genuinely broken.
- [x] Pre-commit gates: format, lint, type-check, vitest, per-commit `pr-review-toolkit:code-reviewer` agent.
- [x] Pre-push `/pr-review-toolkit:review-pr` 5-agent pass (mandatory per CLAUDE.md and required per roadmap for d.6).

---

## FMI inventory — REQUIRED (per CLAUDE.md and roadmap)

This is the concurrency-surface PR of phase D. Each row has explicit unit-test coverage.

| Hazard | Risk | Coverage |
|---|---|---|
| **Late-join + cold-load fetch race** | Both `fetchCurrentJob()` (HTTP GET on mount) and the WS replay `flashJobStarted` could fire on view enter | `applyJobStarted` is idempotent (compares `jobId` and is no-op on match); `fetchCurrentJob` sets state only if `currentJob === null`. Unit test: call both in either order, assert single coherent state. |
| **WS reconnect during flash** | `useWebsocket` reconnects every 3s; server sends `flashJobStarted` snapshot on reconnect | `applyJobStarted` **replaces** (not merges) `controllerStates` from `data.controllers`. Unit test: pre-state with stale entries, applyJobStarted → only `data.controllers` remain. |
| **Tab-close mid-flash** | Browser navigation/close is NOT a flash-cancel signal — server holds the lock until heartbeat / 15s timer | UI must NOT trigger cancel on `beforeunload`. Code review: no `beforeunload` listener added in FirmwareView or firmwareStore. On view re-enter, `fetchCurrentJob` + WS late-join populate state. Manual QA via e2e. |
| **Stale `controllerStates` after job ends** | Next flash inherits stale per-controller stages | `resetToSelect()` clears `controllerStates`. Called when operator clicks "Done" in result bar. Unit test: failed phase → resetToSelect → controllerStates empty. |
| **Enum drift between Vue and server** | `WebsocketMessageType` is a hand-maintained mirror; if server adds a value, the Vue switch silently misroutes | Comment cross-reference at top of `WebsocketMessageType.ts` AND `types/firmware.ts` pointing at server sources. Runtime `default:` warn-on-unknown in `handleMessage` (already present). |
| **WS handler errors swallow real bugs** | Existing handlers `catch + log`; firmware handlers must also reset `phase` → `failed` (with envelope) on `flashJobFailed` even if the payload is malformed | `applyJobFailed` extracts what it can from a partial payload and surfaces `{ reason: 'internal_server_error' }` when fields are missing. Unit test: malformed `flashJobFailed` → phase = `failed`, `flashError` non-null. |
| **`ownJobId` race with WS late-join** | If the WS `flashJobStarted` arrives before the HTTP POST returns (server emits before responding), `ownJobId` is briefly null and the UI shows lock-conflict for our own flash | `startFlash` sets `ownJobId` **before** the POST resolves (use a tentative-id pattern), OR delay phase-from-WS until POST resolves. **Decision in plan**: `applyJobStarted` is idempotent — accept that for ~50ms post-WS-pre-HTTP-response, the lock-conflict banner may flicker. Document as known limitation; if it visually flickers, add a 200ms debounce on the alert render. Unit test: simulate WS-first, then POST-resolves; assert final state is `isOwnJob === true`. |

---

## Verification

1. `npm run build` succeeds.
2. `npx vitest run` — 210 tests pass at branch tip across the firmware/composables/views test suites. Includes coverage for the 5 `applyXxx` handlers, `mapServerStageToUiStage`, `controllerStatePillKind`, `fetchCurrentJob` (incl. 404 vs 5xx), the 7 original FMI hazards, replay queue + multi-FAILED, staleness banner, lock-conflict gating, and dispatcher rollback paths. Updated `AstrosWriteButton` (existing 9 + 3 new).
3. `npx playwright test firmware-flash.spec.ts` — the e2e spec passes locally against the mocked WS.
4. `npm run storybook` — visual regression of d.3/d.4/d.5 stories unchanged. New stories for the lock-conflict banner (FirmwareView and AstrosLayout siblings).
5. Manual `npm run dev` smoke test:
   - Page loads with real controllers from the controllers store (no dev mock).
   - Flash button is disabled when `systemStatus.readOnly` OR `jobLock.locked` (verify both individually).
   - Two-browser test: start a flash in tab A, open tab B to `/firmware` — tab B shows lock-conflict alert with lock owner identifier. Flash button disabled. After tab A flash completes, tab B's banner clears.
6. Pre-push toolkit: 5-agent pass; address Critical/Important.

---

## Risks

1. **Server stage enum drift.** `ServerFwStage` is a hand-maintained mirror of `astros_api/src/models/firmware/firmware_messages.ts`. Mitigation: comment cross-reference at top of the type def. If the server ever adds a stage, the runtime `default:` in `mapServerStageToUiStage` falls back to `null` (treated as "no specific UI stage"), so the worst case is missing a stage transition, not a crash.
2. **`controllers` computed coupling to `useControllerStore()`.** If a future refactor splits the controllers store or renames the per-location refs, the firmwareStore computed breaks silently (TS will likely catch it). Mitigation: an integration test that asserts a sample controllerStore snapshot maps to the expected `FirmwareControllerView[]`.
3. **Playwright spec brittleness.** Mocking WS via Playwright is doable but stage-dependent; if the WS lifecycle changes in `useWebsocket`, the spec needs updates. Mitigation: put all WS-mock fixtures in `tests/e2e/_helpers/mockFirmwareWs.ts` so they're maintained in one place.
4. **`ownJobId` race.** See FMI table item 7. May result in a brief lock-conflict flicker for ~50ms. Acceptable per plan but worth re-verifying during manual QA.
5. **Lock banner double-up.** When both `systemStatus.readOnly` AND `jobLock.locked` are true, both banners might stack. Decision: render only the more-recent / higher-priority one (system-readonly takes precedence — it's a broader condition). i18n key chosen accordingly.

---

## Critical files

- `astros_api/src/firmware/flash_orchestrator.ts:335-344` — `FlashOrchestratorWsMessage` discriminated union (read-only, source of truth).
- `astros_api/src/models/firmware/flash_job_state.ts:1-40` — `FlashJobState` and `ControllerFlashState` (read-only).
- `astros_api/src/models/firmware/firmware_messages.ts` — `FwStage` enum (read-only).
- `astros_api/src/models/enums.ts:82` — `TransmissionType` numeric values (read-only).
- `astros_api/src/api_server.ts:652-660` — late-join `flashJobStarted` snapshot (read-only).
- `astros_vue/src/composables/useWebsocket.ts:87-117` — dispatcher extension point.
- `astros_vue/src/enums/WebsocketMessageType.ts` — add 5 new values.
- `astros_vue/src/stores/firmware.ts` — phase from WS, new state, new actions, computed controllers.
- `astros_vue/src/stores/controller.ts` — read-only; source for the controllers computed.
- `astros_vue/src/components/common/AstrosWriteButton.vue` — extension point.
- `astros_vue/src/views/FirmwareView.vue` — replace dev mock, add lock-conflict alert.
- `astros_vue/src/components/AstrosLayout.vue` — sibling lock banner.

---

## QA test plan

Per prior commitment: d.6 ships with the comprehensive operator-flow manual QA plan at `.docs/qa/firmware-ota-flash-ui.md`. Scope:
- Cold-load `/firmware` with no job in flight.
- Full happy-path flash (select → confirm → flashing → done).
- Failure path (server returns 4xx; server emits `flashJobFailed` mid-flash).
- Late-join: open a second tab while a flash is in progress.
- Lock conflict: try writes elsewhere (Modules / Scripts / Playlists) during a flash; verify `AstrosWriteButton` is disabled with the right tooltip.
- Network failure: simulate a server crash during a flash; verify the UI doesn't hang.
- `prefers-reduced-motion`: topology dashed-line animation halts.

---

## Per-PR plan files (Phase D index — final)

- d.1 → `20260507-2153-firmware-ota-d-1-page-chrome.md` ✅ merged
- d.2 → `20260509-1716-firmware-ota-d-2-source-strip.md` ✅ merged
- d.3 → `20260511-0651-firmware-ota-d-3-topology.md` ✅ merged
- d.4 → `20260511-0811-firmware-ota-d-4-controllers-panel.md` ✅ merged
- d.5 → `20260511-2217-firmware-ota-d-5-page-assembly.md` ✅ merged
- d.6 → **this file** (final)
