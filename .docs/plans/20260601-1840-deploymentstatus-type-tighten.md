# Tighten deploymentStatus key type + drop dead locationName

## Why

Follow-up to the script upload-status key fix (pre-push review findings):

1. **Loose key type allowed the original bug.** `Script.deploymentStatus` is
   `Record<string, DeploymentStatus>`, so `deploymentStatus[someUuid]` was
   type-legal — the regression couldn't be caught at compile time. Tightening
   the key to a `LocationName` union (`'body' | 'core' | 'dome'`) turns that
   class of bug into a type error and matches the frontend's already-tight
   `Partial<Record<Location, …>>`.
2. **Dead field.** `DeploymentStatus.locationName` has zero readers anywhere
   (frontend type doesn't even declare it). Now that the map key *is* the name,
   it's a redundant second source of truth.

## Scope (backend only — frontend types unchanged, wire JSON just drops a field nothing read)

- `models/constants.ts`: add `LocationName` (derived from `Constants.*` to avoid
  drift) + `isLocationName(value): value is LocationName` type guard.
- `models/index.ts`: export both.
- `models/scripts/script.ts`: `deploymentStatus: Partial<Record<LocationName, DeploymentStatus>>`.
- `models/scripts/deployment_status.ts`: remove `locationName`.
- `dal/repositories/script_repository.ts`: replace the `!dep.location_name` skip
  with `!isLocationName(dep.location_name)` (narrows string→union, no cast),
  drop `locationName:` from both status objects, refresh comments.
- `script_repository.test.ts`: rewrite keying assertions — `['dome']` is now
  `… | undefined` (optional chaining) and indexing by the UUID won't compile, so
  assert "not keyed by UUID" via `Object.keys(...) === ['dome']` (stronger).

## Tasks

- [x] Add `LocationName` + `isLocationName` to constants.ts; export from index.ts.
- [x] Tighten `Script.deploymentStatus`; remove `DeploymentStatus.locationName`.
- [x] Update repository: guard with `isLocationName`, drop `locationName` writes.
- [x] Update tests (Object.keys assertion); confirm still mutation-sensitive.
      (Verified: reintroducing the UUID key now fails `tsc` with TS7053 — the bug
      is a compile error, not just a test failure.)
- [x] prettier, lint (0 errors), build (tsc clean), full suite green (869).
- [x] Code review; address Critical/Important. (None; 2 cosmetic Minors fixed —
      warn wording for unknown-name case + dropped unused `locId` return.)
