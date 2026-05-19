# ChunkStreamer ack timeout — size for full-window wire time

## Problem

A 1.2 MB OTA flash makes only a few seq's worth of forward progress per minute, then collapses into a Go-Back-N retransmit spiral. Bench logs from 2026-05-16 show the receiver healthy (`OtaReceiver` correctly `decision=ACK`/`NAK`-ing every chunk), but the host keeps replaying chunks the firmware already ACK'd.

Root cause is in `chunk_streamer.ts:64-70`. The per-chunk ack timer is armed when `bus.send()` returns (`topUpWindow` → line 697), but `bus.send` is fire-and-forget — bytes then sit in the worker's `RAW_WIRE` echo path, the Node `SerialPort` write queue, and the kernel TTY buffer before reaching the UART. At 115200 baud, one ~5527-byte FW_CHUNK frame takes **~480 ms on the wire**. With `windowSize: 16`, the last chunk in the initial fill sits behind 15 others for 15 × 480 = **~7.2 s** before it even leaves the host — but `ackTimeoutMs` is currently `5000` (in this branch's working tree, bumped from 1500 earlier today).

What that produces:

1. Timers for seq=5..15 fire at T+5000 ms — *before* those chunks have even reached the ESP.
2. Host queues duplicates behind the originals still in the UART queue (`onChunkTimeout` → `sendChunk` line 478-479).
3. The **original** chunk reaches the ESP first → `decision=ACK`. The **retransmit** arrives later, after the ESP has moved past that seq → `decision=NAK reason=OUT_OF_ORDER` carrying `nextExpectedSeq = highestContiguousSeq + 1`.
4. The host receives the NAK. The stale-NAK guard at line 581-584 (`nak.nextExpectedSeq <= highestAcked`) does NOT trip — `nextExpectedSeq` is one past `highestAcked` — so `handleChunkNak` runs Go-Back-N (line 643-648): `inFlight.clear()`, `nextToSend = nextExpectedSeq`, `topUpWindow()`.
5. Go-Back-N resends from `nextExpectedSeq`, but in-flight chunks beyond that were already on the wire → they each get NAK'd as OUT_OF_ORDER on arrival → another rewind → cascade.

Evidence in the captured logs:

- **ESP** (`.tmp/ESP.log` line 145 → 148): cleanly ACKs seq=0..20, then 400 ms later receives a retransmit of seq=5 (same CRC `1b44`) → `decision=NAK reason=OUT_OF_ORDER`. Same pattern repeats for seq=6..15 over the next few seconds.
- **Server** (`~/.config/astrosserver/logs/astros.2026-05-16.1.log` pid 143066, transferId=`"1"`): ACK for seq=15 arrives at T+20.997 s after BEGIN_ACK. Its 5 s timer fired at T+5.005 s — ~16 s before the ACK landed. Then at T+28.838 s the first `onChunkNak lastGoodSeq=20 nextExpectedSeq=21 reason=OUT_OF_ORDER` shows up and recurs every ~700 ms thereafter.

Earlier compiled-build attempts in the same log show `chunk_retry_exhausted: seq=N exhausted 3 retries` — same root cause hitting `maxRetriesPerChunk` before the spiral could form.

## Approach

Raise `TRANSPORT_DEFAULTS.ackTimeoutMs` to a value that covers full-window wire time with a safety margin.

Worst case bound:
- windowSize × per-chunk wire time + firmware processing + ack wire time
- 16 × 480 + ~100 + ~30 = ~**7780 ms**

Set the default to **15000 ms** (~2× safety margin). The cost of a too-large `ackTimeoutMs` is slower detection when the master is genuinely dead, but `transferTimeoutMs` (300 000) is the outer bound, and `maxRetriesPerChunk` × `ackTimeoutMs` = 5 × 15 000 = 75 000 ms < 300 000 — still well under the whole-transfer watchdog.

Sized for the current `windowSize: 16` and 115200 baud. If either changes materially, this default should be revisited; flag in a comment.

Two pieces of attendant drift to fix while in here:

1. **Stale comment** at `chunk_streamer.ts:939` says "1500 ms ackTimeoutMs"; the default is 5000 today and 15000 after this fix.
2. **Stale test constant** at `chunk_streamer.test.ts:1169-1172`: `const ACK_TIMEOUT_MS = 1500` with comment "Default ackTimeoutMs from TRANSPORT_DEFAULTS." The tests construct the streamer *without* an `ackTimeoutMs` override (line 1215, 1281), then `advanceTimersByTimeAsync(ACK_TIMEOUT_MS)` expecting the default timer to fire. That worked when the default was 1500, breaks silently as soon as the default diverges. Fix is to **pass an explicit small override per test** (`config: { chunkSizeBytes, ackTimeoutMs: 1500 }`) — tests then advertise their own time budget, the default can move freely, and the suite stays fast.

## Revised approach — switch to stop-and-wait (windowSize=1)

The bench run after `bc762fd` (the 15 000 ms / window=16 commit) still cascaded — same OUT_OF_ORDER NAK pattern, just deferred to seq=29 instead of seq=21. Fresh measurements:

