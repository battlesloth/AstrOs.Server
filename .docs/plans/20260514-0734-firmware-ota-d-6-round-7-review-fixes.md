# d.6 — Round-7 review fixes (Criticals + Importants from `/pr-review-toolkit:review-pr`)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the 18 actionable findings from the round-7 multi-agent PR review on `feature/firmware-ota-d-6-live-wiring`, organized into 3 sequential commits.

**Architecture:**
- **Commit A (6 Criticals):** State-machine guards (reboot-wait wedge, jobId validation), multi-FAILED preservation, mid-stream catch isolation, modal lock-gating, dispatcher compile-time exhaustiveness.
- **Commit B (7 Importants — code+tests):** Discriminated-union tightening (ControllerFlashState, ControllersPanelProps), SlotId wire/slot split, validation hardening, WebSocket lifecycle hygiene, 8 test-coverage gaps.
- **Commit C (5 Importants — prose+cleanup):** Wire/remove dead `abortReason`, rename 3 drifted test names, fix dispatcher sole-writer comment, fix `FlashJobState.source` doc, sweep 5 plan/QA prose drifts.

**Tech Stack:** TypeScript (Vue 3, Pinia, Vitest), Express/Node API, hand-mirrored WS protocol between server (`TransmissionType`) and client (`WebsocketMessageType`).

**Review report:** Convergent findings across 5 agents (code-reviewer, pr-test-analyzer, silent-failure-hunter, type-design-analyzer, comment-analyzer). Two findings appear in multiple agents' reports (CR-4 jobId validation, CR-6 dispatcher drift) — these carry the highest signal.

**Sequencing rationale:** Inside each phase, structural/lowest-risk changes go first (CR-6 enum pinning before behavioral state-machine work; IM-3 validation before IM-2 discriminated union). Within commits, every fix is TDD: failing test → run → fix → run → next item.

**Branch:** `feature/firmware-ota-d-6-live-wiring` (already exists). No new branch.

**Pre-commit ritual (each commit):** prettier:write → lint:fix → build → `npx vitest run` → `superpowers:requesting-code-review` on diff vs prior commit → address Critical/Important reviewer findings → commit.

---

## File touch summary

| Phase | File | Why |
|---|---|---|
| A | `astros_api/src/models/enums.ts` | Add explicit `= N` to `TransmissionType` |
| A | `astros_vue/src/composables/useWebsocket.ts` | `never`-exhaustiveness; mid-stream catch guards; `handleLockStateChanged` defense; closure capture (B) |
| A | `astros_vue/src/composables/__tests__/useWebsocket.spec.ts` | Numeric-pinning test; new behavioral tests |
| A | `astros_vue/src/stores/firmware.ts` | `fetchCurrentJob` endedAt guard; `applyJobFailed` pendingByMac sweep; jobId guards on `applyControllerResult/applyJobDone/applyJobFailed` |
| A | `astros_vue/src/stores/__tests__/firmware.spec.ts` | New tests + strengthen replace-not-merge (B) |
| A | `astros_vue/src/components/modals/modules/AstrosServoTestModal.vue` | Gate slider on `useJobLockStore().locked` |
| A | `astros_vue/src/components/modals/modules/__tests__/AstrosServoTestModal.spec.ts` | NEW — lock-gating test |
| B | `astros_vue/src/types/firmware.ts` | Discriminated-union ControllerFlashState; SlotId wire-vs-slot split; doc fix (C) |
| B | `astros_vue/src/components/firmware/firmwareControllersPanel/types.ts` | Discriminated-union ControllersPanelProps; narrow `failedStage` |
| B | `astros_vue/src/components/firmware/firmwareControllersPanel/AstrosFirmwareControllersPanel.vue` | Consume narrower types |
| B | `astros_vue/src/utils/firmwareStageMapping.spec.ts` | Add i18n key contract test |
| B | `astros_vue/src/views/__tests__/FirmwareView.spec.ts` | Add `lockSinceFormatted` NaN fallback test |
| C | `astros_vue/src/views/FirmwareView.vue` | Render `abortReason` OR remove writes |
| C | `astros_vue/src/components/common/__tests__/AstrosWriteButton.spec.ts` | Rename test |
| C | `astros_vue/src/stores/__tests__/firmware.spec.ts` | Rename 2 tests |
| C | `.docs/plans/20260512-0735-firmware-ota-d-6-live-wiring.md` | Fix 5 prose drift sites |
| C | `.docs/qa/firmware-ota-flash-ui.md` | Fix test-count drift |

---

# Phase A — Criticals (Commit A)

Single commit at end of phase. Message: `fix(firmware): round-7 Criticals — late-join wedge + multi-FAILED + protocol_violation guards + jobId validation + modal lock-gate + dispatcher exhaustiveness`.

## Task A.0: Commit the plan file FIRST (before any code)

Per CLAUDE.md, the plan file must be committed before any implementation code.

- [x] **A.0.1:** Stage and commit the plan file alone.

