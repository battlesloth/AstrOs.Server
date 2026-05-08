// Integration test: per-controller deploy mixed OK/FAILED outcomes.
//
// Pins the orchestrator's `deriveJobLifecycle` contract: when every
// controller reaches a terminal stage, the job lifecycle is `'done'`
// regardless of the OK/Failed mix. The job-wide WS event is
// `flashJobDone` — NOT `flashJobFailed`. Per-controller failures are
// local to that controller's `flashControllerResult`; `flashJobFailed`
// is reserved for job-wide aborts.
//
// Sequence covered:
//   1. Pre-populate variantCache for BOTH master sentinel + one padawan
//   2. Pre-populate upload store with a 4KB firmware blob
//   3. POST /api/firmware/flash kind=upload with two targets
//   4. Stub scriptDeploy emits FW_PROGRESS per controller, then a single
//      FW_DEPLOY_DONE with results=[master OK, padawan FAILED]
//   5. flashControllerResult fires twice: master VersionConfirmed,
//      padawan Failed
//   6. flashJobDone fires (load-bearing); flashJobFailed never fires
//   7. Master POLL_ACK with deployed version → heartbeat releases lock
//   8. workerErrors empty

import { describe, it, expect, afterEach } from 'vitest';
import {
  bootIntegrationHarness,
  type IntegrationHarness,
} from '../../test_harness/integration_harness.js';
import { TransmissionType } from '../../models/enums.js';
import { FwStage } from '../../models/firmware/firmware_messages.js';

const skipIfNotLinux = process.platform !== 'linux' ? it.skip : it;

const MASTER_SENTINEL_MAC = '00:00:00:00:00:00';
const PADAWAN_MAC = 'aa:bb:cc:dd:ee:ff';
const VARIANT = 'astros-controller-v1';
const PRE_FLASH_FW = '1.0.0';
const POST_FLASH_FW = '1.5.0';
const PADAWAN_ERROR = 'crc_mismatch';