- ESP-side: 16 chunks took **15.5 s** to arrive (seq=0 at ESP ts 3997420, seq=15 at 4012980). That's ~970 ms per chunk, not the ~480 ms wire time.
- Host-side (pid 151445): ACK for seq=13 arrived T+15226 ms after BEGIN_ACK, ACK for seq=15 arrived T+16416 ms. With `ackTimeoutMs: 15 000`, timers for seq=13..15 all fire ~200-1400 ms *before* their ACKs land.

The wire is running at ~50% capacity. The bottleneck isn't bandwidth — it's the master's per-chunk processing rate (likely `astrosRxTask` doing other work between FW_CHUNKs, with polling and POLL_ACK traffic eating CPU on a 2 s cycle). The sliding window of 16 was designed for the case where the wire is the bottleneck and pipelining hides round-trip latency. That premise doesn't hold here.

Worse: with multiple chunks in flight, a single spurious retransmit (timer-fired-before-ACK) creates a guaranteed OUT_OF_ORDER NAK when the duplicate lands behind the original, and the host's `handleChunkNak` Go-Back-N path responds by re-flooding the window — cascade.

**Switch to stop-and-wait: `windowSize: 1`.** With only one chunk ever outstanding, the cascade is structurally impossible (no "behind" chunk for a duplicate to arrive after). The existing sliding-window machinery handles `windowSize=1` correctly — `topUpWindow`'s `while (inFlight.size < 1 && ...)` becomes "send one, wait for ACK, send next." No code-path rewrite needed.

Trade-off: theoretical throughput drops from "pipelined wire-rate" to "stop-and-wait at processing-rate," but we're already processing-bound, so the *actual* throughput is the same. 1.2 MB / ~5500 bytes/sec ≈ **3.5 minutes** for a full image — same as what the broken sliding-window run was achieving in its good intervals.

The sliding-window code becomes dead-in-production but stays exercised by tests (which can opt into `windowSize > 1` via explicit config override). That's intentional: if `astrosRxTask` later becomes fast enough that the wire IS the bottleneck, the path back to a larger window is a one-line config change, not a rewrite. Refactor / delete the dead window machinery only after the simpler protocol has proven itself on the bench.

Reverts (or re-tunes back toward) most of `bc762fd`'s value changes since their justification ("size for full-window wire time") no longer applies:

- `ackTimeoutMs: 15 000 → 5_000` (5× margin over the observed ~1 s round trip)
- `maxRetriesPerChunk: 5 → 3` (back to original)
- `windowSize: 16 → 1` (the actual semantic change)
- Comment block rewritten to explain "processing-bound, not wire-bound, so window=1 avoids retransmit-cascade surface area without losing throughput"
- END_ACK race comment back to "5 000 ms"

Tests that exercise multi-chunk in-flight behavior need to explicitly opt into a larger `windowSize` (consistent with the existing per-test config-override pattern from task 2).

## Tasks

- [x] **Bump default + refresh stale comment.** In `chunk_streamer.ts`: changed `ackTimeoutMs: 5000` → `15_000` and added a sizing-rationale block comment above `TRANSPORT_DEFAULTS` (15 × 480 ms wire time = 7.2 s; 15 000 ms gives ~2× margin). Updated the stale "1500 ms ackTimeoutMs" reference at the END_ACK race comment.

- [x] **Make per-chunk-timeout tests pass an explicit `ackTimeoutMs`.** Updated all four construction sites in the per-chunk-timeout describe (lines 1215, 1274, 1332, 1392) plus two sites in the backpressure describe (1684, 1772) to pass `ackTimeoutMs: ACK_TIMEOUT_MS` (and `maxRetriesPerChunk: 3` where the test pins a retry-exhaustion count). Refreshed the `ACK_TIMEOUT_MS` header comment to drop the "Default from TRANSPORT_DEFAULTS" claim. Also updated the watchdog describe's stale "1500 ms" / "4.5 s" arithmetic in the block comment.

- [x] **Verify the suite.** `npm run prettier:write` (clean), `npm run lint:fix` (clean), `npm run build` (clean), `npx vitest run src/firmware/chunk_streamer.test.ts` (57/57 passed), full `npx vitest run` (771/771 passed, 63 test files). Code-reviewer agent dispatched on the diff per CLAUDE.md pre-commit checklist — no Critical / Important findings.

- [x] **Bench validation (superseded — see task 6).** Original plan was to bench-validate `bc762fd`. That bench run still cascaded, which triggered the revised approach above. Skipped — task 6 carries the real validation.

