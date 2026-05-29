# c.6c.2 — In-process TypeScript stub master + PTY harness for end-to-end orchestrator testing

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up an in-process TypeScript stub master attached to a PTY pair so integration tests can drive the real `ApiServer` (HTTP, WebSocket, serial worker, `WorkerSerialBus`, `FlashJobOrchestrator`) end-to-end through happy + failure flash paths without real hardware.

**Architecture:** A `socat` subprocess creates a Linux PTY pair. The server side opens one path via the existing `SerialPort` code (real `DelimiterParser`, real `serial_worker.js` thread). The stub master opens the other path via `serialport` and runs in-process — it parses inbound server frames using the real `MessageGenerator` wire format, scripts outbound responses (FW_TRANSFER_BEGIN_ACK, FW_CHUNK_ACK, FW_PROGRESS, FW_DEPLOY_DONE, POLL_ACK heartbeat), and exposes a programmatic API to trigger or skip each response. Tests boot an `ApiServer` with `SERIAL_PORT` set to one PTY path and connect HTTP + WebSocket clients to the running server, exercising the orchestrator through its real surfaces.

**Tech Stack:** vitest (existing), `serialport` v12 (existing), `socat` (system package — already on the dev box), supertest (existing where used in `firmware_flash_controller.test.ts`), `ws` client for WebSocket assertions.

**Branch:** `feature/firmware-ota-c-6c-2-harness` (off `develop`).
**PR target base:** `develop`.
**References:**
- [c.6c.1 spec](../specs/20260503-0910-firmware-ota-c-6c-1-orchestrator-design.md) §"Out of scope" — defines c.6c.2's scope (PTY harness + integration tests).
- [c.6c.1 plan](./20260503-0933-firmware-ota-c-6c-1-orchestrator.md) — orchestrator implementation; this plan layers integration tests over what shipped there.
- [decomposition](./20260427-2202-firmware-ota-decomposition.md) §c (server orchestrator) and §"Test plan" row **c** — "Mock master via node-pty/socat PTY pair running a stub firmware; drive full state machine through happy + each failure mode."

---

## Context

c.6c.1 shipped the `FlashJobOrchestrator` + HTTP/WS surface, fully unit-tested with `FakeSerialBus` and a scripted `streamerFactory`. The unit tests pin orchestrator-internal correctness — JobLock lifecycle, state-machine transitions, failure routing, WS emit semantics. What they don't cover:

- Real `serial_worker.js` Worker thread → `WorkerSerialBus` → orchestrator wiring (the message-passing boundary).
- Real `MessageGenerator` / `MessageHandler` wire framing round-trip (GS / RS / US / `\n` byte handling).
- Real `SerialPort` + `DelimiterParser` line buffering on a serial-shaped channel.
- Real Express + WebSocket server lifecycle during a flash (HTTP triggers → WS broadcasts).
- Real POLL_ACK heartbeat path (master sentinel MAC + version match → `notifyMasterHeartbeat`) closing the lock under the 15-second timer.

The harness exercises all of those by replacing only the lowest layer — the physical serial wire — with a PTY pair. The stub master is a **scriptable test fake**, not a behavior simulator: it implements just enough wire protocol to satisfy the orchestrator's expectations, with hooks for tests to deterministically drive each scenario. Real firmware behavior simulation lives in AstrOs.ESP (per user direction; firmware sim shares parsing code with real firmware).

### Why `socat` for the PTY pair (design choice, open to redirect)

Three options were considered:

| Option | Mechanism | Pros | Cons |
|--------|-----------|------|------|
| **`socat` subprocess** ✅ recommended | Spawn `socat pty,raw,echo=0 pty,raw,echo=0`; stderr emits two `/dev/pts/N` paths | OS-level PTY pair; both ends openable as `SerialPort`; `socat` already installed locally + in apt for CI | External dep (`socat`); Linux/macOS only |
| `node-pty` openpty | npm package; primarily for child-process spawning; no public openpty API across versions | Pure-JS ish | API mismatch; would need contorted `pty.spawn('socat', ...)` plumbing anyway |
| `@serialport/binding-mock` | In-memory virtual serial binding | Pure JS, cross-platform, no subprocess | Bypasses the real PTY layer + DelimiterParser; not what the decomp doc asked for |

**Recommendation:** `socat`. Rationale:
1. The decomp doc says "node-pty/socat PTY pair" with a slash — alternatives, not a hard requirement. `socat` is the simpler half.
2. The existing `astros_smoke_test/` package (different harness, different purpose) already uses `serialport` against real serial paths, so the test pattern is familiar to the codebase.
3. CI add-on cost is `apt-get install socat` (one line in the GitHub Actions workflow when the workflow lands) — already a Linux runner, so cross-platform is a non-issue.
4. `node-pty` adds a heavy native-build npm dep for no benefit over invoking `socat` via `child_process.spawn` directly.

If reviewer prefers `node-pty` or `MockBinding`, we can swap the PTY-pair primitive without touching the stub master or test files (the dependency boundary is the `pty_pair.ts` module).

### CI / platform note

