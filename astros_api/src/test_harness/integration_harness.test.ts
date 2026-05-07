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

      // Also assert no stub-side parser errors. Wire-format drift between
      // ApiServer's MessageGenerator and the stub's payload parsers would
      // cause the stub to silently drop frames it can't ACK — tests would
      // then time out with no hint why. Empty here is the load-bearing
      // baseline; tests exercising FW_* paths should mirror this assertion.
      expect(harness.stub.parsingErrors()).toEqual([]);
    },
    30_000, // generous timeout — first run may include a fresh build
  );

  skipIfNotLinux(
    'shutdown() completes promptly even when a WS client stays connected',
    async () => {
      // Pins the SIGTERM-doesn't-hang contract: ws.Server.close() refuses to
      // invoke its callback until every client has disconnected, and
      // http.Server.close() refuses to invoke its callback until every
      // keep-alive connection drains. Without proactive teardown
      // (terminate() on each ws client + closeAllConnections() on the
      // http server), shutdown would hang indefinitely on any idle client.
      //
      // The other tests in this file go through `harness.dispose()`, which
      // closes wsClient *before* invoking server.shutdown() — so they do
      // not exercise the bug. Here we deliberately leave the client open
      // and assert shutdown still completes within a generous bound.
      harness = await bootIntegrationHarness();
      expect(harness.wsClient.readyState).toBe(harness.wsClient.OPEN);

      const start = Date.now();
      await harness.server.shutdown();
      const elapsed = Date.now() - start;

      // Sub-second on a quiet machine; a few seconds covers slow CI. The
      // bug was unbounded hang — anything in the seconds range proves the
      // proactive-terminate path ran.
      expect(elapsed).toBeLessThan(3000);
    },
    30_000,
  );
});
