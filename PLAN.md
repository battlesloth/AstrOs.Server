# AstrOs Server — Plan

Workflow rules: `CLAUDE.md` (Workflow section). Rationale and templates: `.docs/agentic-workflow.md`.

## Status

Active:  T-002 — Fix ScriptTestModal setup crash and stale-status Run enable (branch `feature/T-002-script-test-modal-fix`, off develop). T-001 (POLL_NAK) is in review on PR #121 from its own branch.
Now:     T-002 task file committed; implementing TDD (component spec + store spec first)
Next:    T-002 pre-push review → Jeff pushes → PR into develop; then merge PR #121 and bench-verify its DOWN latency
Blocked: none (the firmware-side OTA master-flash fix shipped in AstrOs.ESP rel_1.2 — stack overflow fixed in its PR #47)
Last:    2026-09-04 — T-002 opened from the scripter Test-button bench failure (diagnosis in the task file)

## Standalone tasks

- [ ] T-002 — Fix ScriptTestModal setup crash and stale-status Run enable (`.docs/tasks/T-002-script-test-modal-fix.md`, branch `feature/T-002-script-test-modal-fix`)

## Backlog (unscheduled candidates)

From the 2026-08-06 bench log review (`.tmp/astros.2026-08-06.1.log` analysis):

- POLL_NAK (and other valid-but-unhandled serial types) fall through `handleMessage` and flood the log as `Invalid message received: {"type":0}` — the offline-padawan signal is being discarded
- `GET /api/settings?key=apikey` returns 500 via Kysely `NoResultError` when the setting was never saved — missing settings should be a handled state
- Dual pino writers (main thread + serial worker both instantiate `logger.ts`) corrupt the shared log file: NUL holes, interleaved records, lost crash reasons; worker exit also logged as a bare number (`api_server.ts:620`)
- `GET /api/firmware/releases` hard-depends on GitHub DNS; consider caching last-known releases for offline bench use
- 16:32 crash-restart loop (5 boots in 7 s) had no logged cause — crash paths only reach stderr/`docker logs`, never the log file

From the T-002 diagnosis (2026-09-04, scripter Test button):

- `AstrosScriptTestModal` completion check is sum-based (`>= SUCCESS * 3`); `TransmissionStatus.FAILED = 3` outranks `SUCCESS = 2`, so a failed upload ack also enables Run
- WS `ScriptStatus.status` carries the API `TransmissionStatus` number but is stored into `DeploymentStatus.value` typed `UploadStatus`; works only because both enums put success at 2 — give the WS payload its own type or map it on receipt
- `ScripterView.vue` passes literal strings to `$t()` (`'Saving script...'`, `'Loading...'`, `'Initializing...'`) — intlify warns on every open; move to `scripter_view.*` keys
- `App.vue` `<Suspense>` logs "slots expect a single root node" on every route load (dynamic component is undefined before the router resolves) — cosmetic

Open local branches (pre-workflow threads, unmerged into `develop`):

- `debug/serial-rx-frame-diag` — temp serial-RX + deploy-route diagnostics
- `fix/protocol-crc-doc-correction` — protocol doc CRC reference fix
- `feature/ota-phase2-protocol-sync` — frame CRC scope doc clarification
- `ota_testing` — flash-orchestrator windowSize experiment

## Completed projects

- **Remote Control Redesign + Mobile Remote** (2026-05-19 → 2026-06) — all phases shipped (final merges: Phase 2d PR #97, Phase 5 PR #106, Phase 4 mobile view PR #108). Archive: `.docs/completed_plans/2026/08/14/current_project.md`

## Log

- 2026-08-14 workflow bootstrap
  - adopted the task-file workflow (`.docs/agentic-workflow.md`); `PLAN.md` is now the authoritative status view — agent memory is a cache
  - closed out the Remote Redesign tracker: Phases 4 (PR #108) and 5 (PR #106) had shipped unrecorded; Phase 2d shipped via PR #97
  - seeded Backlog from the 2026-08-06 log analysis
