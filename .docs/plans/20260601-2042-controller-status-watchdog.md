# Controller Status Watchdog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detect when controllers go silent (master offline / serial unplug / padawan dropout) and broadcast `StatusResponse{up:false}` so the Status page flips them to DOWN instead of freezing on the last-known value.

**Architecture:** A pure, unit-testable `ControllerWatchdog` module tracks per-controller last-seen timestamps from `POLL_ACK`s and decides who has gone silent (edge-triggered via a `down` set). `api_server` owns the thin wiring: it calls `recordAck` from the existing poll handler, runs a `setInterval` sweep (suppressed during an OTA flash), marks all controllers down on the serial `close`/`error` event, and broadcasts the synthesized DOWN messages. No frontend, DB, or protocol changes — the UI already renders `up:false` as DOWN.

**Tech Stack:** TypeScript, Node, vitest. Design spec: `.docs/plans/specs/2026-06-01-controller-status-watchdog-design.md`.

---

## File structure

- **Create** `astros_api/src/serial/controller_watchdog.ts` — the `ControllerWatchdog` class, `ControllerIdentity` type, `buildDownStatus()` helper, and the two timing constants. Pure logic; no serial/DB/WS/`Date.now()`.
- **Create** `astros_api/src/serial/controller_watchdog.test.ts` — unit tests (TDD, mutation-checked).
- **Modify** `astros_api/src/api_server.ts` — instantiate the watchdog, `recordAck` in `handlePollResponse`, the sweep `setInterval` in `setupSerialPort()`, `markAllDown` in the serial `error`/`close` handlers, and `clearInterval` in `shutdown()`.
- **Create** `.docs/qa/controller-status-watchdog.md` — manual QA plan (the serial wiring is covered by QA, not automated tests, per the serial TDD exception).

## Failure-mode inventory (brief)

| Mode | Handling |
|---|---|
| Timer leaks past process exit | `setInterval` handle is `.unref()`'d (won't hold the event loop) and `clearInterval`'d in `shutdown()`. |
| Sweep callback fires after teardown | `shutdown()` clears the timer before tearing down clients; `updateClients` already guards per-client send failures. |
| `error` then `close` both fire | `markAllDown` is edge-triggered (skips controllers already in `down`) → idempotent, no duplicate broadcasts. |
| False DOWN during OTA flash | Sweep is skipped while `flashOrchestrator.getCurrentJob()` is non-null. |
| False DOWN on a flaky serial frame | 10 s timeout ≈ 2–3 missed ~4 s ack cycles of slack. |
| Never-seen controller churn | Controllers absent from `lastSeen` are never emitted; cold-start DOWN is the store default. |
| Recovery | Next `POLL_ACK` → existing `handlePollResponse` broadcasts `up:true` and `recordAck` clears the `down` flag. No recovery code. |

---

### Task 1: `ControllerWatchdog` module

**Files:**
- Create: `astros_api/src/serial/controller_watchdog.ts`
- Test: `astros_api/src/serial/controller_watchdog.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `astros_api/src/serial/controller_watchdog.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { TransmissionType } from 'src/models/index.js';
import {
  ControllerWatchdog,
  buildDownStatus,
  STATUS_STALE_TIMEOUT_MS,
  type ControllerIdentity,
} from './controller_watchdog.js';

const dome: ControllerIdentity = {
  controllerId: 'id-dome',
  controllerAddress: 'AA:BB:CC:DD:EE:01',
  controllerLocation: 'dome',
};
const body: ControllerIdentity = {
  controllerId: 'id-body',
  controllerAddress: '00:00:00:00:00:00',
  controllerLocation: 'body',
};

