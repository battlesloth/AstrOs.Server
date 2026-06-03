# Lock-conflict race hardening — follow-up stub (likely low priority post-async-start)

**Status: stub — verify still-relevant after `4b0e081` before designing a fix.**

## Background

During the 2026-05-16 OTA-stabilization arc we identified two race-window classes for the firmware page's "Another Operator started a firmware update" banner appearing for the operator's OWN in-flight flash:

1. **Initial-start race (1-10 s window)** — `lockStateChanged{locked:true}` arrives over WS before the HTTP POST returns (carrying `jobId`) or `flashJobStarted` arrives. Closed by `f32948b` via the `pendingOwnFlashStart` flag in the firmware store (set synchronously at `startFlash()` entry, cleared on terminal events).
2. **Cross-attempt race (30 s+ window)** — Operator clicks Flash, the first attempt fails (e.g., begin_timeout). The server emits `lockStateChanged{locked:false}` via `failJob`. If the WS event lands at the client while attempt 2's `pendingOwnFlashStart=true` is set (because the operator clicked Flash again quickly), `useWebsocket.ts:273-289`'s defensive recovery path fires `applyJobDone(...)` which clears `pendingOwnFlashStart`. Attempt 2's `lockStateChanged{locked:true}` then arrives, finds `isOwnJob === false`, and the banner shows for the operator's own (now legitimately-running) attempt 2.

## Why this is probably no longer load-bearing

The 30 s window in #2 existed because the HTTP POST blocked for the entire upload phase (~7 min), and the client's `apiClient.post()` 30-s timeout was the most common trigger for the race. After commit `4b0e081 fix(flash-orchestrator): start() returns early; upload + deploy run in background`, the HTTP POST returns in ~1-2 s. The race window between attempt-1's lockStateChanged{locked:false} arriving and attempt-2's startFlash setting `pendingOwnFlashStart=true` shrinks from ~30 s to milliseconds.

**Verify before implementing:** trigger the failure scenario (begin_timeout or similar) and rapidly retry. If the banner doesn't appear in attempt 2, this stub can be closed as "fixed by async-start."

If it DOES still appear, the fix shape outlined below stands.

## Suspected fix shape (if still needed)

Make the recovery path at `useWebsocket.ts:273-289` jobId-aware so it only fires when the released lock corresponds to the CURRENT job the client thinks it's watching, not any stale prior-attempt lock release:

```ts
// Sketch — not final design
if (!data.locked) {
  const firmware = useFirmwareStore();
  if (firmware.phase === 'flashing') {
    // Was the released lock OUR job, or a stale prior-attempt event?
    const releasedOwner = data.owner;  // server sends owner in lockStateChanged payload
    const ourJobId = firmware.ownJobId.value ?? firmware.currentJob.value?.jobId;
    if (releasedOwner !== ourJobId) {
      // Stale event — log and ignore, don't tear down our state.
      console.info('[useWebsocket] ignoring stale lockStateChanged{locked:false}', ...);
      return;
    }
    // Real lost terminal event for our job — defensive recovery as today.
    firmware.applyJobDone(...);
    firmware.setFlashError(...);
  }
}
```

Caveat: `data.owner` is the released-lock's owner, which the server already sends (per `jobLock.ts`'s `setState({ locked, owner, since })` shape). Verify this is accurate before relying on it.

## Why this matters even if rare

Three reasons to fix even if the post-`4b0e081` window is small:

1. **Defensive recovery from genuinely lost terminal events.** If a true `flashJobDone` is lost on the WS (network blip, server crash mid-emit), the defensive `applyJobDone` is the only thing that gets the UI out of the `phase='flashing'` deadlock. Making it jobId-aware preserves this safety net while eliminating false positives.
2. **WS reconnect storms.** On WebSocket reconnect, the server sends a fresh `lockStateChanged` snapshot. If the prior connection had been mid-flash and the snapshot says `locked:false` (because the server's state actually changed), the recovery fires correctly. If the snapshot says `locked:true`, no recovery. The jobId-aware path makes both cases right.
3. **Multi-operator scenarios (future).** Today the system assumes one operator per server; if that ever changes, the recovery path needs jobId-awareness anyway.

## First investigative steps

1. **Trigger the cross-attempt scenario post-`4b0e081`** — force a begin_timeout or similar fast failure, retry within 1-2 s, observe whether the banner appears.
2. **If banner still appears:** trace the WS event ordering via the diagnostic from this stub. Identify whether the recovery path is the culprit.
3. **If banner doesn't appear:** close this stub. The async-start refactor closed the window.

## Relevant code locations

- `astros_vue/src/composables/useWebsocket.ts:257-294` — `handleLockStateChanged` including the recovery path
- `astros_vue/src/stores/firmware.ts:480-540` — `applyJobDone` (called by the recovery path)
- `astros_vue/src/stores/firmware.ts:103-130` — `pendingOwnFlashStart`, `ownJobId`, `isOwnJob` definitions
- `astros_vue/src/stores/jobLock.ts` — `setState({ locked, owner, since })` — confirm `owner` is populated on release events

## Acceptance criteria for the eventual fix (if needed)

- Operator-initiated retry after a failed attempt does NOT show the lock-conflict banner during the operator's own in-flight attempt 2.
- A genuinely lost terminal event still triggers the defensive recovery (lock release for OUR job).
- A stale lock-release event for a previous job's lock is silently ignored with an `info`-level log.

## Out of scope (for this stub)

- Implementing any fix without first verifying the race still fires post-`4b0e081`.
- The `pendingOwnFlashStart` flag itself — leave it in place as belt-and-suspenders for the remaining 1-10 s sync-setup window.
