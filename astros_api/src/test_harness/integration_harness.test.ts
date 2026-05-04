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
});