describe('integration: per-controller deploy mixed OK/FAILED', () => {
  let harness: IntegrationHarness | undefined;

  afterEach(async () => {
    await harness?.dispose();
    harness = undefined;
  });

  skipIfNotLinux(
    'master OK + padawan FAILED → flashJobDone (NOT failed) → master heartbeat releases lock',
    async () => {
      // 1. Boot harness configured for the master only. Both controllers
      //    share the same variant; the padawan is introduced via a
      //    second POLL_ACK below.
      harness = await bootIntegrationHarness({
        masterFirmwareVersion: PRE_FLASH_FW,
        masterVariant: VARIANT,
        masterMac: MASTER_SENTINEL_MAC,
      });

      // 2. Pre-populate the controllerVariantCache for BOTH controllers.
      //    All POLL_ACKs flow through the master end of the PTY on the
      //    wire — we just override the `mac` arg per call so each frame
      //    represents a different controller. The harness's
      //    `waitForVariantCachePopulated` is keyed by MAC and lets us
      //    deterministically wait for each insertion.
      //
      //    Insertion order matters: Map iteration is insertion-order in
      //    JS, so master is inserted first → listFlashTargets() returns
      //    [master, padawan] in that order. The test sorts both sides
      //    of the targets assertion for tolerance.
      harness.stub.writePollAck();
      await harness.waitForVariantCachePopulated(MASTER_SENTINEL_MAC, VARIANT);
      harness.stub.writePollAck({ mac: PADAWAN_MAC, variant: VARIANT });
      await harness.waitForVariantCachePopulated(PADAWAN_MAC, VARIANT);

      // 3. Seed the upload store. Same shape as the happy-path test;
      //    the bytes are arbitrary because the streamer's hash check
      //    sees the harness-written sidecar sha256.
      const binBytes = Buffer.alloc(4096, 0x42);
      await harness.populateUpload({
        binBytes,
        originalFilename: 'astros-esp-1.5.0.bin',
        version: POST_FLASH_FW,
      });

      // 4. Configure stub responses. Upload succeeds for both
      //    controllers (the binary is uploaded once to the master and
      //    distributed). scriptDeploy carries mixed outcomes: master
      //    OK with finalVersion, padawan FAILED with error. The stub
      //    emits FW_PROGRESS frames per controller through the default
      //    Sending → Verifying → Rebooting stage progression, then ONE
      //    FW_DEPLOY_DONE whose results[] array has both entries.
      harness.stub.autoAckUpload({});
      harness.stub.scriptDeploy({
        controllers: [
          {
            id: MASTER_SENTINEL_MAC,
            outcome: 'OK',
            finalVersion: POST_FLASH_FW,
            error: '',
          },
          {
            id: PADAWAN_MAC,
            outcome: 'FAILED',
            finalVersion: '',
            error: PADAWAN_ERROR,
          },
        ],
      });

      // 5. POST flash. Targets order is variant-cache insertion order
      //    (master first, padawan second). Sorting both sides of the
      //    assertion keeps the test tolerant to a future change in
      //    iteration order without losing the membership check.
      const flashRes = await fetch(`${harness.httpBaseUrl}/api/firmware/flash`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${harness.authToken}`,
        },
        body: JSON.stringify({ source: { kind: 'upload' } }),
      });
      expect(flashRes.status).toBe(200);
      const flashBody = (await flashRes.json()) as {
        jobId: string;
        targets: string[];
      };
      expect(flashBody.jobId).toBeTruthy();
      expect(flashBody.targets.slice().sort()).toEqual(
        [MASTER_SENTINEL_MAC, PADAWAN_MAC].slice().sort(),
      );

      // 6. flashJobStarted.
      const startedEvent = await harness.waitForWsMessage<{
        type: number;
        data: { jobId: string };
      }>((m) => (m as { type?: unknown }).type === TransmissionType.flashJobStarted, 5000);
      expect(startedEvent.data.jobId).toBe(flashBody.jobId);

      // 7. flashJobDone — the load-bearing assertion. Mixed terminal
      //    outcomes do NOT promote the job to flashJobFailed;
      //    deriveJobLifecycle returns 'done' as long as every
      //    controller is in a terminal stage. A regression that flipped
      //    this to flashJobFailed would time out here.
      const doneEvent = await harness.waitForWsMessage<{
        type: number;
        data: { jobId: string };
      }>((m) => (m as { type?: unknown }).type === TransmissionType.flashJobDone, 10_000);
      expect(doneEvent.data.jobId).toBe(flashBody.jobId);

      // 8. Per-controller flashControllerResult events. Two terminal
      //    transitions, one per controller:
      //      * master  → VersionConfirmed (finalVersion=POST_FLASH_FW)
      //      * padawan → Failed (error=PADAWAN_ERROR)
      //
      //    Note: scriptDeploy's per-stage FW_PROGRESS frames generate
      //    `flashControllerUpdate` events (Sending/Verifying/Rebooting
      //    × 2 controllers = 6 events on the WS bus); the terminal
      //    transitions are the separate `flashControllerResult` stream.
      type ControllerResult = {
        type: number;
        data: {
          jobId: string;
          controller: {
            controllerId: string;
            stage: FwStage;
            error?: string;
            finalVersion?: string;
          };
        };
      };
      const controllerResults = harness.receivedWsMessages.filter(
        (m) => (m as { type?: unknown }).type === TransmissionType.flashControllerResult,
      ) as ControllerResult[];

      expect(controllerResults.length).toBe(2);

      const masterResult = controllerResults.find(
        (r) => r.data.controller.controllerId === MASTER_SENTINEL_MAC,
      );
      const padawanResult = controllerResults.find(
        (r) => r.data.controller.controllerId === PADAWAN_MAC,
      );

      expect(masterResult).toBeDefined();
      expect(masterResult?.data.controller.stage).toBe(FwStage.VersionConfirmed);
      expect(masterResult?.data.controller.finalVersion).toBe(POST_FLASH_FW);

      expect(padawanResult).toBeDefined();
      expect(padawanResult?.data.controller.stage).toBe(FwStage.Failed);
      expect(padawanResult?.data.controller.error).toBe(PADAWAN_ERROR);

      // 9. NO flashJobFailed should have been emitted. This is the
      //    second-most-load-bearing pin: a regression where mixed
      //    terminal outcomes incorrectly trip flashJobFailed (e.g., a
      //    naive "any controller Failed → job Failed" check) would
      //    silently break only this assertion.
      const failedEvents = harness.receivedWsMessages.filter(
        (m) => (m as { type?: unknown }).type === TransmissionType.flashJobFailed,
      );
      expect(failedEvents).toEqual([]);

      // 10. Heartbeat path. The master rebooted into POST_FLASH_FW;
      //     emit POLL_ACK from the sentinel MAC carrying the deployed
      //     version → decidePostDeployHeartbeat fires →
      //     orchestrator.notifyMasterHeartbeat clears the reboot timer
      //     and releases the lock. The padawan failed and didn't
      //     reboot, so its POLL_ACK is irrelevant to the heartbeat
      //     release decision (decidePostDeployHeartbeat filters on the
      //     master sentinel MAC).
      //
      //     Snapshot the WS buffer before emitting so the wait below
      //     only sees the heartbeat-driven release, not the connect-
      //     time lockStateChanged{locked:false} the server sent on
      //     WS open.
      const snapshot = harness.receivedWsMessages.length;
      harness.stub.writePollAck({ firmwareVersion: POST_FLASH_FW });

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

      // 11. GET /api/firmware/flash → null (no active job after release).
      const getRes = await fetch(`${harness.httpBaseUrl}/api/firmware/flash`, {
        headers: { authorization: `Bearer ${harness.authToken}` },
      });
      expect(getRes.status).toBe(200);
      const getBody: unknown = await getRes.json();
      expect(getBody).toBeNull();

      // 12. Worker stayed healthy through the run. LAST so a Worker
      //     that died midway is caught even if other assertions
      //     happened to pass on stale message replay.
      expect(harness.workerErrors).toEqual([]);
      expect(harness.stub.parsingErrors()).toEqual([]);
      expect(harness.pty.unexpectedExits).toEqual([]);
    },
    30_000,
  );
});
