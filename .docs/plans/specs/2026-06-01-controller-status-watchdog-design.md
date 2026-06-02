# Design: server-side controller status watchdog

**Date:** 2026-06-01
**Branch:** `feature/controller-status-watchdog` (off `develop`)
**Status:** design — pending user review

## Problem

A controller's status on the Status page is **edge-triggered on good news
only**: every update flows from a positive `POLL_ACK` through
`handlePollResponse`, which broadcasts a `StatusResponse` with `up: true`
(`api_server.ts:1001-1014`). There is no path that ever broadcasts `up: false`.

So if the master ESP goes offline while a browser Status page is open:

- The browser↔server WebSocket stays up (the Node server is fine), so the
  frontend's reconnect logic never fires and never resets status.
- The serial `'close'`/`'error'` handlers only log (`api_server.ts:659-665`).
- No server-side timeout marks a silent controller offline — there is no
  per-controller last-seen tracking and no sweep timer.

Result: the badges **freeze at their last-known value**. A controller that was
`UP` (green) when the master died stays green indefinitely, misleading the
operator into thinking the droid is reachable. (Confirmed by code trace
2026-06-01; the frozen-UP case is the dangerous one — a *page load* while the
master is offline happens to show DOWN only because the store defaults to DOWN.)

## Goal

Detect that controllers have gone silent and broadcast `up: false` so the UI
flips them to `DOWN` (grey), via two complementary triggers:

