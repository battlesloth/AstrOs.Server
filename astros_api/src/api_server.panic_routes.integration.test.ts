// Pins the route-registration placement for the panic-state routes. The handler
// logic is unit-tested next door (animation_queue.test.ts proves the observable;
// the frontend store/handler tests prove the client side), but those CANNOT
// detect wiring placement — a route registered in the wrong setup phase returns
// 404 under `skipSerialSetup: true`. Only a real-ApiServer boot catches it.
// Mirrors firmware_lock_state_controller.integration.test.ts.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ApiServer } from './api_server.js';

describe('Panic-state route registration under skipSerialSetup: true', () => {
  let server: ApiServer | undefined;

  beforeEach(() => {
    server = undefined;
  });

  afterEach(async () => {
    if (server) {
      await server.shutdown();
    }
  });

  it('registers GET /api/panicState (unauth) and POST /api/panicClear (auth)', async () => {
    // Ephemeral ports + in-memory DB (NODE_ENV=test) + skipSerialSetup → a
    // hermetic boot that finishes in milliseconds (no PTY, no stub master).
    server = await ApiServer.bootstrap({
      configOverrides: {
        apiPort: 0,
        websocketPort: 0,
        jwtKey: 'integration-test-key',
        skipSerialSetup: true,
      },
    });

    const port = server.getBoundApiPort();

    // GET /panicState is unauthenticated (mirrors /system/status, /lock-state) —
    // expect 200 with the fresh-boot state. A 404 here would mean the route was
    // registered in a setup phase that skipSerialSetup never reaches.
    const stateRes = await fetch(`http://127.0.0.1:${port}/api/panicState`);
    expect(stateRes.status).toBe(200);
    const body = (await stateRes.json()) as { inPanicStop: boolean };
    expect(body.inPanicStop).toBe(false);

    // POST /panicClear requires auth — without a token the JWT middleware
    // rejects with 401 (route registered + auth ran), not 404 (never
    // registered). Forging a token to assert the state flip is out of scope for
    // a wiring smoke test.
    const clearRes = await fetch(`http://127.0.0.1:${port}/api/panicClear`, { method: 'POST' });
    expect(clearRes.status).toBe(401);
  });
});
