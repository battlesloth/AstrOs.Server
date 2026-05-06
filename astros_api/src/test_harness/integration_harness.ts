// Boots a real ApiServer connected to a StubMaster via a PTY pair, exposes
// HTTP + WebSocket clients for tests, and tears everything down cleanly on
// dispose(). Linux only (inherits PTY pair platform constraint).

import { createHash, randomUUID } from 'crypto';
import { statSync } from 'fs';
import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises';
import jsonwebtoken from 'jsonwebtoken';
import { tmpdir } from 'os';
import { dirname, join, resolve } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { WebSocket } from 'ws';

import { ApiServer } from '../api_server.js';
import { createPtyPair, type PtyPair } from './pty_pair.js';
import { StubMaster } from './stub_master.js';

export interface BootIntegrationHarnessOpts {
  masterFirmwareVersion?: string; // default '1.0.0'
  masterVariant?: string; // default 'astros-master-test-variant'
  masterMac?: string; // default '00:00:00:00:00:00' (sentinel)
  masterFingerprint?: string; // default 'master-stub'
  /**
   * Tests targeting `kind: 'github'` flashes inject a fake fetch that returns
   * canned GitHub release JSON. Combined with `populateFirmwareCache` (below),
   * this lets the test exercise the github source-resolution path without
   * any network I/O.
   */
  firmwareReleaseFetcher?: typeof fetch;
  /**
   * Override the FlashJobOrchestrator's reboot-timeout / throttle-window to
   * keep timer-fallback tests fast. Default reboot timeout is 15000ms;
   * tests exercising the timer fallback set this to a small value (e.g.
   * 1000ms) so a wrong-version-heartbeat or no-heartbeat scenario doesn't
   * burn 15 seconds of wall-clock.
   */
  flashOrchestratorConfig?: {
    rebootTimeoutMs?: number;
    throttleWindowMs?: number;
  };
}

// Args for `harness.populateUpload(...)` — used by integration tests that
// need to seed the FirmwareUploadStore's single-slot directory directly
// (bypassing the validate-and-promote path of `store()`). The triple
// written to disk satisfies `FirmwareUploadStore.latest()`'s 4 cross-checks:
//   1. UPLOAD_META_RE matches `upload-<uuidv4>.meta.json`
//   2. .sha256 contents match `/^[0-9a-f]{64}$/`
//   3. parsed.uploadId === uuid in filename
//   4. parsed.sizeBytes === bin file size
export interface PopulateUploadArgs {
  binBytes: Buffer; // raw firmware bytes (test fixture content)
  originalFilename: string; // e.g. 'astros-esp-1.5.0.bin'
  version: string; // semver string in meta
  projectName?: string; // default 'AstrOs.ESP'
}

// Args for `harness.populateFirmwareCache(...)` — used by integration tests
// that exercise the `kind: 'github'` source path. Pre-seeds the on-disk
// firmware cache so `FirmwareCache.lookup()` returns a hit and `fetch()`
// short-circuits without any download attempt. Mirrors the cache layout
// produced by a real `fetch(release, asset)` so `lookup()`'s validations
// (SHA256_HEX_RE on the .sha256 sidecar, isValidMeta on the .meta.json)
// pass.
export interface PopulateFirmwareCacheArgs {
  binBytes: Buffer; // raw firmware bytes
  version: string; // semver, e.g. '1.5.0' (no leading 'v')
  variant: string; // PlatformIO env name, e.g. 'lolin_d32_pro'
  tag?: string; // default `v${version}` (mirrors GitHub convention)
  publishedAt?: string; // default new Date().toISOString()
  sourceUrl?: string; // default a synthetic example.test URL
}

