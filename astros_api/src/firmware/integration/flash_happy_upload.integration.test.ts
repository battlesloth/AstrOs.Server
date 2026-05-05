// First end-to-end integration test for the firmware OTA orchestrator.
// Drives a full upload-source flash through a real ApiServer + StubMaster
// over a PTY-backed serial port and verifies the heartbeat path releases
// the lock well before the 15-sec reboot-timer fallback would fire.
//
// Sequence covered:
//   1. Pre-populate variantCache via stub POLL_ACK
//   2. Pre-populate upload store with a 4KB firmware blob
//   3. POST /api/firmware/flash kind=upload (JWT-authenticated)
//   4. Observe flashJobStarted → autoAckUpload drives FW_TRANSFER_BEGIN/CHUNK/END
//   5. scriptDeploy drives FW_PROGRESS + FW_DEPLOY_DONE
//   6. flashJobDone fires
//   7. Stub emits master POLL_ACK with deployed firmwareVersion
//   8. Heartbeat path releases lock → lockStateChanged{locked:false}
//   9. GET /api/firmware/flash returns null
//  10. workerErrors is empty (Worker stayed healthy)

import { describe, it, expect, afterEach } from 'vitest';
import {
  bootIntegrationHarness,
  type IntegrationHarness,
} from '../../test_harness/integration_harness.js';
import { TransmissionType } from '../../models/enums.js';

const skipIfNotPosix = process.platform === 'win32' ? it.skip : it;

// Master's sentinel MAC per project_master_esp_sentinel_mac convention.
// decidePostDeployHeartbeat filters on this exact string so the test must
// match it bit-for-bit.
const MASTER_SENTINEL_MAC = '00:00:00:00:00:00';
const MASTER_VARIANT = 'astros-controller-v1';
const PRE_FLASH_FW = '1.0.0';
const POST_FLASH_FW = '1.5.0';

describe('integration: happy upload flash + heartbeat release', () => {
  let harness: IntegrationHarness | undefined;

  afterEach(async () => {
    await harness?.dispose();
    harness = undefined;
  });

  skipIfNotPosix(
    'POST /api/firmware/flash kind=upload → flashJobDone → POLL_ACK heartbeat → lockStateChanged{locked:false}',
    async () => {
      // 1. Boot harness configured for the master only. Pre-flash firmware
      //    version is what the variantCache POLL_ACK will carry; post-flash
      //    is what the stub reports after the deploy completes.
      harness = await bootIntegrationHarness({
        masterFirmwareVersion: PRE_FLASH_FW,
        masterVariant: MASTER_VARIANT,
        masterMac: MASTER_SENTINEL_MAC,
      });

      // 2. Pre-populate the controllerVariantCache: stub emits a POLL_ACK
      //    from the master sentinel MAC carrying the variant. ApiServer's
      //    handlePollResponse populates the cache so listFlashTargets()
      //    returns this controller at flash time. Without this, the
      //    orchestrator would reject with `no_controllers`.
      //
      //    `waitForVariantCachePopulated` polls the cache deterministically
      //    instead of relying on a fixed sleep, which flakes under vitest's
      //    parallel-thread load.
      harness.stub.writePollAck();
      await harness.waitForVariantCachePopulated(MASTER_SENTINEL_MAC, MASTER_VARIANT);

      // 3. Pre-populate the upload store with a small firmware blob. The
      //    helper writes the meta.json directly (bypassing the
      //    esp_app_desc validation in `store()`) so we can use arbitrary
      //    bytes as the fixture. The streamer reads bytes off disk and
      //    chunk-streams them; the stub auto-ACKs each chunk.
      const binBytes = Buffer.alloc(4096, 0x42);
      const { sha256 } = await harness.populateUpload({
        binBytes,
        originalFilename: 'astros-esp-1.5.0.bin',
        version: POST_FLASH_FW,
      });
      // sha256 isn't asserted but is available for diagnostic use if the
      // test fails (the streamer will fail with hash_mismatch if our sha
      // sidecar diverges from the actual bytes).
      void sha256;

      // 4. Configure stub master responses for the upload + deploy phases.
      //    autoAckUpload({}) uses defaults: windowSize=16, endStatus='OK',
      //    no failAtSeq. scriptDeploy drives FW_PROGRESS frames + a single
      //    FW_DEPLOY_DONE with outcome OK and finalVersion=POST_FLASH_FW.
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

      // 5. POST /api/firmware/flash. Use Node's built-in fetch + the
      //    harness's JWT auth token (express-jwt validates with the same
      //    JWT_KEY the harness signed with).
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
        transferId: string;
        targets: string[];
      };
      expect(flashBody.jobId).toBeTruthy();
      expect(flashBody.targets).toEqual([MASTER_SENTINEL_MAC]);

      // 6. Observe the WS event sequence. WS messages serialize the
      //    TransmissionType numeric enum value, not the string name —
      //    `m.type` is `12`, not `'flashJobStarted'`.
      const startedEvent = await harness.waitForWsMessage<{
        type: number;
        data: { jobId: string };
      }>((m) => (m as { type?: unknown }).type === TransmissionType.flashJobStarted, 5000);
      expect(startedEvent.data.jobId).toBe(flashBody.jobId);

      // 7. Then flashJobDone after upload (BEGIN/CHUNK/END auto-acks) +
      //    deploy (FW_PROGRESS + FW_DEPLOY_DONE). With a 4KB blob this
      //    is sub-second; allow 10s of headroom for slow CI.
      const doneEvent = await harness.waitForWsMessage<{
        type: number;
        data: { jobId: string };
      }>((m) => (m as { type?: unknown }).type === TransmissionType.flashJobDone, 10_000);
      expect(doneEvent.data.jobId).toBe(flashBody.jobId);

      // 8. Stub master emits a POLL_ACK with the post-flash firmwareVersion.
      //    This triggers decidePostDeployHeartbeat → 'fire' (sentinel MAC
      //    matches, version matches deployed target) → orchestrator's
      //    notifyMasterHeartbeat → lock release WELL BEFORE the 15-sec
      //    reboot-timer fallback would fire.
      //
      //    Snapshot the WS buffer length BEFORE emitting so the wait below
      //    only sees the heartbeat-driven release, not the connect-time
      //    lockStateChanged{locked:false} snapshot the server sent on WS open.
      const snapshot = harness.receivedWsMessages.length;
      harness.stub.writePollAck({ firmwareVersion: POST_FLASH_FW });

      // 9. Wait for lockStateChanged{locked:false}. Should arrive within
      //    ~1-2 seconds of step 8. If it takes 15+ seconds, the heartbeat
      //    path is broken and the timer fallback is releasing instead;
      //    that's a real bug, not a flake.
      // lockStateChanged is flat (not {type, data}) — buildLockStateResponse
      // spreads LockState directly into the WS frame. The `locked` field
      // sits at the top level, alongside `type`, `owner`, `since`.
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

      // 10. GET /api/firmware/flash → null (no active job after release).
      const getRes = await fetch(`${harness.httpBaseUrl}/api/firmware/flash`, {
        headers: { authorization: `Bearer ${harness.authToken}` },
      });
      expect(getRes.status).toBe(200);
      const getBody: unknown = await getRes.json();
      expect(getBody).toBeNull();

      // 11. Final assertion: the Worker stayed healthy through the whole
      //     run. Placed LAST so a Worker that died midway is caught even
      //     if other assertions happened to pass (stale message replay
      //     could mask earlier breakage).
      expect(harness.workerErrors).toEqual([]);
    },
    60_000, // generous: includes potential first-time `npm run build` + WS round-trips
  );
});
