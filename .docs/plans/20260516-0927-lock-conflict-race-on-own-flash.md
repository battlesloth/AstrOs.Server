# Lock-conflict race window on the operator's own flash

## Problem

When the operator starts a flash, the page hides the topology + controllers panel and shows the "Firmware update in progress" lock-conflict banner — incorrectly framing their OWN flash as a foreign operator's lockout. The condition persists for the duration of the server's source-resolution window (1-10 s, longer for upload mode where `FirmwareUploadStore.store()` validates + hashes).

## Root cause

`lockConflict = lockLocked && !isOwnJob`. `isOwnJob = currentJob !== null && currentJob.jobId === ownJobId.value`. The server's `orchestrator.start()` emits `lockStateChanged{locked:true}` immediately on lock acquisition (line 561 of `flash_orchestrator.ts`), but the matching `flashJobStarted` broadcast happens only AFTER source resolution completes (line 617), and the HTTP response that carries `jobId` returns last (line 851). The client's `applyJobStarted` sets `currentJob`; `startFlash` sets `ownJobId` from the HTTP response. Both are populated late.

In the gap between `lockStateChanged` and (whichever of `flashJobStarted` / HTTP response arrives first), the operator's own flash satisfies `lockLocked && !isOwnJob`, triggering the conflict banner.

Pre-existing race; not a regression. Tests masked it via fast mocks; bench testing in upload mode (where validation takes real time) exposes it.

## Approach

Add a `pendingOwnFlashStart: Ref<boolean>` to the firmware store. Set true on `startFlash()` entry (synchronous, before the optimistic `phase='flashing'`). Clear on every terminal transition that leaves the "I started this flash, waiting for confirmation" state:

- Successful POST returns + matching `flashJobStarted` arrives (the equality check then becomes the load-bearing signal, but clearing the flag earlier risks re-opening the window; safest to clear when EITHER `applyJobStarted` matches our `ownJobId` OR the flash terminates).
- POST rejection (409, validation, network) — `startFlash`'s catch block.
- `applyJobDone`, `applyJobFailed`, `cancelFlash`, `resetToSelect`.

Update `isOwnJob`:

```ts
const isOwnJob = computed(
  () =>
    pendingOwnFlashStart.value ||
    (currentJob.value !== null && currentJob.value.jobId === ownJobId.value),
);
```

While `pendingOwnFlashStart` is true, `isOwnJob` is true regardless of whether `currentJob` / `ownJobId` have settled. The flag closes the race window for the operator's OWN flash while leaving the foreign-flash detection path untouched (a foreign flash never sets the flag because the operator never called `startFlash`).

## Tasks

- [x] **Store: add `pendingOwnFlashStart` + update `isOwnJob`.** New ref defaults to `false`. Set true at the top of `startFlash()` (before `phase='flashing'`). Clear in `startFlash`'s catch block. Clear in `applyJobDone`, `applyJobFailed`, `cancelFlash`, `resetToSelect`. Update `isOwnJob` to the disjunction above.

- [x] **Tests pinning the race + the terminal-clear contract.** Three cases in `firmware.spec.ts`:
  1. Mid-startFlash race: simulate a pending POST (never-resolving promise), fire `lockStateChanged{locked:true}` via the existing lock-store fixture, assert `lockConflict === false` (the bug today: true).
  2. Foreign-flash detection still works: `startFlash` never called, `lockLocked=true`, `currentJob` set with a foreign `jobId`, `ownJobId` null → `lockConflict === true`. Pins that the flag doesn't accidentally hide real conflicts.
  3. Terminal clear: after `applyJobDone`, `pendingOwnFlashStart === false`. Mutation-verify: revert the clear in `applyJobDone` and confirm a downstream test (foreign-flash detection after our own job ended) fails.

- [x] **Pipeline + commit.** format + lint + build + vitest. Light plan, no QA-plan update needed — manual verification is the same upload-mode flash that surfaced the bug.

## Files touched

- `astros_vue/src/stores/firmware.ts` — new ref + isOwnJob update + clearing in 5 sites
- `astros_vue/src/stores/__tests__/firmware.spec.ts` — 3 new cases

## Out of scope

- **Changing the server-side broadcast order.** Moving `broadcastLockState()` AFTER `flashJobStarted` would close the race upstream, but it changes the semantics for foreign operators (they'd see the live job before knowing the lock is held). The client-side flag is the minimal, correct fix.
- **Surfacing the in-flight POST state visually** (e.g., a "Starting flash…" overlay before the WS flashJobStarted arrives). Once this fix lands, the existing flashing UI (topology + stages list with no current stage yet) shows immediately; that's the right visual for "we're starting." Adding a separate pre-WS state would be cosmetic noise.
- **Persisting `pendingOwnFlashStart` across page reloads.** Reload wipes it — correct behavior. Mid-flash reload triggers `fetchCurrentJob()` which hydrates `currentJob`; if it's our former job, we use the equality check; if it's a foreign job, the conflict banner fires correctly.
