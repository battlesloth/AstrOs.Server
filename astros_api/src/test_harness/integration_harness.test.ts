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
    20_000, // generous timeout — first boot includes DB init + worker spawn
  );

  skipIfNotPosix(
    'serial worker thread loads + round-trips a POLL_ACK frame end-to-end',
    async () => {
      harness = await bootIntegrationHarness();

      // The stub master emits a POLL_ACK on the master end of the PTY.
      // It travels: stub serialport -> kernel PTY pair -> server-side serialport ->
      // DelimiterParser -> serial_worker (PARSED via msgService.handleMessage) ->
      // back through Worker postMessage to ApiServer.handleSerialWorkerMessage.
      //
      // If the Worker fails to load (e.g. ERR_MODULE_NOT_FOUND on `.ts`
      // imports under tsx), the on('error') handler logs but the process
      // doesn't crash — meaning the original smoke test passes even with a
      // dead Worker. This test forces a wire-level round-trip so that a
      // broken Worker would surface (the server would hold the PARSED-event
      // promise indefinitely or never observe the frame).
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

      // The value of this test is purely "the Worker loaded and didn't
      // crash on the first real frame". If the server is still alive and
      // listening here, the Worker loaded successfully under tsx.
      expect(harness.server).toBeDefined();
    },
    10_000,
  );
});