describe('ControllerWatchdog', () => {
  it('does not flag a controller still within the timeout window', () => {
    const wd = new ControllerWatchdog();
    wd.recordAck(dome, 1000);
    expect(wd.sweep(1000 + STATUS_STALE_TIMEOUT_MS)).toEqual([]); // exactly at threshold, not over
  });

  it('flags a controller that has been silent longer than the timeout', () => {
    const wd = new ControllerWatchdog();
    wd.recordAck(dome, 1000);
    expect(wd.sweep(1000 + STATUS_STALE_TIMEOUT_MS + 1)).toEqual([dome]);
  });

  it('emits a DOWN only once per outage (edge-triggered)', () => {
    const wd = new ControllerWatchdog();
    wd.recordAck(dome, 0);
    const first = wd.sweep(STATUS_STALE_TIMEOUT_MS + 1);
    const second = wd.sweep(STATUS_STALE_TIMEOUT_MS + 5000);
    expect(first).toEqual([dome]);
    expect(second).toEqual([]); // already down, do not re-emit
  });

  it('re-arms after a recovering ack and can flag DOWN again', () => {
    const wd = new ControllerWatchdog();
    wd.recordAck(dome, 0);
    expect(wd.sweep(STATUS_STALE_TIMEOUT_MS + 1)).toEqual([dome]);
    wd.recordAck(dome, 100_000); // recovered
    expect(wd.sweep(100_000 + 1)).toEqual([]); // fresh again
    expect(wd.sweep(100_000 + STATUS_STALE_TIMEOUT_MS + 1)).toEqual([dome]); // silent again
  });

  it('only flags the stale controller, not a fresh sibling', () => {
    const wd = new ControllerWatchdog();
    wd.recordAck(dome, 0);
    wd.recordAck(body, 9_000);
    expect(wd.sweep(STATUS_STALE_TIMEOUT_MS + 1)).toEqual([dome]); // body still fresh
  });

  it('never flags a controller it has never seen', () => {
    const wd = new ControllerWatchdog();
    expect(wd.sweep(1_000_000)).toEqual([]);
    expect(wd.markAllDown()).toEqual([]);
  });

  it('markAllDown flags every seen controller once, idempotently', () => {
    const wd = new ControllerWatchdog();
    wd.recordAck(dome, 0);
    wd.recordAck(body, 0);
    const all = wd.markAllDown();
    expect(all).toEqual(expect.arrayContaining([dome, body]));
    expect(all).toHaveLength(2);
    expect(wd.markAllDown()).toEqual([]); // already down
  });

  it('a sweep after markAllDown does not re-emit', () => {
    const wd = new ControllerWatchdog();
    wd.recordAck(dome, 0);
    wd.markAllDown();
    expect(wd.sweep(STATUS_STALE_TIMEOUT_MS + 1)).toEqual([]);
  });

  it('buildDownStatus produces a DOWN StatusResponse the UI renders as down', () => {
    expect(buildDownStatus(dome)).toEqual({
      type: TransmissionType.status,
      success: true,
      message: '',
      controllerId: 'id-dome',
      controllerAddress: 'AA:BB:CC:DD:EE:01',
      controllerLocation: 'dome',
      up: false,
      synced: false,
      firmwareVersion: '',
      firmwareCompatible: false,
    });
  });
});
```

- [ ] **Step 2: Run the tests, verify they fail**

Run: `cd astros_api && npx vitest run src/serial/controller_watchdog.test.ts`
Expected: FAIL — `Failed to resolve import "./controller_watchdog.js"` (module not created yet).

- [ ] **Step 3: Write the module**

Create `astros_api/src/serial/controller_watchdog.ts`:

```ts
import { StatusResponse, TransmissionType } from 'src/models/index.js';

/** How long a controller may be silent (no POLL_ACK) before it is marked DOWN. */
export const STATUS_STALE_TIMEOUT_MS = 10_000;
/** How often the staleness sweep runs. */
export const STATUS_SWEEP_INTERVAL_MS = 2_000;

/** The identity a DOWN broadcast needs, captured from each POLL_ACK. */
export interface ControllerIdentity {
  controllerId: string;
  controllerAddress: string;
  controllerLocation: string; // body | core | dome — the key the frontend reads
}

/**
 * Tracks controller liveness from POLL_ACK timestamps and decides which
 * controllers have gone silent. Pure logic: the caller passes `now` and does the
 * broadcasting — no serial/DB/WS/Date.now() here, so it is fully unit-testable.
 *
 * Edge-triggered: a controller emits one DOWN on the up->down transition (via the
 * `down` set), not once per sweep, preventing WS spam and UI flapping.
 */
export class ControllerWatchdog {
  private readonly lastSeen = new Map<string, { id: ControllerIdentity; at: number }>();
  private readonly down = new Set<string>();

  constructor(private readonly staleTimeoutMs: number = STATUS_STALE_TIMEOUT_MS) {}

  /** A POLL_ACK arrived: stamp last-seen and clear any DOWN flag. */
  recordAck(id: ControllerIdentity, now: number): void {
    this.lastSeen.set(id.controllerId, { id, at: now });
    this.down.delete(id.controllerId);
  }