Tests gate on `process.platform !== 'win32'` (Linux / macOS only). Windows CI runners — if any are added later — skip the integration suite. The unit-test suite (which doesn't need PTYs) still runs everywhere.

## Files in scope

### New source files (3 modules + 1 fixture):

| Path | Responsibility |
|------|----------------|
| `astros_api/src/test_harness/pty_pair.ts` | Spawns `socat`, parses stderr for the two `/dev/pts/N` paths, exposes `{ serverPath, masterPath, dispose() }`. Linux/macOS only |
| `astros_api/src/test_harness/stub_master.ts` | In-process scriptable wire-protocol responder. Opens one PTY path via `serialport`, parses inbound frames using `MessageHandler` (or a narrow inline parser), emits scripted outbound frames using `MessageGenerator` (or a narrow inline encoder). Exposes typed control API (`autoAckUpload`, `scriptDeploy`, `injectChunkNak`, `dropAck`, `emitPollAck`, `emitDeployDone`) |
| `astros_api/src/test_harness/integration_harness.ts` | Boots a fresh `ApiServer` on random ports with `SERIAL_PORT` set to the PTY path; exposes typed HTTP client + WS client; cleanup tears down server, sockets, PTY, socat |
| `astros_api/test_fixtures/firmware/tiny.bin` | 4-KB binary test fixture used by upload-source tests (small enough that 4096-byte chunk size yields exactly 1 chunk; ensures the streamer's transfer-end path runs in-bounds) |

### New test files (1 per scenario file, kept narrow):

| Path | Responsibility |
|------|----------------|
| `astros_api/src/firmware/integration/flash_happy_upload.integration.test.ts` | POST /api/firmware/flash with `kind=upload` → full happy round-trip → flashJobDone → heartbeat releases lock |
| `astros_api/src/firmware/integration/flash_happy_github.integration.test.ts` | POST with `kind=github` against an injected GitHub release fixture → cache fetch → full round-trip |
| `astros_api/src/firmware/integration/flash_cancel.integration.test.ts` | DELETE during upload (streamer aborts); DELETE during deploy (controllers fail-cleanup) |
| `astros_api/src/firmware/integration/flash_chunk_nak.integration.test.ts` | Stub master injects FW_CHUNK_NAK → c.6b's Go-Back-N retransmits → completes |
| `astros_api/src/firmware/integration/flash_heartbeat_vs_timer.integration.test.ts` | Heartbeat path (POLL_ACK with version match) releases lock pre-timer; reboot timer fallback (no heartbeat → 15-sec timer fires) |
| `astros_api/src/firmware/integration/flash_concurrent.integration.test.ts` | Second POST returns 409 with `currentJobId` |

### Modified source files:

None to production code. All harness pieces live under `src/test_harness/` and integration tests under `src/firmware/integration/`. The harness is test-only; production paths are unchanged.

### Build / tooling files:

| Path | Change |
|------|--------|
| `astros_api/package.json` | Add `ws` to devDependencies if not already present; add an `integration` test script (e.g., `"test:integration": "vitest run src/firmware/integration"`) so the new suite can be run separately from the existing unit suite. Existing `npm test` continues to run everything |
| `astros_api/vitest.config.ts` (or test-specific config) | Increase `testTimeout` for integration tests (default 5s is too tight for 15-sec reboot timer test) — either via per-test `vi.setConfig` or a separate `vitest.integration.config.ts`. Pick whichever is less invasive |
| `astros_api/.eslintrc` (or equivalent) | If lint complains about the test_harness directory's use of `child_process.spawn` / direct serialport access, add a narrow override |

### Spec / plan / QA docs:

- `.docs/plans/20260503-2106-firmware-ota-c-6c-2-harness.md` (this file)
- `.docs/qa/firmware-ota-flash.md` — extend the existing QA plan with a "Run the integration suite" section (Task 13)

**Total new files:** 3 source modules + 1 binary fixture + 6 test files = ~10 new files. Below c.6c.1's 12-file footprint; consistent with the harness-only scope.

## Scope guard

**13 tasks total.** Per CLAUDE.md's `~8 tasks / ~3 layers` threshold this warrants a phasing question:

- **Single PR (one branch, one PR vs `develop`):** Default. Mirrors c.6b (~10 tasks) and c.6c.1 (~14 tasks across 2 PRs but a single branch's plan). Reviewer load is high; mitigated by making each integration test a separate small task.
- **Two PRs (Phase A: Tasks 1-7 = harness + happy paths; Phase B: Tasks 8-13 = failure modes + QA):** Phase A ships an end-to-end happy-path integration test (proves the harness works). Phase B layers failure-mode tests on top. Each phase is independently shippable + reviewable.

**Recommendation: single PR.** The harness primitives (Tasks 1-3) are useless without at least one integration test exercising them, and splitting "happy paths" from "failure modes" produces a Phase A PR that's mostly harness code with thin test coverage — exactly the "scaffolding-heavy review" pattern c.6c.1 part 1 felt awkward about. A single PR with 13 small commits keeps each one focused.

User to confirm during plan review.

## Failure-mode inventory

This module hits CLAUDE.md FMI triggers: **concurrency** (Worker thread, async serial I/O, Express + WS lifecycle), **cross-process state** (`socat` subprocess), and **resource lifecycle** (PTYs, file descriptors, child processes, ports, server instances). FMI sections §1, §3, §4, §7 inventoried below; §2 (state matrix) is N/A (no orchestrator-internal state — this module composes existing components); §5 (on-disk state) is N/A (test fixtures only); §6 (hostile input) is N/A (test code, no untrusted boundary).

### §1 External-call error coverage

| Call | Error / condition | Response |
|------|-------------------|----------|
| `child_process.spawn('socat', ...)` | binary not found (`ENOENT`) | Throw with a descriptive error pointing to install instructions; integration tests skip via `it.skipIf(!socatAvailable)` |
| `socat` exits before stderr emits PTY paths | parse timeout (5-sec ceiling) | Reject the harness setup promise; test fails with "socat did not emit PTY paths within 5 sec" |
| `socat` exits during a test | child process unexpectedly dies (e.g., killed externally, OOM) | Stub master detects port-close; surfaces as a test-level failure with the exit code and stderr tail |
| `new SerialPort({ path: ptyPath })` on the stub-master end | path not yet ready (race with socat startup) | Retry with 100 ms backoff up to 1 sec; test fails after timeout |
| `ApiServer.bootstrap()` rejects | Port collision, DB init failure, etc. | Surface the underlying error; test fails with full stack |
| WS client connection rejected | server not yet listening | Retry up to 3 sec; test fails with "WS never connected" |
| `httpClient.post('/api/firmware/flash')` | 4xx / 5xx | Test asserts the expected status + payload; failures with body for diagnosis |
| Stub master receives malformed inbound frame | unexpected wire bytes (shouldn't happen — orchestrator emits real frames) | Log + drop; test surfaces via "expected response not received" timeout |
| WS client receives unexpected event order | e.g., `flashJobDone` before `flashControllerResult` | Test asserts the expected event sequence; mismatch fails the test |

**Common gotchas:**
- `socat`'s stderr emits `2026/05/03 21:06:00 socat[12345.140123456789120] N PTY is /dev/pts/3` — the path is at the END of the line. Parse with a regex anchored on `PTY is `, not on column position.
- `socat` may emit stderr lines in either order (PTY 1 vs PTY 2). Match by line index, not by content.
- `serialport` v12 default opens the port asynchronously; tests must `await port.open()` (or wait for `'open'` event) before writing.
- `DelimiterParser({ delimiter: '\n' })` requires `\n` not `\r\n`. Stub master must terminate frames with `\n` only.

### §3 Concurrency

| Shared resource | Touched by | Sync mechanism | Miss-sync consequence |
|-----------------|-----------|----------------|------------------------|
| PTY file descriptors | server-side `SerialPort`, stub master `SerialPort`, `socat` kernel buffer | Single owner per FD | If both ends open + close in parallel during teardown: stale FD usage. Tests sequentialize teardown via the harness `dispose()` |
| `socat` subprocess | spawned per test, killed in `afterEach` | Test-scoped process handle | If `dispose()` skipped (test crash): orphaned `socat` + dangling PTYs. Mitigated by `process.on('exit')` cleanup hook in the harness |
| `ApiServer` instance | spawned per test on random ports | Test-scoped server handle | If `dispose()` skipped: port leak across tests. Random ports + cleanup hook mitigate |
| WS clients | per-test instances | Test-scoped | If not closed: server keeps connection slot open until next test starts a new server. Cleanup in `dispose()` |
| `worker_threads.Worker` (the serial worker) | spawned by `ApiServer.setupSerialPort()` | Implicit; test depends on `ApiServer` killing its worker on close | `ApiServer` doesn't currently expose a clean shutdown path — see Task 4. We add one, or use `worker.terminate()` from the harness |
| Stub master scripted-response queue | test code (queues), serial inbound listener (consumes) | Single-threaded JS event loop | No race; queue is a plain array drained on inbound frames |

**Concurrency-relevant invariants tested:**
- Heartbeat-vs-timer first-fire-wins (Task 11): post-`flashJobDone`, the stub master has a 15-sec window to emit POLL_ACK with version match. The test in one run lets heartbeat fire before timer; in another, doesn't emit heartbeat → asserts timer fallback fires at exactly 15 sec.
- Concurrent flash (Task 12): two HTTP POSTs back-to-back → second returns 409 with `currentJobId`. Tests synchronization of the JobLock under serial-bound async work.

### §4 Cross-platform / cross-environment

- **Linux / macOS only.** Windows lacks `socat` (and PTYs in the POSIX sense). Tests gate on `process.platform === 'win32' ? it.skip : it`.
- **Linux ≥ 4.x kernel.** `pty,raw,echo=0` requires a PTY-supporting kernel; not a real concern for Ubuntu CI runners.
- **Path separators:** N/A (PTY paths are always `/dev/pts/...`).
- **`worker_threads`:** same on all supported platforms.
- **Random-port allocation:** `:0` ephemeral ports; OS-portable.
- **Node ≥ 18.** Existing project requirement; no new dependency.

### §7 Resource lifecycle

| Resource | Created | Cleanup happy path | If cleanup doesn't run |
|----------|---------|--------------------|------------------------|
| `socat` child process | `pty_pair.ts` setup | `child.kill('SIGTERM')` in `dispose()` | Orphan process, two dangling PTYs, file descriptor leak. Mitigation: `process.on('exit')` hook in the harness force-kills any remaining children |
| Server-side `SerialPort` | `ApiServer.setupSerialPort()` (transitively via PTY env override) | `ApiServer.shutdown()` (we add this in Task 4) closes it | FD leak; next test reuses a closed port. Mitigation: harness `dispose()` always tears down the server |
| Stub master `SerialPort` | `stub_master.ts` setup | `dispose()` closes the port | Same as above |
| `serial_worker.js` Worker thread | `ApiServer.setupSerialPort()` spawns it | `ApiServer.shutdown()` calls `worker.terminate()` | Worker leaks across tests; vitest detects via `--reporter=verbose` and warns |
| Express HTTP server | `ApiServer.runWebServices()` calls `app.listen()` | `ApiServer.shutdown()` calls `httpServer.close()` and waits for `'close'` event | Port stays bound; next test on the same port fails to listen. Random ports avoid the symptom but the FD still leaks |
| WebSocket server | `ApiServer.runWebServices()` constructs `new Server({ port })` | `ApiServer.shutdown()` calls `wss.close()` | Same as HTTP server |
| WebSocket clients | per test | per-test `client.close()` | Connection slot remains until server shuts down |
| Test fixtures (tiny.bin, github release fixture) | `test_fixtures/` directory, committed | N/A — read-only static files | N/A |
| Random ephemeral port reservations | OS-managed | OS releases on socket close | If close skipped: brief port reservation until kernel reclaims (~30 sec on Linux) |

**Cleanup ordering rule:** in `dispose()`, tear down in the reverse order of creation: WS clients → HTTP clients → ApiServer → stub master → PTY pair (socat). The PTY pair lives longest because both serial ports must close before socat can reap.

## Tasks

Each task is one logical commit. Per CLAUDE.md, `superpowers:requesting-code-review` runs between tests-passing and `git commit` for every implementation task except the carve-outs (plan-only commits, trivial typos, plan check-offs). Subagent-driven dev expected; controller (parent agent) provides per-task context to fresh implementer subagents.

**TDD note:** per the user's `feedback_tdd_exceptions` memory, serial-adjacent code skips strict pre-test discipline. Tasks 1-3 (harness primitives) implement-first, then sanity-check. Tasks 5-12 (integration tests) ARE the tests; each task writes a test, runs it, and adjusts the harness if needed.

---

### Task 1 — `pty_pair.ts`: socat-backed PTY pair helper

**Files:**
- Create: `astros_api/src/test_harness/pty_pair.ts`
- Create: `astros_api/src/test_harness/pty_pair.test.ts`

- [ ] **Step 1: Write the helper module**

```ts
// astros_api/src/test_harness/pty_pair.ts
import { spawn, ChildProcess } from 'child_process';
import { logger } from '../logger.js';

export interface PtyPair {
  serverPath: string;   // /dev/pts/N — server-side ApiServer opens this
  masterPath: string;   // /dev/pts/M — stub master opens this
  dispose(): Promise<void>;
}

const PTY_LINE_REGEX = /N PTY is (\/dev\/pts\/\d+)/;
const SOCAT_STARTUP_TIMEOUT_MS = 5000;

export async function createPtyPair(): Promise<PtyPair> {
  if (process.platform === 'win32') {
    throw new Error('PtyPair: socat-based PTYs are not supported on Windows');
  }

  const child = spawn('socat', [
    '-d', '-d',
    'pty,raw,echo=0',
    'pty,raw,echo=0',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });

  let serverPath: string | undefined;
  let masterPath: string | undefined;

  const ready = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`socat did not emit PTY paths within ${SOCAT_STARTUP_TIMEOUT_MS}ms`));
    }, SOCAT_STARTUP_TIMEOUT_MS);

    child.stderr!.on('data', (chunk: Buffer) => {
      for (const line of chunk.toString('utf8').split('\n')) {
        const match = line.match(PTY_LINE_REGEX);
        if (!match) continue;
        if (serverPath === undefined) {
          serverPath = match[1];
        } else if (masterPath === undefined) {
          masterPath = match[1];
          clearTimeout(timer);
          resolve();
        }
      }
    });

    child.on('exit', (code, signal) => {
      if (serverPath === undefined || masterPath === undefined) {
        clearTimeout(timer);
        reject(new Error(`socat exited before emitting both PTY paths (code=${code}, signal=${signal})`));
      }
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(new Error(`socat spawn failed: ${err.message}. Is socat installed? Try \`apt-get install socat\` or \`brew install socat\`.`));
    });
  });

  await ready;

  const dispose = async (): Promise<void> => {
    if (child.exitCode !== null) return;
    child.kill('SIGTERM');
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        resolve();
      }, 1000);
      child.on('exit', () => {
        clearTimeout(timer);
        resolve();
      });
    });
  };

  return { serverPath: serverPath!, masterPath: masterPath!, dispose };
}
```

- [ ] **Step 2: Write a sanity-check test (no full TDD per serial-code exception)**

```ts
// astros_api/src/test_harness/pty_pair.test.ts
import { describe, it, expect } from 'vitest';
import { existsSync } from 'fs';
import { createPtyPair } from './pty_pair.js';

