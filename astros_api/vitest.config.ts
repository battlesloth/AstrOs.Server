import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Run once in the main process before any worker thread spawns. Builds
    // dist/ if stale so the integration harness's spawned serial Worker
    // can load its `.js`-style imports (tsx's loader doesn't propagate to
    // Worker threads). See src/test_harness/global_setup.ts for the full
    // rationale + the race condition that motivated centralizing this here
    // rather than running it per-harness-boot.
    globalSetup: ['./src/test_harness/global_setup.ts'],
  },
});
