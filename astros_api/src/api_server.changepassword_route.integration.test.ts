// Pins the route-registration placement AND the JWT gate for /changePassword.
// The handler logic is unit-tested in authentication_controller.test.ts by
// calling changePassword() directly — but that bypasses Express routing and the
// auth middleware entirely, so it cannot detect (a) the route being registered
// in a setup phase skipSerialSetup never reaches (→ 404 in prod), (b) the auth
// argument being dropped from router.post (→ unauthenticated password changes),
// or (c) the path string drifting from the client's CHANGE_PASSWORD constant.
// Only a real-ApiServer boot catches these. Mirrors
// api_server.panic_routes.integration.test.ts.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ApiServer } from './api_server.js';

describe('Change-password route registration under skipSerialSetup: true', () => {
  let server: ApiServer | undefined;

  beforeEach(() => {
    server = undefined;
  });

  afterEach(async () => {
    if (server) {
      await server.shutdown();
    }
  });

  it('registers POST /api/changePassword behind the JWT gate (401 without a token, not 404)', async () => {
    server = await ApiServer.bootstrap({
      configOverrides: {
        apiPort: 0,
        websocketPort: 0,
        jwtKey: 'integration-test-key',
        skipSerialSetup: true,
      },
    });

    const port = server.getBoundApiPort();

    // No Authorization header → the JWT middleware rejects with 401 (route
    // registered + auth ran). A 404 would mean the route was never registered;
    // a 400/403/200 would mean the auth middleware is missing and the handler
    // ran unauthenticated. Forging a token to assert the password flip is
    // covered by the handler unit tests and is out of scope for this wiring
    // smoke test.
    const res = await fetch(`http://127.0.0.1:${port}/api/changePassword`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oldPassword: 'whatever', newPassword: 'whatever123' }),
    });

    expect(res.status).toBe(401);
  });
});
