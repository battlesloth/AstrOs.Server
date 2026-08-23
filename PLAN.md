# AstrOs Server — Plan

Workflow rules: `CLAUDE.md` (Workflow section). Rationale and templates: `.docs/agentic-workflow.md`.

## Status

Active:  none — T-001 in review (PR #121 into develop)
Now:     PR #121 review findings addressed (CI lint fix; Copilot: bounded NAK dedup set, doc sync) — awaiting push (Jeff pushes via VS Code)
Next:    merge PR #121; bench-verify the ~2–6s DOWN latency post-merge; then promote the next Backlog item
Blocked: none (the firmware-side OTA master-flash fix shipped in AstrOs.ESP rel_1.2 — stack overflow fixed in its PR #47)
Last:    2026-08-23 — PR #121 review round addressed (see Log)

## Standalone tasks

- [x] T-001 — Handle POLL_NAK as the offline-padawan signal (`.docs/tasks/completed/T-001-poll-nak-handling.md`, branch `feature/T-001-poll-nak-handling`; bench sign-off pending post-merge)

## Backlog (unscheduled candidates)

From the 2026-08-06 bench log review (`.tmp/astros.2026-08-06.1.log` analysis):

- ~~POLL_NAK fall-through~~ → promoted to T-001 (2026-08-16)
- `GET /api/settings?key=apikey` returns 500 via Kysely `NoResultError` when the setting was never saved — missing settings should be a handled state
- Dual pino writers (main thread + serial worker both instantiate `logger.ts`) corrupt the shared log file: NUL holes, interleaved records, lost crash reasons; worker exit also logged as a bare number (`api_server.ts:620`)
- `GET /api/firmware/releases` hard-depends on GitHub DNS; consider caching last-known releases for offline bench use
- AstrOs.ESP: stale comment in `AstrOsSerialMsgHandler.cpp` (~line 187) claims "the server's poll-nak parser is name-only" — T-001 built it MAC-keyed (name is diagnostic only); fix in the firmware repo so nobody drops the MAC from the payload

From the T-001 pre-push review (2026-08-16):

- `SCRIPT_RUN` worker envelopes have no `handleSerialWorkerMessage` case — run-script ack/nak responses are produced and routed by the worker but silently vanish on the main thread; audit whether clients should see them, then consider an error-logging `default:` for that switch (safe only once SCRIPT_RUN has a case)
- `RUN_COMMAND_ACK/NAK` and `DEPLOY_CONFIG_NAK`/`FORMAT_SD_NAK` have no business handling: acks still let the 5s tracker time out (misleading "Timeout for message" error), and `/settings/formatSD` replies success before the controller answers. T-001 raised the NAK default to warn-with-payload; real handling is its own task
- Repo lookup NoResultError sweep: `get*ByAddress`/`get*ByController` repo methods `executeTakeFirstOrThrow`, so the `=== null` guards in `handlePollResponse`/`handleConfigSync` are dead code (misses throw into the catch instead). T-001 added nullable `find*` variants for its own path; sweep the remaining callers (same pattern as the settings-500 item above)
- 16:32 crash-restart loop (5 boots in 7 s) had no logged cause — crash paths only reach stderr/`docker logs`, never the log file

Open local branches (pre-workflow threads, unmerged into `develop`):

- `debug/serial-rx-frame-diag` — temp serial-RX + deploy-route diagnostics
- `fix/protocol-crc-doc-correction` — protocol doc CRC reference fix
- `feature/ota-phase2-protocol-sync` — frame CRC scope doc clarification
- `ota_testing` — flash-orchestrator windowSize experiment

## Completed projects

- **Remote Control Redesign + Mobile Remote** (2026-05-19 → 2026-06) — all phases shipped (final merges: Phase 2d PR #97, Phase 5 PR #106, Phase 4 mobile view PR #108). Archive: `.docs/completed_plans/2026/08/14/current_project.md`

## Log

- 2026-08-23 PR #121 review round (T-001 branch)
  - CI lint fix: `no-empty-function` on the poll_nak test's spy stub (`() => {}` → `() => undefined`); root cause was mechanical checks not re-run after the last review-fix edit
  - Copilot finding: `pollNakNoticed` grew unbounded (parser accepts any opaque address string) — now capped at 256 with FIFO eviction, pinned by a fail-without-fix unit test
  - declined Copilot's parser-level MAC validation: contract is pinned strict-2-field, and parser rejection error-logs per frame (reintroduces the T-001 flood)
  - doc sync: checked off the T-001 close-out item; refreshed the Status block
- 2026-08-16 T-001 — POLL_NAK offline-padawan handling
  - worker now parses POLL_NAK (`mac{US}name`, pinned to ESP `getPollNak`); main thread broadcasts DOWN once per outage via edge-triggered `ControllerWatchdog.recordNak`; UI shows an offline padawan in ~2–6s vs the 10s sweep (which stays as backstop)
  - suppressed while a flash job is current (mirrors the sweep; guard re-checked after async lookups), pinned by a PTY-level flash integration test
  - valid-but-unhandled serial types now return NO_OP instead of round-tripping UNKNOWN; `*_NAK` types warn with payload
  - review fallout: new nullable `findControllerByAddress`/`findLocationByController` (the OrThrow originals error-flooded on unknown-MAC NAKs — caught by new spy-based unit tests); enum values pinned by test; firmware-verified timing corrections (4s poll cycle, master suspends polling during OTA)
  - Backlog seeded: SCRIPT_RUN envelope gap, RUN_COMMAND/FORMAT_SD/DEPLOY_CONFIG NAK handling, repo NoResultError sweep, ESP stale poll-nak comment
- 2026-08-14 workflow bootstrap
  - adopted the task-file workflow (`.docs/agentic-workflow.md`); `PLAN.md` is now the authoritative status view — agent memory is a cache
  - closed out the Remote Redesign tracker: Phases 4 (PR #108) and 5 (PR #106) had shipped unrecorded; Phase 2d shipped via PR #97
  - seeded Backlog from the 2026-08-06 log analysis