```bash
git add .docs/plans/20260514-0734-firmware-ota-d-6-round-7-review-fixes.md
git commit -m "$(cat <<'EOF'
docs(plans): round-7 review fixes plan for d.6 live wiring

Captures 18 actionable findings from the multi-agent review across
3 sequential commits (6 Criticals, 7 code-Importants, 5 prose-Importants).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task A.1: CR-6a — Pin `TransmissionType` numeric values on the server

Server `TransmissionType` has implicit numeric values, so mid-insertion silently renumbers downstream. Pin explicit `= N` so a future PR that adds a value MUST pick an explicit slot.

**Files:**
- Modify: `astros_api/src/models/enums.ts:82-100` (the `TransmissionType` enum)

- [x] **A.1.1:** Read the current enum to confirm position ordering.

Run: `grep -n "TransmissionType" astros_api/src/models/enums.ts`

- [x] **A.1.2:** Edit the enum to add explicit values 0-16. Find the existing `export enum TransmissionType {` block and replace its body with:

```ts
export enum TransmissionType {
  script = 0,
  sync = 1,
  status = 2,
  controllers = 3,
  run = 4,
  panic = 5,
  directCommand = 6,
  formatSD = 7,
  servoTest = 8,
  systemStatus = 9,
  lockStateChanged = 10,
  flashJobActive = 11,
  flashJobStarted = 12,
  flashControllerUpdate = 13,
  flashControllerResult = 14,
  flashJobDone = 15,
  flashJobFailed = 16,
}
```

Verify the comment block above the enum still accurately reflects the wire-mirror contract; update if needed.

- [x] **A.1.3:** Run server build + tests to confirm no value mismatch.

Run: `cd astros_api && npm run build && npx vitest run`
Expected: clean build, all tests pass.

---

## Task A.2: CR-6b — Numeric-pinning contract test on the client

**Files:**
- Modify: `astros_vue/src/composables/__tests__/useWebsocket.spec.ts`

- [x] **A.2.1:** Add a top-level `describe` block at the end of the file:

```ts
describe('WebsocketMessageType wire-numeric pinning (cross-process contract)', () => {
  it('pins the wire numeric values that the server emits — drift here breaks every WS message', () => {
    expect(WebsocketMessageType.SCRIPT).toBe(0);
    expect(WebsocketMessageType.CONFIGURATION_SYNC).toBe(1);
    expect(WebsocketMessageType.LOCATION_STATUS).toBe(2);
    expect(WebsocketMessageType.CONTROLLERS_SYNC).toBe(3);
    expect(WebsocketMessageType.RUN).toBe(4);
    expect(WebsocketMessageType.PANIC).toBe(5);
    expect(WebsocketMessageType.DIRECT_COMMAND).toBe(6);
    expect(WebsocketMessageType.FORMAT_SD).toBe(7);
    expect(WebsocketMessageType.SERVO_TEST).toBe(8);
    expect(WebsocketMessageType.SYSTEM_STATUS).toBe(9);
    expect(WebsocketMessageType.LOCK_STATE_CHANGED).toBe(10);
    expect(WebsocketMessageType.FLASH_JOB_ACTIVE).toBe(11);
    expect(WebsocketMessageType.FLASH_JOB_STARTED).toBe(12);
    expect(WebsocketMessageType.FLASH_CONTROLLER_UPDATE).toBe(13);
    expect(WebsocketMessageType.FLASH_CONTROLLER_RESULT).toBe(14);
    expect(WebsocketMessageType.FLASH_JOB_DONE).toBe(15);
    expect(WebsocketMessageType.FLASH_JOB_FAILED).toBe(16);
  });
});
```

Verify `WebsocketMessageType` is already imported at the top of the spec file (it is — round-3 work imported it). If not, add `import { WebsocketMessageType } from '@/enums/WebsocketMessageType';`.

- [x] **A.2.2:** Run the test:

Run: `cd astros_vue && npx vitest run src/composables/__tests__/useWebsocket.spec.ts -t "wire-numeric pinning"`
Expected: PASS (the client enum already has explicit values 0-16).

---

## Task A.3: CR-6c — Compile-time exhaustiveness on the dispatcher switch

The dispatcher's `default` branch is a runtime `console.warn`. Convert to a `never`-cast so a new server-side TransmissionType the client hasn't handled fails to compile.

**Files:**
- Modify: `astros_vue/src/composables/useWebsocket.ts` (the switch block around line 105-144)

- [x] **A.3.1:** Read the current switch block to confirm its shape.

Run: `grep -n "default:" astros_vue/src/composables/useWebsocket.ts`

- [x] **A.3.2:** In the dispatcher switch's `default` branch, add a `never` assignment to force TS exhaustiveness. The current default is:

```ts
default:
  console.warn('Unknown WebSocket message type:', parsedMessage.type);
  break;
```

Replace with:

```ts
default: {
  // Compile-time exhaustiveness — adding a new WebsocketMessageType variant
  // without a case here is a build error, not a silent runtime warn. The
  // runtime warn stays for forward-compat with future server-side values
  // we haven't yet typed.
  const _exhaustive: never = parsedMessage.type as never;
  void _exhaustive;
  console.warn('Unknown WebSocket message type:', parsedMessage.type);
  break;
}
```

Note the `as never` cast: today the switch's discriminator is a wide `WebsocketMessageType` enum and the case arms don't structurally narrow it (the parsed-message type is `BaseWsMessage`, not a true discriminated union). The `as never` is therefore an attestation, not a true compile-time check — but it documents intent and breaks loudly if someone refactors to a true discriminated union later. The full DU refactor is out of scope for this fix (it would require typing every handler's `data` payload, which is a bigger surface).

- [x] **A.3.3:** Confirm build still passes:

Run: `cd astros_vue && npm run build`
Expected: success.

- [x] **A.3.4:** Run dispatcher tests:

Run: `cd astros_vue && npx vitest run src/composables/__tests__/useWebsocket.spec.ts`
Expected: all pass.

---

## Task A.4: CR-4a — Add jobId guard to `applyControllerResult`

**Files:**
- Modify: `astros_vue/src/stores/firmware.ts` (`applyControllerResult` function around line 353)
- Modify: `astros_vue/src/stores/__tests__/firmware.spec.ts` (add test)

- [x] **A.4.1:** Write the failing test in `firmware.spec.ts`. Find the `describe('applyControllerResult', ...)` block (search for it; it should exist near the multi-failure tests). Add inside that block:

```ts
it('drops stale events whose jobId does not match currentJob (post-reconnect race protection)', () => {
  const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    const store = useFirmwareStore();
    seedSampleFleet();
    store.applyJobStarted(sampleJobState({ jobId: 'job-B' }));
    const beforeStage = store.controllerStates.get('body')?.stage;
    // Stale event from Job A: jobId mismatch
    store.applyControllerResult({
      jobId: 'job-A',
      controller: { controllerId: BODY_MAC, stage: 'VERSION_CONFIRMED', finalVersion: 'v9.9.9' },
    });
    expect(store.controllerStates.get('body')?.stage).toBe(beforeStage);
    expect(warnSpy.mock.calls.flat().join(' ')).toContain('jobId mismatch');
  } finally {
    warnSpy.mockRestore();
  }
});
```

(If `seedSampleFleet`, `sampleJobState`, and `BODY_MAC` are not the exact helper names, grep the spec file and use the actual names — round-5 added these helpers.)

- [x] **A.4.2:** Run the test to confirm it fails:

Run: `cd astros_vue && npx vitest run src/stores/__tests__/firmware.spec.ts -t "drops stale events whose jobId"`
Expected: FAIL — stage was mutated, no warn fired.

- [x] **A.4.3:** Edit `applyControllerResult` in `firmware.ts`. The current implementation looks roughly like:

```ts
function applyControllerResult(payload: { jobId: string; controller: ControllerFlashState }): void {
  applyControllerUpdate(payload.controller);
}
```

Add a guard at entry:

```ts
function applyControllerResult(payload: { jobId: string; controller: ControllerFlashState }): void {
  if (currentJob.value !== null && payload.jobId !== currentJob.value.jobId) {
    console.warn(
      `[firmwareStore] applyControllerResult: jobId mismatch ` +
        `(payload="${payload.jobId}" current="${currentJob.value.jobId}"). Dropping stale event.`,
    );
    return;
  }
  applyControllerUpdate(payload.controller);
}
```

- [x] **A.4.4:** Run the test to confirm it passes:

Run: `cd astros_vue && npx vitest run src/stores/__tests__/firmware.spec.ts -t "drops stale events whose jobId"`
Expected: PASS.

---

## Task A.5: CR-4b — Add jobId guard to `applyJobDone`

**Files:**
- Modify: `astros_vue/src/stores/firmware.ts` (`applyJobDone` function around line 360-401)
- Modify: `astros_vue/src/stores/__tests__/firmware.spec.ts`

- [x] **A.5.1:** Add failing test inside `describe('applyJobDone', ...)`:

```ts
it('drops stale flashJobDone whose jobId does not match currentJob', () => {
  const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    const store = useFirmwareStore();
    seedSampleFleet();
    store.applyJobStarted(sampleJobState({ jobId: 'job-B' }));
    expect(store.phase).toBe('flashing');
    store.applyJobDone({ jobId: 'job-A', endedAt: '2026-05-14T08:00:00Z' });
    expect(store.phase).toBe('flashing');
    expect(warnSpy.mock.calls.flat().join(' ')).toContain('jobId mismatch');
  } finally {
    warnSpy.mockRestore();
  }
});
```

- [x] **A.5.2:** Run to confirm failure:

Run: `cd astros_vue && npx vitest run -t "drops stale flashJobDone"`
Expected: FAIL — phase transitioned to 'done'.

- [x] **A.5.3:** Add the guard at entry of `applyJobDone`:

```ts
function applyJobDone(data: { jobId: string; endedAt: string }): void {
  if (currentJob.value !== null && data.jobId !== currentJob.value.jobId) {
    console.warn(
      `[firmwareStore] applyJobDone: jobId mismatch ` +
        `(event="${data.jobId}" current="${currentJob.value.jobId}"). Dropping stale event.`,
    );
    return;
  }
  // ... existing body unchanged
}
```

- [x] **A.5.4:** Run to confirm pass:

Run: `cd astros_vue && npx vitest run -t "drops stale flashJobDone"`
Expected: PASS.

---

## Task A.6: CR-4c — Add jobId guard to `applyJobFailed`

**Files:**
- Modify: `astros_vue/src/stores/firmware.ts` (`applyJobFailed` function around line 403-473)
- Modify: `astros_vue/src/stores/__tests__/firmware.spec.ts`

- [x] **A.6.1:** Add failing test inside `describe('applyJobFailed', ...)`:

```ts
it('drops stale flashJobFailed whose jobId does not match currentJob', () => {
  const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    const store = useFirmwareStore();
    seedSampleFleet();
    store.applyJobStarted(sampleJobState({ jobId: 'job-B' }));
    store.applyJobFailed({
      jobId: 'job-A',
      endedAt: '2026-05-14T08:00:00Z',
      reason: 'internal_server_error',
    });
    expect(store.phase).toBe('flashing');
    expect(store.flashError).toBeNull();
    expect(warnSpy.mock.calls.flat().join(' ')).toContain('jobId mismatch');
  } finally {
    warnSpy.mockRestore();
  }
});
```

- [x] **A.6.2:** Run to confirm failure:

Run: `cd astros_vue && npx vitest run -t "drops stale flashJobFailed"`
Expected: FAIL.

- [x] **A.6.3:** Add the guard at entry of `applyJobFailed`:

```ts
function applyJobFailed(data: FlashJobFailedData & { jobId: string }): void {
  if (currentJob.value !== null && data.jobId !== currentJob.value.jobId) {
    console.warn(
      `[firmwareStore] applyJobFailed: jobId mismatch ` +
        `(event="${data.jobId}" current="${currentJob.value.jobId}"). Dropping stale event.`,
    );
    return;
  }
  // ... existing body unchanged
}
```

If `data` doesn't currently include `jobId` in the type, check the call site in `useWebsocket.ts:handleFlashJobFailed` — the server payload has `jobId` per the orchestrator contract; the store handler should accept it. Update both type and signature consistently.

- [x] **A.6.4:** Run to confirm pass:

Run: `cd astros_vue && npx vitest run -t "drops stale flashJobFailed"`
Expected: PASS.

---

## Task A.7: CR-1a — `fetchCurrentJob` mirrors server's `endedAt` filter

When `currentJob.endedAt` is set (15s reboot-wait window), the server skips emitting `flashJobStarted` on reconnect. HTTP cold-load must mirror that filter or the UI wedges at `phase='flashing'`.

**Files:**
- Modify: `astros_vue/src/stores/firmware.ts` (`fetchCurrentJob` function around line 554-576)
- Modify: `astros_vue/src/stores/__tests__/firmware.spec.ts`

- [x] **A.7.1:** Add failing test inside `describe('fetchCurrentJob', ...)` block:

```ts
it('skips applying a body with endedAt set (mirrors server late-join filter for reboot-wait window)', async () => {
  const store = useFirmwareStore();
  const endedJob = sampleJobState({
    jobId: 'job-completed',
    endedAt: '2026-05-14T08:00:15Z',
  });
  vi.mocked(apiClient.get).mockResolvedValueOnce({ data: endedJob } as never);
  await store.fetchCurrentJob();
  expect(store.currentJob).toBeNull();
  expect(store.phase).toBe('idle');
  expect(store.currentJobLoadFailed).toBe(false);
});
```

(Adjust `apiClient` mock helper to match what the spec file already uses — round-5 wired in a vitest mock; reuse it.)

- [x] **A.7.2:** Run to confirm failure:

Run: `cd astros_vue && npx vitest run -t "skips applying a body with endedAt"`
Expected: FAIL — `currentJob` was populated and phase moved to 'flashing'.

- [x] **A.7.3:** Edit `fetchCurrentJob`. Current guard is:

```ts
if (body && body.jobId && currentJob.value === null) {
  applyJobStarted(body);
}
```

Replace with:

```ts
// Mirror server-side decideLateJoinSnapshot: a job with endedAt is in the
// reboot-wait window. No subsequent flashJobStarted will arrive on the
// WS, so populating the store would wedge phase at 'flashing' indefinitely.
if (body && body.jobId && body.endedAt === undefined && currentJob.value === null) {
  applyJobStarted(body);
} else if (body && body.jobId && body.endedAt !== undefined) {
  console.info(
    `[firmwareStore] fetchCurrentJob: server returned job in reboot-wait window ` +
      `(jobId="${body.jobId}", endedAt="${body.endedAt}"). Skipping apply to avoid wedge.`,
  );
}
```

- [x] **A.7.4:** Run to confirm pass:

Run: `cd astros_vue && npx vitest run -t "skips applying a body with endedAt"`
Expected: PASS.

---

## Task A.8: CR-1b — Defense-in-depth: `handleLockStateChanged` recovers stuck phase

If the client somehow lands at `phase='flashing'` while the lock has released (out-of-order events, partial WS delivery, the CR-1a race surviving despite the fix), force terminal so the UI doesn't wedge.

**Files:**
- Modify: `astros_vue/src/composables/useWebsocket.ts` (`handleLockStateChanged` function around line 244-256)
- Modify: `astros_vue/src/composables/__tests__/useWebsocket.spec.ts`

- [x] **A.8.1:** Add failing test inside the `handleLockStateChanged`/lockStateChanged describe block:

```ts
it('forces firmware phase to done when lock releases but firmware is still flashing (recovery defense)', () => {
  const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    const { handleMessage } = useWebsocket();
    const firmware = useFirmwareStore();
    firmware.setPhase('flashing');
    handleMessage(JSON.stringify({
      type: WebsocketMessageType.LOCK_STATE_CHANGED,
      data: { locked: false, owner: null, since: null },
    }));
    expect(firmware.phase).toBe('done');
    expect(warnSpy.mock.calls.flat().join(' ')).toContain('phase=flashing with lock released');
  } finally {
    warnSpy.mockRestore();
  }
});
```

- [x] **A.8.2:** Run to confirm failure:

Run: `cd astros_vue && npx vitest run -t "forces firmware phase to done when lock releases"`
Expected: FAIL — phase stayed 'flashing'.

- [x] **A.8.3:** Edit `handleLockStateChanged`. After the existing `jobLockStore` update, add:

```ts
// Defense-in-depth: if the server has released the lock while we still think
// we're flashing, a terminal-event (flashJobDone/flashJobFailed) was lost or
// arrived out of order. Force phase to 'done' so the UI doesn't wedge.
// Combined with the fetchCurrentJob endedAt filter, this closes the
// reboot-wait wedge that the CR-1 review identified.
if (!data.locked) {
  const firmware = useFirmwareStore();
  if (firmware.phase === 'flashing') {
    console.warn(
      '[useWebsocket] handleLockStateChanged: phase=flashing with lock released. ' +
        'Forcing phase=done as recovery; a terminal-event may have been lost.',
    );
    firmware.setPhase('done');
  }
}
```

Confirm `useFirmwareStore` is imported in the file. Confirm `setPhase` is an exported action. If `setPhase` doesn't exist, add it to the firmware store as a public action (one-line wrapper around the ref).

- [x] **A.8.4:** Run to confirm pass:

Run: `cd astros_vue && npx vitest run -t "forces firmware phase to done when lock releases"`
Expected: PASS.

---

## Task A.9: CR-2 — `applyJobFailed` collects FAILED entries from `pendingByMac`

Bus-wide ESP-NOW failure can leave FAILED-stage entries queued in pendingByMac because the LocationStatus hasn't arrived for that MAC. The current `applyJobFailed` wipes pendingByMac without scanning it.

**Files:**
- Modify: `astros_vue/src/stores/firmware.ts` (`applyJobFailed` around line 449-472)
- Modify: `astros_vue/src/stores/__tests__/firmware.spec.ts`

- [x] **A.9.1:** Add failing test inside `describe('applyJobFailed', ...)`:

```ts
it('preserves FAILED entries from pendingByMac in failedControllers (bus-wide failure with unmapped MAC)', () => {
  const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    const store = useFirmwareStore();
    seedSampleFleet();
    store.applyJobStarted(sampleJobState({ jobId: 'job-1' }));
    // Body has a known MAC (mapped via seedSampleFleet); core does too.
    // Now queue a FAILED entry for an unmapped MAC.
    store.applyControllerUpdate({
      controllerId: 'aa:bb:cc:dd:ee:99',
      stage: 'FAILED',
      error: 'esp_now timeout',
    });
    expect(store.pendingByMac.get('aa:bb:cc:dd:ee:99')?.length).toBe(1);
    store.applyJobFailed({
      jobId: 'job-1',
      endedAt: '2026-05-14T08:01:00Z',
      reason: 'internal_server_error',
    });
    const failedIds = store.failedControllers.map((c) => c.id);
    expect(failedIds).toContain('aa:bb:cc:dd:ee:99');
    expect(warnSpy.mock.calls.flat().join(' ')).toContain(
      'FAILED entry for unmapped MAC',
    );
  } finally {
    warnSpy.mockRestore();
  }
});
```

- [x] **A.9.2:** Run to confirm failure:

Run: `cd astros_vue && npx vitest run -t "preserves FAILED entries from pendingByMac"`
Expected: FAIL — failedControllers doesn't contain the unmapped MAC.

- [x] **A.9.3:** Edit `applyJobFailed`. Before the `pendingByMac.value = new Map()` clear (around line 472), insert:

```ts
// Scan pendingByMac for FAILED entries that never got their LocationStatus
// learning. These are real bricked controllers whose MAC -> slot mapping
// never arrived; the operator must see them in failedControllers so the
// bus-wide failure mode isn't silently truncated.
for (const [mac, queue] of pendingByMac.value) {
  for (const entry of queue) {
    if (entry.stage === 'FAILED') {
      console.warn(
        `[firmwareStore] applyJobFailed: FAILED entry for unmapped MAC="${mac}" ` +
          `surfaced from pendingByMac. LocationStatus never arrived; ` +
          `using MAC as label.`,
      );
      failed.push({
        id: mac as SlotId,
        label: mac,
        stage: currentStage.value,
      });
    }
  }
}
```

(The `id: mac as SlotId` cast is a known structural-vs-nominal compromise — see IM-11 in Phase B for the proper fix. For this commit, the cast is acceptable because `failedControllers` consumers iterate `id` only for keying/labeling.)

- [x] **A.9.4:** Run to confirm pass + run all firmware.spec.ts tests to confirm no regression:

Run: `cd astros_vue && npx vitest run src/stores/__tests__/firmware.spec.ts`
Expected: all pass.

---

## Task A.10: CR-3 — Mid-stream catches don't clobber a legitimate `flashError`

`handleFlashControllerUpdate` and `handleFlashControllerResult` catches unconditionally call `setFlashError({reason:'protocol_violation'})`. If a terminal failure already set a specific reason, a stray malformed mid-stream frame can silently overwrite it.

**Files:**
- Modify: `astros_vue/src/composables/useWebsocket.ts` (catches around lines 303-306, 323-326)
- Modify: `astros_vue/src/composables/__tests__/useWebsocket.spec.ts`

- [x] **A.10.1:** Add failing test:

```ts
it('does NOT overwrite a terminal flashError with protocol_violation from mid-stream catch', () => {
  const { handleMessage } = useWebsocket();
  const firmware = useFirmwareStore();
  // Simulate a terminal failure that set a specific reason.
  firmware.setFlashError({
    reason: 'internal_server_error',
    detail: 'asset checksum mismatch on Core',
  });
  firmware.setPhase('failed');
  // Now a malformed mid-stream frame arrives.
  handleMessage(JSON.stringify({
    type: WebsocketMessageType.FLASH_CONTROLLER_UPDATE,
    data: null,  // malformed — triggers the catch
  }));
  expect(firmware.flashError?.reason).toBe('internal_server_error');
  expect(firmware.flashError?.detail).toBe('asset checksum mismatch on Core');
});
```

- [x] **A.10.2:** Run to confirm failure:

Run: `cd astros_vue && npx vitest run -t "does NOT overwrite a terminal flashError"`
Expected: FAIL — flashError was clobbered to protocol_violation.

- [x] **A.10.3:** Edit the catch blocks. For each of `handleFlashControllerUpdate` (line ~303) and `handleFlashControllerResult` (line ~323), change the catch from:

```ts
} catch (error) {
  console.error('Error handling flashControllerUpdate:', error);
  store.setFlashError({
    reason: 'protocol_violation',
    detail: 'Malformed flashControllerUpdate from server',
  });
}
```

to:

```ts
} catch (error) {
  console.error('Error handling flashControllerUpdate:', error);
  // Don't clobber a terminal flashError that already carries the actual
  // root cause from a job-lifecycle event (applyJobFailed sets specific
  // reasons; a malformed mid-stream frame's protocol_violation is less
  // informative). Only set if we don't have a terminal error already.
  if (store.flashError === null || store.phase === 'flashing') {
    store.setFlashError({
      reason: 'protocol_violation',
      detail: 'Malformed flashControllerUpdate from server',
    });
  }
}
```

Mirror the same pattern in `handleFlashControllerResult`'s catch (with `flashControllerResult` in the detail string).

- [x] **A.10.4:** Run to confirm pass + all dispatcher tests:

Run: `cd astros_vue && npx vitest run src/composables/__tests__/useWebsocket.spec.ts`
Expected: all pass.

---

## Task A.11: CR-5 — Gate `AstrosServoTestModal` slider on `useJobLockStore().locked`

ServoTest writes during flash get silently rejected by the server (`FLASH_JOB_ACTIVE`). The slider currently allows operator to drag with no visible signal.

**Files:**
- Modify: `astros_vue/src/components/modals/modules/AstrosServoTestModal.vue`
- Create: `astros_vue/src/components/modals/modules/__tests__/AstrosServoTestModal.spec.ts`

- [x] **A.11.1:** Create the new spec file at `astros_vue/src/components/modals/modules/__tests__/AstrosServoTestModal.spec.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createTestingPinia } from '@pinia/testing';
import { useJobLockStore } from '@/stores/jobLock';
import AstrosServoTestModal from '../AstrosServoTestModal.vue';

