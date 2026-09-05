# AstrOs Server — Plan

Workflow rules: `CLAUDE.md` (Workflow section). Rationale and templates: `.docs/agentic-workflow.md`.

## Status

Active:  none — T-002 in review (PR #122 into develop); T-001 (POLL_NAK) in review on PR #121 from its own branch
Now:     PR #122 open (5 commits, pre-push review addressed) — awaiting review/merge (PLAN.md Backlog will conflict with PR #121's; both append to the same region)
Next:    merge PR #121 and PR #122; bench-verify T-002 (QA cases 1–2, 5) and T-001's DOWN latency post-merge; then promote the next Backlog item (candidates: the sum-based Run gate on FAILED and the dead upload catch — both gate a hardware action)
Blocked: none (the firmware-side OTA master-flash fix shipped in AstrOs.ESP rel_1.2 — stack overflow fixed in its PR #47)
Last:    2026-09-05 — T-002 implemented and reviewed (see Log)

## Standalone tasks

- [x] T-002 — Fix ScriptTestModal setup crash and stale-status Run enable (`.docs/tasks/completed/T-002-script-test-modal-fix.md`, branch `feature/T-002-script-test-modal-fix`; bench sign-off pending post-merge)

## Backlog (unscheduled candidates)

From the 2026-08-06 bench log review (`.tmp/astros.2026-08-06.1.log` analysis):

- POLL_NAK (and other valid-but-unhandled serial types) fall through `handleMessage` and flood the log as `Invalid message received: {"type":0}` — the offline-padawan signal is being discarded
- `GET /api/settings?key=apikey` returns 500 via Kysely `NoResultError` when the setting was never saved — missing settings should be a handled state
- Dual pino writers (main thread + serial worker both instantiate `logger.ts`) corrupt the shared log file: NUL holes, interleaved records, lost crash reasons; worker exit also logged as a bare number (`api_server.ts:620`)
- `GET /api/firmware/releases` hard-depends on GitHub DNS; consider caching last-known releases for offline bench use
- 16:32 crash-restart loop (5 boots in 7 s) had no logged cause — crash paths only reach stderr/`docker logs`, never the log file

From the T-002 diagnosis (2026-09-04, scripter Test button):

- `AstrosScriptTestModal` completion check is sum-based (`>= SUCCESS * 3`); `TransmissionStatus.FAILED = 3` outranks `SUCCESS = 2`, so a failed upload ack also enables Run
- WS `ScriptStatus.status` carries the API `TransmissionStatus` number but is stored into `DeploymentStatus.value` typed `UploadStatus`; works only because both enums put success at 2, `UploadStatus` has no FAILED member (so `failed = 3` only works through `default:` branches), and `date` is an ISO string on the wire (epoch sentinel on a never-deployed FAILED path) — give the WS payload its own wire type mapped on receipt; interim guard: a wire-numeric test asserting `TransmissionStatus.SUCCESS === UploadStatus.UPLOADED`
- `ScripterView.vue` passes literal strings (`'Saving script...'`, `'Loading...'`, `'Initializing...'`) as the interrupt modal's `message`, which it renders via `$t(message)` — intlify warns on every open; move to `scripter_view.*` keys
- `App.vue` `<Suspense>` logs "slots expect a single root node" on every route load (dynamic component is undefined before the router resolves) — cosmetic
- `AstrosScriptTestModal`: `scriptsStore.uploadScript` never throws (returns `{ success: false }`), so the modal's `catch` is dead and an HTTP failure leaves "Uploading" forever with Run disabled — check `result.success` and drive the FAILED branch
- `astros_vue/eslint.config.ts` globally ignores `**/*.spec.*`, so "lint clean" never covers spec files and the vitest-plugin block in the same config is dead — either lint specs or drop the dead block
- `AstrosScriptTestModal.runClicked` closes the modal regardless of `runScript`'s result — check `result.success` and toast on failure (pairs with T-001's Backlog note that `SCRIPT_RUN` worker envelopes have no `handleSerialWorkerMessage` case, so run ack/nak never reaches clients)
- `handleScriptDeployResponse`: both location lookups `executeTakeFirstOrThrow`, so an ack/timeout for a MAC that is no longer mapped is caught, logged, and sends no WS message (modal stays "Uploading") — emit a best-effort `failed` ScriptResponse; also `getLastScriptUploadedDate` yields 1970-01-01 for a first-ever failed upload (harmless today — `AstrosScriptRow` shows a date only for UPLOADED — but any future reader of `date` on a failed entry sees the epoch)
- Script upload acks carry no run id; a late ack from a cancelled Test run can flip a location early in the next run — needs an upload id threaded through `SCRIPT_UPLOAD` / `ScriptResponse` (protocol-shaped; its own task)
- `DeploymentStatus.date?: Date | undefined` permits two representations (key absent vs explicit undefined); make it `date: Date | undefined`
- Add `DeployableLocation = Exclude<Location, Location.UNKNOWN>` and key `Script.deploymentStatus`, `ScriptStatus.locationId`, `markUploading`, `ScriptsView.locations`, and `AstrosScriptRow.locations` by it (`createNewScript` seeds an UNKNOWN entry today)
- `AstrosScriptTestModal` with zero assigned locations never reaches a terminal state (completion lives only in the watcher and `markUploading([])` is a no-op) — extract `checkComplete()` and call it from `setInitialUploadStatus`, or decide "nothing to upload" in the modal before requesting
- `AstrosScriptTestModal` state model: nine parallel refs kept consistent by three writers — replace with a per-location discriminated union (`unassigned | sending | success | failed`) and derive `canRun`/captions; makes the T-002 invariants impossible to violate and retires the sum-based completion bug and the `Caption` wrapper
- `useWebsocket.handleScriptMessage`'s `scriptId` gate (an ack for another script must not touch the scripter store) has no dispatch test

Open local branches (pre-workflow threads, unmerged into `develop`):

- `debug/serial-rx-frame-diag` — temp serial-RX + deploy-route diagnostics
- `fix/protocol-crc-doc-correction` — protocol doc CRC reference fix
- `feature/ota-phase2-protocol-sync` — frame CRC scope doc clarification
- `ota_testing` — flash-orchestrator windowSize experiment

## Completed projects

- **Remote Control Redesign + Mobile Remote** (2026-05-19 → 2026-06) — all phases shipped (final merges: Phase 2d PR #97, Phase 5 PR #106, Phase 4 mobile view PR #108). Archive: `.docs/completed_plans/2026/08/14/current_project.md`

## Log

- 2026-09-05 T-002 — ScriptTestModal setup crash + stale-status Run gate
  - root cause: the modal's `immediate: true` watcher called `setCaption` before its `const` declaration (TDZ); the throw escaped setup and left AstrosLayout's vnode tree half-mounted, so every later update cascaded into renderer errors. Latent since ddf65eee (2026-02-07); exposed when PR #113 (2026-06-01) keyed `deploymentStatus` by location name and the watcher's early return stopped masking it — last good upload was 2026-05-31
  - fixes: helpers hoisted above the watcher; `scripterStore.markUploading` resets assigned locations to UPLOADING before the upload request (stale entries could complete the run on the first ack); every run starts gated and the watcher tracks only assigned locations (pre-commit review found the immediate watcher flipping the gate refs at setup)
  - 10 component + 6 store tests, all RED-first with recorded mutation checks; new QA plan `.docs/qa/scripter-script-test.md`
  - pre-push review (5 agents; 4 re-run after a rate-limit cutoff): all "push"; Backlog seeded with the adjacent defects (sum-based Run gate on FAILED, WS status enum coincidence, dead upload catch, no run id on acks, zero-assigned non-terminal state, per-location state refactor, `DeployableLocation` alias, spec files excluded from lint, WS scriptId gate untested)
- 2026-08-14 workflow bootstrap
  - adopted the task-file workflow (`.docs/agentic-workflow.md`); `PLAN.md` is now the authoritative status view — agent memory is a cache
  - closed out the Remote Redesign tracker: Phases 4 (PR #108) and 5 (PR #106) had shipped unrecorded; Phase 2d shipped via PR #97
  - seeded Backlog from the 2026-08-06 log analysis
