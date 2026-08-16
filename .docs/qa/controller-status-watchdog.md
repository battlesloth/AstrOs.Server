# QA: Controller status watchdog

**Preconditions:** server running against real hardware (master + at least one
padawan), all controllers showing UP (green) on the Status page, a browser on
the Status page with the WebSocket connected.

## Test cases

1. **Padawan offline → DOWN (fast path via POLL_NAK).** Power off / disconnect
   a single padawan (master stays up). Expected: within a few seconds (~2–6 s:
   the master polls padawans every 4 s — its 2 s timer alternates poll and
   expire ticks — and the NAK follows 2 s after a missed poll) that location's
   badge turns grey (DOWN); the others stay green. Well before the ~10 s stale
   sweep, which remains the backstop and is what applies when the master
   itself goes silent (case 2).
   - 1b. **Log noise.** While the padawan is offline, the server log must NOT
     fill with `Invalid message received: {"type":0}` — the POLL_NAK frames
     are parsed and handled, not discarded.
2. **Serial unplug → all DOWN immediately.** Unplug the master's USB-serial.
   Expected: all three badges go grey effectively immediately (serial `close`
   fast-path), not after the 10 s timeout.
3. **Recovery.** Reconnect/repower. Expected: each badge returns to green on its
   next POLL_ACK (no page refresh needed).
4. **No flap during OTA flash.** Start a firmware flash. Expected: the Status
   page does NOT flip controllers to DOWN while the flash is in progress, even
   though the master reboots and goes silent > 10 s. After the flash, status
   reflects reality. Both DOWN paths are suppressed while a job is current:
   the stale sweep AND POLL_NAK handling.
   - 4b. Padawan going offline AROUND flash start: power it off shortly before
     or during the flash. The master suspends polling during its own OTA, so
     the in-flash NAK lands either in the narrow pre-transfer window or (more
     reliably) after the master's post-flash reboot, before the heartbeat
     releases the lock. Confirm the badge does NOT flip mid-flash (both paths
     suppressed during a job) and DOES flip to DOWN within ~2 s AFTER the lock
     releases (first un-suppressed sweep; the resumed ~4 s NAK cycle also
     re-asserts it). A padawan that went grey well before the flash simply
     stays grey throughout — no new flip to observe.
5. **Edge-trigger (no spam).** With a controller offline, watch the network/WS
   frames. Expected: a single `status{up:false}` per controller per outage —
   even though the master repeats POLL_NAK every ~4 s poll cycle.
6. **Clean shutdown.** Stop the server (SIGINT). Expected: no errors about a
   timer firing after teardown; process exits promptly (timer is unref'd).

## Negative / edge
- Master offline at page-load time still shows DOWN (store default) — unchanged.
- The sweep never spuriously emits a controller that has not acked this
  session. A POLL_NAK, by contrast, DOES mark a registered-but-never-acked
  controller DOWN (boot with a padawan already off: its badge goes grey within
  ~2 s of the first poll, no 10 s wait) — that is the active signal working.
- A POLL_NAK for a MAC not registered in the DB (e.g. a padawan paired with
  the master but never synced to the server) changes nothing in the UI and
  produces no error-level log spam.
- Recovering from a serial `close` (USB unplug of the master) requires a server
  restart — there is no serial auto-reconnect (a known non-goal); the DOWN badges
  are accurate but the remedy is operator-driven.