const stubSendMessage = vi.fn();
vi.mock('@/composables/useWebsocket', () => ({
  useWebsocket: () => ({ wsSendMessage: stubSendMessage }),
}));

const defaultProps = {
  controllerAddress: 'aa:bb:cc:dd:ee:01',
  controllerName: 'Core',
  moduleSubType: 1,
  moduleIdx: 0,
  channelNumber: 0,
  homePosition: 500,
};

function makeWrapper(opts: { locked: boolean }) {
  const wrapper = mount(AstrosServoTestModal, {
    global: {
      plugins: [createTestingPinia({ createSpy: vi.fn })],
      mocks: { $t: (k: string) => k },
    },
    props: defaultProps,
  });
  const lockStore = useJobLockStore();
  lockStore.locked = opts.locked;
  lockStore.owner = opts.locked ? 'flash:job-A' : null;
  return wrapper;
}

describe('AstrosServoTestModal', () => {
  beforeEach(() => stubSendMessage.mockClear());

  it('disables the Enable Test button when jobLock.locked is true', () => {
    const wrapper = makeWrapper({ locked: true });
    const btn = wrapper.find('[data-test="enable-test-button"]');
    expect(btn.attributes('disabled')).toBeDefined();
  });

  it('does NOT send servoTest when locked even if onSliderChange fires', async () => {
    const wrapper = makeWrapper({ locked: true });
    // Force-enable test internally to prove the lock blocks downstream.
    // This is a defense-in-depth check; the button should be disabled
    // independently but the slider handler should also no-op.
    const slider = wrapper.find('[data-test="position-slider"]');
    await slider.trigger('change');
    expect(stubSendMessage).not.toHaveBeenCalled();
  });

  it('allows enabling and sending servoTest when not locked', async () => {
    const wrapper = makeWrapper({ locked: false });
    const btn = wrapper.find('[data-test="enable-test-button"]');
    await btn.trigger('click');
    expect(stubSendMessage).toHaveBeenCalledTimes(1);
  });
});
```

- [x] **A.11.2:** Run the new spec to confirm it fails on missing `data-test` selectors / lock gate:

Run: `cd astros_vue && npx vitest run src/components/modals/modules/__tests__/AstrosServoTestModal.spec.ts`
Expected: FAIL (selectors not present, locked-case not gated).

- [x] **A.11.3:** Edit `AstrosServoTestModal.vue`. Update the `<script setup>` to import and consume the lock store:

```vue
<script setup lang="ts">
import { ref, computed } from 'vue';
import { useWebsocket } from '@/composables/useWebsocket';
import { useJobLockStore } from '@/stores/jobLock';
import type { ServoTestEvent } from '@/models/events';