const skipIfNotPosix = process.platform === 'win32' ? it.skip : it;

describe('createPtyPair', () => {
  skipIfNotPosix('emits two distinct PTY paths under /dev/pts/', async () => {
    const pty = await createPtyPair();
    try {
      expect(pty.serverPath).toMatch(/^\/dev\/pts\/\d+$/);
      expect(pty.masterPath).toMatch(/^\/dev\/pts\/\d+$/);
      expect(pty.serverPath).not.toBe(pty.masterPath);
      expect(existsSync(pty.serverPath)).toBe(true);
      expect(existsSync(pty.masterPath)).toBe(true);
    } finally {
      await pty.dispose();
    }
  });

  skipIfNotPosix('dispose() releases the socat process and PTY paths', async () => {
    const pty = await createPtyPair();
    const path = pty.serverPath;
    await pty.dispose();
    // After dispose, the PTY device should be gone (kernel reaps when socat exits).
    // Allow brief grace for the kernel close.
    await new Promise((r) => setTimeout(r, 100));
    expect(existsSync(path)).toBe(false);
  });
});
```

- [ ] **Step 3: Run the tests**

Run: `cd astros_api && npx vitest run src/test_harness/pty_pair.test.ts`
Expected: PASS on Linux/macOS; SKIP on Windows.

- [ ] **Step 4: Code review**

Dispatch `superpowers:requesting-code-review` on the diff vs `develop` with the prompt: "Review for socat startup races, stderr parsing edge cases, and process-cleanup leaks. Flag any case where a test failure could leave an orphan socat process."

- [ ] **Step 5: Commit**

```bash
cd /home/jeff/Source/astros/AstrOs.Server
git add astros_api/src/test_harness/pty_pair.ts astros_api/src/test_harness/pty_pair.test.ts
git commit -m "feat(test_harness): add socat-backed PTY pair helper (c.6c.2 Task 1)"
```

---

### Task 2 — `stub_master.ts`: scriptable wire-protocol responder

**Files:**
- Create: `astros_api/src/test_harness/stub_master.ts`
- Create: `astros_api/src/test_harness/stub_master.test.ts`

The stub master is small but has several responsibilities — separation matters. Internal structure:

- **Frame parser**: reads `\n`-delimited lines from the PTY, splits by `GS`, validates the `RS`-separated header, parses payload by message type. Reuses `MessageHelper` constants (`GS`, `RS`, `US`, `MessageEOL`) but does NOT reuse `MessageHandler` (which is server-direction parsing — incoming wire format is server→master, not master→server). Inline narrow parser for the four inbound types: `FW_TRANSFER_BEGIN`, `FW_CHUNK`, `FW_TRANSFER_END`, `FW_DEPLOY_BEGIN`, plus `POLL`.
- **Frame writer**: builds `\n`-delimited lines with the proper validation token (mirrors `MessageGenerator.generateHeader`'s shape) for outbound types: `FW_TRANSFER_BEGIN_ACK`, `FW_CHUNK_ACK`, `FW_CHUNK_NAK`, `FW_TRANSFER_END_ACK`, `FW_PROGRESS`, `FW_DEPLOY_DONE`, `FW_BACKPRESSURE`, `POLL_ACK`.
- **Scripted-response API**: methods tests call to drive behavior. See "control API" below.

- [ ] **Step 1: Write the parser + writer + class skeleton**

Core interface:

```ts
// astros_api/src/test_harness/stub_master.ts
import { SerialPort } from 'serialport';
import { DelimiterParser } from '@serialport/parser-delimiter';
import { MessageHelper } from '../serial/message_helper.js';
import { SerialMessageType } from '../serial/serial_message.js';
import type { FwStage } from '../models/firmware/firmware_messages.js';

