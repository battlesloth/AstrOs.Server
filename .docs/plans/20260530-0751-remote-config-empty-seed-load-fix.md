# Fix: Remote Control config editor fails to load on the `'{}'` seed

**Branch:** `fix/remote-config-empty-seed-load` (off `develop`)
**Tier:** Light plan (self-contained backend bug fix)
**Date:** 2026-05-30

## Symptom

The live `/remote` editor (Phase 2d `RemoteControlConfigView`) renders only the
load-error banner. Console:

```
Failed to load remote control configuration: Error: No remote control configuration found
    at Proxy.loadRemoteControl (remoteControl.ts:96:15)
    at async Promise.all (index 2)
```

## Root cause (confirmed by full data-flow trace)

`migration_0` seeds the `remote_config` row with `value: '{}'` — an empty
**object**, not an array. The editor's `getRemoteConfig` controller forwards
that raw string unmodified. The frontend store `loadRemoteControl` requires a
JSON **array** (`Array.isArray` guard at `remoteControl.ts:94-96`) and throws on
anything else, which trips the view's three-load OR-gate → whole editor replaced
by the error banner.

The sibling firmware endpoint `syncRemoteConfig` already defends against this
exact `'{}'` seed (controller:37-46, with a comment naming it); `getRemoteConfig`
was never given the same guard and has **zero test coverage** — the existing
`remote_config_controller.test.ts` only exercises `syncRemoteConfig`. That gap is
why this shipped green.

Reproduces on any install where the remote config has never been saved through
the editor (every *saved* config is `JSON.stringify(array)`, so `'{}'` can only
be the untouched seed).

## Fix (scope: normalization + seed, no data migration — chosen by owner)

1. **`getRemoteConfig`** normalizes to a guaranteed JSON-array **string**, mirroring
   `syncRemoteConfig`'s defense: return the stored value only if it parses to an
   array, else `'[]'`. Also removes the latent `|| {value:'[]'}` object-fallback
   (which sends an *object* on the empty-row path → would break `JSON.parse`).
   This fixes existing installs with **no DB migration**.
2. **`migration_0`** seed `value: '{}'` → `'[]'` so fresh DBs are contract-correct
   at the source. (Only affects DBs created after the change; existing installs
   are covered by #1.)

Once the backend sends `'[]'`, the store's existing fresh-seed path seeds one
`createDefaultPage(0)` with `isDirty=true` — the intended fresh-install UX.

## Tasks

- [x] Write failing `getRemoteConfig` tests in `remote_config_controller.test.ts`:
      `'{}'` seed → `'[]'`; saved array string → passthrough unchanged; no row →
      `'[]'`; corrupt non-JSON value → `'[]'`; non-array object → `'[]'`; fresh
      `'[]'` seed passthrough. Watched 4 fail (RED). Plus a repo test pinning the
      new seed value (RED: `'{}'` → expected `'[]'`).
- [x] Normalize `getRemoteConfig` in `remote_config_controller.ts`. All green.
- [x] Change `migration_0` seed `value: '{}'` → `'[]'`. Decoupled the two
      seed-dependent controller tests via explicit `saveConfig('{}')` so the
      `'{}'` defense stays covered after the flip.
- [x] Pre-commit: `prettier:write`, `lint:fix` (0 errors), `build` (clean), full
      `vitest run` (67 files / 856 tests pass), then `requesting-code-review` on
      the diff (no Critical/Important; 2 Minor deferred — `migration_7` comment
      nuance, optional `logger.warn`).
- [x] Commit (`eba28cd`). Push via VS Code after pre-push review.

## Out of scope / notes

- No `migration_8` to rewrite existing `'{}'` rows — the read-time normalization
  makes them load, and the first save overwrites the seed with a real array.
- Frontend store's hard-fail on non-array is left as-is by design (Phase 2d
  deliberately blocks editing on a failed load); the contract is enforced
  server-side where the other consumer (`syncRemoteConfig`) already enforces it.