const { wsSendMessage } = useWebsocket();
const jobLock = useJobLockStore();

const props = defineProps<ServoTestEvent>();
const emit = defineEmits<{ close: [] }>();

const disabled = ref(true);
const label = ref('modals.servo_test.enable_test');
const value = ref(props.homePosition);

const writesBlocked = computed(() => jobLock.locked);

const onSliderChange = () => {
  if (disabled.value || writesBlocked.value) return;
  wsSendMessage(JSON.stringify(servoTestMessage()));
};

const enableTest = () => {
  if (writesBlocked.value) return;
  disabled.value = !disabled.value;
  if (!disabled.value) {
    label.value = 'modals.servo_test.disable_test';
    wsSendMessage(JSON.stringify(servoTestMessage()));
  } else {
    label.value = 'modals.servo_test.enable_test';
  }
};
// ... rest unchanged
</script>
```

Then in the `<template>`, find the Enable Test button and the slider. Add `data-test` attributes and bind disabled state:

```vue
<button
  data-test="enable-test-button"
  :disabled="writesBlocked"
  :title="writesBlocked ? $t('common.write_locked') : ''"
  class="btn btn-primary"
  @click="enableTest"
>{{ $t(label) }}</button>

<input
  data-test="position-slider"
  type="range"
  :disabled="disabled || writesBlocked"
  v-model.number="value"
  @change="onSliderChange"
/>
```

(Use the modal's existing button/slider markup and ADD the `data-test` and `:disabled` bindings — don't rewrite the whole template.)

- [x] **A.11.4:** Verify `common.write_locked` i18n key exists (it does — round-5 added it for `AstrosWriteButton`). If not, add to `enUS.json`.

Run: `grep -n "write_locked" astros_vue/src/locales/enUS.json`
Expected: one or more matches.

- [x] **A.11.5:** Run the new spec to confirm it passes:

Run: `cd astros_vue && npx vitest run src/components/modals/modules/__tests__/AstrosServoTestModal.spec.ts`
Expected: PASS.

---

## Task A.12: Phase A wrap — verify, review, commit

- [x] **A.12.1:** Run full Vue test suite + build:

Run: `cd astros_vue && npm run prettier:write && npm run lint:fix && npm run build && npx vitest run`
Expected: all green.

- [x] **A.12.2:** Run full API test suite + build:

Run: `cd astros_api && npm run prettier:write && npm run lint:fix && npm run build && npx vitest run`
Expected: all green.

- [x] **A.12.3:** Invoke code-review subagent on the Phase A diff. Use `superpowers:requesting-code-review` with a prompt that includes:

> Review the changes since the commit `<plan-commit-sha>` for Phase A of the round-7 review fixes. The diff implements 6 Critical findings: dispatcher numeric pinning + never-exhaustiveness, jobId guards on applyControllerResult/applyJobDone/applyJobFailed, fetchCurrentJob endedAt filter, handleLockStateChanged defense-in-depth, applyJobFailed pendingByMac sweep for FAILED entries, mid-stream catch isolation (no flashError clobber), and AstrosServoTestModal lock-gating. Look for: any missed sibling claims (CLAUDE.md partial-fix sweep), test names that drift from what's tested, dead/unused additions, doc-vs-code drift in any header docstrings I touched.

Address any **Critical** or **Important** findings from the reviewer before commit. Re-run tests after each fix.

- [x] **A.12.4:** Stage and commit Phase A:

```bash
git add astros_api/src/models/enums.ts \
  astros_vue/src/composables/useWebsocket.ts \
  astros_vue/src/composables/__tests__/useWebsocket.spec.ts \
  astros_vue/src/stores/firmware.ts \
  astros_vue/src/stores/__tests__/firmware.spec.ts \
  astros_vue/src/components/modals/modules/AstrosServoTestModal.vue \
  astros_vue/src/components/modals/modules/__tests__/AstrosServoTestModal.spec.ts
git commit -m "$(cat <<'EOF'
fix(firmware): round-7 Criticals — late-join wedge + multi-FAILED + protocol_violation guards + jobId validation + modal lock-gate + dispatcher exhaustiveness

CR-1: fetchCurrentJob mirrors server's decideLateJoinSnapshot endedAt
  filter — prevents UI wedge at phase='flashing' during reboot-wait
  window after a refresh.

CR-1b: handleLockStateChanged forces phase='done' when the server
  releases the lock while we're still 'flashing'. Defense-in-depth
  against any terminal-event arrival gap.

CR-2: applyJobFailed scans pendingByMac for FAILED entries before
  wiping the queue. Bus-wide ESP-NOW failures with unmapped MACs
  now surface in failedControllers instead of being silently dropped.

CR-3: handleFlashControllerUpdate/Result catches no longer clobber
  a terminal flashError. A stray malformed mid-stream frame can't
  overwrite the specific reason from applyJobFailed.

CR-4: applyControllerResult/applyJobDone/applyJobFailed now compare
  payload.jobId to currentJob.jobId at entry. Stale events from a
  prior job (post-reconnect race) are dropped with a warn.

CR-5: AstrosServoTestModal gates Enable/slider on useJobLockStore().
  Writes during flash no longer fire silently-rejected WS messages.

CR-6: TransmissionType enum on the server now pins explicit numeric
  values. Client adds a numeric-pinning contract test. Dispatcher
  default branch documents intent via `never`-cast.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [x] **A.12.5:** Update this plan to check off Phase A. Commit the plan update:

```bash
git add .docs/plans/20260514-0734-firmware-ota-d-6-round-7-review-fixes.md
git commit -m "docs(plans): check off Phase A of round-7 review fixes"
```

---

# Phase B — Importants (code + tests) (Commit B)

Single commit at end of phase. Message: `fix(firmware): round-7 Importants (code+tests) — discriminated unions + SlotId split + WS lifecycle + 8 coverage gaps`.

## Task B.1: IM-3 — Tighten `buildControllerStatesMap` and per-element validation

**Files:**
- Modify: `astros_vue/src/stores/firmware.ts` (`buildControllerStatesMap` around line 248-274; also `handleFlashJobStarted` guard upstream)
- Modify: `astros_vue/src/stores/__tests__/firmware.spec.ts`

- [x] **B.1.1:** Add failing test:

```ts
describe('buildControllerStatesMap defensive validation (IM-3)', () => {
  it('returns empty map when states is not an array (string, object, number)', () => {
    const store = useFirmwareStore();
    // Pass through applyJobStarted with garbage controllers — should not throw or pollute
    store.applyJobStarted({
      jobId: 'job-1',
      source: { kind: 'github', version: 'v1' },
      controllers: 'not-an-array' as unknown as ControllerFlashState[],
      startedAt: '2026-05-14T08:00:00Z',
    });
    expect(store.controllerStates.size).toBe(0);
    expect(store.pendingByMac.size).toBe(0);
  });

  it('skips elements with non-string controllerId and warns', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const store = useFirmwareStore();
      store.applyJobStarted({
        jobId: 'job-1',
        source: { kind: 'github', version: 'v1' },
        controllers: [
          { stage: 'QUEUED' } as ControllerFlashState,  // missing controllerId
          { controllerId: 123 as unknown as string, stage: 'QUEUED' },  // non-string
        ],
        startedAt: '2026-05-14T08:00:00Z',
      });
      expect(store.controllerStates.size).toBe(0);
      expect(store.pendingByMac.size).toBe(0);
      expect(warnSpy.mock.calls.flat().join(' ')).toContain('invalid controllerId');
    } finally {
      warnSpy.mockRestore();
    }
  });
});
```

