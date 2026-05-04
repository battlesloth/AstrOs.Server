import { describe, it, expect, afterEach } from 'vitest';
import { bootIntegrationHarness, type IntegrationHarness } from './integration_harness.js';

const skipIfNotPosix = process.platform === 'win32' ? it.skip : it;

describe('integration harness', () => {
  let harness: IntegrationHarness | undefined;

  afterEach(async () => {
    await harness?.dispose();
    harness = undefined;
  });

  skipIfNotPosix(
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

  skipIfNotPosix(
    'serial worker thread loads + does not error when receiving a POLL_ACK frame',
    async () => {
      harness = await bootIntegrationHarness();

      // The stub master emits a POLL_ACK on the master end of the PTY.
      // It travels: stub serialport -> kernel PTY pair -> server-side serialport ->
      // DelimiterParser -> serial_worker (PARSED via msgService.handleMessage) ->
      // back through Worker postMessage to ApiServer.handleSerialWorkerMessage.
      //
      // We use a padawan MAC (NOT the master sentinel 00:00:..) so the frame
      // exercises the controllers update path. The test's empty DB means no
      // controller is registered, so the variant cache won't be populated,
      // but the Worker must still parse and forward the message without
      // crashing.

      harness.stub.writePollAck({
        mac: 'aa:bb:cc:dd:ee:ff',
        firmwareVersion: '1.5.0',
        variant: 'astros-controller-v1',
      });

      // Allow the wire round-trip to complete.
      await new Promise((r) => setTimeout(r, 500));

      // The Worker MUST not have errored. An earlier vacuous version of this
      // test passed despite ERR_MODULE_NOT_FOUND because it only checked
      // `harness.server` was defined — anything could be defined. workerErrors
      // is populated by ApiServer's onWorkerError callback whenever the Worker
      // emits an 'error' event (e.g. failed to load, crashed processing the
      // frame).
      expect(harness.workerErrors).toEqual([]);
    },
    30_000, // bumped from 10s — first run includes a fresh `npm run build`
  );
});
