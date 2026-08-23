// Cross-platform unit coverage for ApiServer.handlePollNak. The PTY
// integration tests (src/serial/integration/poll_nak_down.integration.test.ts)
// are Linux-gated and assert via WS traffic, which cannot distinguish "guard
// returned early" from "guard missing, threw, and the catch swallowed it" —
// so the non-broadcast branches and the recordNak gating are pinned here with
// spies, on every platform.
//
// Hermetic boot: in-memory DB (NODE_ENV=test), skipSerialSetup, ephemeral
// ports — mirrors api_server.panic_routes.integration.test.ts. The seeding
// reuses the real repositories against the getDb() singleton the server
// itself opened.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';
import { ApiServer } from './api_server.js';
import { getDb } from './dal/database.js';
import { ControllerRepository } from './dal/repositories/controller_repository.js';
import { LocationsRepository } from './dal/repositories/locations_repository.js';
import { SerialWorkerResponseType, type PollNakResponse } from './serial/serial_worker_response.js';
import { logger } from './logger.js';

const LINKED_MAC = 'AA:BB:CC:DD:EE:21';
const NO_LOCATION_MAC = 'AA:BB:CC:DD:EE:22';
const UNKNOWN_MAC = 'AA:BB:CC:DD:EE:23';

function nak(mac: string, name = 'padawan'): PollNakResponse {
  return { type: SerialWorkerResponseType.POLL_NAK, controller: { address: mac, name } };
}

describe('ApiServer.handlePollNak', () => {
  let server: ApiServer;
  let updateClientsSpy: MockInstance;
  let errorSpy: MockInstance;
  let warnSpy: MockInstance;

  beforeEach(async () => {
    server = await ApiServer.bootstrap({
      configOverrides: {
        apiPort: 0,
        websocketPort: 0,
        jwtKey: 'poll-nak-test-key',
        skipSerialSetup: true,
      },
    });

    const db = getDb();
    const controllers = new ControllerRepository(db);
    await controllers.insertControllers([
      { id: '', name: 'dome', address: LINKED_MAC },
      { id: '', name: 'orphan', address: NO_LOCATION_MAC },
    ]);
    const linked = await controllers.getControllerByAddress(LINKED_MAC);
    if (linked === null) throw new Error('seed failed: linked controller not inserted');

    const locations = new LocationsRepository(db);
    const dome = (await locations.getLocations()).find((l) => l.locationName === 'dome');
    if (dome === undefined) throw new Error('seed failed: dome location missing');
    await db
      .transaction()
      .execute((trx) => locations.setLocationController(trx, dome.id, linked.id));

    // Spies attach after boot so bootstrap noise cannot pollute assertions.
    updateClientsSpy = vi
      .spyOn(server as unknown as { updateClients: (msg: unknown) => void }, 'updateClients')
      .mockImplementation(() => undefined);
    errorSpy = vi.spyOn(logger, 'error');
    warnSpy = vi.spyOn(logger, 'warn');
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await server.shutdown();
  });

  it('broadcasts DOWN once for a linked controller; repeat NAKs are gated on recordNak', async () => {
    await server.handlePollNak(nak(LINKED_MAC, 'dome'));

    expect(updateClientsSpy).toHaveBeenCalledTimes(1);
    expect(updateClientsSpy.mock.calls[0][0]).toMatchObject({
      controllerAddress: LINKED_MAC,
      controllerLocation: 'dome',
      up: false,
    });

    // The master repeats the NAK every poll cycle for the whole outage — the
    // broadcast must not repeat with it.
    await server.handlePollNak(nak(LINKED_MAC, 'dome'));
    await server.handlePollNak(nak(LINKED_MAC, 'dome'));
    expect(updateClientsSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('unknown MAC: no broadcast and no error-level log (guard, not a swallowed throw)', async () => {
    await server.handlePollNak(nak(UNKNOWN_MAC, 'ghost'));

    expect(updateClientsSpy).not.toHaveBeenCalled();
    // Distinguishes the null-guard from its mutation: without the guard,
    // controller.id throws and the catch logs at error level.
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('registered controller without a location: no broadcast, one warn per process', async () => {
    await server.handlePollNak(nak(NO_LOCATION_MAC, 'orphan'));
    await server.handlePollNak(nak(NO_LOCATION_MAC, 'orphan'));

    expect(updateClientsSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0][0])).toContain(NO_LOCATION_MAC);
  });
});