export interface StubMasterOpts {
  ptyPath: string;
  masterMac?: string;            // default '00:00:00:00:00:00' (sentinel per project memory)
  masterFingerprint?: string;    // default 'master-stub'
  masterFirmwareVersion?: string; // default '1.0.0'; tests override per scenario
  masterVariant?: string;        // default 'astros-master-test-variant'
}

export interface InboundFrame {
  type: SerialMessageType;
  msgId: string;
  payload: string;
}

export class StubMaster {
  private port!: SerialPort;
  private parser!: DelimiterParser;
  private inbound: InboundFrame[] = [];
  private inboundListeners: Array<(frame: InboundFrame) => void> = [];
  // Scripted-response state — see Task 3.

  constructor(private readonly opts: StubMasterOpts) {}

  async start(): Promise<void> {
    this.port = new SerialPort({ path: this.opts.ptyPath, baudRate: 9600, autoOpen: false });
    await new Promise<void>((resolve, reject) => {
      this.port.open((err) => (err ? reject(err) : resolve()));
    });
    this.parser = this.port.pipe(new DelimiterParser({ delimiter: '\n' }));
    this.parser.on('data', (buf: Buffer) => this.handleInbound(buf.toString('utf8')));
  }

  async dispose(): Promise<void> {
    if (this.port?.isOpen) {
      await new Promise<void>((resolve) => this.port.close(() => resolve()));
    }
  }

  private handleInbound(line: string): void {
    const frame = parseInbound(line);
    if (frame === null) return;  // log + drop malformed
    this.inbound.push(frame);
    for (const l of this.inboundListeners) l(frame);
    this.dispatchScriptedResponse(frame);  // Task 3 logic
  }

  /** Wait for an inbound frame matching the predicate. Used by tests to synchronize. */
  async waitForFrame(
    predicate: (frame: InboundFrame) => boolean,
    timeoutMs = 2000,
  ): Promise<InboundFrame> {
    const existing = this.inbound.find(predicate);
    if (existing) return existing;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.inboundListeners = this.inboundListeners.filter((l) => l !== handler);
        reject(new Error(`waitForFrame: predicate did not match within ${timeoutMs}ms. Received: ${JSON.stringify(this.inbound.slice(-5))}`));
      }, timeoutMs);
      const handler = (frame: InboundFrame): void => {
        if (!predicate(frame)) return;
        clearTimeout(timer);
        this.inboundListeners = this.inboundListeners.filter((l) => l !== handler);
        resolve(frame);
      };
      this.inboundListeners.push(handler);
    });
  }

  /** Write a pre-built outbound frame line ('\n'-terminated). Used by Task 3 helpers. */
  writeRaw(line: string): void {
    this.port.write(line);
  }
}

function parseInbound(line: string): InboundFrame | null {
  const groups = line.split(MessageHelper.GS);
  if (groups.length !== 2) return null;
  const headerParts = groups[0].split(MessageHelper.RS);
  if (headerParts.length !== 3) return null;
  const type = parseInt(headerParts[0], 10);
  if (Number.isNaN(type)) return null;
  return { type: type as SerialMessageType, msgId: headerParts[2], payload: groups[1] };
}
```

- [ ] **Step 2: Add the outbound writer helpers (mirrors MessageGenerator's wire format)**

Continue in `stub_master.ts`:

```ts
// Outbound wire-format writers. Each builds a header (matching server's
// MessageGenerator.generateHeader shape: type<RS>validation<RS>msgId)
// followed by GS, the payload, and \n. Validation strings are the
// known constants from MessageHelper.ValidationMap.

export interface FwTransferBeginAckArgs {
  transferId: string;
  windowSize?: number;       // default 16 (FW_SERIAL_SLIDING_WINDOW)
  msgId?: string;
}

export interface FwChunkAckArgs {
  transferId: string;
  highestContiguousSeq: number;
  bytesSent: number;
  windowRemaining?: number;  // default windowSize - inflight
  msgId?: string;
}

export interface FwChunkNakArgs {
  transferId: string;
  lastGoodSeq: number;
  reasonCode: 'CRC' | 'OUT_OF_ORDER' | 'BUFFER_FULL' | 'INTERNAL_ERROR';
  msgId?: string;
}

// ... and similarly for FwTransferEndAck, FwProgress, FwDeployDone, FwBackpressure, PollAck.

// Each writer composes the line and calls writeRaw(). Implementations are mechanical
// and use the wire-format documented in .docs/protocol.md and serial_message_service.ts.
```

(Full implementations of each writer go here — straightforward, ~5-10 lines each. Total ~80-100 lines for all 7 outbound writers.)

- [ ] **Step 3: Sanity-check test for round-trip parsing/writing**

```ts
// astros_api/src/test_harness/stub_master.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import { SerialPort } from 'serialport';
import { DelimiterParser } from '@serialport/parser-delimiter';
import { createPtyPair, type PtyPair } from './pty_pair.js';
import { StubMaster } from './stub_master.js';
import { SerialMessageType } from '../serial/serial_message.js';
import { MessageHelper } from '../serial/message_helper.js';

const skipIfNotPosix = process.platform === 'win32' ? it.skip : it;

