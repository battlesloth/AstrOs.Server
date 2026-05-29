# Firmware type-design — orphaned follow-ups (stub)

**Origin:** `/pr-review-toolkit:review-pr` run-1 on `feature/firmware-allow-downgrade` flagged 6 Important type-design items. The run-1 synthesis filed 2 dedicated stubs (`20260517-0833-firmware-downgrade-ack-server-enforcement.md` for I5, `20260517-0833-firmware-clear-upload-delete-endpoint.md` for Silent I4) and stated the remaining items "already captured in `20260516-1734-firmware-store-discriminated-unions-followup.md`."

The 2026-05-18 pre-push toolkit re-run caught the partial-fix-sweep miss: the 1734 stub uses its own internal numbering (I9, I10, I15, I21) covering `OwnFlash`, `Upload`, integration tests, and typed Request/Response. **Three Important type-design items have no tracker:**

- **Type I1 — `TransferId` brand** (covers `TransferSpec.transferId` AND the orchestrator's `nextTransferId: number` counter — see below)
- **Type I2 — `ProdTransportConfig` (production windowSize=1 literal type)**
- **Type I6 — Cross-boundary type drift across the three server unions feeding `FLASH_ERROR_REASONS`**

This stub captures them so they don't fall out of memory.

## Type I1 — `TransferId` brand

**Origin:** type-design review run-1 finding I1; extended by run-3 type-design Important #3 to include the orchestrator's `nextTransferId` counter.

**Problem.** `TransferSpec.transferId: string` (`astros_api/src/models/firmware/chunk_streamer.ts:11-18`) discards the uint8 brand at every internal seam. `mintTransferId(n)` runtime-validates `[0..255]` (`chunk_streamer.ts:22-27`), but the field type is bare `string` — a test fixture or alternate producer could construct a `TransferSpec` literal with `'foo'` and bypass the range check.

The orchestrator's own `private nextTransferId: number = 0` counter (`astros_api/src/firmware/flash_orchestrator.ts`, search `nextTransferId`) shares the same uint8 invariant. Range is enforced only at the increment site (`& 0xff` mask) and inside `mintTransferId(n)`. Any brand sweep should also tighten the producer field's type so a future caller couldn't bypass the modulo by assigning `999` directly.

**Proposed approach.** Introduce a nominal brand:

```ts
declare const transferIdBrand: unique symbol;
export type TransferId = string & { readonly [transferIdBrand]: true };

export interface TransferSpec {
  transferId: TransferId;
  source: { path: string; sha256: string; sizeBytes: number };
  targets: string[];
}

export function mintTransferId(n: number): TransferId {
  if (!Number.isInteger(n) || n < 0 || n > 255) {
    throw new RangeError(`transferId out of uint8 range: ${n}`);
  }
  return String(n) as TransferId;
}
```

**Scope.** ~5 producer sites + ~10 consumer test sites. Mint-function call sites already exist; brand makes the bypass a compile error.

## Type I2 — `ProdTransportConfig` literal

**Origin:** type-design review run-1 finding I2.

**Problem.** `TransportConfig.windowSize: number` (`models/firmware/chunk_streamer.ts:113`) is unconstrained. The stop-and-wait production invariant lives in a single constant (`DEFAULT_STREAMER_CONFIG.windowSize: 1` at `flash_orchestrator.ts:456-461`). A future refactor that pulled the streamer config into env vars or settings would silently accept any positive integer and let production flip to sliding-window without a compile-time hint.

**Proposed approach.** Introduce a production-only type that pins `windowSize: 1` at the assignment line, without overconstraining the streamer's general-purpose code:

```ts
type ProdTransportConfig = TransportConfig & { windowSize: 1 };

export const DEFAULT_STREAMER_CONFIG: ProdTransportConfig = {
  windowSize: 1,
  ackTimeoutMs: 5_000,
  maxRetriesPerChunk: 3,
  transferTimeoutMs: 600_000,
};
```

A regression that flipped it to 2 fails at the assignment, not at the bench.

**Scope.** ~3 lines. Streamer tests stay flexible (they pass `windowSize: 16` via overrides).

## Type I6 — Cross-boundary type drift

**Origin:** type-design review run-1 finding I6 + run-2 re-confirmation.

**Problem.** Three independent server unions feed one Vue union:

- `FlashOrchestratorErrorReason` (server, 14 members) at `astros_api/src/firmware/flash_orchestrator.ts:388`
- `TransferErrorCode` (server, 12 members) at `astros_api/src/models/firmware/chunk_streamer.ts:84`
- `FirmwareUploadErrorCode` (server, 5 members) at `astros_api/src/models/firmware/upload.ts:69` (derived from the const tuple `FIRMWARE_UPLOAD_ERROR_CODES` at line 63)
- `FLASH_ERROR_REASONS` (Vue, 33 members + locale keys) at `astros_vue/src/types/firmware.ts:154-196`

The Vue union must contain every server-emitted reason or `mapHttpErrorToFlashEnvelope` falls through to `internal_server_error` and the operator sees the catch-all banner. Today there is **no compile-time tether** — a new `TransferErrorCode` member on the server passes `tsc` server-side, fails silently client-side.

The C3 fix demonstrated the cost: `payload_too_large` had to land in three independent files (server union, Vue mirror union, Vue locale). Test analyzer run-2 also flagged a related gap: the parameterized `it.each` test in `firmware.spec.ts` enumerates streamer reasons as a hardcoded literal duplicating `TransferErrorCode` — same silent-shrinkage risk if a code is added to the server union without updating the test array.

**Proposed approach (two options).**

1. **Narrow — shared snapshot test.** Add a CI/build-time test that imports both sides (or emits `.d.ts` from both workspaces and diffs) and asserts every server reason has a Vue mirror entry + a locale key. Low cost; closes the drift-detection gap without restructuring.

2. **Broader — shared `astros_shared` package.** Move the wire-shape types (`FlashOrchestratorErrorReason`, `TransferErrorCode`, `FirmwareUploadErrorCode`, `FlashJobState`, `FlashJobFailedData`, `FwStage`, etc.) into a new package. Both workspaces import from it via path aliases. Eliminates the entire drift class for these and any future wire-shape types. Higher cost (tsconfig paths, Vite alias, package boundaries).

Recommend option 1 first to close the immediate hazard; revisit option 2 when a third concrete drift bug lands.

**Related test-side finding (test-analyzer run-2 I2):** the `it.each` over 11 streamer reasons in `firmware.spec.ts:1498-1520` should be derived from the same shared list so a regression that adds a server code without test coverage fails the parameterized test, not just silently shrinks the iteration. Either approach above closes this.

## Tasks (not yet broken into a plan)

When this work starts: probably a light plan (3-5 tasks). Type I1 and Type I2 are simple branded-type / literal-type adds. Type I6 needs a brainstorm on option 1 vs option 2.

## References

- Toolkit run-1 synthesis (2026-05-17).
- Toolkit run-2 type-design Important finding (2026-05-18) — plan-trail integrity drift.
- `.docs/plans/20260517-0817-firmware-pr-review-important-sweep.md` — the plan that incorrectly claimed these were captured in the 1734 stub. Now corrected.
