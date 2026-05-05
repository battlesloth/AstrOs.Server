// c.6c.2 Task 10 — heartbeat-vs-reboot-timer first-fire-wins integration tests.
//
// Two scenarios:
//   1. matching-version POLL_ACK heartbeat releases the lock fast (well under
//      the 15s reboot-timer threshold).
//   2. wrong-version POLL_ACK heartbeat is filtered by
//      decidePostDeployHeartbeat → the timer fallback is what releases the
//      lock (asserted via wall-clock lower bound, the load-bearing piece).

import { describe, it, expect, afterEach } from 'vitest';
import {
  bootIntegrationHarness,
  type IntegrationHarness,
} from '../../test_harness/integration_harness.js';
import { TransmissionType } from '../../models/enums.js';

const skipIfNotPosix = process.platform === 'win32' ? it.skip : it;

const MASTER_SENTINEL_MAC = '00:00:00:00:00:00';
const MASTER_VARIANT = 'astros-controller-v1';
const PRE_FLASH_FW = '1.0.0';
const POST_FLASH_FW = '1.5.0';
// Shrunk reboot timer so the wrong-version test's timer-fallback path
// completes in ~1s rather than the production 15s.
const SHORT_REBOOT_TIMEOUT_MS = 1000;

describe('integration: heartbeat vs reboot-timer', () => {
  let harness: IntegrationHarness | undefined;

  afterEach(async () => {
    await harness?.dispose();
    harness = undefined;
  });

  skipIfNotPosix(
    'matching-version POLL_ACK heartbeat releases lock well under reboot timer',
    async () => {
      // 1. Boot — production 15s reboot timer (default). Test asserts the
      //    heartbeat fires before the timer.
      harness = await bootIntegrationHarness({
        masterFirmwareVersion: PRE_FLASH_FW,
        masterVariant: MASTER_VARIANT,
        masterMac: MASTER_SENTINEL_MAC,
      });
      harness.stub.writePollAck();
      await harness.waitForVariantCachePopulated(MASTER_SENTINEL_MAC, MASTER_VARIANT);

      // 2. Seed upload + configure stub for happy path.
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
      }>((m) => (m as { type?: unknown }).type === TransmissionType.flashJobDone, 10_000);
      expect(doneEvent.data.jobId).toBe(flashBody.jobId);

      // 4. Snapshot the timestamp + WS index.
      const heartbeatStartedAt = Date.now();
      const snapshot = harness.receivedWsMessages.length;

      // 5. Master heartbeat with matching version.
      harness.stub.writePollAck({ firmwareVersion: POST_FLASH_FW });

      // 6. Lock release — should arrive within ~1-2s, well below the
      //    15-sec timer threshold. Assert delta < 3000ms (generous
      //    headroom for slow CI). If this assertion fires, the
      //    heartbeat path is broken and the timer fallback released
      //    instead.
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
      const deltaMs = releasedAt - heartbeatStartedAt;
      expect(deltaMs).toBeLessThan(3000);

      expect(harness.workerErrors).toEqual([]);
    },
    30_000,
  );

  skipIfNotPosix(
    'wrong-version POLL_ACK heartbeat is ignored → timer fallback releases lock',
    async () => {
      // 1. Boot with shrunken reboot timer so the timer-fallback path
      //    completes in ~1s rather than 15s.
      harness = await bootIntegrationHarness({
        masterFirmwareVersion: PRE_FLASH_FW,
        masterVariant: MASTER_VARIANT,
        masterMac: MASTER_SENTINEL_MAC,
        flashOrchestratorConfig: { rebootTimeoutMs: SHORT_REBOOT_TIMEOUT_MS },
      });
      harness.stub.writePollAck();
      await harness.waitForVariantCachePopulated(MASTER_SENTINEL_MAC, MASTER_VARIANT);

      // 2. Seed + happy stub setup (same as test 1).
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

      await harness.waitForWsMessage(
        (m) =>
          (m as { type?: unknown }).type === TransmissionType.flashJobDone &&
          (m as { data?: { jobId?: unknown } }).data?.jobId === flashBody.jobId,
        10_000,
      );

      // 4. Master heartbeat with WRONG version (still pre-flash).
      //    decidePostDeployHeartbeat returns 'version_mismatch'; orchestrator
      //    does NOT clear the reboot timer.
      const wrongVersionAt = Date.now();
      const snapshot = harness.receivedWsMessages.length;
      harness.stub.writePollAck({ firmwareVersion: PRE_FLASH_FW }); // wrong version!

      // 5. Lock release should arrive via the timer fallback (~1s with our
      //    override). NOT before — this proves the wrong-version POLL_ACK
      //    was correctly ignored.
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
      const deltaMs = releasedAt - wrongVersionAt;
      // Released via timer fallback — expected ~SHORT_REBOOT_TIMEOUT_MS
      // (1000ms). Generous lower bound (>= 800ms) to prove the heartbeat
      // didn't release; generous upper bound (< 4000ms) for CI slowness.
      expect(deltaMs).toBeGreaterThanOrEqual(800);
      expect(deltaMs).toBeLessThan(4000);

      expect(harness.workerErrors).toEqual([]);
    },
    30_000,
  );
});