describe('StubMaster round-trip', () => {
  let pty: PtyPair;
  let stub: StubMaster;
  let serverPort: SerialPort;

  afterEach(async () => {
    await stub?.dispose();
    if (serverPort?.isOpen) await new Promise((r) => serverPort.close(() => r(undefined)));
    await pty?.dispose();
  });

  skipIfNotPosix('parses a server-side FW_TRANSFER_BEGIN frame', async () => {
    pty = await createPtyPair();
    stub = new StubMaster({ ptyPath: pty.masterPath });
    await stub.start();

    serverPort = new SerialPort({ path: pty.serverPath, baudRate: 9600 });
    await new Promise((r) => serverPort.on('open', r));

    const validation = MessageHelper.ValidationMap.get(SerialMessageType.FW_TRANSFER_BEGIN)!;
    const header = `${SerialMessageType.FW_TRANSFER_BEGIN}${MessageHelper.RS}${validation}${MessageHelper.RS}msg-1`;
    const payload = `xfer-1${MessageHelper.US}1024${MessageHelper.US}${'a'.repeat(64)}${MessageHelper.US}256${MessageHelper.US}body${MessageHelper.RS}master`;
    serverPort.write(`${header}${MessageHelper.GS}${payload}${MessageHelper.MessageEOL}`);

    const frame = await stub.waitForFrame((f) => f.type === SerialMessageType.FW_TRANSFER_BEGIN);
    expect(frame.msgId).toBe('msg-1');
    expect(frame.payload).toContain('xfer-1');
  });

  // Symmetric test: stub writes an outbound FW_TRANSFER_BEGIN_ACK, server-side
  // raw read confirms it appears with correct framing.
  skipIfNotPosix('writes a FW_TRANSFER_BEGIN_ACK that the server-side parser can read', async () => {
    pty = await createPtyPair();
    stub = new StubMaster({ ptyPath: pty.masterPath });
    await stub.start();

    serverPort = new SerialPort({ path: pty.serverPath, baudRate: 9600 });
    await new Promise((r) => serverPort.on('open', r));
    const serverParser = serverPort.pipe(new DelimiterParser({ delimiter: '\n' }));

    const linePromise = new Promise<string>((resolve) => {
      serverParser.once('data', (b: Buffer) => resolve(b.toString('utf8')));
    });

    stub.writeFwTransferBeginAck({ transferId: 'xfer-1', windowSize: 16, msgId: 'm1' });

    const line = await linePromise;
    expect(line).toContain('xfer-1');
    expect(line).toContain(String(SerialMessageType.FW_TRANSFER_BEGIN_ACK));
  });
});
```

- [ ] **Step 4: Run the tests**

Run: `cd astros_api && npx vitest run src/test_harness/stub_master.test.ts`
Expected: PASS on Linux/macOS.

- [ ] **Step 5: Code review**

Dispatch `superpowers:requesting-code-review` with the prompt: "Review for wire-format mismatches between StubMaster's writers and `MessageHandler`'s parsers — drift here would silently break every integration test. Cross-check each outbound writer against the corresponding handler in `astros_api/src/serial/message_handler.ts`. Also check that `parseInbound` correctly handles the validation-token field that `generateHeader` emits."

- [ ] **Step 6: Commit**

```bash
git add astros_api/src/test_harness/stub_master.ts astros_api/src/test_harness/stub_master.test.ts
git commit -m "feat(test_harness): add scriptable stub master with PTY-backed serial (c.6c.2 Task 2)"
```

---

### Task 3 — Stub master scripted-response API

**Files:**
- Modify: `astros_api/src/test_harness/stub_master.ts`
- Modify: `astros_api/src/test_harness/stub_master.test.ts`

Layer the deterministic-script API onto the StubMaster. Tests should be able to express:

- **`autoAckUpload({ chunkAckCadence: 'every' | 'window', failAtSeq?: number })`** — automatically ACK every FW_CHUNK (or per-window batch) the orchestrator sends; ACK FW_TRANSFER_BEGIN with a configurable window size; ACK FW_TRANSFER_END with status=`OK`. If `failAtSeq` provided, send a NAK at that seq and resume normal ACK after.
- **`scriptDeploy(controllers: Array<{ id: string; outcome: 'OK' | 'FAILED'; finalVersion?: string; error?: string; stages?: FwStage[] }>)`** — when the orchestrator sends `FW_DEPLOY_BEGIN`, emit `FW_PROGRESS` events walking through each controller's stages, then `FW_DEPLOY_DONE` with the configured outcomes.
- **`emitPollAck({ mac?: string; firmwareVersion?: string; variant?: string })`** — emit a single POLL_ACK frame on demand. Used to:
  1. Pre-populate the `controllerVariantCache` before a flash (each controller's variant)
  2. Trigger the master heartbeat post-flashJobDone (master sentinel MAC + matching firmwareVersion)
- **`disable(featureName: 'autoAckUpload' | 'scriptDeploy')`** — stop auto-responses; leaves inbound frames unhandled so tests can drive timeouts.

- [ ] **Step 1: Add the API**

Sketch in `stub_master.ts`:

```ts
interface AutoAckUploadConfig {
  windowSize: number;           // default 16
  ackCadence: 'every' | 'window';  // 'every' acks every FW_CHUNK; 'window' batches
  failAtSeq?: number;           // if set, NAK at this seq once
  endStatus?: 'OK' | 'HASH_MISMATCH' | 'INCOMPLETE';  // FW_TRANSFER_END_ACK status; default OK
}

interface ScriptDeployConfig {
  controllers: Array<{
    id: string;
    outcome: 'OK' | 'FAILED';
    finalVersion?: string;       // required if OK
    error?: string;              // required if FAILED
    stages?: FwStage[];          // default [Sending, Verifying, Rebooting, VersionConfirmed/Failed]
  }>;
  doneTransferId?: string;       // captured from FW_DEPLOY_BEGIN if not set
}

class StubMaster {
  // ...existing fields...
  private autoAckUploadCfg: AutoAckUploadConfig | null = null;
  private autoAckUploadFailedSeq = false;  // track whether failAtSeq has fired
  private scriptDeployCfg: ScriptDeployConfig | null = null;

  autoAckUpload(cfg: Partial<AutoAckUploadConfig>): void {
    this.autoAckUploadCfg = {
      windowSize: 16,
      ackCadence: 'every',
      endStatus: 'OK',
      ...cfg,
    };
    this.autoAckUploadFailedSeq = false;
  }

  scriptDeploy(cfg: ScriptDeployConfig): void {
    this.scriptDeployCfg = cfg;
  }

  emitPollAck(opts: { mac?: string; firmwareVersion?: string; variant?: string }): void {
    const mac = opts.mac ?? this.opts.masterMac ?? '00:00:00:00:00:00';
    const fingerprint = this.opts.masterFingerprint ?? 'master-stub';
    const fw = opts.firmwareVersion ?? this.opts.masterFirmwareVersion ?? '1.0.0';
    const variant = opts.variant ?? this.opts.masterVariant ?? 'astros-master-test-variant';
    // POLL_ACK wire format (per message_handler.handlePollAck):
    //   parts[0] mac, parts[1] name, parts[2] fingerprint, parts[3] fwVersion, parts[4] variant
    // separated by US; framed with the standard header GS payload \n envelope.
    const validation = MessageHelper.ValidationMap.get(SerialMessageType.POLL_ACK)!;
    const header = `${SerialMessageType.POLL_ACK}${MessageHelper.RS}${validation}${MessageHelper.RS}${this.nextMsgId()}`;
    const payload = [mac, mac /* name = mac for stub */, fingerprint, fw, variant].join(MessageHelper.US);
    this.writeRaw(`${header}${MessageHelper.GS}${payload}${MessageHelper.MessageEOL}`);
  }

  // dispatchScriptedResponse: called from handleInbound. Routes by frame.type
  // to the matching auto-responder.
  private dispatchScriptedResponse(frame: InboundFrame): void {
    switch (frame.type) {
      case SerialMessageType.FW_TRANSFER_BEGIN:
        if (this.autoAckUploadCfg) this.respondTransferBegin(frame);
        break;
      case SerialMessageType.FW_CHUNK:
        if (this.autoAckUploadCfg) this.respondChunk(frame);
        break;
      case SerialMessageType.FW_TRANSFER_END:
        if (this.autoAckUploadCfg) this.respondTransferEnd(frame);
        break;
      case SerialMessageType.FW_DEPLOY_BEGIN:
        if (this.scriptDeployCfg) this.respondDeployBegin(frame);
        break;
      // POLL is server-driven; we don't auto-reply (tests call emitPollAck explicitly)
    }
  }

  private nextMsgId(): string { /* uuid_v4 or counter */ }