export interface IntegrationHarness {
  server: ApiServer;
  stub: StubMaster;
  pty: PtyPair;
  httpBaseUrl: string;
  // JWT signed with the same JWT_KEY the ApiServer reads from env, valid
  // for 7 days. Tests pass `Authorization: Bearer ${authToken}` on
  // protected routes (everything under /api except /api/auth/*).
  authToken: string;
  wsClient: WebSocket;
  receivedWsMessages: readonly unknown[];
  // Errors emitted by the spawned serial Worker thread. Tests assert this is
  // empty so a Worker that fails to load (e.g. ERR_MODULE_NOT_FOUND) surfaces
  // as a test failure rather than a silent log line. Mutated in-place by the
  // ApiServer's onWorkerError callback during the harness lifetime.
  workerErrors: readonly Error[];
  /**
   * Resolves with the next inbound WS frame matching `predicate`, or rejects
   * after `timeoutMs` (default 5s) listing the last 10 received message types.
   *
   * Pass `fromIndex` to ignore everything already in `receivedWsMessages` up
   * to (but not including) that index. Used to avoid matching connection-time
   * snapshots when the test wants the result of an action it just initiated.
   * Pattern:
   *   const snapshot = harness.receivedWsMessages.length;
   *   harness.stub.writePollAck({ firmwareVersion: '1.5.0' });
   *   const released = await harness.waitForWsMessage(predicate, 5000, snapshot);
   */
  waitForWsMessage<T = unknown>(
    predicate: (msg: unknown) => boolean,
    timeoutMs?: number,
    fromIndex?: number,
  ): Promise<T>;
  // Seeds the FirmwareUploadStore (FIRMWARE_CACHE_PATH/uploads/) with a
  // valid `upload-<uuid>.bin` + `.bin.sha256` + `.meta.json` triple so a
  // subsequent flash with `kind: 'upload'` resolves without going through
  // `store()` (which requires a real esp_app_desc_t header). Returns the
  // generated uploadId + sha256 so callers can cross-reference if needed.
  populateUpload(args: PopulateUploadArgs): Promise<{ uploadId: string; sha256: string }>;
  // Seeds the FirmwareCache (FIRMWARE_CACHE_PATH/github/) with a valid
  // `astros-esp-<version>-<variant>-app.{bin,bin.sha256,meta.json}` triple so
  // a subsequent flash with `kind: 'github'` resolves via cache hit and
  // never attempts a download. Returns the computed sha256 so callers can
  // cross-reference if needed (the streamer will fail with hash_mismatch
  // if the fixture's sidecar diverges from the actual bytes).
  populateFirmwareCache(args: PopulateFirmwareCacheArgs): Promise<{ sha256: string }>;
  /**
   * Poll-waits up to `timeoutMs` for the ApiServer's controllerVariantCache
   * to contain `mac` with the expected `variant`. The cache is populated
   * asynchronously by handlePollResponse after a POLL_ACK arrives; under
   * vitest's parallel-thread load, an arbitrary sleep after `stub.writePollAck`
   * isn't reliable. This helper is the deterministic alternative.
   *
   * Throws on timeout (default 3000ms).
   */
  waitForVariantCachePopulated(
    mac: string,
    expectedVariant: string,
    timeoutMs?: number,
  ): Promise<void>;
  dispose(): Promise<void>;
}

/**
 * Resolve the dist Worker URL the harness will pass to ApiServer. The build
 * itself happens in vitest's globalSetup (see global_setup.ts) so it runs
 * once in the main process before any worker thread spawns; this function
 * is read-only.
 *
 * Why a separate globalSetup instead of building here: vitest runs test
 * files in parallel worker threads, and `npm run build` includes a
 * `prebuild` step that does `rm -rf dist`. If two workers raced on the
 * build, one would delete dist/ while another was mid-spawn of the Worker
 * pointing at it — ERR_MODULE_NOT_FOUND on a half-deleted tree.
 */
function resolveDistWorkerUrl(): URL {
  // Resolve the astros_api root from this file's location.
  // here     -> .../astros_api/src/test_harness/integration_harness.ts
  // apiRoot  -> .../astros_api/
  const here = fileURLToPath(import.meta.url);
  const apiRoot = resolve(dirname(here), '..', '..');
  const distWorker = resolve(apiRoot, 'dist', 'background_tasks', 'serial_worker.js');

  try {
    statSync(distWorker);
  } catch {
    throw new Error(
      `Integration harness: ${distWorker} is missing. ` +
        `vitest's globalSetup (src/test_harness/global_setup.ts) should have built it; ` +
        `if you're running the harness outside vitest, run \`npm run build\` first.`,
    );
  }
  return pathToFileURL(distWorker);
}