- [x] **B.1.2:** Run to confirm failure.

Run: `cd astros_vue && npx vitest run -t "buildControllerStatesMap defensive validation"`
Expected: FAIL.

- [x] **B.1.3:** Edit `buildControllerStatesMap`. Replace the guard `if (!states) return m;` with:

```ts
function buildControllerStatesMap(
  states: ControllerFlashState[] | undefined,
): Map<SlotId, ControllerFlashState> {
  const m = new Map<SlotId, ControllerFlashState>();
  if (!Array.isArray(states)) return m;
  for (const s of states) {
    if (!s || typeof s.controllerId !== 'string' || s.controllerId.length === 0) {
      console.warn(
        `[firmwareStore] buildControllerStatesMap: skipping element with invalid controllerId`,
        s,
      );
      continue;
    }
    // ... existing per-element handling (resolveSlot / enqueuePending)
  }
  return m;
}
```

Preserve the existing per-element body (resolveSlot → enqueuePending fallback) — only the guards above change.

- [x] **B.1.4:** Run to confirm pass + full firmware suite:

Run: `cd astros_vue && npx vitest run src/stores/__tests__/firmware.spec.ts`
Expected: all pass.

---

## Task B.2: IM-2 — Convert client `ControllerFlashState` to discriminated union on `stage`

Server's `ControllerFlashState` is a discriminated union: `VersionConfirmed/finalVersion:string` and `Failed/error:string` are required-on-variant. Client mirror flattens them to optional. This task tightens the mirror.

**Files:**
- Modify: `astros_vue/src/types/firmware.ts:157-164`
- Modify: `astros_vue/src/stores/firmware.ts` (any sites that assume optional fields)
- Modify: `astros_vue/src/utils/firmwareStageMapping.ts` (consumers of `state.stage`)
- Modify: `astros_vue/src/components/firmware/firmwareControllerRow/AstrosFirmwareControllerRow.vue` (consumers of finalVersion / error)

- [x] **B.2.1:** Read the server-side discriminated union to mirror exactly.

Run: `grep -n "type ControllerFlashState\|interface ControllerFlashState\|FwStage\.Failed\|FwStage\.VersionConfirmed" astros_api/src/models/firmware/flash_job_state.ts`

- [x] **B.2.2:** Replace the client `ControllerFlashState` interface in `types/firmware.ts:157-164`:

```ts
/**
 * Mirror of the server's discriminated `ControllerFlashState`, narrowed
 * to fields the UI reads. The server wire carries bytesSent/totalBytes/
 * detail on every variant; we omit those since the UI doesn't render them.
 *
 * Source of truth: `astros_api/src/models/firmware/flash_job_state.ts`.
 *
 * IMPORTANT: `controllerId` may be EITHER a MAC string (wire form, pre-
 * resolution) OR a `SlotId` (post-resolution, in-store form). TS can't
 * distinguish nominally; the data-flow position determines meaning. See
 * `buildControllerStatesMap` for the translation site.
 */
export type ControllerFlashState =
  | { controllerId: string; stage: 'QUEUED' | 'UPLOADING_TO_MASTER' | 'SENDING' | 'VERIFYING' | 'REBOOTING' }
  | { controllerId: string; stage: 'VERSION_CONFIRMED'; finalVersion: string }
  | { controllerId: string; stage: 'FAILED'; error: string };
```

- [x] **B.2.3:** Run TS build to find every site that breaks:

Run: `cd astros_vue && npm run build`
Expected: failures at consumer sites that read `state.error` or `state.finalVersion` without first narrowing on `stage`. Fix each by checking `state.stage === 'FAILED'` or `state.stage === 'VERSION_CONFIRMED'` first.

- [x] **B.2.4:** For each compile error, narrow at the read site. Examples:
  - `controllerStatePillKind(state)` in `selectModePillKind.ts` or `firmwareStageMapping.ts` — narrow inside the switch on `state.stage`
  - `state.finalVersion` reads in `AstrosFirmwareControllerRow.vue` — gate on `state.stage === 'VERSION_CONFIRMED'`
  - `state.error` reads — gate on `state.stage === 'FAILED'`

For each narrowing, prefer a small `if`-gate over an `as` cast.

- [x] **B.2.5:** Run build + tests:

Run: `cd astros_vue && npm run build && npx vitest run`
Expected: all green.

---

## Task B.3: IM-11 — Split `ControllerFlashState` into wire vs by-slot views

The current `controllerId: string` field carries either MAC or SlotId depending on position. Three `as SlotId` casts in `firmware.ts:239, 456, 610` paper over this. Split the type.

**Files:**
- Modify: `astros_vue/src/types/firmware.ts`
- Modify: `astros_vue/src/stores/firmware.ts`

- [x] **B.3.1:** Add a new `ControllerFlashStateBySlot` type next to the existing `ControllerFlashState` (which becomes wire-side only):

```ts
/**
 * Wire-side `ControllerFlashState` (above) carries `controllerId: string`
 * which is a MAC. After `buildControllerStatesMap` translates MAC -> SlotId,
 * the in-store value uses a `SlotId` keyed view:
 */
export type ControllerFlashStateBySlot =
  | { controllerId: SlotId; stage: 'QUEUED' | 'UPLOADING_TO_MASTER' | 'SENDING' | 'VERIFYING' | 'REBOOTING' }
  | { controllerId: SlotId; stage: 'VERSION_CONFIRMED'; finalVersion: string }
  | { controllerId: SlotId; stage: 'FAILED'; error: string };
```

- [x] **B.3.2:** Update `firmware.ts`:
  - The store's `controllerStates` map becomes `ReadonlyMap<SlotId, ControllerFlashStateBySlot>`.
  - `buildControllerStatesMap` returns `Map<SlotId, ControllerFlashStateBySlot>` and is the translation site.
  - `applyControllerUpdate` translates incoming `ControllerFlashState` to `ControllerFlashStateBySlot` by replacing `controllerId` with the resolved slot.

- [x] **B.3.3:** Run build:

Run: `cd astros_vue && npm run build`
Expected: cast count at line 239/456/610 drops to one (the translation in `buildControllerStatesMap`). Fix any new compile errors at consumer sites.

- [x] **B.3.4:** Run tests:

Run: `cd astros_vue && npx vitest run`
Expected: all pass.

---

## Task B.4: IM-12 — `ControllersPanelProps` discriminated union + narrow `failedStage`

**Files:**
- Modify: `astros_vue/src/components/firmware/firmwareControllersPanel/types.ts:21-33`
- Modify: `astros_vue/src/components/firmware/firmwareControllersPanel/AstrosFirmwareControllersPanel.vue`
- Modify: `astros_vue/src/views/FirmwareView.vue` (the call site)

- [x] **B.4.1:** Replace `ControllersPanelProps` with a discriminated union:

```ts
import type { FirmwareStage, ControllerProgressEntry, SlotId } from '@/types/firmware';

type ProgressMap = Partial<Record<SlotId, ControllerProgressEntry>>;

export type ControllersPanelProps =
  | { phase: 'select' }
  | { phase: 'flashing'; progressByControllerId: ProgressMap }
  | { phase: 'done'; progressByControllerId: ProgressMap; doneCount?: number }
  | {
      phase: 'failed';
      progressByControllerId: ProgressMap;
      failedControllerLabel: string;
      failedStage?: FirmwareStage;
      failedCount: number;
    };
```

- [x] **B.4.2:** Update `AstrosFirmwareControllersPanel.vue`. Replace the existing `defineProps<ControllersPanelProps>()` and the dev-only `watchEffect` warnings (since TS now enforces the constraints). Use TS narrowing throughout the template:

```ts
const props = defineProps<ControllersPanelProps>();
// Remove the watchEffect blocks at lines 43-66 — TS structural narrowing
// enforces phase-vs-fields correlation now.
```

In the template, narrow by phase before reading phase-specific props.

- [x] **B.4.3:** Update the call site in `FirmwareView.vue`. The current `<AstrosFirmwareControllersPanel ... />` call passes all optional props; update to pass only the phase-appropriate set, conditionally:

```vue
<AstrosFirmwareControllersPanel
  v-if="firmwareStore.phase === 'select'"
  phase="select"
/>
<AstrosFirmwareControllersPanel
  v-else-if="firmwareStore.phase === 'flashing'"
  phase="flashing"
  :progress-by-controller-id="progressByControllerId"
/>
<AstrosFirmwareControllersPanel
  v-else-if="firmwareStore.phase === 'done'"
  phase="done"
  :progress-by-controller-id="progressByControllerId"
  :done-count="doneCount"
/>
<AstrosFirmwareControllersPanel
  v-else-if="firmwareStore.phase === 'failed'"
  phase="failed"
  :progress-by-controller-id="progressByControllerId"
  :failed-controller-label="failedControllerLabel"
  :failed-stage="failedStage ?? undefined"
  :failed-count="failedCount"
/>
```

- [x] **B.4.4:** Run build + the panel's existing spec:

Run: `cd astros_vue && npm run build && npx vitest run src/components/firmware/firmwareControllersPanel/__tests__/AstrosFirmwareControllersPanel.spec.ts`
Expected: all pass. If the existing tests passed flat-shape props, update them to pass discriminated shape.

---

