import { describe, it, expect, afterEach } from 'vitest';
import { bootIntegrationHarness, type IntegrationHarness } from './integration_harness.js';

const skipIfNotLinux = process.platform !== 'linux' ? it.skip : it;

describe('integration harness', () => {
  let harness: IntegrationHarness | undefined;

  afterEach(async () => {
    await harness?.dispose();
    harness = undefined;
  });

  skipIfNotLinux(
    'boots ApiServer + StubMaster, accepts WS, receives initial state, tears down',
    async () => {
      harness = await bootIntegrationHarness();

      // The server emits an initial `lockState` snapshot on WS connect (per
      // api_server.ts websocket connection handler). Verify we receive it.
      // Use loose matching: any message whose type field exists.
      const msg = await harness.waitForWsMessage(
        (m) => typeof (m as { type?: unknown })?.type !== 'undefined',
        5000,
      );
      expect(msg).toBeDefined();
    },
    30_000, // generous timeout — first boot includes a fresh `npm run build`
  );

  skipIfNotLinux(
    'serial worker thread loads + does not error when receiving a POLL_ACK frame',
    async () => {
      harness = await bootIntegrationHarness();

      // The stub master emits a POLL_ACK on the master end of the PTY.
      // It travels: stub serialport -> kernel PTY pair -> server-side serialport ->
      // DelimiterParser -> serial_worker (PARSED via msgService.handleMessage) ->
      // back through Worker postMessage to ApiServer.handleSerialWorkerMessage.
      //
      // We use a padawan MAC (NOT the master sentinel 00:00:..) so the frame
      // exercises the controllers update path. The DB has no row for this
      // MAC so handlePollResponse bails at the controller-existence check
      // after the lookup, but the variant-cache `.set` and heartbeat-decision
      // logic run *before* that lookup — so awaiting the cache entry proves
      // the frame round-tripped through the Worker and was dispatched
      // end-to-end, not just that the Worker didn't crash.

      harness.stub.writePollAck({
        mac: 'aa:bb:cc:dd:ee:ff',
        firmwareVersion: '1.5.0',
        variant: 'astros-controller-v1',
      });

      // Deterministic wait: polls the variant cache instead of sleeping.
      // Throws on timeout, so failure to dispatch surfaces clearly rather
      // than as a no-op `expect.toEqual([])` pass.
      await harness.waitForVariantCachePopulated('aa:bb:cc:dd:ee:ff', 'astros-controller-v1');

      // Belt-and-suspenders: even after end-to-end dispatch succeeded, an
      // earlier vacuous version of this test passed despite
      // ERR_MODULE_NOT_FOUND because it only checked `harness.server` was
      // defined. workerErrors is populated by ApiServer's onWorkerError
      // callback whenever the Worker emits an 'error' event.
      expect(harness.workerErrors).toEqual([]);
    },
    30_000, // generous timeout — first run may include a fresh build
  );
});
