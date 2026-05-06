// vitest globalSetup hook — runs once in the main process before any worker
// thread spawns, builds dist/ if the integration harness will need it.
//
// Why globalSetup specifically: vitest's default pool runs test files in
// parallel worker threads. If `bootIntegrationHarness` triggered the build
// per-call, multiple workers could race on the rebuild — `rm -rf dist`
// followed by `tsc` would delete dist/ from under any worker mid-spawn or
// mid-load of the dist Worker file. Symptoms range from ERR_MODULE_NOT_FOUND
// on a half-deleted dist tree to vacuous passes when one worker finishes a
// build during another worker's mtime check.
//
// globalSetup eliminates the race by serializing: vitest invokes this in
// its main process before any worker exists, so dist/ is stable for the
// entire test run. Workers just resolve the URL — they never write to dist/.
//
// We still mtime-skip the build if dist/ is newer than every compilable
// source file (see `newestCompiledMtime`) plus tsconfig.json / package.json,
// so unit-only `npx vitest run` invocations don't pay the build cost.
//
// Not in the freshness check, intentionally: `.env` / `.env.test`. We invoke
// `tsc` + `tsc-alias` directly here — bypassing `npm run build` precisely
// so the gitignored `.env` isn't required — so globalSetup never even
// produces a dist/.env. Even if a manual `npm run build` had populated one,
// integration_harness.ts sets every env var the ApiServer reads directly on
// process.env before bootstrap and Dotenv.config is non-overwriting, so
// dist/.env contents are unreachable from the integration suite either way.
// Adding `.env*` to the check would force needless rebuilds when developers
// tweak local files.

import { spawnSync } from 'child_process';
import { readdirSync, rmSync, statSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

// Walk a directory recursively and return the newest mtime among files that
// would actually be compiled into dist/. Mirrors tsconfig.json's exclude list
// (`**/*.test.ts`, `**/*.spec.ts`) so that editing a test file does not force
// a rebuild — those files never end up in dist. If you change tsconfig.json's
// exclude list, update this filter to match (and vice versa).
//
// Symlinks under src/ are intentionally skipped: `entry.isFile()` is false for
// a symlink Dirent even when the target is a regular file, so they fall
// through. There are none today, and skipping them avoids cyclic-symlink
// recursion. If a future workflow needs them, switch to lstat + a realpath
// visited-set guard.
function newestCompiledMtime(dir: string): number {
  let newest = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      newest = Math.max(newest, newestCompiledMtime(full));
      continue;
    }
    if (!entry.isFile()) continue;
    if (entry.name.endsWith('.test.ts') || entry.name.endsWith('.spec.ts')) continue;
    const m = statSync(full).mtimeMs;
    if (m > newest) newest = m;
  }
  return newest;
}

export default function setup(): void {
  // The integration suite is Linux-only (see pty_pair.ts). Skip the build
  // on every other platform so unit-only `npx vitest run` invocations on
  // Windows still succeed — `npm run build`'s `prebuild` step uses
  // `rm -rf dist` which fails on win32, and macOS's socat emits PTY paths
  // pty_pair.ts's regex doesn't match anyway.
  if (process.platform !== 'linux') {
    return;
  }

  // Resolve the astros_api root from this file's location.
  // here    -> .../astros_api/src/test_harness/global_setup.ts
  // apiRoot -> .../astros_api/
  const here = fileURLToPath(import.meta.url);
  const apiRoot = resolve(dirname(here), '..', '..');
  const srcRoot = resolve(apiRoot, 'src');
  const distWorker = resolve(apiRoot, 'dist', 'background_tasks', 'serial_worker.js');

  // Skip the build only if dist/ is at least as new as every compilable source
  // file plus tsconfig.json / package.json. The previous heuristic compared
  // dist worker mtime to src worker mtime alone, which missed transitive deps
  // — editing src/serial/serial_message_service.ts (imported by the worker)
  // left dist stale while this check returned early. Walking src/ catches any
  // change that would alter dist's contents; tsconfig.json and package.json
  // are included because edits to either (compiler flags, TypeScript version)
  // can also change dist output without touching any src/ file.
  try {
    const distMtime = statSync(distWorker).mtimeMs;
    const tsconfigMtime = statSync(resolve(apiRoot, 'tsconfig.json')).mtimeMs;
    const packageMtime = statSync(resolve(apiRoot, 'package.json')).mtimeMs;
    const newest = Math.max(newestCompiledMtime(srcRoot), tsconfigMtime, packageMtime);
    if (distMtime >= newest) {
      return;
    }
  } catch {
    // dist/ missing or stat failed; fall through to build.
  }

  // Build it directly with tsc + tsc-alias instead of `npm run build`.
  // `npm run build` invokes `postbuild` (`cp .env ./dist/.env`), which fails
  // on any checkout without a local `.env` — `.env` is gitignored, so a
  // clean clone or CI runner without one would fail integration tests at
  // setup time. dist/.env is unreachable from the integration suite anyway:
  // integration_harness.ts sets every env var the ApiServer reads directly
  // on process.env before bootstrap, and Dotenv.config is non-overwriting.
  //
  // We mirror prebuild's `rm -rf dist` so renamed/deleted src files don't
  // leave stale dist artifacts behind. Lint is intentionally skipped — it's
  // a separate CI job and a pre-commit step, not vitest's responsibility.
  rmSync(resolve(apiRoot, 'dist'), { recursive: true, force: true });

  const tscResult = spawnSync('npx', ['tsc'], {
    cwd: apiRoot,
    stdio: 'inherit',
    env: process.env,
  });
  if (tscResult.status !== 0) {
    throw new Error(
      `vitest globalSetup: npx tsc failed with code ${tscResult.status}. ` +
        `dist/ is required so integration tests can spawn the serial Worker — ` +
        `tsx's loader does not propagate to Worker threads.`,
    );
  }

  const aliasResult = spawnSync('npx', ['tsc-alias'], {
    cwd: apiRoot,
    stdio: 'inherit',
    env: process.env,
  });
  if (aliasResult.status !== 0) {
    throw new Error(`vitest globalSetup: npx tsc-alias failed with code ${aliasResult.status}.`);
  }

  // Verify the Worker file exists post-build.
  try {
    statSync(distWorker);
  } catch {
    throw new Error(`vitest globalSetup: build completed but ${distWorker} is missing.`);
  }
}