  // respondTransferBegin / respondChunk / respondTransferEnd / respondDeployBegin
  // are private helpers that build the appropriate outbound frame using the
  // writers from Task 2 + the active config.
}
```

- [ ] **Step 2: Implement each respondX helper**

Each is ~10-20 lines. `respondChunk` is the most subtle: parses `frame.payload` for the seq number, decides whether to NAK (failAtSeq match) or ACK with `highestContiguousSeq` advancing per ACK and `windowRemaining` decrementing per chunk-in-flight (then resetting on each ACK). For the first c.6c.2 cut, the simplest implementation: respond with `highestContiguousSeq = seq` and `windowRemaining = windowSize - 0` (treating the window as immediately re-available); this satisfies the c.6b streamer's sliding-window expectations.

- [ ] **Step 3: Add scripted-API tests**

Tests in `stub_master.test.ts`:
- `autoAckUpload` ACKs every FW_CHUNK with `highestContiguousSeq` advancing.
- `autoAckUpload` with `failAtSeq=5` NAKs at seq 5 once, then resumes ACKing.
- `scriptDeploy` walks each controller through `[Sending, Verifying, Rebooting, VersionConfirmed]` stages and emits `FW_DEPLOY_DONE` with the configured outcomes.
- `emitPollAck` writes a 5-field POLL_ACK frame parseable by `MessageHandler.handlePollAck`.

- [ ] **Step 4: Run the tests**

`cd astros_api && npx vitest run src/test_harness/stub_master.test.ts`
Expected: PASS.

- [ ] **Step 5: Code review**

Prompt: "Find any drift between the stub master's responses and what `chunk_streamer.ts` and `flash_orchestrator.ts` consume. Specifically check: window-remaining math in FW_CHUNK_ACK, validation-token strings on outbound frames, FW_DEPLOY_DONE result-list framing (US/RS separators), POLL_ACK 5-field layout."

- [ ] **Step 6: Commit**

```bash
git add astros_api/src/test_harness/stub_master.ts astros_api/src/test_harness/stub_master.test.ts
git commit -m "feat(test_harness): add scripted response API to StubMaster (c.6c.2 Task 3)"
```

---

### Task 4 — Integration harness boot helper + ApiServer shutdown path

**Files:**
- Create: `astros_api/src/test_harness/integration_harness.ts`
- Modify: `astros_api/src/api_server.ts` (add a `shutdown()` method)

The harness:
1. Allocates a PTY pair.
2. Allocates random ports for HTTP + WS.
3. Sets `process.env.SERIAL_PORT = pty.serverPath`, `API_PORT`, `WEBSOCKET_PORT`, and `JWT_KEY`.
4. Boots an `ApiServer` (real `Init()`).
5. Constructs the `StubMaster` on the master end of the PTY.
6. Returns `{ server, stub, http, ws, dispose }`.

The `ApiServer.shutdown()` method (new in this task) closes the HTTP server, WS server, serial port, and terminates the worker. Without this, tests leak workers + ports.

- [ ] **Step 1: Add `ApiServer.shutdown()`**

```ts
// In api_server.ts
public async shutdown(): Promise<void> {
  if (this.serialPort?.isOpen) {
    await new Promise<void>((resolve) => this.serialPort.close(() => resolve()));
  }
  if (this.serialWorker !== undefined) {
    await this.serialWorker.terminate();
  }
  if (this.websocket !== undefined) {
    await new Promise<void>((resolve) => this.websocket.close(() => resolve()));
  }
  if (this.httpServer !== undefined) {
    await new Promise<void>((resolve) => this.httpServer.close(() => resolve()));
  }
  // Close DB to release the file lock.
  if (this.db !== undefined) {
    await this.db.destroy();
  }
}
```

(Capture `this.httpServer = this.app.listen(...)` so it can be closed; the existing code likely returns the listen-result; small refactor.)

- [ ] **Step 2: Write the harness module**

```ts
// astros_api/src/test_harness/integration_harness.ts
import { createServer } from 'net';
import { ApiServer } from '../api_server.js';
import { createPtyPair, PtyPair } from './pty_pair.js';
import { StubMaster } from './stub_master.js';
import { WebSocket } from 'ws';
// ... HTTP client (axios or node:fetch), uuid, etc.

export interface IntegrationHarness {
  server: ApiServer;
  stub: StubMaster;
  httpBaseUrl: string;       // 'http://127.0.0.1:<random>'
  wsClient: WebSocket;
  receivedWsMessages: any[]; // buffered for assertion
  waitForWsMessage(predicate: (msg: any) => boolean, timeoutMs?: number): Promise<any>;
  dispose(): Promise<void>;
}

async function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, () => {
      const port = (server.address() as any).port;
      server.close(() => resolve(port));
    });
    server.on('error', reject);
  });
}

export async function bootIntegrationHarness(opts?: {
  masterFirmwareVersion?: string;
  masterVariant?: string;
}): Promise<IntegrationHarness> {
  const pty = await createPtyPair();
  const apiPort = await findFreePort();
  const wsPort = await findFreePort();

  process.env.SERIAL_PORT = pty.serverPath;
  process.env.BAUD_RATE = '9600';
  process.env.API_PORT = String(apiPort);
  process.env.WEBSOCKET_PORT = String(wsPort);
  process.env.JWT_KEY = 'test-jwt-key';
  // Use in-memory DB or a temp directory for the integration suite.
  // (Existing test mode does in-memory; we want NODE_ENV != 'test' so setupSerialPort runs.)

  const server = await ApiServer.bootstrap();
  const stub = new StubMaster({
    ptyPath: pty.masterPath,
    masterFirmwareVersion: opts?.masterFirmwareVersion,
    masterVariant: opts?.masterVariant,
  });
  await stub.start();

  const wsClient = new WebSocket(`ws://127.0.0.1:${wsPort}`);
  await new Promise<void>((resolve, reject) => {
    wsClient.once('open', () => resolve());
    wsClient.once('error', reject);
  });

  const receivedWsMessages: any[] = [];
  const wsListeners: Array<(m: any) => void> = [];
  wsClient.on('message', (data) => {
    try {
      const parsed = JSON.parse(data.toString());
      receivedWsMessages.push(parsed);
      for (const l of wsListeners) l(parsed);
    } catch (err) {
      // Non-JSON; ignore
    }
  });

  const waitForWsMessage = (predicate: (m: any) => boolean, timeoutMs = 5000): Promise<any> => {
    const existing = receivedWsMessages.find(predicate);
    if (existing) return Promise.resolve(existing);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = wsListeners.indexOf(handler);
        if (idx >= 0) wsListeners.splice(idx, 1);
        reject(new Error(`waitForWsMessage timeout. Received: ${JSON.stringify(receivedWsMessages.map((m) => m.type).slice(-10))}`));
      }, timeoutMs);
      const handler = (m: any): void => {
        if (!predicate(m)) return;
        clearTimeout(timer);
        const idx = wsListeners.indexOf(handler);
        if (idx >= 0) wsListeners.splice(idx, 1);
        resolve(m);
      };
      wsListeners.push(handler);
    });
  };

  const dispose = async (): Promise<void> => {
    wsClient.close();
    await stub.dispose();
    await server.shutdown();
    await pty.dispose();
  };

  return {
    server,
    stub,
    httpBaseUrl: `http://127.0.0.1:${apiPort}`,
    wsClient,
    receivedWsMessages,
    waitForWsMessage,
    dispose,
  };
}
```

- [ ] **Step 3: Smoke test the harness**

```ts
// astros_api/src/test_harness/integration_harness.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import { bootIntegrationHarness, type IntegrationHarness } from './integration_harness.js';

