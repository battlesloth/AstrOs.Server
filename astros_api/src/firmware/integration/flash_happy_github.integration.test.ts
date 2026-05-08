// End-to-end integration test for the firmware OTA orchestrator's
// `kind: 'github'` source path. Mirrors the upload-source happy path
// (flash_happy_upload.integration.test.ts) but exercises the GitHub
// release service + firmware cache code paths instead of the upload
// store.
//
// Two interception points are needed for a hermetic run:
//   1. GitHubReleaseService.getReleases() — intercepted by injecting a
//      fake `fetch` via ApiServerOptions.firmwareReleaseFetcher. The
//      fake returns canned release JSON for v1.5.0 with one asset
//      matching the master's variant.
//   2. FirmwareCache.fetch() — intercepted by pre-populating the on-disk
//      cache so lookup() returns a hit and fetch() short-circuits
//      without invoking its own downloader.
//
// Sequence covered:
//   1. Pre-populate variantCache via stub POLL_ACK
//   2. Pre-populate firmware cache with a 4KB blob for variant lolin_d32_pro
//   3. POST /api/firmware/flash kind=github version=1.5.0 (JWT-auth)
//   4. flashJobStarted carries a github-shaped source.displayName
//   5. autoAckUpload drives FW_TRANSFER_BEGIN/CHUNK/END from cache.path
//   6. scriptDeploy drives FW_PROGRESS + FW_DEPLOY_DONE
//   7. flashJobDone fires
//   8. Stub emits master POLL_ACK with deployed firmwareVersion
//   9. Heartbeat path releases lock → lockStateChanged{locked:false}
//  10. workerErrors is empty (Worker stayed healthy)

import { describe, it, expect, afterEach } from 'vitest';
import {
  bootIntegrationHarness,
  type IntegrationHarness,
} from '../../test_harness/integration_harness.js';
import { TransmissionType } from '../../models/enums.js';

const skipIfNotLinux = process.platform !== 'linux' ? it.skip : it;

// Master's sentinel MAC per project_master_esp_sentinel_mac convention.
// decidePostDeployHeartbeat filters on this exact string so the test must
// match it bit-for-bit.
const MASTER_SENTINEL_MAC = '00:00:00:00:00:00';
// Variant matches the github asset-name regex /^astros-esp-(.+)-([a-z][a-z0-9_]*)-app\.bin$/
// — lowercase letters/digits/underscores only, no hyphens. The
// upload-side test uses 'astros-controller-v1' which would fail the
// regex; for github source we have to use a PlatformIO env name.
const VARIANT = 'lolin_d32_pro';
const PRE_FLASH_FW = '1.0.0';
const POST_FLASH_FW = '1.5.0';