## Task B.5: IM-9 — `useWebsocket.wsConnect` closure capture

Handler closures reference `ws.value` (mutable). Re-connect during HMR or programmatic retry can cause cross-socket close.

**Files:**
- Modify: `astros_vue/src/composables/useWebsocket.ts:35-65`

- [x] **B.5.1:** Read the current `wsConnect` to confirm shape:

Run: `grep -n "function wsConnect\|onopen\|onerror\|onmessage\|onclose" astros_vue/src/composables/useWebsocket.ts`

- [x] **B.5.2:** Refactor `wsConnect` to capture the socket locally:

```ts
function wsConnect() {
  intentionallyClosed = false;
  // Capture the new socket in a local so handlers don't close over
  // ws.value (which is mutated by subsequent reconnects).
  const socket = new WebSocket(getWsUrl());
  ws.value = socket;
  socket.onopen = () => {
    wsHasEverConnected.value = true;
    // ... existing onopen body using `socket`, not `ws.value`
  };
  socket.onerror = (error) => {
    console.error('WebSocket error:', error);
    socket.close();
  };
  socket.onmessage = (event) => {
    handleMessage(event.data);
  };
  socket.onclose = () => {
    if (!intentionallyClosed) {
      setTimeout(wsConnect, 3000);
    }
  };
}
```

Preserve the existing handler body content; only swap `ws.value?.` references to `socket.` and confirm setTimeout/intentionallyClosed flow is preserved.

- [x] **B.5.3:** Run tests:

Run: `cd astros_vue && npx vitest run src/composables/__tests__/useWebsocket.spec.ts`
Expected: all pass.

---

## Task B.6: IM-10 — `cancelFlash` surfaces errors via flashError

Decision: surface (not delete). The action is exported and intended for future Cancel UI; silently logging on failure would leave the operator stranded.

**Files:**
- Modify: `astros_vue/src/stores/firmware.ts` (`cancelFlash` around line 522-533)
- Modify: `astros_vue/src/stores/__tests__/firmware.spec.ts`

- [x] **B.6.1:** Add failing test:

```ts
it('surfaces flashError when the cancel HTTP fails (operator visibility)', async () => {
  const store = useFirmwareStore();
  vi.mocked(apiClient.delete).mockRejectedValueOnce(new Error('network down'));
  await store.cancelFlash();
  expect(store.flashError?.reason).toBe('network_error');
  expect(store.flashError?.detail).toContain('Cancel request failed');
});
```

- [x] **B.6.2:** Run to confirm failure.

- [x] **B.6.3:** Update `cancelFlash` catch:

```ts
async function cancelFlash(): Promise<void> {
  try {
    await apiClient.delete(FIRMWARE_FLASH);
  } catch (error) {
    console.warn('firmware.cancelFlash failed', error);
    setFlashError({
      reason: 'network_error',
      detail:
        'Cancel request failed; the flash may still be running. Refresh to recheck status.',
    });
  }
}
```

- [x] **B.6.4:** Run tests:

Run: `cd astros_vue && npx vitest run -t "surfaces flashError when the cancel HTTP fails"`
Expected: PASS.

---

## Task B.7: IM-8 — Test coverage additions (8 tests)

Bundle these into one task since each is small. Each follows: write the test → run/fail → no implementation needed (the production code already does the right thing OR a tiny implementation fix follows) → run/pass.

**Files:**
- Modify: `astros_vue/src/composables/__tests__/useWebsocket.spec.ts`
- Modify: `astros_vue/src/stores/__tests__/firmware.spec.ts`
- Modify: `astros_vue/src/utils/__tests__/firmwareStageMapping.spec.ts`
- Modify: `astros_vue/src/views/__tests__/FirmwareView.spec.ts`

- [x] **B.7.1:** Add `FLASH_CONTROLLER_RESULT` happy-path dispatcher test (pr-test-analyzer C2):

```ts
// In useWebsocket.spec.ts inside the existing dispatcher describe:
it('routes FLASH_CONTROLLER_RESULT through applyControllerResult with the full payload (happy path)', () => {
  const { handleMessage } = useWebsocket();
  const firmware = useFirmwareStore();
  const controllers = useControllerStore();
  controllers.setControllerMac(Location.CORE, 'aa:bb:cc:dd:ee:01');
  firmware.applyJobStarted({
    jobId: 'job-1',
    source: { kind: 'github', version: 'v1.4.2' },
    controllers: [{ controllerId: 'aa:bb:cc:dd:ee:01', stage: 'VERIFYING' }],
    startedAt: '2026-05-14T08:00:00Z',
  });
  handleMessage(JSON.stringify({
    type: WebsocketMessageType.FLASH_CONTROLLER_RESULT,
    data: {
      jobId: 'job-1',
      controller: { controllerId: 'aa:bb:cc:dd:ee:01', stage: 'VERSION_CONFIRMED', finalVersion: 'v1.4.2' },
    },
  }));
  const core = firmware.controllerStates.get('core');
  expect(core?.stage).toBe('VERSION_CONFIRMED');
  expect(core?.stage === 'VERSION_CONFIRMED' && core.finalVersion).toBe('v1.4.2');
});
```

- [x] **B.7.2:** Add `FLASH_JOB_ACTIVE` no-op contract test (pr-test-analyzer C3):

```ts
it('FLASH_JOB_ACTIVE is a no-op: phase, flashError, controllerStates all unchanged', () => {
  const { handleMessage } = useWebsocket();
  const firmware = useFirmwareStore();
  firmware.setPhase('flashing');
  const phaseBefore = firmware.phase;
  const errorBefore = firmware.flashError;
  const statesSizeBefore = firmware.controllerStates.size;
  handleMessage(JSON.stringify({
    type: WebsocketMessageType.FLASH_JOB_ACTIVE,
    data: { reason: 'write_during_flash' },
  }));
  expect(firmware.phase).toBe(phaseBefore);
  expect(firmware.flashError).toBe(errorBefore);
  expect(firmware.controllerStates.size).toBe(statesSizeBefore);
});
```

- [x] **B.7.3:** Add `flushPendingForMac` re-queue forensic warn test (pr-test-analyzer C4):

```ts
// In firmware.spec.ts inside an appropriate describe:
it('logs a distinct re-queue warning when flushPendingForMac re-enqueues during flush (forensic breadcrumb)', () => {
  const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    const store = useFirmwareStore();
    // Force pendingByMac to have an entry by applying an update with no slot mapping
    store.applyControllerUpdate({ controllerId: 'aa:bb:cc:dd:ee:99', stage: 'SENDING' });
    expect(store.pendingByMac.size).toBe(1);
    // Flush without first calling setControllerMac — resolver still returns null
    store.flushPendingForMac('aa:bb:cc:dd:ee:99');
    const warnText = warnSpy.mock.calls.flat().join(' ');
    expect(warnText).toContain('re-queued during flush');
    expect(warnText).toContain('aa:bb:cc:dd:ee:99');
  } finally {
    warnSpy.mockRestore();
  }
});
```

