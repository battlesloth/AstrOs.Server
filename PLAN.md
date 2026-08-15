# AstrOs Server — Plan

Workflow rules: `CLAUDE.md` (Workflow section). Rationale and templates: `.docs/agentic-workflow.md`.

## Status

Active:  none — between projects
Now:     —
Next:    promote a Backlog item to T-001, or start the next project with a seam-discovery session
Blocked: none known (firmware-side OTA master-flash fix lives in AstrOs.ESP; status last confirmed 2026-05-29)
Last:    2026-08-14 — agentic workflow bootstrap; Remote Redesign tracker closed out

## Standalone tasks

(none open)

## Backlog (unscheduled candidates)

From the 2026-08-06 bench log review (`.tmp/astros.2026-08-06.1.log` analysis):

- POLL_NAK (and other valid-but-unhandled serial types) fall through `handleMessage` and flood the log as `Invalid message received: {"type":0}` — the offline-padawan signal is being discarded
- `GET /api/settings?key=apikey` returns 500 via Kysely `NoResultError` when the setting was never saved — missing settings should be a handled state
- Dual pino writers (main thread + serial worker both instantiate `logger.ts`) corrupt the shared log file: NUL holes, interleaved records, lost crash reasons; worker exit also logged as a bare number (`api_server.ts:620`)
- `GET /api/firmware/releases` hard-depends on GitHub DNS; consider caching last-known releases for offline bench use
- 16:32 crash-restart loop (5 boots in 7 s) had no logged cause — crash paths only reach stderr/`docker logs`, never the log file

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
