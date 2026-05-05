// Integration tests for the cancel mechanism. Two cases — cancel
// during upload phase, cancel during deploy phase. Each verifies the
// corresponding orchestrator branch ends in `flashJobFailed` + lock release.
//
// Both branches converge on the same external contract (HTTP 200 from POST +
// DELETE, flashJobFailed on WS, lockStateChanged{locked:false}, GET → null,
// healthy worker), but the WS event shape differs between them:
//
//   - Upload-cancel: AbortController.abort('http') → streamer rejects with
//     TransferError('aborted', ...) → orchestrator's catch block routes
//     through `failJob` which stamps BOTH `reason: 'aborted'` and
//     `abortReason: 'aborted'` on the flashJobFailed emit.
//   - Deploy-cancel: streamer is already settled, so abort is a no-op.
//     Orchestrator runs the inline deploy-cancel sequence and emits
//     flashJobFailed with ONLY `abortReason: 'http'` (no `reason` field).
//
// See flash_orchestrator.ts:788-826 for both cancel codepaths.

import { describe, it, expect, afterEach } from 'vitest';
import {
  bootIntegrationHarness,
  type IntegrationHarness,
} from '../../test_harness/integration_harness.js';
import { TransmissionType } from '../../models/enums.js';
import { SerialMessageType } from '../../serial/serial_message.js';
import { FwStage } from '../../models/firmware/firmware_messages.js';

const skipIfNotLinux = process.platform !== 'linux' ? it.skip : it;

const MASTER_SENTINEL_MAC = '00:00:00:00:00:00';
const MASTER_VARIANT = 'astros-controller-v1';
const PRE_FLASH_FW = '1.0.0';
const POST_FLASH_FW = '1.5.0';

