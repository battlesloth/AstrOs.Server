// Integration: POLL_NAK → immediate DOWN broadcast (T-001).
//
// Drives the full path: stub master writes a POLL_NAK frame over the PTY →
// serial worker parses and posts PollNakResponse → main thread looks up the
// controller, feeds ControllerWatchdog.recordNak, and broadcasts a DOWN
// StatusResponse over WS.
//
// Each frame is written only after the previous frame's broadcast has been
// awaited, so ordering is deterministic. The repeat-NAK dedup (no second DOWN
// while already down) is deliberately NOT asserted here: a back-to-back
// NAK+ACK write would race the two un-awaited async handlers on the main
// thread, making the assertion flaky either way. The dedup is pinned by the
// ControllerWatchdog unit tests instead.

import { describe, it, expect, afterEach } from 'vitest';
import {
  bootIntegrationHarness,
  type IntegrationHarness,
} from '../../test_harness/integration_harness.js';
import { createKyselyConnection } from '../../dal/database.js';
import { ControllerRepository } from '../../dal/repositories/controller_repository.js';
import { LocationsRepository } from '../../dal/repositories/locations_repository.js';
import { TransmissionType } from '../../models/enums.js';

const skipIfNotLinux = process.platform !== 'linux' ? it.skip : it;

const PADAWAN_MAC = 'AA:BB:CC:DD:EE:11';
const PADAWAN_NAME = 'dome';
const UNSEEDED_MAC = 'AA:BB:CC:DD:EE:99';

// Master identity for the NAK-during-flash case (mirrors flash_happy_upload).
const MASTER_SENTINEL_MAC = '00:00:00:00:00:00';
const MASTER_VARIANT = 'astros-controller-v1';
const PRE_FLASH_FW = '1.0.0';
const POST_FLASH_FW = '1.5.0';

// Register a padawan controller and link it to the dome location, via the
// real repositories on a second connection to the harness's SQLite file.
async function seedPadawan(harness: IntegrationHarness): Promise<void> {
  const conn = createKyselyConnection(harness.databasePath);
  try {
    const controllers = new ControllerRepository(conn.db);
    await controllers.insertControllers([{ id: '', name: PADAWAN_NAME, address: PADAWAN_MAC }]);
    const controller = await controllers.getControllerByAddress(PADAWAN_MAC);
    if (controller === null) throw new Error('seedPadawan: controller insert failed');

    const locations = new LocationsRepository(conn.db);
    const dome = (await locations.getLocations()).find((l) => l.locationName === 'dome');
    if (dome === undefined) throw new Error('seedPadawan: dome location not seeded');
    await conn.db
      .transaction()
      .execute((trx) => locations.setLocationController(trx, dome.id, controller.id));
  } finally {
    conn.raw.close();
  }
}

interface StatusMsg {
  type: number;
  controllerAddress: string;
  up: boolean;
}

const statusFor =
  (mac: string, up: boolean) =>
  (m: unknown): boolean => {
    const s = m as Partial<StatusMsg>;
    return s?.type === TransmissionType.status && s.controllerAddress === mac && s.up === up;
  };

