# OTA host-side speed investigation — stub

**Status: stub — brainstorming + diagnostic measurements required before implementation.**

## Problem

The polling-pause fix on the ESP (`AstrOs.ESP` commit `f913d6e`) eliminated the master-side gaps in chunk processing, but per-chunk transfer time only dropped from ~970 ms (cascade-prone) to ~1535 ms (clean) — far short of the wire-rate ceiling of ~480 ms. Bench measurements from the post-`4b0e081` flash (`astros.2026-05-16.1.log` pid 176725):

- ESP-side: chunks arrive at uniform ~480 ms intervals (wire-rate). ACK queued at +20 ms, drained at +30 ms post-arrival. ESP processing ~30 ms total.
- Host-side: ~1535 ms between successive ACK arrivals.
- Round-trip math: 480 ms (host→ESP wire) + 30 ms (ESP) + 3 ms (ESP→host wire) ≈ 513 ms.
- **Unaccounted: ~1020 ms per chunk, lives on the host between "ACK arrives" and "next chunk's bytes hit the wire."**

At ~1535 ms/chunk × 294 chunks = ~7.5 min per 1.2 MB image. Within the 10-min watchdog from `15fc6d0`, but fixing this would drop transfers to ~2.5 min and let us reduce the watchdog back to its 5-min default.

## Suspect surface

Hypotheses, in rough probability order:

1. **USB-CDC packet aggregation on the master's USB endpoint.** Master is Metro S3 (native USB) — the USB-CDC driver waits for `bMaxPacketSize` worth of bytes OR a timeout before flushing. If we're hitting the timeout per chunk, that's where the seconds go.
2. **Kernel TTY line discipline / `n_tty` layer.** Linux's serial layer adds its own buffering on top of the driver.
3. **Node `SerialPort` library polling / write batching.** `SerialPort.write()` returns immediately but actual drain timing is opaque.
4. **Worker IPC overhead** — `bus.send` → `worker.postMessage` → `SerialPort.write` chain involves structured-cloning the ~5.5 KB base64 payload + cross-thread message scheduling. Per call probably sub-ms, but adds up.
5. **Event-loop pressure from WS emits.** Every `onChunkAck` submits to the throttle; the throttle flushes up to 4 emits/sec; each emit serializes JSON + loops through WS clients. Plausibly tens of ms per chunk under load.

## First investigative steps

Before designing a fix, **measure**:

1. **Add DIAG logging inside `ChunkStreamer.sendChunk` at `chunk_streamer.ts:308`** — log `seq + Date.now()` just before `bus.send`. Compare to the existing `handleFwChunkAck` arrival timestamps in the server log. The gap between "ACK arrived for seq N" and "send issued for seq N+1" answers whether the delay is in the streamer/event-loop OR downstream in the worker / SerialPort / kernel chain.
   - If delay is on the streamer side → look at WS emit pressure, throttle behavior, event-loop blocking.
   - If "send issued" and "ACK arrived" are tight but bytes-on-wire arrival at the ESP is delayed → it's the worker / SerialPort / kernel / USB driver.

2. **Look at `SerialPort.write` drain timing.** The `serialport` npm package exposes `.drain(cb)` — calling it after every write and timing the callback would tell us how long bytes actually take to leave the host's UART buffer. Cheap to add as a diagnostic.

3. **Linux-specific: check the USB-CDC driver's polling interval.** `lsusb -v` on the master's vendor:product would tell us the endpoint's `bInterval`. If it's 1 ms we're fine; if it's higher we'd see proportional delays.

4. **Try a different master baud rate** (e.g., 230400 or 460800 if the firmware supports it) — would help differentiate "wire-rate ceiling" from "per-write overhead." Caveat: the protocol pin to 115200 baud in `platformio.ini` would need changing, which is itself a protocol change worth its own plan.

## Relevant code locations

- `astros_api/src/firmware/chunk_streamer.ts` — `sendChunk` at line ~308, `handleChunkAck` at line ~488
- `astros_api/src/firmware/serial_bus.ts` — `WorkerSerialBus.send` at line ~33
- `astros_api/src/background_tasks/serial_worker.js` — worker IPC entry point
- `astros_api/src/api_server.ts` — `SerialPort` setup at line ~593, `DelimiterParser` pipe at ~607

## Out of scope (for this stub)

- Implementing any actual fix. This stub captures the territory; the next session brainstorms approach + writes a real plan based on whatever the diagnostic measurements reveal.
- Re-enabling sliding window (`windowSize > 1`). If the host bottleneck is fixed and the wire becomes the constraint, pipelining is the next lever. Cross-reference: the sliding-window machinery is already tested and in place — see the "Removing the sliding-window machinery" entry in `20260516-1433-chunk-streamer-ack-timeout-for-full-window.md`'s Out of scope section.

## Acceptance criteria for the eventual fix

- Per-chunk round-trip at the host drops from ~1535 ms toward ~500 ms (wire-rate ceiling for stop-and-wait at 115200 baud).
- 1.2 MB image transfer completes in ~2.5-3 min instead of ~7.5 min.
- The 10-min watchdog override in `defaultStreamerFactory` can be reverted to the 5-min `TRANSPORT_DEFAULTS` default.
