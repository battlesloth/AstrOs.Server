# QA: Controller status watchdog

**Preconditions:** server running against real hardware (master + at least one
padawan), all controllers showing UP (green) on the Status page, a browser on
the Status page with the WebSocket connected.

## Test cases

1. **Staleness → DOWN.** Power off / disconnect a single padawan (master stays
   up). Expected: within ~10 s that location's badge turns grey (DOWN); the
   others stay green.
2. **Serial unplug → all DOWN immediately.** Unplug the master's USB-serial.
   Expected: all three badges go grey effectively immediately (serial `close`
   fast-path), not after the 10 s timeout.
3. **Recovery.** Reconnect/repower. Expected: each badge returns to green on its
   next POLL_ACK (no page refresh needed).
4. **No flap during OTA flash.** Start a firmware flash. Expected: the Status
   page does NOT flip controllers to DOWN while the flash is in progress, even
   though the master reboots and goes silent > 10 s. After the flash, status
   reflects reality.
   - 4b. With a padawan ALREADY offline when the flash starts: confirm it does
     NOT flip to DOWN mid-flash (sweep suppressed for all controllers during a
     job), and DOES flip to DOWN within ~10 s AFTER the flash completes.
5. **Edge-trigger (no spam).** With a controller offline, watch the network/WS
   frames. Expected: a single `status{up:false}` per controller per outage, not
   one every 2 s.
6. **Clean shutdown.** Stop the server (SIGINT). Expected: no errors about a
   timer firing after teardown; process exits promptly (timer is unref'd).

## Negative / edge
- Master offline at page-load time still shows DOWN (store default) — unchanged.
- A controller never seen this session is never spuriously emitted.
- Recovering from a serial `close` (USB unplug of the master) requires a server
  restart — there is no serial auto-reconnect (a known non-goal); the DOWN badges
  are accurate but the remedy is operator-driven.
