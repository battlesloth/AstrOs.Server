// vitest globalSetup hook — runs once in the main process before any worker
// thread spawns, builds dist/ if the integration harness will need it.
//
// Why globalSetup specifically: vitest's default pool runs test files in
// parallel worker threads. If `bootIntegrationHarness` triggered the build
// per-call, multiple workers could race on `npm run build` — and the build's
// `prebuild` script (`rm -rf dist && eslint`) deletes dist/ from under any
// worker that's mid-spawn or mid-load of the dist Worker file. Symptoms
// range from ERR_MODULE_NOT_FOUND on a half-deleted dist tree to vacuous
// passes when one worker finishes a build during another worker's mtime
// check.
//
// globalSetup eliminates the race by serializing: vitest invokes this in
// its main process before any worker exists, so dist/ is stable for the
// entire test run. Workers just resolve the URL — they never write to dist/.
//
// We still mtime-skip the build if dist/ is already fresh, so unit-only
// `npx vitest run` invocations don't pay the build cost.

import { spawnSync } from 'child_process';
import { statSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

export default function setup(): void {
  // Resolve the astros_api root from this file's location.
  // here    -> .../astros_api/src/test_harness/global_setup.ts
  // apiRoot -> .../astros_api/
  const here = fileURLToPath(import.meta.url);
  const apiRoot = resolve(dirname(here), '..', '..');
  const distWorker = resolve(apiRoot, 'dist', 'background_tasks', 'serial_worker.js');
  const srcWorker = resolve(apiRoot, 'src', 'background_tasks', 'serial_worker.js');

  // Skip the build if dist/ is fresh (dist worker mtime >= src worker mtime).
  try {
    const distStat = statSync(distWorker);
    const srcStat = statSync(srcWorker);
    if (distStat.mtimeMs >= srcStat.mtimeMs) {
      return;
    }
  } catch {
    // dist/ missing or stat failed; fall through to build.
  }

  // Build it. `npm run build` runs the project's full pipeline (lint + tsc +
  // tsc-alias). If lint fails, the build fails and the entire vitest run
  // fails to start — that's correct: a failing lint should not silently
  // produce a stale dist/.
  const result = spawnSync('npm', ['run', 'build'], {
    cwd: apiRoot,
    stdio: 'inherit',
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error(
      `vitest globalSetup: npm run build failed with code ${result.status}. ` +
        `dist/ is required so integration tests can spawn the serial Worker — ` +
        `tsx's loader does not propagate to Worker threads.`,
    );
  }

  // Verify the Worker file exists post-build.
  try {
    statSync(distWorker);
  } catch {
    throw new Error(`vitest globalSetup: build completed but ${distWorker} is missing.`);
  }
}