const skipIfNotPosix = process.platform === 'win32' ? it.skip : it;

describe('integration harness', () => {
  let harness: IntegrationHarness | undefined;
  afterEach(async () => {
    await harness?.dispose();
    harness = undefined;
  });

  skipIfNotPosix('boots, accepts WS connection, receives initial systemStatus, and tears down', async () => {
    harness = await bootIntegrationHarness();
    const status = await harness.waitForWsMessage((m) => m.type === 'systemStatus' || m.type === 0 /* TransmissionType.systemStatus value */);
    expect(status).toBeDefined();
  });
});
```

- [ ] **Step 4: Run + review + commit**

Standard cycle: run vitest, code review on the diff, commit.

```bash
git add astros_api/src/test_harness/integration_harness.ts astros_api/src/test_harness/integration_harness.test.ts astros_api/src/api_server.ts
git commit -m "feat(test_harness): add integration harness + ApiServer.shutdown (c.6c.2 Task 4)"
```

**Reviewer prompt:** "Look for resource-cleanup ordering bugs in `dispose()` and any test-pollution risk from setting `process.env` globals (one test's env values shouldn't leak into another)."

---

### Task 5 — Integration test: happy upload-source flash + heartbeat release

**Files:**
- Create: `astros_api/src/firmware/integration/flash_happy_upload.integration.test.ts`
- Create: `astros_api/test_fixtures/firmware/tiny.bin` (4 KB binary, deterministic content)

This is the smoke test for the entire stack. End-to-end:

1. Boot harness with `masterFirmwareVersion: '1.5.0'`, `masterVariant: 'astros-controller-v1'`.
2. Pre-populate `controllerVariantCache` by emitting POLL_ACK from the stub master with the variant.
3. Pre-populate the upload store with `tiny.bin` (use the existing `firmware_upload_store` directly, bypassing the HTTP route).
4. Configure stub: `autoAckUpload({ ackCadence: 'every' })` and `scriptDeploy({ controllers: [{ id: '00:00:00:00:00:00', outcome: 'OK', finalVersion: '1.5.0' }] })`.
5. POST `/api/firmware/flash` with `{ source: { kind: 'upload' } }`.
6. Assert WS receives, in order: `flashJobStarted`, `flashControllerUpdate` (UploadingToMaster), `flashControllerUpdate` (Sending), `flashControllerUpdate` (Verifying), `flashControllerResult` (VersionConfirmed), `flashJobDone`.
7. Stub master emits POLL_ACK with master sentinel MAC + matching firmwareVersion.
8. Assert WS receives `lockStateChanged { locked: false }`.
9. Assert `GET /api/firmware/flash` returns `null` (no active job).

- [ ] **Step 1: Write `tiny.bin` fixture**

Use a Node script or a one-liner to generate 4096 bytes of deterministic content:

```bash
node -e "require('fs').writeFileSync('astros_api/test_fixtures/firmware/tiny.bin', Buffer.alloc(4096, 0x42))"
```

- [ ] **Step 2: Write the integration test**

(Implementation per the steps above. ~80-120 lines.)

- [ ] **Step 3: Run, debug, commit**

The first integration test will likely surface a few harness rough edges. Fix them in `stub_master.ts` / `integration_harness.ts` as needed. Each fix gets its own commit (subagent-driven dev flow).

Final commit message: `test(integration): happy upload flash + heartbeat release (c.6c.2 Task 5)`

---

### Task 6 — Integration test: happy github-source flash with cache fixture

**Files:**
- Create: `astros_api/src/firmware/integration/flash_happy_github.integration.test.ts`

Same shape as Task 5 but with `kind: 'github'`. Requires:
1. Inject a fake `releaseService` returning a synthetic `ReleaseInfo` whose asset matches the controllers' variant. Either:
    a) Pre-populate the on-disk cache so `cache.fetch()` returns immediately without hitting GitHub.
    b) Add a constructor injection point on `ApiServer` for tests to swap the `githubReleaseService`. (Likely option (a) is simpler — no production-code change needed.)

This task surfaces whether the harness needs an injection seam for `releaseService`. If so, add it (small: an optional constructor opt that overrides the auto-built service).

Commit: `test(integration): happy github flash from cache fixture (c.6c.2 Task 6)`

---

### Task 7 — Integration test: cancel during upload + during deploy

**Files:**
- Create: `astros_api/src/firmware/integration/flash_cancel.integration.test.ts`

Two test cases in one file:
1. **Cancel during upload**: stub master configured with no auto-ack; POST flash; wait for `flashJobStarted`; DELETE flash; assert streamer abort propagates → `flashJobFailed { abortReason: 'aborted' }` → controllers transition to Failed → lock released.
2. **Cancel during deploy**: stub master `autoAckUpload` enabled but `scriptDeploy` NOT configured (so deploy stalls awaiting FW_DEPLOY_DONE); POST flash; wait for `Sending` stage transition; DELETE flash; assert `flashJobFailed { abortReason: 'http' }` (or whatever cancel reason) + controllers in Failed + lock released.

Commit: `test(integration): cancel during upload + during deploy (c.6c.2 Task 7)`

---

### Task 8 — Integration test: chunk NAK + Go-Back-N recovery

**Files:**
- Create: `astros_api/src/firmware/integration/flash_chunk_nak.integration.test.ts`

Stub master configured with `autoAckUpload({ failAtSeq: 2 })`. POST flash. Assert:
- Server retransmits from `lastGoodSeq + 1`.
- Stub master ACKs the retransmitted chunks normally.
- Flash completes successfully.

This validates the c.6b chunk_streamer's Go-Back-N path under a real serial wire.

Commit: `test(integration): chunk NAK + Go-Back-N retransmit (c.6c.2 Task 8)`

---

### Task 9 — Integration test: per-controller deploy FAILED outcome

**Files:**
- Create: `astros_api/src/firmware/integration/flash_partial_failure.integration.test.ts`

Stub master: `scriptDeploy({ controllers: [{ id: 'A', outcome: 'OK', ...}, { id: 'B', outcome: 'FAILED', error: 'crc_mismatch' }] })`.

Assert:
- `flashControllerResult` for A with VersionConfirmed
- `flashControllerResult` for B with Failed + error
- `flashJobDone` (NOT failed — per c.6a's `deriveJobLifecycle`, all-terminal regardless of mix)

Commit: `test(integration): per-controller deploy FAILED outcome (c.6c.2 Task 9)`

---

### Task 10 — Integration test: heartbeat releases lock pre-timer

**Files:**
- Create: `astros_api/src/firmware/integration/flash_heartbeat_release.integration.test.ts`

Run a happy flash through to `flashJobDone`. Within the 15-sec reboot window, stub master emits POLL_ACK with master sentinel MAC + matching firmwareVersion. Assert `lockStateChanged { locked: false }` arrives BEFORE the 15-sec timer would have fired (use a measured delta of ~1-2 sec post-POLL_ACK).

Variant test: emit POLL_ACK with WRONG firmwareVersion → orchestrator ignores → 15-sec timer eventually fires → assert lock released after that delay (use vitest's `testTimeout` ≥ 20 sec for this case).

Commit: `test(integration): heartbeat-vs-timer first-fire-wins (c.6c.2 Task 10)`

---

### Task 11 — Integration test: reboot timer fallback fires (no heartbeat)

**Files:**
- (Could fold into Task 10's file — single test file, two `it()` blocks. Decide during implementation.)

Run a happy flash through to `flashJobDone`. Stub master does NOT emit POLL_ACK. Assert `lockStateChanged { locked: false }` arrives ~15 sec after `flashJobDone` (with a tolerance band, e.g., 14.5–16 sec).

This test runs slow by design. Mark with `it.concurrent` if vitest supports it, OR simply accept the 15-sec wall-clock cost. Reduces test-suite parallelism — that's fine for the integration tier.

If folded into Task 10, omit this task; otherwise:

Commit: `test(integration): reboot timer fallback fires after 15s (c.6c.2 Task 11)`

---

### Task 12 — Integration test: concurrent flash returns 409

**Files:**
- Create: `astros_api/src/firmware/integration/flash_concurrent.integration.test.ts`

POST flash. Mid-flow (e.g., after `flashJobStarted` but before `flashJobDone`), POST a second flash. Assert second response is 409 with `{ error: 'job_already_running', currentJobId: <first-job-id> }`. Let first flash complete normally.

Variant: WS sends a write-class message during the flash → assert `flashJobActive` rejection frame back. (Touches the c.2 lock-guard layer; nice to cover end-to-end.)

Commit: `test(integration): concurrent flash returns 409 + flashJobActive WS rejection (c.6c.2 Task 12)`

---

### Task 13 — QA plan extension + final verification

**Files:**
- Modify: `.docs/qa/firmware-ota-flash.md`

Append a section to the existing QA plan:

```markdown
## Integration test suite (c.6c.2)

