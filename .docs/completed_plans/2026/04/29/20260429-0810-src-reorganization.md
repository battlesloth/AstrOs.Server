# src/ reorganization

Light plan for a follow-up refactor PR that organizes `astros_api/src/` into semantic folders. Independent of the firmware-OTA work — just a directory cleanup that's been overdue and was surfaced during c.2 review.

**Trigger:** the user will ping when ready. **Do not start until c.2 has merged to `develop`** — there will already be a c.2 merge commit on develop, and this reorg should branch from it. Starting earlier risks merge conflicts on every file the reorg touches.

**Branch:** `feature/refactor-src-organization` (off `develop`).
**PR target base:** `develop`.

## Context

`astros_api/src/` currently has 20 files at the root, mixing a few categories:

| Category | Files |
|---|---|
| Bootstrap / top-level | `api_server.ts`, `custom.d.ts`, `logger.ts`, `system_status.ts` (+ test) |
| Express middleware / request gates | `api_key_validator.ts`, `write_guard.ts` (+ tests) |
| Lock primitive | `job_lock.ts` (+ test, integration test) |
| WS-side lock helper | `job_lock_middleware.ts` (+ test) — name is now misleading; only contains `rejectIfLocked` |
| Cross-cutting utilities | `semver.ts`, `utility.ts` (+ tests) |
| Domain | `script_converter.ts` (+ test) |

The mix has been fine so far but is starting to obscure intent. The c.2 work introduced a third file in the "request gates" family (`job_lock_middleware.ts`/`rejectIfLocked`), making the top-level too noisy. Folder grouping clarifies what each file is *for*.

## Target structure

```
src/
  api_server.ts                  ← bootstrap, stays at root
  custom.d.ts                    ← TS declarations, stays at root
  logger.ts                      ← used everywhere; folder for one file would over-organize
  system_status.ts (+ test)      ← top-level server state, stays at root

  guard/
    api_key_validator.ts (+ test)
    write_guard.ts (+ test)
    ws_lock_guard.ts (+ test)    ← renamed from job_lock_middleware.ts

  job_lock/
    job_lock.ts (+ test)
    job_lock.integration.test.ts

  utility/
    semver.ts (+ test)
    short_id.ts (+ test)         ← extracted from utility.ts
                                   (only generateShortId — generic, no domain coupling)

  scripting/
    script_converter.ts (+ test)
    script_duration.ts (+ test)  ← extracted from utility.ts
                                   (updateScriptDuration + calculateLengthDS — script-specific)
```

`utility.ts` itself is removed: its two semantic concerns split cleanly. `generateShortId` is a generic utility (stays in `utility/` under a clear name); `updateScriptDuration` + `calculateLengthDS` operate on `Script` and belong with the other script logic.

## Tasks

- [ ] **Branch off the post-c.2 develop.** Confirm `git log --oneline develop` shows the c.2 merge commit before starting. Branch off that.
- [ ] **Create folders.** `mkdir -p src/{guard,job_lock,utility,scripting}`.
- [ ] **Move + rename in `src/guard/`.** `git mv src/api_key_validator.ts src/api_key_validator.test.ts src/write_guard.ts src/write_guard.test.ts src/guard/`. `git mv src/job_lock_middleware.ts src/guard/ws_lock_guard.ts` and `git mv src/job_lock_middleware.test.ts src/guard/ws_lock_guard.test.ts`.
- [ ] **Move into `src/job_lock/`.** `git mv src/job_lock.ts src/job_lock.test.ts src/job_lock.integration.test.ts src/job_lock/`.
- [ ] **Split + move utility.** Create `src/utility/short_id.ts` containing only `generateShortId` (with its imports from `models/`). Create `src/scripting/script_duration.ts` containing `updateScriptDuration` and `calculateLengthDS`. Move `src/semver.ts` and `src/semver.test.ts` to `src/utility/`. Update `src/utility.test.ts` to point at the new homes (`short_id.test.ts` for the ID generator; `script_duration.test.ts` for the script helpers in `src/scripting/`). Delete the now-empty `src/utility.ts` and the original `src/utility.test.ts`.
- [ ] **Move script_converter.** `git mv src/script_converter.ts src/script_converter.test.ts src/scripting/`.
- [ ] **Update imports across consumers.** Every `from './job_lock_middleware.js'` → `from './guard/ws_lock_guard.js'`. Every `from './job_lock.js'` → `from './job_lock/job_lock.js'`. Every `from './utility.js'` → split into appropriate new home. Every `from './semver.js'` → `from './utility/semver.js'`. Etc. Use `git grep "from './<old-name>"` to enumerate before each batch.
- [ ] **Verify after every batch of moves.** `npm run build` (lint + tsc), `npm run test`, `npm run prettier:write`, `npm run lint:fix`. Catch path mistakes early — stale imports surface as either compile errors or "Cannot find module" runtime errors in tests.
- [ ] **Final commit + PR.** Single conceptual commit ("refactor(src): reorganize into guard/, job_lock/, utility/, scripting/ folders + split utility.ts"). PR description explains the new layout.

## utility.ts split detail

Current `astros_api/src/utility.ts`:

```ts
import { Script } from './models/index.js';

export function generateShortId(prefix: string): string { ... }     // generic, no domain coupling
export function updateScriptDuration(script: Script): void { ... }  // script-specific
export function calculateLengthDS(script: Script): number { ... }   // script-specific (called by updateScriptDuration)
```

Split:

- **`src/utility/short_id.ts`** — `generateShortId` only. No `models/` import.
- **`src/scripting/script_duration.ts`** — `updateScriptDuration` + `calculateLengthDS`. Keeps the `Script` import (now `from '../models/index.js'` since we're one level deeper).

`utility.test.ts` likewise splits along the same lines (`short_id.test.ts` + `script_duration.test.ts`).

## Verification

- [ ] `npm run build` clean (lint + tsc).
- [ ] `npm run test` green (no regressions; same total test count, just relocated).
- [ ] `npm run prettier:write` and `npm run lint:fix` clean.
- [ ] `git grep "from './job_lock_middleware\|from './job_lock'\|from './utility'\|from './semver'\|from './write_guard'\|from './api_key_validator'\|from './script_converter'"` returns nothing — every old-path import has been updated to a new folder path.
- [ ] Spot-check that the new file naming is consistent (no `utility/utility.ts`-style awkwardness; this plan deliberately splits `utility.ts` to avoid it).

## Out of scope

- Reorganizing inside the existing folders (`controllers/`, `dal/`, `models/`, `serial/`). They're already grouped by feature; no changes needed.
- Renaming `job_lock_middleware.test.ts` → `ws_lock_guard.test.ts` is part of this plan, but the test contents themselves don't change (still tests `rejectIfLocked`).
- Any code logic changes — pure mechanical move + import-path rewrites + a clean split of `utility.ts`.

## Notes for whoever picks this up

- The c.2 PR moves `requireUnlocked` out of `job_lock_middleware.ts` and replaces it with `rejectIfLocked` (HTTP gating moved to `writeGuard`). This reorg renames the file to match: `ws_lock_guard.ts`. If you're reading this before c.2 merges, the rename only makes sense after that PR lands.
- `system_status.ts` deliberately stays at `src/` root rather than going into `guard/` — it's a stateful service consumed by the gate rather than a gate itself. Same reasoning for `job_lock.ts` going into its own `job_lock/` folder rather than `guard/`.
- `logger.ts` deliberately stays at `src/` root — it's used by literally everything; a folder for one file is over-organization.