  /**
   * Periodic check: return controllers silent longer than the timeout that are
   * not already flagged, marking them DOWN. Caller broadcasts each as up:false.
   */
  sweep(now: number): ControllerIdentity[] {
    const newlyDown: ControllerIdentity[] = [];
    for (const [controllerId, entry] of this.lastSeen) {
      if (this.down.has(controllerId)) {
        continue;
      }
      if (now - entry.at > this.staleTimeoutMs) {
        this.down.add(controllerId);
        newlyDown.push(entry.id);
      }
    }
    return newlyDown;
  }

  /**
   * Serial close/error fast-path: return every seen controller not already
   * flagged, marking them DOWN. They stay down until a fresh recordAck.
   */
  markAllDown(): ControllerIdentity[] {
    const newlyDown: ControllerIdentity[] = [];
    for (const [controllerId, entry] of this.lastSeen) {
      if (this.down.has(controllerId)) {
        continue;
      }
      this.down.add(controllerId);
      newlyDown.push(entry.id);
    }
    return newlyDown;
  }
}

/** Synthesize the DOWN StatusResponse the UI renders as ControllerStatus.DOWN. */
export function buildDownStatus(id: ControllerIdentity): StatusResponse {
  return {
    type: TransmissionType.status,
    success: true,
    message: '',
    controllerId: id.controllerId,
    controllerAddress: id.controllerAddress,
    controllerLocation: id.controllerLocation,
    up: false,
    synced: false,
    firmwareVersion: '',
    firmwareCompatible: false,
  };
}
```

- [ ] **Step 4: Run the tests, verify they pass**

Run: `cd astros_api && npx vitest run src/serial/controller_watchdog.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Mutation-check the defensive guards** (per the project's defensive-feature convention)

Temporarily break each guard, confirm a test fails, then restore:
1. In `sweep`, change `now - entry.at > this.staleTimeoutMs` to `< this.staleTimeoutMs`. Run the file → "flags a controller that has been silent…" FAILS. Restore.
2. In `sweep`, delete the `if (this.down.has(controllerId)) { continue; }` guard. Run the file → "emits a DOWN only once per outage" FAILS (second sweep re-emits). Restore.
3. In `recordAck`, delete `this.down.delete(id.controllerId);`. Run the file → "re-arms after a recovering ack…" FAILS. Restore.

Re-run the file after restoring → PASS (9 tests).

- [ ] **Step 6: Format, lint, commit**

```bash
cd astros_api && npm run prettier:write && npm run lint:fix
git add astros_api/src/serial/controller_watchdog.ts astros_api/src/serial/controller_watchdog.test.ts
git commit -m "feat(status): ControllerWatchdog — detect silent controllers (pure logic + tests)"
```

---

### Task 2: Wire the watchdog into `api_server`

**Files:**
- Modify: `astros_api/src/api_server.ts` (import; two fields; `handlePollResponse` `:1001-1014`; `setupSerialPort` `:659-665`; `shutdown` `:1383`)

> No automated test: this wiring lives in `setupSerialPort()`, which is skipped under `NODE_ENV=test`. It is covered by the manual QA plan in Task 3 (serial TDD exception). The logic it calls is already fully unit-tested in Task 1.

- [ ] **Step 1: Add the import**

Add to the existing imports in `api_server.ts` (anywhere among the `src/serial/...` imports):

```ts
import {
  ControllerWatchdog,
  buildDownStatus,
  STATUS_SWEEP_INTERVAL_MS,
} from 'src/serial/controller_watchdog.js';
```

- [ ] **Step 2: Add the two fields**

Next to the other private fields (near `private serialPort: any;` at `:180` and `private flashOrchestrator?` at `:212`):

```ts
  private readonly controllerWatchdog = new ControllerWatchdog();
  private statusSweepTimer: NodeJS.Timeout | null = null;
```

- [ ] **Step 3: Record each POLL_ACK in `handlePollResponse`**

In `handlePollResponse`, immediately before the existing `this.updateClients(update);` (`:1014`), add:

```ts
      this.controllerWatchdog.recordAck(
        {
          controllerId: controller.id,
          controllerAddress: val.controller.address,
          controllerLocation: location.locationName,
        },
        Date.now(),
      );
```

- [ ] **Step 4: Add the sweep interval in `setupSerialPort()`**

In `setupSerialPort()`, after the `this.serialParser = ...` block but still inside the `try` (i.e. just before the closing `} catch (err) {` at `:675`), add:

```ts
      // Staleness watchdog: a controller silent past the timeout flips to DOWN.
      // Suppressed during an OTA flash — the master reboots and polls pause past
      // the timeout, and the firmware-stages board owns status then.
      this.statusSweepTimer = setInterval(() => {
        if (this.flashOrchestrator?.getCurrentJob()) {
          return;
        }
        for (const id of this.controllerWatchdog.sweep(Date.now())) {
          this.updateClients(buildDownStatus(id));
        }
      }, STATUS_SWEEP_INTERVAL_MS);
      this.statusSweepTimer.unref();
```

- [ ] **Step 5: Mark all down on serial `error`/`close` (the fast-path)**

Replace the existing handlers (`:659-665`):

```ts
      this.serialPort.on('error', (err: any) => {
        logger.error(`Serial port error: ${err}`);
      });

      this.serialPort.on('close', () => {
        logger.warn('Serial port closed');
      });
```

with:

```ts
      this.serialPort.on('error', (err: any) => {
        logger.error(`Serial port error: ${err}`);
        for (const id of this.controllerWatchdog.markAllDown()) {
          this.updateClients(buildDownStatus(id));
        }
      });

      this.serialPort.on('close', () => {
        logger.warn('Serial port closed');
        for (const id of this.controllerWatchdog.markAllDown()) {
          this.updateClients(buildDownStatus(id));
        }
      });
```

- [ ] **Step 6: Clear the timer in `shutdown()`**

In `shutdown()`, immediately after the `safeClose` helper is defined and before the first existing `await safeClose(...)` call (`:1397`), add:

```ts
    await safeClose('statusSweepTimer.clear', () => {
      if (this.statusSweepTimer) {
        clearInterval(this.statusSweepTimer);
        this.statusSweepTimer = null;
      }
    });
```

- [ ] **Step 7: Build, lint, full suite — verify nothing broke**

```bash
cd astros_api && npm run prettier:write && npm run lint:fix && npm run build && npx vitest run
```
Expected: lint 0 errors; `tsc` clean; full suite green (existing count + the 9 new watchdog tests).

- [ ] **Step 8: Commit**

```bash
git add astros_api/src/api_server.ts
git commit -m "feat(status): wire ControllerWatchdog into api_server (sweep + serial-close fast-path)"
```

---

### Task 3: Manual QA plan

**Files:**
- Create: `.docs/qa/controller-status-watchdog.md`

- [ ] **Step 1: Write the QA plan**

Create `.docs/qa/controller-status-watchdog.md`:

```markdown
# QA: Controller status watchdog

**Preconditions:** server running against real hardware (master + at least one
padawan), all controllers showing UP (green) on the Status page, a browser on
the Status page with the WebSocket connected.

## Test cases

1. **Staleness → DOWN.** Power off / disconnect a single padawan (master stays
   up). Expected: within ~10 s that location's badge turns grey (DOWN); the
   others stay green.
2. **Serial unplug → all DOWN immediately.** Unplug the master's USB-serial.
   Expected: all three badges go grey effectively immediately (serial `close`
   fast-path), not after the 10 s timeout.
3. **Recovery.** Reconnect/repower. Expected: each badge returns to green on its
   next POLL_ACK (no page refresh needed).
4. **No flap during OTA flash.** Start a firmware flash. Expected: the Status
   page does NOT flip controllers to DOWN while the flash is in progress, even
   though the master reboots and goes silent > 10 s. After the flash, status
   reflects reality.
5. **Edge-trigger (no spam).** With a controller offline, watch the network/WS
   frames. Expected: a single `status{up:false}` per controller per outage, not
   one every 2 s.
6. **Clean shutdown.** Stop the server (SIGINT). Expected: no errors about a
   timer firing after teardown; process exits promptly (timer is unref'd).

## Negative / edge
- Master offline at page-load time still shows DOWN (store default) — unchanged.
- A controller never seen this session is never spuriously emitted.
```

- [ ] **Step 2: Commit**

```bash
git add .docs/qa/controller-status-watchdog.md
git commit -m "docs(qa): manual QA plan for controller status watchdog"
```

---

## After all tasks

- [ ] Update the spec/plan status if desired; run the pre-push branch review
      (`/pr-review-toolkit:review-pr`) on the full diff vs `develop`; address
      Critical/Important; then open the PR with `gh pr create --base develop`.