The following scenarios are now covered by the automated integration suite under
`astros_api/src/firmware/integration/`. Operators do not need to manually verify
these unless investigating a regression in the suite itself:

- Happy upload flash (Task 5)
- Happy github flash (Task 6)
- Cancel during upload + deploy (Task 7)
- Chunk NAK + Go-Back-N recovery (Task 8)
- Per-controller deploy FAILED outcome (Task 9)
- Heartbeat releases lock pre-timer (Task 10)
- Reboot timer fallback fires after 15-sec (Task 11)
- Concurrent flash returns 409 (Task 12)

Run via: `cd astros_api && npm run test:integration`

The remaining manual scenarios in this plan (real-hardware end-to-end smoke,
mixed-variant location, no-controllers, source-resolution failure with real
GitHub) still require operator attention — they cover boundaries the
integration suite intentionally doesn't (real network, real hardware
register, real master firmware behavior).
```

- [ ] **Verification (run before opening PR):**
    - `cd astros_api && npm run prettier:write` clean
    - `cd astros_api && npm run lint:fix` clean
    - `cd astros_api && npm run build` clean
    - `cd astros_api && npx vitest run` — full suite green (existing + new integration)
    - `cd astros_api && npm run test:integration` — integration suite green in isolation
    - `cd astros_vue && npm run build && npm run test:unit` clean (no Vue changes, but verify no regressions)
    - `superpowers:requesting-code-review` on the full diff vs `develop` with the prompt: "Review for: (a) wire-format drift between StubMaster's writers and `MessageHandler`'s parsers; (b) resource leaks in the integration harness across PTY pair, socat subprocess, ApiServer, WS clients, and serial worker; (c) test flakiness — any timing-dependent assertion that could be brittle on a slower CI runner; (d) doc-vs-code drift between this plan's task descriptions and what shipped."

Commit: `docs(qa): extend firmware OTA flash QA plan with integration suite + run final verification (c.6c.2 Task 13)`

---

## Verification

- [ ] `cd astros_api && npm run build` clean (lint + tsc).
- [ ] `cd astros_api && npx vitest run` — full suite green (existing ~630 + ~10 integration tests = ~640).
- [ ] `cd astros_api && npm run test:integration` green in isolation; passes on a fresh check-out (no test-order dependencies).
- [ ] `cd astros_api && npm run prettier:write` and `npm run lint:fix` clean.
- [ ] FMI §1, §3, §4, §7 items have corresponding tests OR are explicitly marked N/A.
- [ ] No production-code paths changed except `ApiServer.shutdown()` (Task 4) — verify with `git diff develop -- src | grep -v test_harness | grep -v integration | grep -v firmware/integration`.
- [ ] Integration suite skips on Windows; passes on Linux. macOS not gated in CI but should pass locally if `socat` is installed (`brew install socat`).

## Out of scope (deferred)

Per the user redirect ("server repo only — firmware sim deferred to AstrOs.ESP") and the c.6c.1 spec §"Out of scope":

- **C++ firmware simulator (full master behavior simulation)** — lives in AstrOs.ESP, where it can share parsing code with the real firmware. The stub master in this plan is a wire-protocol responder, not a behavior simulator.
- **Padawan-side OTA simulation** — c.6c.2's stub master models a single virtual master only; per-padawan FW_DEPLOY_DONE entries are scripted, not simulated. Real per-padawan behavior covered by AstrOs.ESP's `b` series + bench testing.
- **Full GitHub release-service network test** — deferred. We test the `kind: 'github'` path against a pre-populated cache. A real GitHub network round-trip belongs in a fixture-based test of the release service itself (already covered by `github_release_service.test.ts` with HTTP fixtures).
- **`writeGuard` / WS lock-guard scenarios beyond `flashJobActive`** — c.2's lock-guard layer is unit-tested in its own file; we hit only the one path (concurrent-write-during-flash) in Task 12.
- **`esp_app_desc_t` validation against real binary headers** — covered by `esp_app_desc.test.ts` with binary fixtures.
- **Performance / throughput testing** — not a goal. The harness is for correctness.
- **CI workflow changes** — adding `socat` to the GitHub Actions runner image is out of scope for this branch unless the CI workflow YAML is committed alongside (which is plausible — call out during plan review).

## Notes for the reviewer

- **Why `socat` over `node-pty`.** `node-pty` is primarily a child-process spawn lib and lacks a clean `openpty` API across versions. Using it for raw PTY pairs requires spawning `socat` as the child anyway, plus a heavy native-build npm dep. Direct `child_process.spawn('socat', ...)` is simpler and the dep is system-level (already on the dev box; one-line apt install on CI). The decomp doc's "node-pty/socat" wording uses a slash to mean "alternatives", not a hard mandate. If reviewer prefers `node-pty`, swap the `pty_pair.ts` impl — the rest of the harness doesn't care.
- **Why integration tests live under `src/firmware/integration/` not `tests/`.** The existing project convention puts tests next to source (`*.test.ts`). Integration tests are slower and qualitatively different — they get their own subdirectory + filename suffix (`*.integration.test.ts`) so vitest can target them via `npm run test:integration` independently.
- **Why `ApiServer.shutdown()` is added in Task 4 rather than as separate prep work.** It's a pure refactor — a single new method that captures references already held as instance fields and closes them. Tucking it into the harness-setup task keeps the refactor co-located with its first consumer; carving it into its own task would be busywork.
- **Why the stub master's wire-format parser is inline rather than reusing `MessageHandler`.** `MessageHandler` parses messages flowing FROM master TO server (e.g., POLL_ACK, FW_*_ACK, FW_PROGRESS). The stub master needs to parse the OTHER direction (FW_TRANSFER_BEGIN, FW_CHUNK, FW_DEPLOY_BEGIN). Reusing `MessageHandler` would drag in dependencies + parse logic for the wrong direction. A narrow inline parser (~30 lines) is cheaper and clearer.
- **Test-time vs production-time `serial_worker.js` behavior.** The worker is unchanged. Tests merely point its serial port at a PTY rather than a real device. The Worker thread, msgService, MessageHandler, MessageGenerator — all real and exercised end-to-end.
- **Slowest test is Task 11 (reboot timer fallback) at ~15-16 sec wall-clock.** If suite runtime becomes a problem, that test could be moved to a separate `vitest --testTimeout=20000` config. For now, the integration suite is opt-in via `npm run test:integration`, so it doesn't slow the default `npm test` cycle.