1. **Staleness sweep** — per-controller: no `POLL_ACK` within ~10 s → DOWN.
2. **Serial-close fast-path** — the serial `'close'`/`'error'` event → mark all
   known controllers DOWN immediately (don't wait out the 10 s).

**Non-goals:** reconnecting the serial port (no auto-reconnect exists today and
that stays out of scope); a distinct `UNKNOWN`/`DISCONNECTED` UI state (we reuse
`DOWN`); the firmware OTA deploy-phase watchdog, which is a *different* concern
with its own spec (`2026-05-29-firmware-deploy-watchdog-design.md`) — that one
fails a flash *job*; this one tracks *liveness status* of controllers.

## Design decisions (settled in brainstorming)

1. **Staleness sweep + serial-close fast-path** (not either alone). The sweep
   catches a wedged master (port open, polling stopped) and a single padawan
   dropping while the master keeps acking; the close fast-path gives instant
   feedback on a physical unplug instead of waiting out the timeout.
2. **Reuse `StatusResponse{ up: false }` → frontend `DOWN`.** The frontend
   already maps `!up` to `ControllerStatus.DOWN` (grey overlay). **No new enum,
   no new message type, no frontend changes.** "down" already effectively means
   "not reachable" since polls only ever send `up: true`.
3. **~10 s silence, swept every 2 s.** Each controller is realistically heard
   ~every 4 s (firmware polls every 2 s, alternating master self-ack / padawan
   poll), so 10 s ≈ 2–3 missed cycles of slack — tolerates dropped serial frames
   without false-flagging, surfaces a real outage within a few seconds.
   Configurable; defaults `STATUS_STALE_TIMEOUT_MS = 10_000`,
   `STATUS_SWEEP_INTERVAL_MS = 2_000`.
4. **Edge-triggered.** Emit one DOWN on the `up → down` transition, not every
   sweep — a `down` set turns the level condition ("still silent") into an event
   ("just went silent"). Prevents WS spam and UI flapping.
5. **Suppress the sweep while a flash job is active.** During an OTA flash the
   master reboots and polls legitimately pause > 10 s; the firmware-stages board
   already owns per-controller status then. While
   `flashOrchestrator.getCurrentJob() !== null`, skip the sweep. The
   serial-close fast-path stays active (a genuine unplug mid-flash is still real).
6. **Identity captured from each `POLL_ACK`.** The DOWN message needs
   `controllerId`, `controllerAddress`, `controllerLocation`; the watchdog stores
   those at `recordAck` time so it can synthesize a DOWN without a DB lookup.

## Mechanism

### New module — `astros_api/src/serial/controller_watchdog.ts`

Pure timing logic: no serial, no DB, no WebSocket, no `Date.now()` (the caller
passes `now`). Fully unit-testable with explicit timestamps.

```ts
interface ControllerIdentity {
  controllerId: string;
  controllerAddress: string;
  controllerLocation: string; // body | core | dome (the frontend key)
}

class ControllerWatchdog {
  constructor(private readonly staleTimeoutMs = STATUS_STALE_TIMEOUT_MS) {}
  private lastSeen = new Map<string, { id: ControllerIdentity; at: number }>();
  private down = new Set<string>(); // controllerIds currently flagged down

  // POLL_ACK arrived: stamp last-seen, clear any down flag.
  recordAck(id: ControllerIdentity, now: number): void;

  // Periodic: return controllers gone silent > staleTimeoutMs and not already
  // down; mark them down. Caller broadcasts a DOWN StatusResponse for each.
  sweep(now: number): ControllerIdentity[];

  // Serial close/error: return all seen-but-not-already-down controllers; add
  // them to `down` (so a later sweep won't re-emit). They stay down until a
  // fresh recordAck clears the flag.
  markAllDown(now: number): ControllerIdentity[];
}
```

Keyed by `controllerId` (the DB identity `handlePollResponse` already resolves).
A never-seen controller is absent from `lastSeen`, so it is never flagged DOWN —
the frontend's default `DOWN` covers cold-start, with no spurious up→down churn.

### Wiring in `api_server` (the only consumer; serial-adjacent, skipped in test)

- **Record:** in `handlePollResponse`, right where it builds the `up:true`
  `StatusResponse` (`:1001`), also call
  `this.watchdog.recordAck({ controllerId, controllerAddress, controllerLocation }, Date.now())`.
- **Sweep:** a `setInterval(STATUS_SWEEP_INTERVAL_MS)` that, **unless**
  `this.flashOrchestrator?.getCurrentJob()` is non-null, runs
  `for (const id of this.watchdog.sweep(Date.now())) this.updateClients(buildDownStatus(id))`.
  The timer is `.unref()`'d (never holds the process open), stored on the
  instance, and `clearInterval`'d in the existing shutdown path. Created inside
  the serial-setup block that already no-ops under `NODE_ENV=test`.
- **Fast-path:** the `'close'` and `'error'` handlers (`:659-665`) additionally
  `for (const id of this.watchdog.markAllDown(Date.now())) this.updateClients(buildDownStatus(id))`.

### The DOWN message — `buildDownStatus(id): StatusResponse`

Identical shape to the live path, `up:false`, fields the frontend ignores when
`!up` set to inert defaults:

```ts
{ type: TransmissionType.status, success: true, message: '',
  controllerId, controllerAddress, controllerLocation,
  up: false, synced: false, firmwareVersion: '', firmwareCompatible: false }
```

### Recovery — free

The next `POLL_ACK` runs the existing `handlePollResponse`, which broadcasts
`up:true` *and* calls `recordAck` (clearing the down flag). No recovery code.

## Races & invariants

- **Edge-trigger prevents spam/flap.** `down` set ⇒ one DOWN per outage; the
  2 s sweep does not re-emit while still silent.
- **Asymmetric ownership.** The watchdog only ever introduces the down
  transition; the existing poll handler owns the up transition. The two can't
  fight: a fresh ack always wins (it clears `down` and broadcasts `up:true`).
- **`markAllDown` then `sweep` don't double-fire.** `markAllDown` adds to `down`,
  so the subsequent sweep skips them; they stay down until a fresh `recordAck`
  clears the flag (correct — the port stays closed, no auto-reconnect).
- **`'error'` + `'close'` both firing is idempotent** (edge-trigger).
- **Flash suppression is sweep-only.** Serial-close still fires during a flash;
  a real unplug mid-flash is a real event.
- **Timer lifecycle.** `.unref()` so tests/process aren't held open;
  `clearInterval` on shutdown so no callback runs against a torn-down server.

## Surfaces touched

- **Backend only.** New `serial/controller_watchdog.ts` + `.test.ts`;
  `api_server.ts` wiring (instantiate, `recordAck` in `handlePollResponse`, sweep
  interval, `markAllDown` in serial handlers, `buildDownStatus` helper,
  `clearInterval` on shutdown). Two timing constants.
- **No frontend changes. No DB changes. No new WS message type.**

## Tests

- **Unit (`controller_watchdog.test.ts`, TDD, mutation-checked):**
  recordAck-then-sweep-before-threshold → no DOWN; after-threshold → one DOWN;
  second sweep → no re-emit (edge-trigger); ack-after-down → clears, re-fires on
  next timeout; `markAllDown` → all seen, not unseen, idempotent; never-seen →
  never emitted; `buildDownStatus` shape. Revert each guard and confirm the test
  fails (per the project's defensive-feature mutation convention).
- **Wiring** (serial/interval in `api_server`) is exercised by **manual QA**, per
  the serial TDD exception: open the Status page with controllers UP, pull the
  master's serial, confirm all badges go grey within ~10 s (and immediately if
  the close event fires); reconnect/repower, confirm they return to green on the
  next poll; start a flash and confirm the page does not flap mid-flash.

## Failure-mode inventory

A short inventory (template: `.docs/templates/failure-mode-inventory.md`) will be
filled in the plan covering: timer leak on shutdown; callback firing post-teardown;
double-fire on error+close; false-positive during flash; false-positive on a
flaky link (threshold tuning); never-seen-controller churn; and recovery
correctness.

## Out of scope (follow-ups)

- Serial **auto-reconnect** (none exists today; the watchdog reports the outage,
  it doesn't heal it).
- A distinct `UNKNOWN`/`DISCONNECTED` UI state (reusing `DOWN` for now).
- A `lastSeenAt` column / persisted liveness (in-memory only this PR).
