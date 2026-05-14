// Pins the route-registration placement for GET /api/firmware/lock-state.
//
// The handler-only unit test next door (`firmware_lock_state_controller.test.ts`)
// drives `getLockState` directly — it cannot detect whether `ApiServer` actually
// mounts the route. The first version of this branch registered the route inside
// `setupSerialPort()`, which is skipped when `skipSerialSetup === true` (the
// default in NODE_ENV=test and any future no-hardware boot). That made the
// endpoint return 404 in test/no-hardware environments — defeating the entire
// purpose of the hydrate, which is to populate the lock store BEFORE the WS
// handshake completes. This test boots a real `ApiServer` with
// `skipSerialSetup: true`, fetches the endpoint, and asserts 200 — so a future
// move back into `setupSerialPort` (or any other code path that skips when
// serial does) trips the test before it ships.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ApiServer } from '../api_server.js';

describe('GET /api/firmware/lock-state — route registration', () => {
  let server: ApiServer | undefined;

  beforeEach(() => {
    server = undefined;
  });

  afterEach(async () => {
    if (server) {
      await server.shutdown();
    }
  });

  it('is registered even when serial setup is skipped (NODE_ENV=test path)', async () => {
    // Ephemeral ports + in-memory DB (NODE_ENV=test) + skipSerialSetup so the
    // boot is hermetic and finishes in milliseconds — no PTY, no stub master.
    // The fixed-string jwtKey avoids reading process.env.JWT_KEY (which the
    // integration harness deliberately bypasses for the same reason).
    server = await ApiServer.bootstrap({
      configOverrides: {
        apiPort: 0,
        websocketPort: 0,
        jwtKey: 'integration-test-key',
        skipSerialSetup: true,
      },
    });

    const port = server.getBoundApiPort();
    const res = await fetch(`http://127.0.0.1:${port}/api/firmware/lock-state`);

    expect(res.status).toBe(200);
    const body = (await res.json()) as { locked: boolean; owner: unknown; since: unknown };
    expect(body.locked).toBe(false);
    expect(body.owner).toBeNull();
    expect(body.since).toBeNull();
  });
});
