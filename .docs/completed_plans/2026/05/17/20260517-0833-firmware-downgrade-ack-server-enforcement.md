# Firmware downgrade-ack — server-side enforcement (stub)

**Origin:** `/pr-review-toolkit:review-pr` Type I5 finding on `feature/firmware-allow-downgrade`. The biggest **uncaptured-by-any-existing-plan** hazard from the toolkit run.

## Problem

Today the "operator has acknowledged this is a downgrade" invariant is enforced entirely client-side, by two independent booleans the caller must coordinate:

- `allowDowngrade` (Pinia store ref, `astros_vue/src/stores/firmware.ts:177`) — the panel toggle's persisted state.
- `downgradeAck` (local ref in `AstrosFirmwareConfirmModal.vue:59`) — the modal's per-flash acknowledgement checkbox.

The flash POST does NOT carry either signal. The server's `FlashRequest` (`astros_api/src/models/firmware/flash_orchestrator.ts:24`) is shaped as `{ source, controllers }` — no `downgrade` field. The flash controller's `validateFlashRequest` (`astros_api/src/controllers/firmware_flash_controller.ts:167`) has nothing to cross-check.

Consequences:

- A future CLI / alternate-UI / scripted caller can push a downgrade without the operator-acknowledgement gate. Today only `AstrosFirmwareConfirmModal` enforces the gate; if any other entry point ever opens a flash POST, downgrades bypass the ack.
- The store's `anyDowngradeBlocked` check in `canFlash` (`stores/firmware.ts:?`) is best-effort UX — a determined caller can flip `allowDowngrade.value = true` in the console and bypass the modal entirely.

## Proposed approach

Encode the operator's intent in the request shape as a typed `DowngradePolicy` discriminated union that the server cross-checks against the resolved-version-vs-current-version comparison:

```ts
// Wire shape — shared between server FlashRequest and Vue FlashRequestBody
type DowngradePolicy =
  | { allow: false }
  | { allow: true; acknowledgedAt: string };  // ISO timestamp from modal confirm

type FlashRequestBody = {
  source: { kind: 'github'; version: string } | { kind: 'upload' };
  controllers: string[];
  downgrade: DowngradePolicy;
};
```

Server-side:

1. `validateFlashRequest` accepts the new field (back-compat: missing `downgrade` defaults to `{ allow: false }` so existing callers don't break, behind a config flag if needed).
2. After source resolution + variant lookup, compare each controller's current version vs. the resolved target.
3. If ANY controller would be downgraded AND `downgrade.allow !== true`, reject with HTTP 400 `error: 'downgrade_unacknowledged'`.
4. New `FlashOrchestratorErrorReason`: `'downgrade_unacknowledged'`. Add to Vue `FLASH_ERROR_REASONS` + locale.

Client-side:

1. `AstrosFirmwareConfirmModal` populates `downgrade.acknowledgedAt` from the confirm-click timestamp when the toggle is on.
2. Non-downgrade flashes send `downgrade: { allow: false }`.
3. `mapHttpErrorToFlashEnvelope` already handles the new reason via `KNOWN_FLASH_ERROR_REASONS` — no mapper changes.

## Out of scope

- Recording the ack in a server-side audit log (separate observability concern).
- Operator-identity binding (the ack is anonymous; not a sign-off contract).
- Multi-step approval flow (this is a single-operator ack, not a manager-approval workflow).

## Tasks (not yet broken into a plan)

When this work starts: brainstorm with `superpowers:brainstorming`, then write a full plan with `superpowers:writing-plans` because it crosses the wire (server + client + tests + locale + back-compat) and will likely exceed 5 tasks.

## References

- Toolkit run synthesis: `2026-05-17` session.
- Related already-deferred work: `.docs/plans/20260516-1734-firmware-store-discriminated-unions-followup.md` (covers client-side `Upload` / `OwnFlash` unions; does not cover the wire shape).
