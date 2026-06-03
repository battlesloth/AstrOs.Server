// Integration test: deploy-phase inactivity watchdog.
//
// Pins the contract: if FW_DEPLOY_BEGIN is sent but the master never emits
// FW_PROGRESS or FW_DEPLOY_DONE (silent master mid-deploy), the watchdog
// fires flashJobFailed{reason:'deploy_timeout'} and releases the lock within
// deployStallTimeoutMs. Without this, a bricked master mid-deploy would hold
// the JobLock forever and block every subsequent flash attempt.

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
// Short watchdog so the test completes in seconds rather than the default 90 s.
const SHORT_DEPLOY_STALL_TIMEOUT_MS = 3_000;

describe('integration: deploy-stall watchdog (silent master mid-deploy)', () => {
  let harness: IntegrationHarness | undefined;

  afterEach(async () => {
    await harness?.dispose();
    harness = undefined;
  });

  skipIfNotLinux(
    'no FW_PROGRESS/FW_DEPLOY_DONE after FW_DEPLOY_BEGIN → deploy_timeout → lockStateChanged{locked:false}',
    async () => {
      // 1. Boot with a shrunken deploy-stall timeout so the watchdog fires in
      //    ~3 s instead of the default 90 s. Pattern mirrors the reboot-timer
      //    fallback test which shrinks rebootTimeoutMs the same way.
      harness = await bootIntegrationHarness({
        masterFirmwareVersion: PRE_FLASH_FW,
        masterVariant: MASTER_VARIANT,
        masterMac: MASTER_SENTINEL_MAC,
        flashOrchestratorConfig: { deployStallTimeoutMs: SHORT_DEPLOY_STALL_TIMEOUT_MS },
      });
      harness.stub.writePollAck();
      await harness.waitForVariantCachePopulated(MASTER_SENTINEL_MAC, MASTER_VARIANT);

      // 2. Seed the upload store so the flash reaches the deploy phase.
      const binBytes = Buffer.alloc(4096, 0x42);
      await harness.populateUpload({
        binBytes,
        originalFilename: 'astros-esp-1.5.0.bin',
        version: POST_FLASH_FW,
      });

      // 3. Approach (A) — total deploy silence: configure upload auto-ack so
      //    the streamer completes and FW_DEPLOY_BEGIN is sent, but do NOT call
      //    scriptDeploy(). When FW_DEPLOY_BEGIN arrives, the stub's
      //    dispatchScriptedResponse case sees scriptDeployCfg===null and breaks
      //    without emitting any FW_PROGRESS or FW_DEPLOY_DONE. The deploy phase
      //    is silent from the start → watchdog fires after deployStallTimeoutMs.
      harness.stub.autoAckUpload({});
      // Deliberately omit harness.stub.scriptDeploy() — deploy silence is the
      // test vector. The stub emits no deploy events after FW_DEPLOY_BEGIN.

      // 4. POST /api/firmware/flash and confirm the server accepted it.
      const flashRes = await fetch(`${harness.httpBaseUrl}/api/firmware/flash`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${harness.authToken}`,
        },
        body: JSON.stringify({
          source: { kind: 'upload' },
          controllers: [MASTER_SENTINEL_MAC],
        }),
      });
      expect(flashRes.status).toBe(200);
      const flashBody = (await flashRes.json()) as { jobId: string };
      expect(flashBody.jobId).toBeTruthy();

      // 5. Wait for flashJobStarted to confirm the job is in flight, then
      //    gate on the stub receiving FW_DEPLOY_BEGIN before snapshotting.
      //    The gate deterministically confirms the deploy phase was entered
      //    and the watchdog is armed, removing upload-phase duration from
      //    the timeout budget. The snapshot is taken after the gate so the
      //    lock-release assertion below skips the connect-time
      //    lockStateChanged{locked:false} frame and only sees
      //    watchdog-driven messages.
      await harness.waitForWsMessage<{ type: number }>(
        (m) => (m as { type?: unknown }).type === TransmissionType.flashJobStarted,
        10_000,
      );
      await harness.stub.waitForFrame((f) => f.type === SerialMessageType.FW_DEPLOY_BEGIN, 10_000);
      const snapshot = harness.receivedWsMessages.length;

      // 6. Wait for flashJobFailed{reason:'deploy_timeout'}. The watchdog is
      //    already armed (FW_DEPLOY_BEGIN confirmed above), so elapsed time
      //    is only deployStallTimeoutMs + WS delivery lag.
      //    SHORT_DEPLOY_STALL_TIMEOUT_MS + 5 s is comfortably generous.
      const failed = await harness.waitForWsMessage<{
        type: number;
        data: { reason: string; jobId: string };
      }>(
        (m) =>
          (m as { type?: unknown }).type === TransmissionType.flashJobFailed &&
          (m as { data?: { reason?: string } }).data?.reason === 'deploy_timeout',
        SHORT_DEPLOY_STALL_TIMEOUT_MS + 5_000,
      );
      expect(failed.data.reason).toBe('deploy_timeout');
      expect(failed.data.jobId).toBe(flashBody.jobId);

      // 7. Wait for lockStateChanged{locked:false}. The watchdog calls
      //    failDeployPhase → failJob → releaseLock, which broadcasts the lock
      //    release in the same synchronous call — it should arrive in the same
      //    WS batch as or immediately after flashJobFailed. fromIndex=snapshot
      //    skips the connect-time lockStateChanged{locked:false} snapshot.
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
      expect(lockReleased.locked).toBe(false);

      // 8. GET /api/firmware/flash → null (lock released, no active job).
      const getRes = await fetch(`${harness.httpBaseUrl}/api/firmware/flash`, {
        headers: { authorization: `Bearer ${harness.authToken}` },
      });
      expect((await getRes.json()) as unknown).toBeNull();

      // 9. Worker and stub stayed healthy throughout.
      expect(harness.workerErrors).toEqual([]);
      expect(harness.stub.parsingErrors()).toEqual([]);
      expect(harness.pty.unexpectedExits).toEqual([]);
    },
    30_000,
  );
});