- [x] **Switch to `windowSize: 1` — placement choice.** First attempt put the change in `TRANSPORT_DEFAULTS`, which broke 23/57 streamer tests (sliding-window machinery is the streamer's documented surface, exercised throughout). Pivoted: leave `TRANSPORT_DEFAULTS` at the bc762fd state (windowSize=16, ackTimeoutMs=15_000, maxRetriesPerChunk=5) and put the production override in `defaultStreamerFactory` at `flash_orchestrator.ts:454`. Cleaner division — the streamer stays a general sliding-window transport; the AstrOs deployment selects stop-and-wait. Added a cross-reference comment in `TRANSPORT_DEFAULTS` pointing readers to the factory.

- [x] **Audit tests for multi-chunk-in-flight assumptions.** Moot under the placement choice above — `TRANSPORT_DEFAULTS` is unchanged, so tests continue to exercise sliding-window behavior. Full suite passes (771/771).

- [x] **Code review + commit.** Code-reviewer agent dispatched, no Critical / Important findings. Shipped as `ab17995 fix(chunk-streamer): production wiring runs stop-and-wait (windowSize=1)`. Full suite 771/771 green.

- [x] **Bench validation (stop-and-wait).** Confirmed end-to-end: zero `onChunkNak OUT_OF_ORDER` events on the post-`f913d6e`-ESP bench run (`astros.2026-05-16.1.log` pid 176725, `flash_orchestrator: onChunkNak` count = 0). ESP-side chunk arrivals at perfectly uniform ~480 ms intervals (no more 1.5-3.5 s polling-cycle gaps). Actual transfer time was ~7.5 min instead of the predicted ~3-5 min — the slower-than-expected rate is host-side (USB-CDC / worker IPC adds ~1 s per chunk between "ACK arrives" and "next chunk hits the wire"). Captured as a separate speed-investigation follow-up; the 10-min watchdog from task 6 gives comfortable margin until then.

- [x] **Bump `transferTimeoutMs` to 10 min in the orchestrator override.** First bench-validation attempt revealed the 300 s default sits right at the edge of the observed ~1 s/chunk × 294 chunks ≈ 295 s budget — and a few cascade-induced retries pushed the transfer past the watchdog at chunk 195/294 (`transfer_timeout: transfer exceeded 300000ms watchdog`, host log line 4596). Bumped `transferTimeoutMs` to 600_000 in the same `defaultStreamerFactory` override block alongside the windowSize/ackTimeoutMs/maxRetries config. Even with stop-and-wait eliminating the cascade, leaving a 2× headroom on the whole-transfer watchdog keeps a single unlucky `chunk_retry` from killing the entire flash. Rationale comment refreshed to document the math. Note: that bench failure was on the bc762fd codepath — pid 151445 loaded the older dist before our `ab17995` build completed, so the run was still running windowSize=16 and the cascade WAS firing. Server restart needed for the actual stop-and-wait validation.

- [x] **Revert investigation DIAG logging.** Reverted via `git checkout HEAD --` on both `api_server.ts` and `message_handler.ts`. Grep for `DIAG serial-rx` / `DIAG handleFwChunkAck` in both files returns empty. (See the "Removing the sliding-window machinery" item in Out of scope below — that's the final deferred follow-up; not a task to be done here.)

## Files touched

- `astros_api/src/firmware/chunk_streamer.ts` — cross-reference NOTE in `TRANSPORT_DEFAULTS` comment pointing to `defaultStreamerFactory`. Defaults unchanged from bc762fd.
- `astros_api/src/firmware/flash_orchestrator.ts` — `defaultStreamerFactory` passes `{ windowSize: 1, ackTimeoutMs: 5_000, maxRetriesPerChunk: 3 }` with rationale comment explaining the AstrOs deployment's processing-bound link.
- `astros_api/src/firmware/chunk_streamer.test.ts` — no change in this round (the placement pivot avoided test churn).
- `astros_api/src/api_server.ts` — revert investigation DIAG logging (final cleanup task).
- `astros_api/src/serial/message_handler.ts` — revert investigation DIAG logging (final cleanup task).

## Out of scope

- **OUT_OF_ORDER NAK cascade hardening.** With stop-and-wait, the cascade is structurally impossible, so the smarter NAK handler (suppress Go-Back-N when host is ahead of `nextExpectedSeq`) is no longer load-bearing. Keep on the radar for if/when the window is ever re-enlarged.
- **Arming the timer on UART drain rather than `bus.send` return.** Same logic — at window=1, timer race is irrelevant. Was structurally cleaner but no longer needed.
- **Removing the sliding-window machinery.** Sliding-window code stays in for now even though `windowSize=1` makes it dead-in-production. Reasons: (a) it's still exercised by tests that opt into `windowSize > 1`, so it doesn't bit-rot; (b) re-enabling on a future faster master is a one-line config change rather than a feature rebuild; (c) the simpler protocol needs bench-time before we commit to ripping out the alternative. Tracked as the final (deferred) task.
- **Diagnosing the master's processing-rate bottleneck.** ESP-side `astrosRxTask` is the actual reason throughput is processing-bound. Worth a separate firmware investigation — could yield faster transfers if the per-chunk processing time can be reduced. Not blocking on this for the OTA stabilization fix.
- **Cutting a separate branch for this fix.** Folded into the current `feature/firmware-allow-downgrade` branch — no point shipping a downgrade feature that can't reliably push a firmware image across the wire. Both changes are firmware-flash stabilization; they ride together.
