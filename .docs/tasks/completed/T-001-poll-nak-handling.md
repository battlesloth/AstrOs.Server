# T-001: Handle POLL_NAK as the offline-padawan signal

<!-- File: .docs/tasks/T-001-poll-nak-handling.md. Branch: feature/T-001-poll-nak-handling.
     PR title: "T-001: Handle POLL_NAK as the offline-padawan signal". -->

## Context

The 2026-08-06 bench log review (`.tmp/astros.2026-08-06.1.log`, windows extracted in
`.tmp/sync_windows.txt`) found the log flooded with `Invalid message received: {"type":0}`
every ~2–4s. Trace: the serial worker's dispatch (`serial_message_service.ts` `handleMessage`)
has no `POLL_NAK` case and no `default`, so a valid POLL_NAK frame falls through, the
pre-initialized `{type: UNKNOWN}` result round-trips to the main thread, and
`api_server.ts` logs it with the frame content already discarded.

POLL_NAK is the master ESP actively reporting "I polled this padawan and it did not
answer" — the payload names the exact padawan (MAC + name). Today that signal is thrown
away; the UI only learns a padawan is offline passively, via `ControllerWatchdog`'s 10s
POLL_ACK-silence sweep. The firmware side even documents the expectation of a server
parser (`AstrOsSerialMsgHandler.cpp` NAK path comment: "the server's poll-nak parser is
name-only, see message_handler.ts") that was never built.

Same fall-through affects the other valid-but-unhandled types (`DEPLOY_CONFIG_NAK`,
`RUN_COMMAND_ACK/NAK`, `FORMAT_SD_ACK/NAK`); they get a logging default case only —
warn (with payload) for NAK-suffixed types since those are controllers actively
reporting failure, debug for ACKs. (`SERVO_TEST_ACK` is NOT in this set: it has no
`ValidationMap` entry, so such a frame fails validation upstream and never reaches
the dispatch switch — and per `project_servo_test_no_ack` the firmware never sends
it anyway.)

Backlog origin: `PLAN.md` Backlog item 1 (seeded 2026-08-14).

## Contract (pinned — do not change)

- **POLL_NAK wire payload:** `mac{US}name` — exactly 2 unit-separated fields, header
  msgId `"na"` (unsolicited). Source of truth:
  `AstrOs.ESP/lib_native/AstrOsMessaging/src/AstrOsSerialMessageService.cpp::getPollNak`.
  Parser strictness decision (raised in code review): the parser rejects field counts
  other than 2 rather than pre-emptively tolerating growth. This matches the actual
  house convention — `handlePollAck` accepts a *closed* range [3,5] that was widened
  release-by-release as firmware shipped new fields (and explicitly rejects 6) — so
  when the NAK payload grows, the firmware PR widens this range too, same as ACK's
  history. Accepted failure mode of that convention: new-firmware/old-server logs
  `Invalid poll nak` until the server updates.
- **`SerialMessageType` enum values** must continue to match the ESP enums; no
  renumbering, no insertions above the FW block.
- **`StatusResponse` WS shape** is unchanged; the DOWN broadcast reuses
  `buildDownStatus()` exactly as the stale sweep does. `controllerLocation` carries the
  Location enum NAME (`body`/`core`/`dome`), not the UUID.
- **Existing `ControllerWatchdog` semantics** (`recordAck`, `sweep`, `markAllDown`,
  `STATUS_STALE_TIMEOUT_MS = 10_000`) are unchanged; `recordNak` is additive.
- **`handlePollAck` behavior** (payload variants, tracker exemption, debug-log
  exemption) is unchanged.

## Task

1. `ControllerWatchdog.recordNak(id: ControllerIdentity): boolean` — edge-triggered:
   adds to the existing `down` set, returns `true` only on the up→down transition.
   `recordAck` already clears the flag when the padawan returns.
2. `serial_worker_response.ts`: add `POLL_NAK` and `NO_OP` to
   `SerialWorkerResponseType`; add `PollNakResponse` carrying `{ address, name }`.
3. `MessageHandler.handlePollNak(msg)`: parse `mac{US}name`; malformed payload
   (wrong field count / empty MAC) → log error, return UNKNOWN, mirroring
   `handlePollAck`'s error path.
4. `SerialMessageService.handleMessage`: add the `POLL_NAK` case; exempt POLL_NAK from
   the per-message debug log and the tracker update exactly like POLL_ACK; add a
   `default:` case returning `NO_OP` that logs the type name — at warn with payload
   for `*_NAK` types (active failure reports), at debug otherwise.
5. `api_server.ts`: `POLL_NAK` case → new `handlePollNak(msg)`: look up controller +
   location via new nullable repo variants (`findControllerByAddress` /
   `findLocationByController` — the `get*` originals `executeTakeFirstOrThrow` and
   error-log inside the repo on every miss, which would re-create the log flood;
   discovered by the spy-based unit tests), call `recordNak`, broadcast
   `buildDownStatus(identity)` only when newly down. Unknown MAC → debug once per
   address; registered-but-no-location → warn once, re-armed when
   `handlePollResponse` sees the location. Add an explicit no-op `NO_OP` case to
   `handleSerialWorkerMessage`.

## Acceptance criteria

- [x] A POLL_NAK frame no longer produces `Invalid message received`; it routes to
      `handlePollNak` and skips tracker + per-message debug log.
- [x] First NAK for a known, up controller → exactly one DOWN `StatusResponse`
      broadcast; repeated NAKs for the same controller → zero additional broadcasts.
- [x] POLL_ACK after a NAK clears the down flag; a subsequent NAK broadcasts DOWN again.
- [x] NAK for a MAC not in the DB → no broadcast, no error-level log (debug once per
      address). Registered controller without a location → no broadcast, one warn.
- [x] Other valid-but-unhandled types hit the default case (`NO_OP`, main thread
      silent): ACKs (e.g. `FORMAT_SD_ACK`) log the type name at debug; NAKs (e.g.
      `FORMAT_SD_NAK`) warn with the payload — a controller reporting failure must
      stay visible above debug.
- [x] Genuinely invalid frames still return UNKNOWN and still log an error.
- [x] A NAK arriving while a flash job is current produces no DOWN broadcast
      (mirrors the stale-sweep suppression; QA watchdog case 4).
- [x] Watchdog edge-trigger test survives the mutation check: reverting the
      `recordNak` dedup (always returning `true`) makes a test fail.

## Out of scope

- Business handling for `DEPLOY_CONFIG_NAK`, `RUN_COMMAND_ACK/NAK`, `FORMAT_SD_ACK/NAK`
  beyond the logging default (each would be its own task if ever needed — see the
  PLAN.md Backlog notes added at task close).
- The dual-pino log-corruption issue (PLAN.md Backlog item 3).
- Watchdog sweep timing/semantics changes.
- Firmware changes (AstrOs.ESP is untouched).
- Frontend changes (the DOWN status shape already renders).

## Verification

- `cd astros_api && npx vitest run` green (includes new parser, dispatch, and watchdog
  tests).
- `cd astros_api && npm run build` clean.
- Mutation check: temporarily make `recordNak` always return `true` → at least one test
  fails; restore.
- [ ] Bench (human-gated, post-merge): power off one padawan → its location shows DOWN
      within ~2–6s (master polls every 4s, NAK follows 2s after the missed poll; vs
      ~10s sweep today); log shows no `Invalid message received: {"type":0}` spam.

## Failure-mode inventory

Scoped to the new surface (worker↔main envelope, watchdog state, DB lookups). §§ refer
to `.docs/templates/failure-mode-inventory.md`.

**§1 External-call error coverage**

| Call | Error / condition | Response |
|------|-------------------|----------|
| `findControllerByAddress(mac)` | returns null (unknown MAC) | debug once per address, drop NAK — watchdog sweep remains backstop |
| `findControllerByAddress(mac)` | throws (real DB error) | caught by `handlePollNak` try/catch, error log with MAC, no crash |
| `findLocationByController(id)` | returns null (no location link) | warn once per controller (config gap), drop NAK; re-armed on ACK |
| WS broadcast | client gone mid-send | existing `updateClients` path already tolerates closed sockets |

Inventory correction (found by the unit tests): the original rows assumed the
`get*ByAddress`/`get*ByController` repo methods return null on a miss — they
`executeTakeFirstOrThrow` (Kysely `NoResultError`) and error-log inside the repo,
so the planned "debug log, drop" behavior required new nullable `find*` variants.
Same `NoResultError` pattern as PLAN.md Backlog item 2 (settings 500).

**§2 Crash-recovery state matrix** — N/A: no filesystem writes; watchdog state is
in-memory and rebuilt from live POLL traffic after restart.

**§3 Concurrency**

- `down` set / `lastSeen` map: mutated only on the main thread (worker messages and
  sweep interval both dispatch there); no locking needed. NAK-before-first-ACK: the
  controller is not in `lastSeen`; `recordNak` still flags `down` and broadcasts using
  the DB-derived identity — sweep never re-flags (already down), `recordAck` recovers.
- NAK during an active flash: padawans reboot during OTA and the master NAKs
  them. **Corrected during implementation** — the original "accepted, sweep does
  the same" claim was wrong: the stale sweep is *suppressed* while a flash job
  is current (QA controller-status-watchdog case 4), so an unguarded NAK
  broadcast would introduce a new flapping mode. `handlePollNak` now carries the
  same `flashOrchestrator?.getCurrentJob()` guard as the sweep; pinned by the
  NAK-during-flash integration test. After lock release the DOWN re-asserts via
  the first un-suppressed sweep (≤2s) or the next NAK (~4s master poll cycle,
  once its polling resumes post-OTA — the master suspends polling during its
  own flash).
- Envelope ordering: POLL_ACK and POLL_NAK for the same controller can interleave;
  last-writer-wins on the `down` flag is the intended semantic.

**§4 Cross-platform** — N/A: pure in-memory/TS logic, no fs or OS surface.

**§5 Pre-existing on-disk state** — N/A.

**§6 Hostile / malformed input**

- POLL_NAK payload crosses the serial trust boundary: field-count and empty-MAC
  validation before any DB lookup; the MAC is used only as a query parameter (Kysely
  binds it), never for path/SQL interpolation.
- Well-formed payloads that hit a handled state (unknown MAC, missing location) log at
  debug only — no error-level flooding from a repeating NAK. Malformed payloads DO log
  at error (per the acceptance criteria: invalid frames keep the error log); a master
  emitting garbage every poll cycle is a wiring/firmware fault that should be loud.

**§7 Resource lifecycle** — no new resources (no timers, listeners, handles). `down`
set entries are cleared by `recordAck` or discarded with the process.

**§8 Reviewer pre-flight** — run before opening the PR, against the implementation.

## Implementation checklist

- [x] Watchdog `recordNak` tests (TDD) + implementation, incl. mutation check
      (mutation: always-true `recordNak` → 2 tests fail)
- [x] `serial_worker_response.ts`: `POLL_NAK`, `NO_OP`, `PollNakResponse`
      (appended to the enum — in integration runs the main thread executes src/
      while the Worker loads compiled dist/, which can lag if the mtime rebuild
      check is fooled; values pinned by `serial_worker_response.test.ts`)
- [x] `handlePollNak` parser tests (TDD) + implementation in `message_handler.ts`
- [x] Dispatch tests (POLL_NAK routing, tracker/debug exemption, default→NO_OP) +
      implementation in `serial_message_service.ts`
- [x] `api_server.ts`: `handlePollNak` + `NO_OP` case + flash-suppression guard
      (added mid-task after QA case 4 disproved the inventory's "accepted" claim)
- [x] Integration tests: `src/serial/integration/poll_nak_down.integration.test.ts`
      (full PTY→worker→WS path; NAK-during-flash suppression); harness additions:
      `stub.writePollNak`, `harness.databasePath`
- [x] QA plan: `controller-status-watchdog.md` cases 1/1b/4/4b/5 + negative edges
- [x] prettier + lint (both sub-projects), build, full vitest run (909 passed)
- [x] Pre-commit code review (1 Important fixed: flash-guard TOCTOU re-check) and
      pre-push `/pr-review-toolkit:review-pr` (5 agents). Findings addressed: NAK
      types warn in the dispatch default; nullable `find*` repo variants (the unit
      tests exposed that `get*OrThrow` misses threw and error-flooded); spy-based
      cross-platform unit tests for `handlePollNak`; enum value-pin test;
      once-per-condition log dedup; firmware-verified timing corrections (4s poll
      cycle, 2–6s first DOWN, master suspends polling during OTA). Push-back
      recorded in Contract: parser stays strict-2-field per the ACK parser's
      closed-range history. Deferred to Backlog: SCRIPT_RUN envelope gap,
      RUN_COMMAND/FORMAT_SD/DEPLOY_CONFIG business handling, repo NoResultError
      sweep, ESP stale-comment fix.
- [x] Move task file to `.docs/tasks/completed/`, flip `PLAN.md`
- [x] PR #121 Copilot review (2026-08-23): bounded `pollNakNoticed` at 256
      entries with FIFO eviction — the parser treats the address as an opaque
      string, so a noisy peer could mint unlimited novel `addr:` keys.
      Declined the suggested parser-level MAC validation: the parse contract
      is pinned strict-2-field (see push-back above), and parser rejection
      error-logs per frame, which reintroduces the log flood T-001 removes.