describe('integration: POLL_NAK marks a padawan DOWN', () => {
  let harness: IntegrationHarness | undefined;

  afterEach(async () => {
    await harness?.dispose();
    harness = undefined;
  });

  skipIfNotLinux(
    'NAK broadcasts DOWN, ACK recovers, NAK re-arms; unknown MAC is ignored',
    async () => {
      harness = await bootIntegrationHarness();
      await seedPadawan(harness);

      // 1. Unknown-MAC NAK first: must neither crash the server nor emit a
      //    status (absence asserted at the end, after ordered fences).
      harness.stub.writePollNak({ mac: UNSEEDED_MAC, name: 'ghost', msgId: 'na' });

      // 2. NAK for the seeded padawan → DOWN broadcast.
      let snapshot = harness.receivedWsMessages.length;
      harness.stub.writePollNak({ mac: PADAWAN_MAC, name: PADAWAN_NAME, msgId: 'na' });
      const down = await harness.waitForWsMessage<StatusMsg>(
        statusFor(PADAWAN_MAC, false),
        5000,
        snapshot,
      );
      expect(down.up).toBe(false);

      // 3. Recovery ACK → up:true broadcast (and re-arms the NAK trigger).
      snapshot = harness.receivedWsMessages.length;
      harness.stub.writePollAck({ mac: PADAWAN_MAC });
      await harness.waitForWsMessage<StatusMsg>(statusFor(PADAWAN_MAC, true), 5000, snapshot);

      // 4. NAK after recovery → a second DOWN (edge trigger re-armed).
      snapshot = harness.receivedWsMessages.length;
      harness.stub.writePollNak({ mac: PADAWAN_MAC, name: PADAWAN_NAME, msgId: 'na' });
      await harness.waitForWsMessage<StatusMsg>(statusFor(PADAWAN_MAC, false), 5000, snapshot);

      // 5. The unknown-MAC NAK produced no status at any point. Its handler
      //    ran before every awaited fence above (FIFO serial → worker → WS),
      //    so by now its broadcast would have arrived if the bug existed.
      const ghostStatuses = harness.receivedWsMessages.filter(
        (m) => (m as Partial<StatusMsg>).controllerAddress === UNSEEDED_MAC,
      );
      expect(ghostStatuses).toEqual([]);

      expect(harness.workerErrors).toEqual([]);
      expect(harness.pty.unexpectedExits).toEqual([]);
    },
    30_000,
  );

  // QA controller-status-watchdog case 4: no status flapping during an OTA
  // flash. The stale sweep is suppressed while a job is current; POLL_NAK
  // must be suppressed the same way or padawans rebooting mid-flash would
  // flip badges the sweep deliberately holds steady.
  skipIfNotLinux(
    'NAK during an active flash is suppressed; NAK after lock release broadcasts',
    async () => {
      harness = await bootIntegrationHarness({
        masterFirmwareVersion: PRE_FLASH_FW,
        masterVariant: MASTER_VARIANT,
        masterMac: MASTER_SENTINEL_MAC,
      });
      await seedPadawan(harness);

      // Flash preconditions (mirrors flash_happy_upload): variant cache,
      // upload fixture, stub auto-responses for transfer + deploy.
      harness.stub.writePollAck();
      await harness.waitForVariantCachePopulated(MASTER_SENTINEL_MAC, MASTER_VARIANT);
      await harness.populateUpload({
        binBytes: Buffer.alloc(4096, 0x42),
        originalFilename: 'astros-esp-1.5.0.bin',
        version: POST_FLASH_FW,
      });
      harness.stub.autoAckUpload({});
      harness.stub.scriptDeploy({
        controllers: [
          { id: MASTER_SENTINEL_MAC, outcome: 'OK', finalVersion: POST_FLASH_FW, error: '' },
        ],
      });

      const flashRes = await fetch(`${harness.httpBaseUrl}/api/firmware/flash`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${harness.authToken}`,
        },
        body: JSON.stringify({ source: { kind: 'upload' }, controllers: [MASTER_SENTINEL_MAC] }),
      });
      expect(flashRes.status).toBe(200);

      // NAK the padawan while the job is current (job registration precedes
      // the 200; the transfer keeps the job current for seconds after this).
      harness.stub.writePollNak({ mac: PADAWAN_MAC, name: PADAWAN_NAME, msgId: 'na' });

      // Ride out the flash: done event, then heartbeat-driven lock release.
      // The job stays current until the release, so both fences sit strictly
      // after the NAK above was processed (FIFO serial → worker → handler).
      await harness.waitForWsMessage(
        (m) => (m as { type?: unknown }).type === TransmissionType.flashJobDone,
        10_000,
      );
      let snapshot = harness.receivedWsMessages.length;
      harness.stub.writePollAck({ firmwareVersion: POST_FLASH_FW });
      await harness.waitForWsMessage(
        (m) => {
          const msg = m as { type?: unknown; locked?: unknown };
          return msg.type === TransmissionType.lockStateChanged && msg.locked === false;
        },
        5000,
        snapshot,
      );

      // The during-flash NAK must not have produced a DOWN.
      expect(harness.receivedWsMessages.filter(statusFor(PADAWAN_MAC, false))).toEqual([]);

      // With the lock released, the same NAK now broadcasts DOWN.
      snapshot = harness.receivedWsMessages.length;
      harness.stub.writePollNak({ mac: PADAWAN_MAC, name: PADAWAN_NAME, msgId: 'na' });
      await harness.waitForWsMessage<StatusMsg>(statusFor(PADAWAN_MAC, false), 5000, snapshot);

      expect(harness.workerErrors).toEqual([]);
      expect(harness.pty.unexpectedExits).toEqual([]);
    },
    60_000,
  );
});
