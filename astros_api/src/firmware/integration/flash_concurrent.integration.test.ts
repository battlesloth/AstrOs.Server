// Integration test: concurrent flash rejection.
//
// Two assertions in one test:
//
//   (a) HTTP 409: while the first flash is hanging in the deploy phase
//       (autoAckUpload completes the upload, no scriptDeploy keeps the
//       orchestrator awaiting FW_DEPLOY_DONE forever), a second POST
//       returns 409 with { error: 'job_already_running', currentJobId }
//       matching the first flash's jobId.
//
//   (b) WS flashJobActive: with the lock still held, a SERVO_TEST message
//       (the only entry in WS_WRITE_CLASS_MESSAGE_TYPES) is rejected by
//       rejectIfLocked, which emits a flashJobActive frame back to the
//       originating client carrying error='flashJobActive' and
//       rejectedMsgType='SERVO_TEST'.
//
// Cleanup: DELETE the in-flight flash at end-of-test so the lock releases
// immediately rather than waiting 15s for the reboot timer.
//
// This is the only integration test exercising the in-flight-flash
// rejection path — every other test completes the flash cleanly.

import { describe, it, expect, afterEach } from 'vitest';
import {
  bootIntegrationHarness,
  type IntegrationHarness,
} from '../../test_harness/integration_harness.js';
import { TransmissionType } from '../../models/enums.js';
import { SerialMessageType } from '../../serial/serial_message.js';

const skipIfNotLinux = process.platform !== 'linux' ? it.skip : it;

const MASTER_SENTINEL_MAC = '00:00:00:00:00:00';
const MASTER_VARIANT = 'astros-controller-v1';
const PRE_FLASH_FW = '1.0.0';
const POST_FLASH_FW = '1.5.0';

describe('integration: concurrent flash rejection', () => {
  let harness: IntegrationHarness | undefined;

  afterEach(async () => {
    await harness?.dispose();
    harness = undefined;
  });

  skipIfNotLinux(
    'second POST during in-flight flash → 409; WS SERVO_TEST → flashJobActive frame',
    async () => {
      // 1. Boot + variant cache + upload seed.
      harness = await bootIntegrationHarness({
        masterFirmwareVersion: PRE_FLASH_FW,
        masterVariant: MASTER_VARIANT,
        masterMac: MASTER_SENTINEL_MAC,
      });
      harness.stub.writePollAck();
      await harness.waitForVariantCachePopulated(MASTER_SENTINEL_MAC, MASTER_VARIANT);

      const binBytes = Buffer.alloc(4096, 0x42);
      await harness.populateUpload({
        binBytes,
        originalFilename: 'astros-esp-1.5.0.bin',
        version: POST_FLASH_FW,
      });

      // 2. autoAckUpload completes the upload phase. NO scriptDeploy → the
      //    orchestrator sends FW_DEPLOY_BEGIN and hangs awaiting
      //    FW_DEPLOY_DONE, holding the lock the whole time.
      harness.stub.autoAckUpload({});

      // 3. POST first flash.
      const firstFlashRes = await fetch(`${harness.httpBaseUrl}/api/firmware/flash`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${harness.authToken}`,
        },
        body: JSON.stringify({ source: { kind: 'upload' } }),
      });
      expect(firstFlashRes.status).toBe(200);
      const firstFlashBody = (await firstFlashRes.json()) as { jobId: string };

      // 4. Wait for the deploy phase: stub receives FW_DEPLOY_BEGIN. Once
      //    we observe it on the wire, we know the lock is held and the
      //    orchestrator is hanging in the deploy waiter.
      await harness.stub.waitForFrame((f) => f.type === SerialMessageType.FW_DEPLOY_BEGIN, 10_000);

      // 5. Concurrent POST → 409 with currentJobId.
      const secondFlashRes = await fetch(`${harness.httpBaseUrl}/api/firmware/flash`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${harness.authToken}`,
        },
        body: JSON.stringify({ source: { kind: 'upload' } }),
      });
      expect(secondFlashRes.status).toBe(409);
      const conflictBody = (await secondFlashRes.json()) as {
        error: string;
        currentJobId: string;
      };
      expect(conflictBody.error).toBe('job_already_running');
      expect(conflictBody.currentJobId).toBe(firstFlashBody.jobId);

      // 6. Send a write-class WS message (SERVO_TEST, the only entry in
      //    WS_WRITE_CLASS_MESSAGE_TYPES) and expect a flashJobActive
      //    rejection frame back. Snapshot the buffer first so we don't
      //    match earlier flashJobActive frames if any landed.
      const snapshot = harness.receivedWsMessages.length;
      harness.wsClient.send(
        JSON.stringify({
          msgType: 'SERVO_TEST',
          data: {
            controllerAddress: MASTER_SENTINEL_MAC,
            controllerName: 'master',
            moduleSubType: 0,
            moduleIdx: 0,
            channelNumber: 0,
            value: 0,
          },
        }),
      );

      const rejectionFrame = await harness.waitForWsMessage<{
        type: number;
        error: string;
        rejectedMsgType: string;
      }>((m) => (m as { type?: unknown }).type === TransmissionType.flashJobActive, 5000, snapshot);
      expect(rejectionFrame.error).toBe('flashJobActive');
      expect(rejectionFrame.rejectedMsgType).toBe('SERVO_TEST');

      // 7. Clean up: DELETE the in-flight flash so the lock releases now
      //    rather than waiting 15s for the reboot timer.
      const cancelRes = await fetch(`${harness.httpBaseUrl}/api/firmware/flash`, {
        method: 'DELETE',
        headers: { authorization: `Bearer ${harness.authToken}` },
      });
      expect(cancelRes.status).toBe(200);

      // 8. Worker stayed healthy.
      expect(harness.workerErrors).toEqual([]);
    },
    30_000,
  );
});