// Fake fetcher returning canned GitHub release JSON. The shape matches
// GitHubReleaseDto (models/firmware/release.ts): tag_name with leading
// 'v' (the service's stripLeadingV normalizes to '1.5.0'), draft/prerelease
// false, one asset whose name+content_type pass extractFirmwareAssets's
// filters.
function buildFakeReleaseFetcher(releases: unknown[]): typeof fetch {
  const fn = async (input: RequestInfo | URL, _init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (!url.includes('api.github.com/repos/') || !url.includes('/releases')) {
      throw new Error(`fake fetcher: unexpected URL ${url}`);
    }
    return new Response(JSON.stringify(releases), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  return fn as unknown as typeof fetch;
}

describe('integration: happy github flash + heartbeat release', () => {
  let harness: IntegrationHarness | undefined;

  afterEach(async () => {
    await harness?.dispose();
    harness = undefined;
  });

  skipIfNotLinux(
    'POST /api/firmware/flash kind=github → flashJobDone → POLL_ACK heartbeat → lockStateChanged{locked:false}',
    async () => {
      // 1. Boot the harness with a fake release fetcher. The cache is
      //    pre-seeded BEFORE the flash POST so FirmwareCache.lookup()
      //    returns a hit and fetch() short-circuits — no download
      //    attempted, no real network I/O.
      const binBytes = Buffer.alloc(4096, 0x42);

      harness = await bootIntegrationHarness({
        masterFirmwareVersion: PRE_FLASH_FW,
        masterVariant: VARIANT,
        masterMac: MASTER_SENTINEL_MAC,
        firmwareReleaseFetcher: buildFakeReleaseFetcher([
          {
            tag_name: `v${POST_FLASH_FW}`,
            published_at: '2026-04-15T12:00:00Z',
            draft: false,
            prerelease: false,
            assets: [
              {
                name: `astros-esp-${POST_FLASH_FW}-${VARIANT}-app.bin`,
                browser_download_url: `https://example.test/astros-esp-${POST_FLASH_FW}-${VARIANT}-app.bin`,
                size: binBytes.length,
                content_type: 'application/octet-stream',
              },
            ],
          },
        ]),
      });

      // 2. Pre-populate the controllerVariantCache: stub emits POLL_ACK
      //    so listFlashTargets() finds the master at flash time. Without
      //    this the orchestrator rejects with `no_controllers`.
      //
      //    Deterministic poll-wait instead of a fixed sleep — the latter
      //    flakes under vitest's parallel-thread load.
      harness.stub.writePollAck();
      await harness.waitForVariantCachePopulated(MASTER_SENTINEL_MAC, VARIANT);

      // 3. Seed the firmware cache. The helper writes the
      //    .bin/.bin.sha256/.meta.json triple matching FirmwareCache's
      //    layout so lookup() returns non-null on the first call.
      const { sha256 } = await harness.populateFirmwareCache({
        binBytes,
        version: POST_FLASH_FW,
        variant: VARIANT,
      });
      void sha256; // available for diagnostic if streamer fails

      // 4. Configure stub master responses: defaults for upload, single
      //    OK deploy outcome reporting POST_FLASH_FW.
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

      // 5. POST /api/firmware/flash with the github source. The
      //    orchestrator's resolveFlashSource calls
      //    releaseService.getReleases() (intercepted by the fake
      //    fetcher) → finds release v1.5.0 → finds the lolin_d32_pro
      //    asset → calls cache.fetch() → cache.lookup() returns hit →
      //    short-circuits. The version field matches because
      //    stripLeadingV strips the 'v' from 'v1.5.0'.
      const flashRes = await fetch(`${harness.httpBaseUrl}/api/firmware/flash`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${harness.authToken}`,
        },
        body: JSON.stringify({ source: { kind: 'github', version: POST_FLASH_FW } }),
      });
      expect(flashRes.status).toBe(200);
      const flashBody = (await flashRes.json()) as {
        jobId: string;
        transferId: string;
        targets: string[];
      };
      expect(flashBody.jobId).toBeTruthy();
      expect(flashBody.targets).toEqual([MASTER_SENTINEL_MAC]);

      // 6. flashJobStarted: WS frame is `{type, data}`. Assert the
      //    github-shaped displayName per resolveFlashSource:
      //    `astros-esp ${version} (${variant})`.
      const startedEvent = await harness.waitForWsMessage<{
        type: number;
        data: { jobId: string; source: { displayName: string } };
      }>((m) => (m as { type?: unknown }).type === TransmissionType.flashJobStarted, 5000);
      expect(startedEvent.data.jobId).toBe(flashBody.jobId);
      expect(startedEvent.data.source.displayName).toBe(`astros-esp ${POST_FLASH_FW} (${VARIANT})`);

      // 7. flashJobDone after upload (BEGIN/CHUNK/END auto-acks) +
      //    deploy (FW_PROGRESS + FW_DEPLOY_DONE). Sub-second for a 4KB
      //    blob; 10s headroom for slow CI.
      const doneEvent = await harness.waitForWsMessage<{
        type: number;
        data: { jobId: string };
      }>((m) => (m as { type?: unknown }).type === TransmissionType.flashJobDone, 10_000);
      expect(doneEvent.data.jobId).toBe(flashBody.jobId);

      // 8. Stub emits POLL_ACK with the post-flash firmwareVersion.
      //    decidePostDeployHeartbeat → 'fire' (sentinel MAC matches,
      //    version matches deployed target) → orchestrator's
      //    notifyMasterHeartbeat → lock release WELL BEFORE the 15-sec
      //    reboot-timer fallback would fire.
      //
      //    Snapshot the WS buffer length BEFORE emitting so the wait below
      //    only sees the heartbeat-driven release, not the connect-time
      //    lockStateChanged{locked:false} snapshot the server sent on WS open.
      const snapshot = harness.receivedWsMessages.length;
      harness.stub.writePollAck({ firmwareVersion: POST_FLASH_FW });

      // 9. lockStateChanged is FLAT — `locked` sits at the top level
      //    alongside `type`, not under `data`. Should arrive within
      //    ~1-2 seconds of step 8; 15+ seconds means the heartbeat path
      //    is broken and the timer fallback is releasing instead.
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

      // 11. Worker stayed healthy — placed LAST so a Worker that died
      //     midway is caught even if other assertions happened to pass
      //     on stale message replay.
      expect(harness.workerErrors).toEqual([]);
      expect(harness.stub.parsingErrors()).toEqual([]);
      expect(harness.pty.unexpectedExits).toEqual([]);
    },
    60_000, // generous: includes potential first-time `npm run build` + WS round-trips
  );
});
