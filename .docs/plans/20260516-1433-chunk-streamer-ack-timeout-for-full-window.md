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

## Tasks

- [ ] **Bump default + refresh stale comment.** In `chunk_streamer.ts`: change `ackTimeoutMs: 5000` → `15000` (line 67). Update the `TRANSPORT_DEFAULTS` declaration comment to note the sizing rationale (window × wire time at 115200 baud). Update the stale "1500 ms ackTimeoutMs" reference in the comment at line 939 to read "15 000 ms ackTimeoutMs" with a note that the END_ACK race uses the same budget as a chunk ack.

- [ ] **Make per-chunk-timeout tests pass an explicit `ackTimeoutMs`.** In `chunk_streamer.test.ts` (the `describe('ChunkStreamer — per-chunk timeout + retry'`) block starting at line 1168): change `new ChunkStreamer({ bus, config: { chunkSizeBytes: chunkSize } })` (lines 1215, 1281, and any other call sites in that describe) to also pass `ackTimeoutMs: ACK_TIMEOUT_MS`. Drop the "Default ackTimeoutMs from TRANSPORT_DEFAULTS" claim from the `ACK_TIMEOUT_MS` comment — the test now owns the value. Re-check the other test describes (`begin_timeout`, `end_timeout`, watchdog, abort) — most already pass explicit `ackTimeoutMs` (line 2416, 2583, 2628 confirmed); make sure none rely on the default for timer math.

- [ ] **Verify the suite.** `npm run prettier:write && npm run lint:fix && npm run build && npx vitest run --reporter=verbose astros_api/src/firmware/chunk_streamer.test.ts`. Then full `npx vitest run` to catch any integration-test that asserts on the default. Expected: zero changes outside the files listed below.

- [ ] **Bench validation.** Build, push to the master, retry the 1.2 MB flash from the UI. **Keep the DIAG logging in place for this step** — the next task removes it once the cascade is confirmed gone. Watch `~/.config/astrosserver/logs/astros.*.log` for `flash orchestrator: onChunkNak` events during the upload phase — the cascade should disappear. ESP-side `.tmp/ESP.log` should show monotonically increasing seq with no retransmits below `highestSeq`. Capture both logs into the issue notes as the "after" comparison.

- [ ] **Revert investigation DIAG logging.** Once bench validation confirms the cascade is gone, revert the unstaged diagnostics in `api_server.ts` (the `DIAG serial-rx` block at line 610-618) and `message_handler.ts` (the `DIAG handleFwChunkAck raw=...` line at 213). These were scratch for the ack-loss hunt and were never intended to ship. Easiest path: `git checkout HEAD -- astros_api/src/api_server.ts astros_api/src/serial/message_handler.ts` after the bench run, then re-run lint + build to confirm nothing else depended on the removals.

## Files touched

- `astros_api/src/firmware/chunk_streamer.ts` — `ackTimeoutMs` default + two comment refresh sites (also carries the already-applied `maxRetriesPerChunk: 3 → 5` bump from the working tree; it stays in this commit)
- `astros_api/src/firmware/chunk_streamer.test.ts` — pass explicit `ackTimeoutMs` in the per-chunk-timeout describe block; drop stale "Default from TRANSPORT_DEFAULTS" claim
- `astros_api/src/api_server.ts` — revert investigation DIAG logging (final cleanup task)
- `astros_api/src/serial/message_handler.ts` — revert investigation DIAG logging (final cleanup task)

## Out of scope

- **OUT_OF_ORDER NAK cascade hardening.** Even with a correctly sized timeout, a real lossy wire could still produce OUT_OF_ORDER NAKs for chunks the host has moved past. The host could be smarter: if a NAK arrives with `reasonCode === 'OUT_OF_ORDER'` AND `nextExpectedSeq <= nextToSend`, suppress the Go-Back-N rewind (the host has already sent that seq forward) and just clear any matching in-flight entry. Reserve for a follow-up plan once the timeout fix is shipped and we have data on residual NAK churn.
- **Arming the timer on UART drain rather than `bus.send` return.** Structurally cleaner — it's what every other reliable-transport library does — but needs a "bytes-on-wire" callback path from the worker / `SerialPort.write`'s drain event back into the streamer, threaded by message-id. Material refactor; not worth it when a default bump achieves the same effect.
- **Reducing `windowSize` instead.** Window of 2 would also fit comfortably under a 5 s timeout, but at the cost of throughput (each chunk gates on its predecessor's round trip). The whole point of a 16-deep window is to overlap wire time with firmware processing — keep it.
- **Cutting a separate branch for this fix.** Folded into the current `feature/firmware-allow-downgrade` branch — no point shipping a downgrade feature that can't reliably push a firmware image across the wire. Both changes are firmware-flash stabilization; they ride together.
