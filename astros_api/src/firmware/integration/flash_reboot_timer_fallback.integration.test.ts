// Integration test: reboot-timer fallback when NO heartbeat arrives.
//
// Pins the recovery contract: if a flash succeeds but the master never
// emits a heartbeat POLL_ACK (bricked, partitioned, or just slow), the
// reboot timer is the only path to lock release. Without this, an
// operator's next flash attempt would be permanently blocked.

import { describe, it, expect, afterEach } from 'vitest';
import {
  bootIntegrationHarness,
  type IntegrationHarness,
} from '../../test_harness/integration_harness.js';
import { TransmissionType } from '../../models/enums.js';

const skipIfNotLinux = process.platform !== 'linux' ? it.skip : it;

const MASTER_SENTINEL_MAC = '00:00:00:00:00:00';
const MASTER_VARIANT = 'astros-controller-v1';
const PRE_FLASH_FW = '1.0.0';
const POST_FLASH_FW = '1.5.0';
const SHORT_REBOOT_TIMEOUT_MS = 1000;

describe('integration: reboot-timer fallback (no heartbeat)', () => {
  let harness: IntegrationHarness | undefined;

  afterEach(async () => {
    await harness?.dispose();
    harness = undefined;
  });

  skipIfNotLinux(
    'no POLL_ACK after flashJobDone → timer fallback fires → lockStateChanged{locked:false}',
    async () => {
      // 1. Boot with shrunken reboot timer so the test completes in seconds.
      harness = await bootIntegrationHarness({
        masterFirmwareVersion: PRE_FLASH_FW,
        masterVariant: MASTER_VARIANT,
        masterMac: MASTER_SENTINEL_MAC,
        flashOrchestratorConfig: { rebootTimeoutMs: SHORT_REBOOT_TIMEOUT_MS },
      });
      harness.stub.writePollAck();
      await harness.waitForVariantCachePopulated(MASTER_SENTINEL_MAC, MASTER_VARIANT);

      // 2. Seed upload + happy stub setup so the flash reaches flashJobDone.
      const binBytes = Buffer.alloc(4096, 0x42);
      await harness.populateUpload({
        binBytes,
        originalFilename: 'astros-esp-1.5.0.bin',
        version: POST_FLASH_FW,
      });
      harness.stub.autoAckUpload({});
      harness.stub.scriptDeploy({
        controllers: [
          {
            id: MASTER_SENTINEL_MAC,
            outcome: 'OK',
            finalVersion: POST_FLASH_FW,
            error: '',
          },
        ],
      });

      // 3. POST flash + wait for flashJobDone.
      const flashRes = await fetch(`${harness.httpBaseUrl}/api/firmware/flash`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${harness.authToken}`,
        },
        body: JSON.stringify({ source: { kind: 'upload' } }),
      });
      expect(flashRes.status).toBe(200);
      const flashBody = (await flashRes.json()) as { jobId: string };

      const doneEvent = await harness.waitForWsMessage<{
        type: number;
        data: { jobId: string };
      }>(
        (m) =>
          (m as { type?: unknown }).type === TransmissionType.flashJobDone &&
          (m as { data?: { jobId?: unknown } }).data?.jobId === flashBody.jobId,
        10_000,
      );
      expect(doneEvent.data.jobId).toBe(flashBody.jobId);

      // 4. Snapshot the moment flashJobDone resolved + WS index.
      //    DELIBERATELY emit NO POLL_ACK after this — the test pins the
      //    timer-only release path.
      const doneAt = Date.now();
      const snapshot = harness.receivedWsMessages.length;

      // 5. Wait for lock release. The reboot timer is the only path; with
      //    SHORT_REBOOT_TIMEOUT_MS=1000, the lock should release ~1s after
      //    flashJobDone. The lower bound of 800ms is the load-bearing
      //    assertion: it proves the lock did NOT release immediately
      //    (which would indicate the timer didn't arm or fired
      //    prematurely). Upper bound 4000ms tolerates slow CI.
      const lockReleased = await harness.waitForWsMessage<{
        type: number;
        locked: boolean;
      }>(
        (m) => {
          const msg = m as { type?: unknown; locked?: unknown };
          return msg.type === TransmissionType.lockStateChanged && msg.locked === false;
        },
        5000,
        snapshot,
      );
      const releasedAt = Date.now();
      expect(lockReleased.locked).toBe(false);
      const deltaMs = releasedAt - doneAt;
      expect(deltaMs).toBeGreaterThanOrEqual(800);
      expect(deltaMs).toBeLessThan(4000);

      // 6. GET → null.
      const getRes = await fetch(`${harness.httpBaseUrl}/api/firmware/flash`, {
        headers: { authorization: `Bearer ${harness.authToken}` },
      });
      expect((await getRes.json()) as unknown).toBeNull();

      // 7. Worker stayed healthy.
      expect(harness.workerErrors).toEqual([]);
    },
    30_000,
  );
});