describe('integration: cancel during upload + deploy', () => {
  let harness: IntegrationHarness | undefined;

  afterEach(async () => {
    await harness?.dispose();
    harness = undefined;
  });

  skipIfNotLinux(
    'DELETE during upload phase: streamer aborts → flashJobFailed{reason:aborted} → lock release',
    async () => {
      // 1. Boot harness + pre-populate variantCache so listFlashTargets()
      //    returns the master at flash time.
      harness = await bootIntegrationHarness({
        masterFirmwareVersion: PRE_FLASH_FW,
        masterVariant: MASTER_VARIANT,
        masterMac: MASTER_SENTINEL_MAC,
      });
      harness.stub.writePollAck();
      await harness.waitForVariantCachePopulated(MASTER_SENTINEL_MAC, MASTER_VARIANT);

      // 2. Seed upload so source resolution succeeds.
      const binBytes = Buffer.alloc(4096, 0x42);
      await harness.populateUpload({
        binBytes,
        originalFilename: 'astros-esp-1.5.0.bin',
        version: POST_FLASH_FW,
      });

      // 3. Stub master is intentionally NOT configured with autoAckUpload.
      //    The streamer will send FW_TRANSFER_BEGIN over the PTY and wait
      //    for FW_TRANSFER_BEGIN_ACK indefinitely (well, the streamer's
      //    1500ms begin-ack timeout — but we cancel well before that fires).

      // 4. POST flash. `orchestrator.start()` awaits `streamer.run`, so the
      //    HTTP response WILL NOT return until the streamer settles (success,
      //    typed error, or — in this test — `AbortController.abort` →
      //    TransferError('aborted',...) → 500). Kick the POST off without
      //    awaiting and use the `flashJobStarted` WS event as the
      //    "job is in flight" signal instead.
      const flashPromise = fetch(`${harness.httpBaseUrl}/api/firmware/flash`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${harness.authToken}`,
        },
        body: JSON.stringify({ source: { kind: 'upload' } }),
      });

      // 5. Wait for flashJobStarted to confirm the job is in flight. This
      //    fires AFTER lock acquire + source resolve but BEFORE
      //    `await streamer.run`, so it's available even though the POST
      //    response is still pending.
      const startedEvent = await harness.waitForWsMessage<{
        type: number;
        data: { jobId: string };
      }>((m) => (m as { type?: unknown }).type === TransmissionType.flashJobStarted, 5000);
      const jobId = startedEvent.data.jobId;
      expect(jobId).toBeTruthy();

      // 6. Snapshot the WS buffer and DELETE while the streamer awaits
      //    begin-ack. Snapshot lets the predicates below ignore any WS
      //    traffic emitted before the cancel.
      const deleteSnapshot = harness.receivedWsMessages.length;
      const cancelRes = await fetch(`${harness.httpBaseUrl}/api/firmware/flash`, {
        method: 'DELETE',
        headers: { authorization: `Bearer ${harness.authToken}` },
      });
      expect(cancelRes.status).toBe(200);
      const cancelBody = (await cancelRes.json()) as { jobId: string; cancelled: boolean };
      expect(cancelBody.cancelled).toBe(true);
      expect(cancelBody.jobId).toBe(jobId);

      // 7. flashJobFailed with reason='aborted' AND abortReason='aborted'.
      //    The upload-cancel path runs through `failJob` (orchestrator
      //    routes TransferError('aborted',...) → failJob with abortReason
      //    populated), so both fields are stamped on the WS emit.
      const failedEvent = await harness.waitForWsMessage<{
        type: number;
        data: { jobId: string; reason?: string; abortReason?: string };
      }>(
        (m) => (m as { type?: unknown }).type === TransmissionType.flashJobFailed,
        5000,
        deleteSnapshot,
      );
      expect(failedEvent.data.jobId).toBe(jobId);
      expect(failedEvent.data.reason).toBe('aborted');
      expect(failedEvent.data.abortReason).toBe('aborted');

      // The deferred POST resolves once the streamer rejects with the
      // abort. Per controller mapping, `aborted` → 500. Drain the body
      // so the connection isn't left dangling at suite teardown.
      const flashRes = await flashPromise;
      expect(flashRes.status).toBe(500);
      await flashRes.json().catch(() => undefined);

      // 8. Lock release via the cancel/failJob path (NOT the heartbeat path —
      //    we never emit a post-deploy POLL_ACK in this test).
      const lockReleased = await harness.waitForWsMessage<{
        type: number;
        locked: boolean;
      }>(
        (m) => {
          const msg = m as { type?: unknown; locked?: unknown };
          return msg.type === TransmissionType.lockStateChanged && msg.locked === false;
        },
        5000,
        deleteSnapshot,
      );
      expect(lockReleased.locked).toBe(false);

      // 9. GET → null (no active job after release).
      const getRes = await fetch(`${harness.httpBaseUrl}/api/firmware/flash`, {
        headers: { authorization: `Bearer ${harness.authToken}` },
      });
      expect(getRes.status).toBe(200);
      const getBody: unknown = await getRes.json();
      expect(getBody).toBeNull();

      // 10. Worker stayed healthy. LAST so a Worker that died midway is
      //     caught even if other assertions happened to pass.
      expect(harness.workerErrors).toEqual([]);
    },
    30_000,
  );

  skipIfNotLinux(
    'DELETE during deploy phase: deploy-unsub disposed → flashJobFailed{abortReason} + per-controller Failed → lock release',
    async () => {
      // 1. Boot harness + variant cache + upload (same as upload-cancel test).
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

      // 2. autoAckUpload so the upload phase succeeds. NO scriptDeploy →
      //    when the orchestrator sends FW_DEPLOY_BEGIN, the stub captures
      //    it but emits no further frames. The deploy phase hangs
      //    awaiting FW_DEPLOY_DONE.
      harness.stub.autoAckUpload({});

      // 3. POST flash.
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
        (m) => (m as { type?: unknown }).type === TransmissionType.flashJobStarted,
        5000,
      );

      // 4. Wait until we know we're in the deploy phase. Signal: the stub
      //    received FW_DEPLOY_BEGIN over the wire. Upload completes
      //    sub-second under autoAckUpload, then orchestrator immediately
      //    sends FW_DEPLOY_BEGIN — without this gate, a fast cancel could
      //    land while the streamer is still running and we'd hit the
      //    upload-cancel codepath instead.
      await harness.stub.waitForFrame((f) => f.type === SerialMessageType.FW_DEPLOY_BEGIN, 10_000);

      // 5. Snapshot + DELETE while deploy is hanging.
      const deleteSnapshot = harness.receivedWsMessages.length;
      const cancelRes = await fetch(`${harness.httpBaseUrl}/api/firmware/flash`, {
        method: 'DELETE',
        headers: { authorization: `Bearer ${harness.authToken}` },
      });
      expect(cancelRes.status).toBe(200);
      const cancelBody = (await cancelRes.json()) as { jobId: string; cancelled: boolean };
      expect(cancelBody.cancelled).toBe(true);
      expect(cancelBody.jobId).toBe(flashBody.jobId);

      // 6. flashJobFailed with abortReason='http' and NO `reason` field.
      //    The deploy-cancel path emits inline (flash_orchestrator.ts:820-823),
      //    bypassing `failJob` and its `reason` stamping.
      const failedEvent = await harness.waitForWsMessage<{
        type: number;
        data: { jobId: string; reason?: string; abortReason?: string };
      }>(
        (m) => (m as { type?: unknown }).type === TransmissionType.flashJobFailed,
        5000,
        deleteSnapshot,
      );
      expect(failedEvent.data.jobId).toBe(flashBody.jobId);
      expect(failedEvent.data.abortReason).toBe('http');
      expect(failedEvent.data.reason).toBeUndefined();

      // 7. flashControllerResult emitted before flashJobFailed for the
      //    master, transitioning Sending → Failed. Per orchestrator's
      //    failNonTerminalControllers, the result event carries the
      //    full ControllerFlashState with stage=Failed.
      const controllerResult = harness.receivedWsMessages
        .slice(deleteSnapshot)
        .find((m) => (m as { type?: unknown }).type === TransmissionType.flashControllerResult) as
        | { data?: { controller?: { stage?: FwStage } } }
        | undefined;
      expect(controllerResult).toBeDefined();
      expect(controllerResult?.data?.controller?.stage).toBe(FwStage.Failed);

      // 8. Lock release via the cancel codepath.
      const lockReleased = await harness.waitForWsMessage<{
        type: number;
        locked: boolean;
      }>(
        (m) => {
          const msg = m as { type?: unknown; locked?: unknown };
          return msg.type === TransmissionType.lockStateChanged && msg.locked === false;
        },
        5000,
        deleteSnapshot,
      );
      expect(lockReleased.locked).toBe(false);

      // 9. GET → null.
      const getRes = await fetch(`${harness.httpBaseUrl}/api/firmware/flash`, {
        headers: { authorization: `Bearer ${harness.authToken}` },
      });
      expect(getRes.status).toBe(200);
      const getBody: unknown = await getRes.json();
      expect(getBody).toBeNull();

      // 10. Worker stayed healthy.
      expect(harness.workerErrors).toEqual([]);
    },
    30_000,
  );
});
