# Firmware store discriminated unions + upload-endpoint integration + controllers-dir typed-Request — follow-up stub

**Status: stub — deferred from the `feature/firmware-allow-downgrade` pre-push review (2026-05-16). All items Important, not Critical.**

## What's deferred

| Item | Origin | Scope hint |
|---|---|---|
| I9 — `OwnFlash` discriminated union | type-design review | Vue store + 1 story + 1 spec |
| I10 — `Upload` state discriminated union | type-design review | Vue store + 1 story + source-strip template |
| I15 — POST /api/firmware/upload integration test | test-coverage review | Real multipart upload via FormData → fetch; needs a server-side esp_app_desc-valid binary fixture exposed to the integration harness (the unit-level scaffolding already builds these via `makeFirmwareBytes`, but `populateUpload` bypasses the HTTP layer entirely). End-to-end pin: real-POST → orchestrator's `upload.latest()` consumer → kind:'upload' flash. |
| I21 — Typed `Request` / `Response` in upload controller | type-design review | `req: any, res: any` is the convention across the entire `astros_api/src/controllers/` directory (8 controllers). Either type just the upload controller (inconsistent) or refactor the directory (broader scope). Defer until the convention itself is revisited. |

## Background

The pre-push type-design review flagged two flag-soup states in `astros_vue/src/stores/firmware.ts` that could be replaced with discriminated unions to make invalid combinations unrepresentable. The runtime behavior is correct today and pinned by mutation-discipline tests in `firmware.spec.ts`; these are forward-looking encapsulation improvements, not bug fixes.

### I9 — `OwnFlash` (ownership of the active flash)

Three independent fields encode "is the active flash ours":

```ts
const ownJobId = ref<string | null>(null);
const pendingOwnFlashStart = ref(false);
const isOwnJob = computed(
  () =>
    pendingOwnFlashStart.value ||
    (currentJob.value !== null && currentJob.value.jobId === ownJobId.value),
);
```

Mutation sites: `startFlash` entry + POST `.then` (lines ~712, 720), `applyJobDone`/`applyJobFailed`/`resetToSelect` (4 clear sites). `pendingOwnFlashStart` doesn't clear on `startFlash`'s own success path — only on terminal events — so a future regression that made `applyJobDone` conditionally not fire would leave the flag stuck.

Proposed shape:

```ts
type OwnFlash =
  | { kind: 'none' }
  | { kind: 'pending' }
  | { kind: 'owned'; jobId: string };
```

### I10 — `Upload` (operator-supplied filename + server-acked metadata + transition)

Three independent refs encode one state machine:

```ts
const uploadedFilename = ref<string | null>(null);
const uploadState = ref<UploadState>('idle');
const uploadedFile = ref<UploadedFirmware | null>(null);
```

The source-strip template (`AstrosFirmwareSourceStrip.vue:176`) defensively re-checks `uploadState === 'uploaded' && uploadedFile` because the type doesn't promise the second when the first holds.

Proposed shape:

```ts
type Upload =
  | { kind: 'idle' }
  | { kind: 'uploading'; filename: string }
  | { kind: 'uploaded'; filename: string; file: UploadedFirmware }
  | { kind: 'error'; filename: string };
```

## Why deferred from the source branch

- The runtime behavior is correct; no current bug.
- Existing tests in `firmware.spec.ts` (locate by symbol — the relevant `pendingOwnFlashStart` mutation-discipline `it(...)` blocks start at line ~1808 as of this writing) pin the user-visible behavior. The source strip itself has no dedicated spec file today (only `.vue` + `.stories.ts` under `firmwareSourceStrip/`); any state-machine refactor that breaks the template's defensive `uploadState === 'uploaded' && uploadedFile` check would have to be caught via the parent `FirmwareView.spec.ts` integration tests or via newly-added source-strip specs.
- The refactor crosses three layers (store + templates + stories + specs) — two story files (`AstrosFirmwareSourceStrip.stories.ts`, `AstrosLockStateBanner.stories.ts`) currently write to the refs directly and would need to call new mutators instead.
- Scope per CLAUDE.md's "scope guard" — `feature/firmware-allow-downgrade` is already at 25+ commits across the OTA stack; adding a Vue-store-internal refactor here would push it into "should have been phased" territory.

## Suspected fix shape (sketched, not final)

For each state:

1. Add the discriminated-union ref as the source of truth (`upload`, `ownFlash`).
2. Convert the existing exports to `computed()` derivations for backward compat with components and tests that read them.
3. Add typed mutators (`setUpload(...)`, `setOwnFlash(...)`).
4. Update the 2 story files to call the mutators instead of assigning to refs.
5. Update specs to exercise the new mutators where they currently assign to refs.

## Open questions

- Is full external-API breakage acceptable, or do we keep the existing names as derived `computed` for one release as a deprecation path?
- Are there any non-test/non-story consumers writing to these refs? (Grep at follow-up time — the answer was "no production sites" as of 2026-05-16.)

## Related

- Type-design review findings I9 + I10 in the `feature/firmware-allow-downgrade` pre-push run.
- Companion stubs from the same arc: `20260516-1705-ota-host-side-speed-investigation.md`,
  `20260516-1706-firmware-ui-transfer-step-falsely-green.md`,
  `20260516-1707-lock-conflict-race-hardening-followup.md`.