export async function bootIntegrationHarness(
  opts: BootIntegrationHarnessOpts = {},
): Promise<IntegrationHarness> {
  // 0. Resolve the dist Worker URL. The build itself runs in vitest's
  //    globalSetup before any worker thread spawns; we just point the
  //    spawned ApiServer at the existing artifact here.
  const workerScriptUrl = resolveDistWorkerUrl();

  // 1. PTY pair
  const pty = await createPtyPair();

  // 2. Temp DB directory (so tests don't pollute ~/.config/astrosserver)
  const dbDir = await mkdtemp(join(tmpdir(), 'astros-integration-'));

  // 2b. Temp firmware-cache directory. FirmwareCache + FirmwareUploadStore
  //     are constructed during ApiServer.bootstrap and read this env var
  //     at construction time, so it must be set BEFORE bootstrap is called.
  //     Cleaned up in dispose alongside dbDir.
  const firmwareCacheDir = await mkdtemp(join(tmpdir(), 'astros-fwcache-'));

  // 3. Set env vars for the ApiServer's bootstrap.
  // NOTE: process.env is process-global, so concurrent harness boots in the
  // same process would race. vitest doesn't run tests within the same file
  // in parallel by default; each test sequentially boots+disposes.
  //
  // API_PORT='0' / WEBSOCKET_PORT='0' tells ApiServer to ask the kernel for
  // an ephemeral port. The harness reads back the actual ports via
  // server.getBoundApiPort()/getBoundWebsocketPort() AFTER bootstrap. This
  // avoids a TOCTOU race: a "find free port, then bind it later" scheme
  // closes the probe socket before the real bind, leaving a window for any
  // other process (or sibling vitest worker) to grab the port and cause
  // EADDRINUSE on bootstrap.
  const prevEnv = {
    SERIAL_PORT: process.env.SERIAL_PORT,
    BAUD_RATE: process.env.BAUD_RATE,
    API_PORT: process.env.API_PORT,
    WEBSOCKET_PORT: process.env.WEBSOCKET_PORT,
    JWT_KEY: process.env.JWT_KEY,
    DATABASE_PATH: process.env.DATABASE_PATH,
    FIRMWARE_CACHE_PATH: process.env.FIRMWARE_CACHE_PATH,
    NODE_ENV: process.env.NODE_ENV,
  };
  process.env.SERIAL_PORT = pty.serverPath;
  process.env.BAUD_RATE = '9600';
  process.env.API_PORT = '0';
  process.env.WEBSOCKET_PORT = '0';
  const jwtKey = process.env.JWT_KEY ?? 'test-jwt-key';
  process.env.JWT_KEY = jwtKey;
  process.env.DATABASE_PATH = dbDir;
  process.env.FIRMWARE_CACHE_PATH = firmwareCacheDir;
  // Important: do NOT set NODE_ENV='test' — that would skip setupSerialPort,
  // which is the very thing we want to exercise. Override to undefined if it
  // was set by vitest globals.
  delete process.env.NODE_ENV;

  // 3b. Generate a long-lived JWT signed with the same JWT_KEY the
  //     ApiServer reads. Mirrors `User.generateJwt()` in models/users.ts so
  //     the express-jwt middleware on /api routes accepts it identically.
  //     Done before bootstrap so the harness can return the token even if
  //     bootstrap fails partway (the token itself doesn't depend on server
  //     state — it's just a signed envelope).
  const jwtExpiry = new Date();
  jwtExpiry.setDate(jwtExpiry.getDate() + 7);
  const authToken = jsonwebtoken.sign(
    { name: 'integration-test', exp: jwtExpiry.getTime() / 1000 },
    jwtKey,
  );

  let server: ApiServer | undefined;
  let stub: StubMaster | undefined;
  let wsClient: WebSocket | undefined;

  // Captures any 'error' events from the spawned serial Worker thread. The
  // round-trip test asserts this stays empty: a Worker that died with
  // ERR_MODULE_NOT_FOUND would otherwise pass test assertions silently.
  const workerErrors: Error[] = [];

  try {
    // 4. Boot ApiServer. bootstrap() awaits both binds (HTTP listen + WS
    //    'listening'), so it rejects on EADDRINUSE rather than returning a
    //    server that's mid-bind.
    server = await ApiServer.bootstrap({
      workerScriptUrl,
      onWorkerError: (err) => workerErrors.push(err),
      firmwareReleaseFetcher: opts?.firmwareReleaseFetcher,
      flashOrchestratorConfig: opts?.flashOrchestratorConfig,
    });

    // 4b. Read back the kernel-assigned ports (we asked for 0). These are
    //     used to construct httpBaseUrl and the WS client URL below; before
    //     bootstrap returned they would have been 0, useless to the caller.
    const apiPort = server.getBoundApiPort();
    const wsPort = server.getBoundWebsocketPort();

    // 5. Construct + start StubMaster on the master end.
    stub = new StubMaster({
      ptyPath: pty.masterPath,
      masterMac: opts.masterMac,
      masterFingerprint: opts.masterFingerprint,
      masterFirmwareVersion: opts.masterFirmwareVersion,
      masterVariant: opts.masterVariant,
    });
    await stub.start();

    // 6. Connect WS client + buffer messages. The message listener must be
    // attached BEFORE the connection completes, because the server sends its
    // initial `systemStatus` + `lockState` snapshot inside its 'connection'
    // handler (which fires on handshake completion). If we awaited 'open'
    // first and then registered the listener, those frames would emit before
    // any consumer was listening and would be lost.
    wsClient = new WebSocket(`ws://127.0.0.1:${wsPort}`);

    const receivedWsMessages: unknown[] = [];
    type Listener = (msg: unknown) => void;
    const listeners: Listener[] = [];
    wsClient.on('message', (data) => {
      try {
        const parsed: unknown = JSON.parse(data.toString());
        receivedWsMessages.push(parsed);
        for (const l of [...listeners]) l(parsed);
      } catch {
        // Ignore non-JSON frames (shouldn't happen — server emits JSON).
      }
    });

    const ws = wsClient;
    await new Promise<void>((resolve, reject) => {
      ws.once('open', () => resolve());
      ws.once('error', reject);
    });

    const waitForWsMessage = <T = unknown>(
      predicate: (msg: unknown) => boolean,
      timeoutMs = 5000,
      fromIndex = 0,
    ): Promise<T> => {
      // Existing-scan ignores anything before fromIndex so a test waiting for
      // the result of an action it just initiated doesn't match a connect-time
      // snapshot frame (e.g. the WS server emits lockStateChanged{locked:false}
      // on connect — without fromIndex, a post-flash heartbeat-release wait
      // would resolve immediately on that buffered frame).
      for (let i = fromIndex; i < receivedWsMessages.length; i++) {
        const msg = receivedWsMessages[i];
        if (predicate(msg)) return Promise.resolve(msg as T);
      }

      return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => {
          const idx = listeners.indexOf(handler);
          if (idx >= 0) listeners.splice(idx, 1);
          const recent = receivedWsMessages
            .slice(-10)
            .map((m) => (m as { type?: unknown })?.type ?? '<no type>');
          reject(
            new Error(
              `waitForWsMessage timed out after ${timeoutMs}ms. ` +
                `Recent message types: ${JSON.stringify(recent)}`,
            ),
          );
        }, timeoutMs);

        const handler: Listener = (msg) => {
          if (!predicate(msg)) return;
          clearTimeout(timer);
          const idx = listeners.indexOf(handler);
          if (idx >= 0) listeners.splice(idx, 1);
          resolve(msg as T);
        };
        listeners.push(handler);
      });
    };

    // Closure over firmwareCacheDir: each test gets a fresh harness with a
    // fresh cache dir, so populateUpload always writes into the dir the
    // ApiServer's FirmwareUploadStore is reading from.
    const populateUpload = async (
      args: PopulateUploadArgs,
    ): Promise<{ uploadId: string; sha256: string }> => {
      const uploadId = randomUUID();
      const uploadsDir = join(firmwareCacheDir, 'uploads');
      await mkdir(uploadsDir, { recursive: true });

      const sha256 = createHash('sha256').update(args.binBytes).digest('hex');
      const baseName = `upload-${uploadId}`;

      await writeFile(join(uploadsDir, `${baseName}.bin`), args.binBytes);
      await writeFile(join(uploadsDir, `${baseName}.bin.sha256`), sha256);
      await writeFile(
        join(uploadsDir, `${baseName}.meta.json`),
        JSON.stringify({
          uploadId,
          originalFilename: args.originalFilename,
          projectName: args.projectName ?? 'AstrOs.ESP',
          version: args.version,
          uploadedAt: new Date().toISOString(),
          sizeBytes: args.binBytes.length,
        }),
      );

      return { uploadId, sha256 };
    };

    // Closure over firmwareCacheDir, mirroring populateUpload's shape.
    // Layout per firmware_cache.ts:
    //   <cache>/github/astros-esp-<version>-<variant>-app.bin
    //   <cache>/github/astros-esp-<version>-<variant>-app.bin.sha256
    //   <cache>/github/astros-esp-<version>-<variant>-app.meta.json
    // The sidecar contents satisfy lookup()'s SHA256_HEX_RE + isValidMeta
    // checks so a subsequent FirmwareCache.fetch() short-circuits via
    // lookup() without ever invoking its injected fetcher.
    const populateFirmwareCache = async (
      args: PopulateFirmwareCacheArgs,
    ): Promise<{ sha256: string }> => {
      const githubDir = join(firmwareCacheDir, 'github');
      await mkdir(githubDir, { recursive: true });

      const sha256 = createHash('sha256').update(args.binBytes).digest('hex');
      const baseName = `astros-esp-${args.version}-${args.variant}-app`;
      const tag = args.tag ?? `v${args.version}`;
      const publishedAt = args.publishedAt ?? new Date().toISOString();
      const sourceUrl = args.sourceUrl ?? `https://example.test/${baseName}.bin`;

      await writeFile(join(githubDir, `${baseName}.bin`), args.binBytes);
      await writeFile(join(githubDir, `${baseName}.bin.sha256`), sha256);
      await writeFile(
        join(githubDir, `${baseName}.meta.json`),
        JSON.stringify({
          tag,
          version: args.version,
          variant: args.variant,
          downloadedAt: new Date().toISOString(),
          publishedAt,
          sourceUrl,
          sizeBytes: args.binBytes.length,
        }),
      );

      return { sha256 };
    };

    const dispose = async (): Promise<void> => {
      // Reverse-order teardown. Resilient: each step in its own try/catch so
      // a failure in one doesn't leak the others.
      try {
        wsClient?.close();
      } catch {
        /* ignore */
      }
      try {
        await stub?.dispose();
      } catch {
        /* ignore */
      }
      try {
        await server?.shutdown();
      } catch {
        /* ignore */
      }
      try {
        await pty.dispose();
      } catch {
        /* ignore */
      }
      try {
        await rm(dbDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
      try {
        await rm(firmwareCacheDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }

      // Restore env vars to prevent leakage to other tests.
      for (const [key, value] of Object.entries(prevEnv)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    };

    const waitForVariantCachePopulated = async (
      mac: string,
      expectedVariant: string,
      timeoutMs = 3000,
    ): Promise<void> => {
      const startedAt = Date.now();
      // 25ms poll: the round-trip (PTY → DelimiterParser → Worker postMessage
      // → handlePollResponse → cache.set) is sub-millisecond on a quiet
      // machine but can stretch under vitest's parallel-thread load.
      const pollIntervalMs = 25;
      // Bind the server reference here — the outer `server` is reassigned
      // by the bootstrap path so TS can't narrow the closure capture.
      const apiServer = server;
      if (apiServer === undefined) {
        throw new Error('waitForVariantCachePopulated: harness server not bootstrapped');
      }
      while (Date.now() - startedAt < timeoutMs) {
        if (apiServer.getVariantForControllerForTest(mac) === expectedVariant) {
          return;
        }
        await new Promise((r) => setTimeout(r, pollIntervalMs));
      }
      const actual = apiServer.getVariantForControllerForTest(mac);
      throw new Error(
        `waitForVariantCachePopulated: cache for mac=${mac} did not reach variant=${expectedVariant} within ${timeoutMs}ms ` +
          `(actual=${actual === undefined ? '<missing>' : actual})`,
      );
    };

    return {
      server,
      stub,
      pty,
      httpBaseUrl: `http://127.0.0.1:${apiPort}`,
      authToken,
      wsClient,
      receivedWsMessages,
      workerErrors,
      waitForWsMessage,
      populateUpload,
      populateFirmwareCache,
      waitForVariantCachePopulated,
      dispose,
    };
  } catch (bootErr) {
    // If anything fails mid-boot, tear down what we did set up.
    try {
      wsClient?.close();
    } catch {
      /* ignore */
    }
    try {
      await stub?.dispose();
    } catch {
      /* ignore */
    }
    try {
      await server?.shutdown();
    } catch {
      /* ignore */
    }
    try {
      await pty.dispose();
    } catch {
      /* ignore */
    }
    try {
      await rm(dbDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    try {
      await rm(firmwareCacheDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    for (const [key, value] of Object.entries(prevEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    throw bootErr;
  }
}
