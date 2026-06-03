// Pins the route-registration placement for firmware routes that DON'T need the
// serial Worker — currently GET /api/firmware/lock-state and GET
// /api/firmware/releases. Both depend on services built before setupSerialPort()
// (jobLock at field-init, githubReleaseService in configApi), so both must
// register inside setRoutes() rather than setupSerialPort(); otherwise they
// return 404 under `skipSerialSetup: true` (NODE_ENV=test default + any future
// no-hardware boot mode).
//
// The first version of this branch made exactly that mistake for the lock-state
// route, and the partial-fix-sweep review caught the same mispattern on the
// releases route. The handler-only unit tests next door drive the handler
// functions directly and cannot detect wiring placement — only an integration
// test that boots a real ApiServer with `skipSerialSetup: true` can.
//
// The releases route is authenticated, so this test issues an unauth GET and
// asserts 401 (route registered + auth middleware ran, but rejected) rather
// than 404 (route never registered). Using 401-vs-404 keeps the test from
// needing to forge a JWT.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ApiServer } from '../api_server.js';

describe('Firmware route registration under skipSerialSetup: true', () => {
  let server: ApiServer | undefined;

  beforeEach(() => {
    server = undefined;
  });

  afterEach(async () => {
    if (server) {
      await server.shutdown();
    }
  });

  it('registers GET /api/firmware/lock-state and GET /api/firmware/releases', async () => {
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

    // Lock-state is unauthenticated (mirrors /api/system/status) — expect 200.
    const lockStateRes = await fetch(`http://127.0.0.1:${port}/api/firmware/lock-state`);
    expect(lockStateRes.status).toBe(200);
    const body = (await lockStateRes.json()) as {
      locked: boolean;
      owner: unknown;
      since: unknown;
    };
    expect(body.locked).toBe(false);
    expect(body.owner).toBeNull();
    expect(body.since).toBeNull();

    // Releases requires auth — without a token the JWT middleware rejects with
    // 401. That's enough to confirm the route is registered (a 404 would mean
    // it's not). Forging a token to assert 200 is out of scope for a wiring
    // smoke test; the unit test next door (`firmware_releases_controller.test.ts`)
    // exercises the happy-path handler.
    const releasesRes = await fetch(`http://127.0.0.1:${port}/api/firmware/releases`);
    expect(releasesRes.status).toBe(401);
  });
});