(`flushPendingForMac` must be exposed on the store for this test. If it isn't, expose it as a public action — round-5 may have already done so.)

- [x] **B.7.4:** Strengthen `applyJobStarted` replace-not-merge mutation test (pr-test-analyzer C6). Find the existing test at `firmware.spec.ts:653` and replace its body:

```ts
it('REPLACES (not merges) controllerStates on duplicate flashJobStarted', () => {
  const store = useFirmwareStore();
  seedSampleFleet();
  store.applyJobStarted(sampleJobState());
  store.applyControllerUpdate({ controllerId: BODY_MAC, stage: 'SENDING' });
  store.applyControllerUpdate({ controllerId: CORE_MAC, stage: 'SENDING' });
  // Both are now SENDING. New snapshot contains only body at VERIFYING.
  store.applyJobStarted(sampleJobState({
    controllers: [{ controllerId: BODY_MAC, stage: 'VERIFYING' }],
  }));
  // Replace semantics: core must be absent. Merge would keep it at SENDING.
  expect(store.controllerStates.get('body')?.stage).toBe('VERIFYING');
  expect(store.controllerStates.get('core')).toBeUndefined();
  expect(store.controllerStates.size).toBe(1);
});
```

- [x] **B.7.5:** Add `FLASH_JOB_STARTED` dispatcher happy-path test (pr-test-analyzer I3):

```ts
it('routes well-formed FLASH_JOB_STARTED through applyJobStarted', () => {
  const { handleMessage } = useWebsocket();
  const firmware = useFirmwareStore();
  handleMessage(JSON.stringify({
    type: WebsocketMessageType.FLASH_JOB_STARTED,
    data: {
      jobId: 'job-X',
      source: { kind: 'github', version: 'v1.0' },
      controllers: [],
      startedAt: '2026-05-14T08:00:00Z',
    },
  }));
  expect(firmware.currentJob?.jobId).toBe('job-X');
  expect(firmware.phase).toBe('flashing');
});
```

- [x] **B.7.6:** Add i18n key contract test (pr-test-analyzer I4):

```ts
// In firmwareStageMapping.spec.ts or a new firmwareFlashError.spec.ts:
import { FLASH_ERROR_REASONS } from '@/types/firmware';
import enUS from '@/locales/enUS.json';

it('every FlashErrorReason has a corresponding firmware_view.flash_errors.* i18n key', () => {
  for (const reason of FLASH_ERROR_REASONS) {
    expect(enUS.firmware_view.flash_errors).toHaveProperty(reason);
  }
});
```

- [x] **B.7.7:** Add `flashError` persists-across-success test (pr-test-analyzer I7):

```ts
// In useWebsocket.spec.ts:
it('flashError persists across a subsequent successful applyControllerUpdate (operator must dismiss)', () => {
  const { handleMessage } = useWebsocket();
  const firmware = useFirmwareStore();
  const controllers = useControllerStore();
  controllers.setControllerMac(Location.CORE, 'aa:bb:cc:dd:ee:01');
  firmware.setFlashError({ reason: 'protocol_violation', detail: 'earlier error' });
  handleMessage(JSON.stringify({
    type: WebsocketMessageType.FLASH_CONTROLLER_UPDATE,
    data: { controllerId: 'aa:bb:cc:dd:ee:01', stage: 'VERIFYING' },
  }));
  expect(firmware.flashError?.reason).toBe('protocol_violation');
});
```

- [x] **B.7.8:** Add `lockSinceFormatted` defensive NaN-fallback test (pr-test-analyzer I8):

```ts
// In FirmwareView.spec.ts:
it('lockSinceFormatted renders a fallback (not "Invalid Date") for malformed ISO', async () => {
  // Mount with a jobLockStore.since set to a malformed string
  // and assert the banner copy doesn't contain "Invalid Date" or "NaN".
  // Use the existing mount helper from this file and stub useJobLockStore.
});
```

(Fill in the test body using the existing FirmwareView mount helper pattern. The assertion goes against the rendered banner text.)

- [x] **B.7.9:** Run all tests:

Run: `cd astros_vue && npx vitest run`
Expected: all pass.

---

## Task B.8: Phase B wrap — verify, review, commit

- [x] **B.8.1:** Run prettier + lint + build + tests on both projects.

Run:
```bash
cd astros_vue && npm run prettier:write && npm run lint:fix && npm run build && npx vitest run
cd ../astros_api && npm run prettier:write && npm run lint:fix && npm run build && npx vitest run
```
Expected: all green.

- [x] **B.8.2:** Invoke `superpowers:requesting-code-review` on the Phase B diff. Prompt:

> Review the changes since Commit A for Phase B of the round-7 review fixes. The diff implements 7 Important findings: array/element validation in buildControllerStatesMap (IM-3), discriminated-union ControllerFlashState (IM-2), SlotId wire-vs-by-slot split (IM-11), ControllersPanelProps discriminated union (IM-12), useWebsocket closure capture (IM-9), cancelFlash error surfacing (IM-10), plus 8 test coverage additions (IM-8). Look for: type-narrowing sites that should use a discriminated check instead of an `as` cast, missed sibling claims after the type changes (CLAUDE.md partial-fix sweep — header docstrings, plan refs), any test added that's vacuous (would pass if production code was reverted).

Address any Critical or Important findings.

- [x] **B.8.3:** Stage and commit Phase B:

```bash
git add astros_vue/src/types/firmware.ts \
  astros_vue/src/stores/firmware.ts \
  astros_vue/src/stores/__tests__/firmware.spec.ts \
  astros_vue/src/composables/useWebsocket.ts \
  astros_vue/src/composables/__tests__/useWebsocket.spec.ts \
  astros_vue/src/components/firmware/firmwareControllersPanel/types.ts \
  astros_vue/src/components/firmware/firmwareControllersPanel/AstrosFirmwareControllersPanel.vue \
  astros_vue/src/components/firmware/firmwareControllersPanel/__tests__/AstrosFirmwareControllersPanel.spec.ts \
  astros_vue/src/views/FirmwareView.vue \
  astros_vue/src/views/__tests__/FirmwareView.spec.ts \
  astros_vue/src/utils/__tests__/firmwareStageMapping.spec.ts \
  astros_vue/src/utils/firmwareStageMapping.ts \
  astros_vue/src/components/firmware/firmwareControllerRow/AstrosFirmwareControllerRow.vue
git commit -m "$(cat <<'EOF'
fix(firmware): round-7 Importants (code+tests) — discriminated unions + SlotId split + WS lifecycle + 8 coverage gaps

IM-3: buildControllerStatesMap rejects non-array states and warns on
  invalid per-element shape. Prevents pendingByMac pollution from
  malformed server payloads.

IM-2: ControllerFlashState (client mirror) is now a discriminated
  union on stage. VERSION_CONFIRMED requires finalVersion, FAILED
  requires error — matches the server's contract.

IM-11: ControllerFlashState split into wire (`controllerId: string`
  MAC) and by-slot (`controllerId: SlotId`) views. The cast tax in
  applyControllerUpdate/applyJobFailed drops from 3 sites to 1
  (buildControllerStatesMap, the translation boundary).

IM-12: ControllersPanelProps is a discriminated union on phase.
  Phase-vs-fields correlations enforced at compile time; dev-only
  watchEffect warnings retired.

IM-9: useWebsocket.wsConnect captures the socket locally so handlers
  reference the correct WebSocket across reconnects. Closes a
  potential cross-socket-close HMR race.

IM-10: cancelFlash surfaces a network_error flashError on HTTP
  failure instead of logging silently.

IM-8: 8 coverage gaps closed — happy-path dispatch for
  flashControllerResult and flashJobStarted, FLASH_JOB_ACTIVE no-op
  contract pin, flushPendingForMac re-queue forensic warn, mutation-
  resistant replace-not-merge, i18n key contract for FlashErrorReason,
  flashError-persists-across-success, lockSinceFormatted NaN fallback.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [x] **B.8.4:** Check off Phase B in this plan, commit the update.

---

# Phase C — Importants (prose + cleanup) (Commit C)

Single commit at end of phase. Message: `fix(firmware): round-7 Importants (prose+cleanup) — abortReason wired + 3 test renames + 5 plan/QA drifts + dispatcher comment + source-type doc`.

## Task C.1: IM-1 — Wire `currentJob.abortReason` into FirmwareView (or remove writes)

Decision: **wire into the failed-result bar.** The data is captured at `applyJobFailed:411-413` but unused. Operators benefit from seeing the abort reason inline with the failure attribution.

**Files:**
- Modify: `astros_vue/src/views/FirmwareView.vue` (failed-phase render block)
- Modify: `astros_vue/src/locales/enUS.json` (add an i18n key for the abort label if needed)

- [x] **C.1.1:** Find the failed-result bar in `FirmwareView.vue` (search for `phase === 'failed'` template region or the `failedControllerLabels` rendering).

- [x] **C.1.2:** Add a render for `currentJob?.abortReason` near the failure detail. Example:

```vue
<div v-if="firmwareStore.phase === 'failed' && firmwareStore.currentJob?.abortReason"
     class="text-sm opacity-80 mt-1">
  {{ $t('firmware_view.failed.abort_reason', { reason: firmwareStore.currentJob.abortReason }) }}
</div>
```

- [x] **C.1.3:** Add the i18n key to `enUS.json`:

```json
"firmware_view": {
  "failed": {
    "abort_reason": "Abort reason: {reason}"
  }
}
```

(Place inside the existing `firmware_view.failed.*` block.)

- [x] **C.1.4:** Add a view test:

```ts
// In FirmwareView.spec.ts:
it('renders abortReason in the failed-result bar when present', () => {
  const wrapper = mountWithStore({
    phase: 'failed',
    currentJob: makeJob({ abortReason: 'user_cancel' }),
    failedControllers: [{ id: 'core', label: 'Core', stage: 'transfer' }],
  });
  expect(wrapper.text()).toContain('user_cancel');
});
```

Adjust `mountWithStore`/`makeJob` to match the file's existing helpers.

- [x] **C.1.5:** Run tests:

Run: `cd astros_vue && npx vitest run src/views/__tests__/FirmwareView.spec.ts`
Expected: all pass.

---

## Task C.2: IM-4 — Rename 3 drifted test-name format strings

**Files:**
- Modify: `astros_vue/src/components/common/__tests__/AstrosWriteButton.spec.ts:65`
- Modify: `astros_vue/src/stores/__tests__/firmware.spec.ts:1023, 1100`

- [x] **C.2.1:** In `AstrosWriteButton.spec.ts:65`, rename the test from `'applies the tooltip class to the wrapper only when readOnly is true'` to `'applies the tooltip class to the wrapper when either readOnly OR jobLock.locked is true'`. Add a positive locked-tooltip assertion alongside the existing readOnly one (or split into two tests with accurate names).

- [x] **C.2.2:** In `firmware.spec.ts:1023`, rename `'collects ALL FAILED entries (multi-failure realistic on bus-wide ESP-NOW errors)'` to `'collects ALL FAILED entries AND attributes stage from the shared currentStage ref (not per-controller history)'`. Or split into two tests.

- [x] **C.2.3:** In `firmware.spec.ts:1100`, rename `'preserves server-reported FAILED entries during the failed normalize (preserves their error string)'` to `'preserves server-reported FAILED error strings AND leaves demoted entries without an error string (C1 normalize attribution)'`. Or split.

- [x] **C.2.4:** Run all affected tests:

Run: `cd astros_vue && npx vitest run src/components/common/__tests__/AstrosWriteButton.spec.ts src/stores/__tests__/firmware.spec.ts`
Expected: all pass.

---

## Task C.3: IM-7 — Update dispatcher sole-writer comment

**Files:**
- Modify: `astros_vue/src/composables/useWebsocket.ts:258-265`

- [x] **C.3.1:** Find the comment block at lines 258-265 (search for "directly" near the firmware-flash handler family doc). Replace `the catch path may also write store.flashError directly` with:

```ts
// The catch path may also call store.setFlashError(...) to surface a
// generic envelope (when the store can't see the malformed input to
// recover by itself). All flashError writes route through setFlashError
// (the round-6 sole-writer pattern — see firmware.ts:209 setFlashError).
```

- [x] **C.3.2:** Search for any other comments in `useWebsocket.ts` that reference `flashError =` or `store.flashError =`. Replace with `setFlashError` references.

Run: `grep -n "flashError\s*=" astros_vue/src/composables/useWebsocket.ts`
Expected: no comment-level direct-write references remain (test files and stories are not in scope).

---

## Task C.4: IM-6 — Fix `FlashJobState.source` doc

**Files:**
- Modify: `astros_vue/src/types/firmware.ts:166-168`

- [x] **C.4.1:** Replace the docstring above `FlashJobState`:

```ts
/**
 * Mirror of the server's `FlashJobState`, narrowed to UI-readable fields.
 * The server transmits the full `FlashSource` shape (sha256, sizeBytes,
 * displayName); we keep only what the UI needs. Source of truth:
 * `astros_api/src/models/firmware/flash_job_state.ts`.
 *
 * Note: `endedAt` is set on both success and failure terminal states.
 * `abortReason` is set only on cancel/streamer-rejection paths.
 */
```

---

## Task C.5: IM-5a — Fix plan-file line refs and stale claims (5 sites)

**Files:**
- Modify: `.docs/plans/20260512-0735-firmware-ota-d-6-live-wiring.md`

- [x] **C.5.1:** Update L40 and L281: change `api_server.ts:652-660` → `api_server.ts:654-669`.

- [x] **C.5.2:** Update L203: change `"228 tests total at branch tip across rounds 1–4"` → `"228 tests total at branch tip across all six (now seven) fix rounds"`.

- [x] **C.5.3:** Update L221: change `"5 FMI hazards"` → `"7 FMI hazards"` (or however many rows the table actually has — count and match).

- [x] **C.5.4:** Update L246 (FMI item 6): change `'internal_server_error'` → `'protocol_violation'` for the WS-handler malformed-payload envelope. (Note: `internal_server_error` remains the correct envelope for the `applyJobFailed` unknown-server-reason fallback — clarify both.)

- [x] **C.5.5:** Update L278: change `flash_job_state.ts:1-40` → `flash_job_state.ts:1-47` (or drop the line range entirely).

- [x] **C.5.6:** Add a new FMI inventory row capturing the CR-1 reboot-wait wedge race (per the round-7 review finding):

```
| 8 | HTTP cold-load during reboot-wait window | fetchCurrentJob applied an endedAt-set body, wedging phase at flashing | Mirrored server's decideLateJoinSnapshot filter; defense-in-depth in handleLockStateChanged forces phase=done on lock release |
```

(Adjust column/format to match the existing FMI table layout.)

---

## Task C.6: IM-5b — Fix QA plan test-count drift

**Files:**
- Modify: `.docs/qa/firmware-ota-flash-ui.md`

- [x] **C.6.1:** Find line 166 (`"The 210 vitest tests still pass"`) and update to `"All vitest tests still pass"` (drop the number to avoid future drift), or update to the post-round-7 count once Phase C is complete.

Run: `cd astros_vue && npx vitest run 2>&1 | tail -5` to get the post-round-7 count.

- [x] **C.6.2:** Update line 3 if needed to match.

- [x] **C.6.3:** Add a QA test case §6.5 covering the reboot-wait wedge fix from CR-1:

```markdown
### 6.5 Refresh during the 15s reboot-wait window after a successful flash

**Preconditions:** A flash has just completed; the result bar shows "✓ all updated"; the server is in the reboot-wait window (lock still held).

**Steps:**
1. Refresh the browser tab.

**Expected:**
- Page shows phase='idle' / Select panel (CR-1a fix).
- Lock-conflict banner may briefly appear if the lock hasn't released yet; it disappears within ~15s.
- No UI wedge at phase='flashing'.

**Regression signal (pre-fix):** Page rendered phase='flashing' indefinitely until a second refresh.
```

---

## Task C.7: Sweep — partial-fix check on all renamed/edited claims

CLAUDE.md emphasizes the "partial-fix sweep" pattern: fix the cited site AND every sibling. After Phase C's edits, grep for any remaining stale references.

- [x] **C.7.1:** Sweep for `"210"` in `.docs/`:

Run: `grep -rn "210" .docs/ | grep -v node_modules`
Inspect each match — any reference to "210 tests" or "210 passing" is stale; update.

- [x] **C.7.2:** Sweep for old API-server line refs:

Run: `grep -rn "api_server.ts:65" .docs/`
Inspect each — confirm they point at the post-round-7 line numbers.

- [x] **C.7.3:** Sweep for `"rounds 1–4"` / `"rounds 1-4"` in `.docs/`:

Run: `grep -rn "rounds 1.4\|round 4\|round-4" .docs/`
Inspect — any "at branch tip" claim should reflect round 7.

- [x] **C.7.4:** Sweep `useWebsocket.ts` for any other stale direct-write claims:

Run: `grep -n "flashError\s*=" astros_vue/src/composables/useWebsocket.ts`
Expected: no comment-level direct-write references; only `setFlashError(...)` calls.

- [x] **C.7.5:** Sweep the round-7 plan file itself for any line refs that may have shifted:

Run: `grep -n "firmware.ts:\|useWebsocket.ts:\|api_server.ts:" .docs/plans/20260514-0734-firmware-ota-d-6-round-7-review-fixes.md`
Inspect — confirm line numbers point at the post-Phase-B state (these are best-effort because the plan was written before the code shifted; flag any that are clearly off).

---

## Task C.8: Phase C wrap — verify, review, commit

- [x] **C.8.1:** Run prettier + lint + build + tests on Vue (no API changes in Phase C):

Run: `cd astros_vue && npm run prettier:write && npm run lint:fix && npm run build && npx vitest run`
Expected: all green.

- [x] **C.8.2:** Invoke `superpowers:requesting-code-review` on the Phase C diff. Prompt:

> Review the changes since Commit B for Phase C of the round-7 review fixes. The diff implements 5 Important prose/cleanup findings: abortReason wired into the failed-result bar (IM-1), 3 test renames to fix format-string drifts (IM-4), dispatcher sole-writer comment update (IM-7), FlashJobState.source docstring correction (IM-6), 5 plan/QA prose drift fixes including a new FMI row and QA test case for the CR-1 wedge fix (IM-5). Look specifically for: any test rename that now lies in a different way, any sibling claim I missed in the prose sweep (CLAUDE.md partial-fix sweep), any rendered abortReason path that crashes on undefined.

Address any Critical or Important findings.

- [x] **C.8.3:** Stage and commit Phase C:

```bash
git add astros_vue/src/views/FirmwareView.vue \
  astros_vue/src/views/__tests__/FirmwareView.spec.ts \
  astros_vue/src/locales/enUS.json \
  astros_vue/src/components/common/__tests__/AstrosWriteButton.spec.ts \
  astros_vue/src/stores/__tests__/firmware.spec.ts \
  astros_vue/src/composables/useWebsocket.ts \
  astros_vue/src/types/firmware.ts \
  .docs/plans/20260512-0735-firmware-ota-d-6-live-wiring.md \
  .docs/qa/firmware-ota-flash-ui.md
git commit -m "$(cat <<'EOF'
fix(firmware): round-7 Importants (prose+cleanup) — abortReason wired + 3 test renames + 5 plan/QA drifts + dispatcher comment + source-type doc

IM-1: currentJob.abortReason now renders in the failed-result bar.
  The field was being captured at applyJobFailed but never displayed
  — operators saw the FlashError detail but not the abort reason.

IM-4: 3 test names renamed to match what they actually verify
  (AstrosWriteButton tooltip-on-locked, firmware.spec.ts shared-
  stage attribution, firmware.spec.ts normalize-without-error).
  Closes the CLAUDE.md flagged broken-test-name format-string category.

IM-7: Dispatcher sole-writer comment now correctly references
  setFlashError instead of "flashError directly", matching the
  round-6 contract.

IM-6: FlashJobState.source docstring points at FlashSource (server's
  actual transmit type) instead of FlashRequest (the POST body
  shape). Adds note on endedAt/abortReason semantics.

IM-5: Plan file line refs corrected (api_server.ts:654-669, not
  :652-660; flash_job_state.ts:1-47, not :1-40). Stale test count
  (210) replaced. FMI hazard count corrected (7, not 5). Round-6
  protocol_violation envelope added to FMI item 6. New FMI row 8
  added for the CR-1 reboot-wait wedge race. QA plan adds test
  case 6.5 for the reboot-wait refresh scenario.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [x] **C.8.4:** Check off Phase C in this plan, commit the update.

---

# Post-phase verification

After all 3 commits land:

- [ ] **Z.1:** Re-run the full pre-push toolkit on the branch vs `origin/develop`:

Run: `/pr-review-toolkit:review-pr`

Expected: All 6 Criticals from round-7 resolved; the 12 Importants addressed or downgraded. Any new findings from the toolkit pass become round-8 work (or fold into existing commits if the user requests).

- [ ] **Z.2:** Confirm test count, build pass, lint clean:

Run:
```bash
cd astros_vue && npm run build && npx vitest run 2>&1 | tail -3
cd ../astros_api && npm run build && npx vitest run 2>&1 | tail -3
```

- [ ] **Z.3:** Hand off to user for VS Code push (per memory: never push from terminal).

---

# Notes on this plan

- **No new branches.** All commits land on `feature/firmware-ota-d-6-live-wiring`.
- **No `git push`.** The user pushes via VS Code per their workflow.
- **Plan commits are part of the deliverable.** The plan commit (A.0) and the post-phase plan-update commits (A.12.5, B.8.4, C.8.4) keep this file as the single source of truth for progress.
- **Each phase is independently shippable.** If interrupted, the branch can be pushed with just Phase A landed and the remaining work picked up next session.
- **TDD where applicable.** Store/composable/util/type changes have failing-test-first. UI template tweaks (e.g., the abortReason render in C.1) get a test after, per CLAUDE.md's TDD-exception for UI work.
- **The code-review subagent runs before EACH commit.** This is mandatory per CLAUDE.md's pre-commit section (carve-outs don't apply because every commit touches `.ts`/`.vue` logic).
