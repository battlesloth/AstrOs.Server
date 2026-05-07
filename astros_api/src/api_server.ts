/**
 * Two-mode entrypoint.
 *
 * - **Production / dev runs** (`node dist/api_server.js`, `tsx src/api_server.ts`):
 *   this file is the main module. The auto-bootstrap block at the bottom (gated by `isMainModule`) calls
 *   `ApiServer.bootstrap()` automatically and installs SIGTERM/SIGINT handlers
 *   that trigger a clean async shutdown. This is how the server runs in the
 *   container.
 *
 * - **Integration test harness** (`src/test_harness/integration_harness.ts`):
 *   the harness imports `ApiServer` and calls `bootstrap()` itself, with
 *   options that point the serial Worker at compiled dist/ and inject an
 *   error callback. The `isMainModule` check at the bottom suppresses the
 *   auto-bootstrap when this file is imported, so importing doesn't spawn
 *   a "default" server in the test process.
 *
 * Production and test paths share the same class; the only differences are
 * the constructor opts (`workerScriptUrl`, `onWorkerError`) and which side
 * initiates `bootstrap()` / `shutdown()`.
 */

import Dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import path from 'path';
import passport from 'passport';
import { expressjwt as jwt } from 'express-jwt';
import cors from 'cors';
import fileUpload from 'express-fileupload';

import Express, { Router, Application, RequestHandler as ReqHandler } from 'express';
import { WebSocketServer as Server, WebSocket } from 'ws';
import { v4 as uuid_v4 } from 'uuid';
import { Strategy } from 'passport-local';
import { Worker } from 'worker_threads';

import { pinoHttp } from 'pino-http';

import { UserRepository } from './dal/repositories/user_repository.js';
import { registerLocationRoutes } from './controllers/locations_controller.js';
import { registerAuthRoutes } from './controllers/authentication_controller.js';
import { registerScriptRoutes } from './controllers/scripts_controller.js';
import { registerAudioRoutes } from './controllers/audio_controller.js';
import { registerFileRoutes } from './controllers/file_controller.js';
import { createScriptUpload } from './models/scripts/script_upload.js';
import { ScriptRepository } from './dal/repositories/script_repository.js';

import { ScriptConverter } from './scripting/script_converter.js';
import {
  StatusResponse,
  ControllersResponse,
  TransmissionType,
  ControllerLocation,
  ScriptResponse,
  TransmissionStatus,
  ModuleSubType,
} from './models/index.js';
import { ControllerRepository } from './dal/repositories/controller_repository.js';
import { createConfigSync } from './models/config/config_sync.js';
import { createScriptRun } from './models/scripts/script_run.js';
import { logger } from './logger.js';
import { registerRemoteConfigRoutes } from './controllers/remote_config_controller.js';
import { registerSettingsRoutes } from './controllers/settings_controller.js';
import { ApiKeyValidator } from './guard/api_key_validator.js';
import { JobLock } from './job_lock/job_lock.js';
import { rejectIfLocked } from './guard/ws_lock_guard.js';
import { buildLockStateResponse } from './models/networking/lock_responses.js';
import { SerialMessageType } from './serial/serial_message.js';
import {
  ConfigSyncResponse,
  ISerialWorkerResponse,
  PollResponse,
  RegistrationResponse,
  SerialWorkerResponseType,
} from './serial/serial_worker_response.js';
import { LocationsRepository } from './dal/repositories/locations_repository.js';
import { ServoTest } from './models/servo_test.js';
import { FirmwareConfig } from './models/firmware_config.js';
import { meetsMinimum } from './utility/semver.js';

import { fileURLToPath, pathToFileURL } from 'url';

import { initializeDatabase } from './dal/database.js';
import { Kysely } from 'kysely';
import { Database } from './dal/types.js';
import { SystemStatus } from './system_status.js';
import { writeGuard } from './guard/write_guard.js';
import { registerSystemStatusRoutes } from './controllers/system_status_controller.js';
import { WorkerSerialBus } from './firmware/serial_bus.js';
import { FlashJobOrchestrator } from './firmware/flash_orchestrator.js';
import { registerFirmwareFlashRoutes } from './controllers/firmware_flash_controller.js';
import { FirmwareCache } from './firmware/firmware_cache.js';
import { FirmwareUploadStore } from './firmware/firmware_upload_store.js';
import { GitHubReleaseService } from './firmware/github_release_service.js';
import { decidePostDeployHeartbeat } from './firmware/post_deploy_heartbeat.js';
import { decideLateJoinSnapshot } from './firmware/late_join_snapshot.js';

const __filename = fileURLToPath(import.meta.url);

const __dirname = path.dirname(__filename);

import { SerialPort } from 'serialport';
import { DelimiterParser } from '@serialport/parser-delimiter';
import { registerPlaylistRoutes } from './controllers/playlist_controller.js';
import { AnimationQueue } from './serial/animation_queue/animation_queue.js';
import { AnimationQueuePlaylist } from './serial/animation_queue/queue_item/animation_queue_item.js';
import { PlaylistType } from './models/playlists/playlistType.js';
import { convertPlaylistToQueueItem } from './serial/animation_queue/playlist_converter.js';
import { PlaylistRepository } from './dal/repositories/playlist_repository.js';
// Imported via `src/*` alias to match the converter's import path. Using a
// relative path here would create two separate class instances under
// esbuild-based runtimes (tsx/vitest) and break `instanceof` checks.
import { PlaylistCycleError } from 'src/models/playlists/playlist_cycle_error.js';

interface IWebSocketMessage {
  msgType: string;
  data: any;
}

interface IServoTestData {
  controllerAddress: string;
  controllerName: string;
  moduleSubType: ModuleSubType;
  moduleIdx: number;
  channelNumber: number;
  value: number;
}

/**
 * Optional bootstrap/constructor inputs for the ApiServer. Both fields exist
 * to support the integration test harness:
 *   - `workerScriptUrl`: tests point this at compiled dist/ because tsx's
 *     loader hooks do not propagate to Worker threads, so the src/ Worker
 *     script (with its `.js`-style imports of TS sources) cannot load under
 *     vitest+tsx. Production leaves this undefined and gets the default
 *     relative-to-import.meta.url URL, which lands in dist/ at runtime.
 *   - `onWorkerError`: tests pass a callback so they can fail the test if
 *     the Worker emits an `error` event (e.g. ERR_MODULE_NOT_FOUND on boot),
 *     instead of relying on the existing logger.error which is silent to
 *     the test runner.
 */
export interface ApiServerOptions {
  workerScriptUrl?: URL;
  onWorkerError?: (err: Error) => void;
  /**
   * Tests inject a fake `fetch` so `GitHubReleaseService.getReleases()` returns
   * canned release data instead of hitting GitHub's REST API. Production leaves
   * this undefined and gets the global `fetch`.
   */
  firmwareReleaseFetcher?: typeof fetch;
  /**
   * Tests override the FlashJobOrchestrator's reboot-timeout (default 15s)
   * to keep wrong-version-heartbeat / timer-fallback tests fast. Production
   * leaves this undefined.
   */
  flashOrchestratorConfig?: {
    rebootTimeoutMs?: number;
    throttleWindowMs?: number;
  };
  /**
   * Per-instance overrides for values normally pulled from process.env.
   * The integration harness uses this to avoid mutating the process-global
   * environment — concurrent harness boots (in any future test pool that
   * shares process.env across workers) would otherwise clobber each other's
   * SERIAL_PORT / DATABASE_PATH / etc. Each field falls back to the
   * corresponding env var when undefined, preserving production behavior
   * for the auto-bootstrap caller.
   */
  configOverrides?: ConfigOverrides;
}

export interface ConfigOverrides {
  readonly serialPort?: string;
  readonly baudRate?: number;
  readonly apiPort?: number;
  readonly websocketPort?: number;
  readonly jwtKey?: string;
  /**
   * Full file path to the SQLite database (matching `initializeDatabase`'s
   * `dbPath` semantics — the file, not the directory).
   */
  readonly databasePath?: string;
  readonly firmwareCachePath?: string;
  /**
   * When true, ApiServer.Init skips serial-port setup. Mirrors the legacy
   * `NODE_ENV=test` short-circuit. The harness sets this to `false`
   * explicitly because vitest defaults NODE_ENV to 'test' (which would
   * otherwise skip serial setup, the very thing the harness is exercising).
   */
  readonly skipSerialSetup?: boolean;
}

// Exported so the integration test harness can import + bootstrap an
// instance directly. Production never imports this class — the auto-bootstrap
// block at the bottom of this file is the only production caller of
// `bootstrap()`.
// See file header for the full two-mode contract.
export class ApiServer {
  private apiPort = 0;
  private websocketPort = 0;
  private clients: Map<string, WebSocket>;

  private app: Application;
  private router: Router;
  private websocket?: Server;

  private serialWorker!: Worker;
  private serialPort: any;
  private serialParser: any;

  private readonly workerScriptUrl: URL;
  private readonly onWorkerError?: (err: Error) => void;
  private readonly firmwareReleaseFetcher?: typeof fetch;
  private readonly flashOrchestratorConfig?: {
    rebootTimeoutMs?: number;
    throttleWindowMs?: number;
  };
  private readonly configOverrides?: ConfigOverrides;

  private httpServer?: import('http').Server;

  private animationQueue!: AnimationQueue;

  private authHandler!: any;
  private apiKeyValidator!: ReqHandler;

  private db!: Kysely<Database>;
  private systemStatus = new SystemStatus();
  private readonly jobLock = new JobLock();

  // Firmware-OTA wiring. The orchestrator + WorkerSerialBus
  // are constructed in setupSerialPort() because they depend on the serial
  // worker; when serial setup is skipped — either explicit override
  // (`configOverrides.skipSerialSetup=true`), or no override AND
  // NODE_ENV='test' — `flashOrchestrator` stays undefined and the flash
  // routes aren't registered either, so HTTP /api/firmware/flash returns
  // 404 in unit tests rather than tripping a null deref on the
  // orchestrator. The integration harness sets skipSerialSetup=false
  // explicitly to override vitest's NODE_ENV='test' default and exercise
  // the serial path. The firmware cache, upload store, and GitHub release
  // service are constructed unconditionally in configApi() because they
  // have no Worker dependency and are otherwise useful (unit tests don't
  // reach them, but the construction is cheap).
  private firmwareCache!: FirmwareCache;
  private firmwareUploadStore!: FirmwareUploadStore;
  private githubReleaseService!: GitHubReleaseService;
  private workerSerialBus?: WorkerSerialBus;
  private flashOrchestrator?: FlashJobOrchestrator;
  // POLL_ACK-fed variant cache, keyed by controller MAC (the same id flowing
  // through FW_PROGRESS / FW_DEPLOY_BEGIN). Populated by handlePollResponse
  // whenever a POLL_ACK arrives with a non-empty variant; consumed by the
  // orchestrator's controllersStore.listFlashTargets() at flash time. Entries
  // never expire — a controller that goes offline keeps its last-known
  // variant until the server restarts (or a fresh POLL_ACK overwrites it).
  // Per FMI §7 row "controllers cache": stale entries are operator-recoverable
  // (re-poll via syncControllers) and out-of-scope for c.6c.1.
  private readonly controllerVariantCache = new Map<string, string>();

  /**
   * Test-only accessor for the POLL_ACK-fed variant cache. Used by the
   * integration harness to poll-wait for a stub master's POLL_ACK to round-trip
   * through Worker → handlePollResponse → cache.set(). Without this, tests
   * have to sleep an arbitrary duration before flashing, which flakes under
   * vitest's parallel-thread load.
   *
   * Not part of the production runtime API. Callers outside `test_harness/`
   * should not use this.
   */
  public getVariantForControllerForTest(mac: string): string | undefined {
    return this.controllerVariantCache.get(mac);
  }

  upload!: any;

  private isSerialWorkerAvailable(): boolean {
    return this.serialWorker !== undefined;
  }

  private sendSerialUnavailable(res?: any): boolean {
    if (this.isSerialWorkerAvailable()) {
      return false;
    }

    logger.warn('Serial services unavailable; serial port setup was skipped or failed');

    if (res) {
      res.status(503);
      res.json({
        message: 'Serial services unavailable',
      });
    }

    return true;
  }

  /**
   * Wraps a serial route handler with the standard boilerplate:
   * - short-circuits with 503 when the serial worker is unavailable
   * - catches thrown errors and responds with 500
   *
   * The wrapped handler is responsible for sending its own success response,
   * so handlers can still return 404 or other status codes when appropriate.
   */
  private withSerialGuard(
    handler: (req: any, res: any, next: any) => Promise<void> | void,
  ): (req: any, res: any, next: any) => Promise<void> {
    return async (req, res, next) => {
      if (this.sendSerialUnavailable(res)) return;
      try {
        await handler(req, res, next);
      } catch (error) {
        logger.error(error);
        res.status(500);
        res.json({
          message: 'Internal server error',
        });
      }
    };
  }

  constructor(opts?: ApiServerOptions) {
    Dotenv.config({ path: __dirname + '/.env' });

    this.configOverrides = opts?.configOverrides;
    this.apiPort = this.configOverrides?.apiPort ?? Number.parseInt(process.env.API_PORT || '3000');
    this.websocketPort =
      this.configOverrides?.websocketPort ?? Number.parseInt(process.env.WEBSOCKET_PORT || '5000');

    this.clients = new Map<string, WebSocket>();
    this.app = Express();
    this.router = Express.Router();

    // Default Worker URL is the relative ./background_tasks/serial_worker.js,
    // which resolves correctly when running compiled `node dist/api_server.js`
    // (where dist/background_tasks/serial_worker.js exists alongside dist/logger.js).
    // Tests override this to point at the compiled dist/ Worker because the
    // src/ Worker file's `.js` imports cannot be resolved by Worker threads
    // under tsx (Worker threads don't inherit the tsx loader).
    this.workerScriptUrl =
      opts?.workerScriptUrl ?? new URL('./background_tasks/serial_worker.js', import.meta.url);
    this.onWorkerError = opts?.onWorkerError;
    this.firmwareReleaseFetcher = opts?.firmwareReleaseFetcher;
    this.flashOrchestratorConfig = opts?.flashOrchestratorConfig;

    // Broadcast lock state to all connected clients on every change. Subscribed
    // here (rather than in Init) so a state change emitted before Init finishes
    // — which won't happen today, but is a cheap guarantee — still reaches the
    // updateClients fan-out path. The clients Map starts empty; updateClients
    // is a no-op until WS connections land.
    this.jobLock.subscribe((state) => {
      this.updateClients(buildLockStateResponse(state));
    });
  }

  public async Init() {
    logger.info('Initializing database');
    this.db = await initializeDatabase(this.systemStatus, {
      dbPath: this.configOverrides?.databasePath,
    });

    logger.info('Setting up authentication strategy');
    this.setAuthStrategy();

    logger.info('Setting up API server');
    await this.configApi();

    logger.info('Setting up animation queue');
    this.animationQueue = new AnimationQueue((scriptId, locations) => {
      this.dispatchScriptFromQueue(scriptId, locations);
    });

    logger.info('Setting up routes');
    this.setRoutes();

    const skipSerialSetup =
      this.configOverrides?.skipSerialSetup ?? process.env.NODE_ENV?.toLocaleLowerCase() === 'test';
    if (skipSerialSetup) {
      logger.warn(
        `Skipping serial port setup (configOverrides.skipSerialSetup=${String(this.configOverrides?.skipSerialSetup)}, NODE_ENV=${process.env.NODE_ENV ?? '<unset>'})`,
      );
    } else {
      logger.info('Starting up serial port services');
      this.setupSerialPort();
    }

    logger.info('Starting web services');
    await this.runWebServices();
  }

  /**
   * Construct + Init the server. Two callers:
   *  1. Production auto-bootstrap block at the bottom (gated by `isMainModule`) of this file — invoked with no args
   *     when api_server.js is the main module.
   *  2. Integration test harness — invoked with `opts` pointing the serial
   *     Worker at compiled dist/ and supplying an error callback so a
   *     Worker boot failure surfaces as a test failure.
   *
   * On boot failure, throws after logging the underlying cause.
   */
  public static async bootstrap(opts?: ApiServerOptions): Promise<ApiServer> {
    const server = new ApiServer(opts);
    try {
      await server.Init();
    } catch (error) {
      logger.error(error);
      // Preserve the original error via `cause` so callers can inspect the
      // underlying failure (e.g. tests asserting on JWT_KEY misconfig, or a
      // future debug session distinguishing EADDRINUSE from a DB migration
      // failure). Without it, the rewrap discards the only specific signal
      // the caller has. Set as a property rather than the ES2022 `Error`
      // constructor option because tsconfig.target is ES6 — Node 20 still
      // exposes `cause` on the instance just fine.
      const wrapped = new Error('Failed to initialize server');
      (wrapped as Error & { cause?: unknown }).cause = error;
      throw wrapped;
    }

    return server;
  }

  private setAuthStrategy(): void {
    passport.use(
      new Strategy(
        {
          usernameField: 'username',
        },
        async (username: string, password: string, done) => {
          const repository = new UserRepository(this.db);

          const user = await repository.getByUsername(username);

          // Return if user not found in database
          if (!user) {
            return done(null, false, {
              message: 'User not found',
            });
          }
          // Return if password is wrong
          if (!user.validatePassword(password)) {
            return done(null, false, {
              message: 'Password is wrong',
            });
          }
          // If credentials are correct, return the user object
          return done(null, user);
        },
      ),
    );
  }

  private async configApi(): Promise<void> {
    const loggerMiddleware = pinoHttp({
      logger: logger,
      autoLogging: true,
      serializers: {
        req(req) {
          return { method: req.method, url: req.url };
        },
        res(res) {
          return { statusCode: res.statusCode };
        },
      },
      customSuccessMessage(req, res) {
        return `${req.method} ${req.url} ${res.statusCode}`;
      },
      customErrorMessage(req, res, error) {
        return `${req.method} ${req.url} ${res.statusCode} - ${error.message}`;
      },
      customLogLevel(req, res, error) {
        if (res.statusCode >= 400 && res.statusCode < 500) {
          return 'warn';
        } else if (res.statusCode >= 500 || error) {
          return 'error';
        }
        return 'info';
      },
    });

    this.app.use(loggerMiddleware);

    const allowedOrigins = process.env.CORS_ORIGIN
      ? process.env.CORS_ORIGIN.split(',').map((origin) => origin.trim())
      : ['http://localhost:5173', 'http://localhost:8080'];

    this.app.use(
      cors({
        origin: allowedOrigins,
        credentials: true,
      }),
    );
    this.app.use(fileUpload());
    this.app.use(Express.json());
    this.app.use(Express.urlencoded({ extended: false }));
    this.app.use(cookieParser());
    this.app.use(Express.static(path.join(__dirname, 'public')));
    this.app.use(passport.initialize());
    this.app.use('/api', writeGuard(this.systemStatus, this.jobLock));
    this.app.use('/api', this.router);

    this.app.get('/index.html', (req, res) => {
      res.send('Hello World!');
    });

    this.app.use((req: any, res: any, next: any) => {
      res.status(404).json({
        message: 'Endpoint not found',
      });
    });

    this.app.use((err: any, req: any, res: any, next: any) => {
      res.locals.message = err.message;
      res.locals.error = req.app.get('env') === 'development' ? err : {};
      res.status(err.status || 500).json({
        message: err.message || 'Internal server error',
      });
    });

    const jwtKey = this.configOverrides?.jwtKey ?? process.env.JWT_KEY;
    if (!jwtKey) {
      // Throw rather than process.exit: ApiServer is also imported as a
      // class by the integration harness, and library-style init code
      // calling process.exit makes graceful test failure (or any caller's
      // misconfiguration handling) impossible. The auto-bootstrap block
      // at the bottom of this file owns process.exit; bootstrap()'s catch
      // logs the original error before rethrowing.
      throw new Error(
        'JWT_KEY is required (set process.env.JWT_KEY or pass configOverrides.jwtKey)',
      );
    }

    this.authHandler = jwt({
      secret: jwtKey,
      algorithms: ['HS256'],
    });

    this.apiKeyValidator = ApiKeyValidator(this.db);

    // Firmware infrastructure shared across the c.4 / c.5 / c.3 endpoints and
    // the c.6c.1 orchestrator. Constructed unconditionally — the cache/upload
    // store resolve their root from `configOverrides.firmwareCachePath` if
    // supplied, otherwise FIRMWARE_CACHE_PATH (default ~/.config/astrosserver),
    // and the release service is a thin GitHub API wrapper. None of them open
    // the serial worker, so test mode is safe.
    this.firmwareCache = new FirmwareCache({ rootDir: this.configOverrides?.firmwareCachePath });
    this.firmwareUploadStore = new FirmwareUploadStore({
      rootDir: this.configOverrides?.firmwareCachePath,
    });
    this.githubReleaseService = new GitHubReleaseService(
      process.env.FIRMWARE_REPO ?? 'battlesloth/AstrOs.ESP',
      this.firmwareReleaseFetcher ?? fetch,
    );
  }

  private setRoutes(): void {
    registerAuthRoutes(this.router);
    registerSystemStatusRoutes(this.router, this.systemStatus);
    registerLocationRoutes(this.router, this.authHandler, this.db);
    registerScriptRoutes(this.router, this.authHandler, this.db);
    registerPlaylistRoutes(this.router, this.authHandler, this.db);
    registerRemoteConfigRoutes(this.router, this.authHandler, this.apiKeyValidator, this.db);
    registerSettingsRoutes(this.router, this.authHandler, this.db);
    registerAudioRoutes(this.router, this.authHandler, this.db);
    registerFileRoutes(this.router, this.authHandler, this.db);

    this.router.get('/check-session', this.authHandler, (req: any, res: any, next: any) => {
      res.status(200);
      res.json({ isAuthenticated: true });
    });

    this.router.get(
      '/locations/syncconfig',
      this.authHandler,
      this.withSerialGuard((req, res, next) => this.syncControllerConfig(req, res, next)),
    );

    this.router.get(
      '/locations/synccontrollers',
      this.authHandler,
      this.withSerialGuard((req, res, next) => this.syncControllers(req, res, next)),
    );

    this.router.get(
      '/scripts/upload',
      this.authHandler,
      this.withSerialGuard((req, res, next) => this.uploadScript(req, res, next)),
    );

    this.router.get(
      '/scripts/run',
      this.authHandler,
      this.withSerialGuard((req, res, next) => this.runScript(req, res, next)),
    );

    this.router.get(
      '/playlists/run',
      this.authHandler,
      this.withSerialGuard((req, res, next) => this.runPlaylist(req, res, next)),
    );

    this.router.post(
      '/settings/formatSD',
      this.authHandler,
      this.withSerialGuard((req, res, next) => this.formatSD(req, res, next)),
    );

    this.router.post(
      '/directcommand',
      this.authHandler,
      this.withSerialGuard((req, res, next) => this.directCommand(req, res, next)),
    );

    this.router.post(
      '/panicStop',
      this.authHandler,
      this.withSerialGuard((req, res, next) => this.panicStop(req, res, next)),
    );

    this.router.post('/panicClear', this.authHandler, (req: any, res: any, next: any) => {
      this.animationQueue.clearPanicStop();
      res.status(200);
      res.json({ message: 'success' });
    });

    // API key secured routes
    this.router.get(
      '/remotecontrol',
      this.apiKeyValidator,
      this.withSerialGuard((req, res, next) => this.remoteControl(req, res, next)),
    );
  }

  private setupSerialPort(): void {
    this.serialWorker = new Worker(this.workerScriptUrl);

    this.serialWorker.on('exit', (exit) => {
      logger.info(exit);
    });
    this.serialWorker.on('error', (err) => {
      logger.error(err);
      this.onWorkerError?.(err);
    });

    this.serialWorker.on('message', (msg) => {
      this.handleSerialWorkerMessage(msg);
    });

    // c.6c.1 firmware-OTA orchestrator. Built here (rather than in configApi)
    // because the WorkerSerialBus needs the serialWorker reference. Test mode
    // skips setupSerialPort() entirely, so this branch only runs in real
    // runtime — the flash routes are registered alongside so HTTP /api/firmware/flash
    // 404s in tests rather than reaching an undefined orchestrator.
    this.workerSerialBus = new WorkerSerialBus({ worker: this.serialWorker });
    this.flashOrchestrator = new FlashJobOrchestrator({
      bus: this.workerSerialBus,
      jobLock: this.jobLock,
      cache: this.firmwareCache,
      upload: this.firmwareUploadStore,
      releaseService: this.githubReleaseService,
      controllersStore: {
        // The variant cache is the in-memory source of truth for "which
        // controllers have we observed alive" (POLL_ACK is the heartbeat).
        // Returning a snapshot per call keeps the orchestrator's
        // validateControllers free to apply trim/uniformity checks without
        // racing a concurrent POLL_ACK update of the underlying Map.
        listFlashTargets: async () =>
          Array.from(this.controllerVariantCache.entries()).map(([id, variant]) => ({
            id,
            variant,
          })),
      },
      emitWs: (msg) => this.updateClients(msg),
      config: this.flashOrchestratorConfig,
    });
    registerFirmwareFlashRoutes(this.router, this.authHandler, this.flashOrchestrator);

    try {
      this.serialPort = new SerialPort({
        path: this.configOverrides?.serialPort ?? process.env.SERIAL_PORT ?? '/dev/ttyS0',
        baudRate:
          this.configOverrides?.baudRate ?? Number.parseInt(process.env.BAUD_RATE || '9600'),
      });

      this.serialPort.on('error', (err: any) => {
        logger.error(`Serial port error: ${err}`);
      });

      this.serialPort.on('close', () => {
        logger.warn('Serial port closed');
      });

      this.serialParser = this.serialPort
        .pipe(new DelimiterParser({ delimiter: '\n' }))
        .on('data', (data: any) => {
          this.serialWorker.postMessage({
            type: SerialMessageType.SERIAL_MSG_RECEIVED,
            data: data.toString(),
          });
        });
    } catch (err) {
      logger.error(`Failed to open serial port: ${err}`);
    }
  }

  private async runWebServices(): Promise<void> {
    // Await both binds (HTTP listen + WS 'listening') before returning so
    // bootstrap() rejects cleanly on EADDRINUSE in production, and so the
    // integration harness can read the bound ports back via
    // getBoundApiPort/getBoundWebsocketPort. Setting API_PORT/WEBSOCKET_PORT
    // to '0' lets the kernel assign ephemeral ports — used by the harness
    // to avoid the TOCTOU race that any "find free port, then bind it
    // later" scheme has.
    await new Promise<void>((resolve, reject) => {
      const httpServer = this.app.listen(this.apiPort, () => {
        logger.info(`The application is listening on port ${this.getBoundApiPort()}`);
        resolve();
      });
      this.httpServer = httpServer;
      httpServer.once('error', reject);
    });

    // Wrap WS setup in a try/catch. If WS bind fails (e.g. websocketPort
    // already in use), the HTTP server above is already listening — without
    // this rollback we'd leak a live listening socket on every failed
    // bootstrap, which manifests as cumulative EADDRINUSE flakes in tests
    // that retry-after-failure.
    // Capture the systemStatus unsubscribe handle so the rollback can detach
    // the subscriber if WS bind fails. Without this, the closure would
    // outlive the dead instance — on the next bootstrap (or a sibling
    // instance under test), the orphaned subscriber would double-emit
    // systemStatus frames AND keep the dead instance alive in the
    // emitter's set.
    let unsubscribeSystemStatus: (() => void) | undefined;
    try {
      const ws = (this.websocket = new Server({ port: this.websocketPort }));

      unsubscribeSystemStatus = this.systemStatus.subscribe((state) => {
        this.updateClients({ type: TransmissionType.systemStatus, data: state });
      });

      // Connection handler attached synchronously before awaiting 'listening'
      // so any client racing the bind still hits the handler — the WS server
      // begins accepting connections only when 'listening' fires, but
      // attaching after the await would leave a window where the listener
      // isn't installed yet.
      ws.on('connection', (conn) => {
        const id = uuid_v4();
        this.clients.set(id, conn);

        try {
          conn.send(
            JSON.stringify({
              type: TransmissionType.systemStatus,
              data: this.systemStatus.getState(),
            }),
          );
        } catch (err) {
          logger.error(`websocket initial systemStatus send error: ${err}`);
        }

        // Late-join snapshot: a client connecting while the lock is held would
        // otherwise wait until the next acquire/release transition to learn the
        // current state. Mirrors the systemStatus initial send above.
        try {
          conn.send(JSON.stringify(buildLockStateResponse(this.jobLock.getState())));
        } catch (err) {
          logger.error(`websocket initial lockState send error: ${err}`);
        }

        // Flash-job late-join snapshot. When a client connects
        // mid-flash, send the current FlashJobState so the operator UI can
        // reconstruct progress without waiting for the next per-controller
        // update. Sent only when a job is in flight; nothing is sent for the
        // common "no active job" case (per spec §"Late-join" — no history
        // persistence in v1, so completed jobs are not retained). Skipped in
        // test mode where flashOrchestrator is undefined.
        if (this.flashOrchestrator !== undefined) {
          try {
            const snapshot = decideLateJoinSnapshot(this.flashOrchestrator.getCurrentJob());
            if (snapshot.kind === 'flashJobStarted') {
              conn.send(
                JSON.stringify({
                  type: TransmissionType.flashJobStarted,
                  data: snapshot.data,
                }),
              );
            }
          } catch (err) {
            logger.error(`websocket initial flashJobStarted send error: ${err}`);
          }
        }

        conn.on('message', (msg) => {
          this.handleWebsocketMessage(msg.toString(), conn);
        });

        conn.on('close', () => {
          this.clients.delete(id);
          logger.info(`websocket disconnected: id=${id}`);
        });

        conn.on('error', (err) => {
          logger.error(`websocket client error: id=${id}, ${err}`);
          this.clients.delete(id);
        });

        logger.info(`websocket connected: id=${id}`);
      });

      await new Promise<void>((resolve, reject) => {
        ws.once('listening', () => resolve());
        ws.once('error', reject);
      });
      logger.info(`websocket server listening on port ${this.getBoundWebsocketPort()}`);
    } catch (wsErr) {
      // Roll back the HTTP bind so we don't leak a listening socket. Also
      // close the partial WS server if it got constructed before failing
      // (the ws library schedules its bind on next tick, so the Server
      // instance exists even when the listen errored). And detach the
      // systemStatus subscriber so the dead instance doesn't keep getting
      // ticked by the emitter (and so the closure can be GC'd).
      if (unsubscribeSystemStatus !== undefined) {
        unsubscribeSystemStatus();
      }
      const httpServer = this.httpServer;
      this.httpServer = undefined;
      if (httpServer !== undefined) {
        // Surface httpServer.close errors via logger.warn rather than the
        // prior swallow. ENOTLISTENING here means the rollback is a no-op
        // — combined with the still-bound socket from the listen success,
        // that's a leak the user needs to know about. We don't rethrow
        // because the original wsErr is the failure the caller asked
        // about; close errors during rollback are diagnostics, not the
        // primary fault.
        await new Promise<void>((resolve) =>
          httpServer.close((closeErr) => {
            if (closeErr) {
              logger.warn(`runWebServices rollback: httpServer.close failed: ${closeErr.message}`);
            }
            resolve();
          }),
        );
      }
      const partialWs = this.websocket;
      this.websocket = undefined;
      if (partialWs !== undefined) {
        // ws.Server.close(cb) only fires its callback once the underlying
        // http server has shut down — but on a WS that errored before
        // reaching 'listening', that internal state may never resolve and
        // close() can hang forever. Race against a short timeout so the
        // rollback always completes; the original wsErr is the diagnostic
        // we care about either way.
        try {
          await Promise.race([
            new Promise<void>((resolve) => partialWs.close(() => resolve())),
            new Promise<void>((resolve) => setTimeout(resolve, 1000)),
          ]);
        } catch (closeErr) {
          // Synchronous throw from partialWs.close — log but don't mask wsErr.
          const msg = closeErr instanceof Error ? closeErr.message : String(closeErr);
          logger.warn(`runWebServices rollback: partialWs.close threw: ${msg}`);
        }
      }
      throw wsErr;
    }
  }

  /**
   * Port the HTTP server is actually bound to. Useful for callers that pass
   * `API_PORT=0` to request an ephemeral port and need to know the kernel's
   * assignment. Throws if called before `runWebServices` completes.
   */
  public getBoundApiPort(): number {
    if (this.httpServer === undefined) {
      throw new Error('ApiServer.getBoundApiPort: httpServer not yet running');
    }
    const addr = this.httpServer.address();
    if (typeof addr !== 'object' || addr === null) {
      throw new Error(
        `ApiServer.getBoundApiPort: httpServer.address() returned ${typeof addr}, expected object`,
      );
    }
    return addr.port;
  }

  /**
   * Port the WebSocket server is actually bound to. See `getBoundApiPort`.
   * Throws if called before `runWebServices` completes or if the server was
   * configured for a unix-socket path (never the case in this codebase, but
   * the `ws` library's address() type permits it).
   */
  public getBoundWebsocketPort(): number {
    if (this.websocket === undefined) {
      throw new Error('ApiServer.getBoundWebsocketPort: websocket not yet running');
    }
    const addr = this.websocket.address();
    if (typeof addr === 'string') {
      throw new Error(
        'ApiServer.getBoundWebsocketPort: websocket bound to unix socket, no port available',
      );
    }
    if (addr === null) {
      throw new Error('ApiServer.getBoundWebsocketPort: websocket.address() returned null');
    }
    return addr.port;
  }

  handleWebsocketMessage(msg: string, conn: WebSocket): void {
    try {
      const parsed = JSON.parse(msg) as IWebSocketMessage;

      // Lock guard: write-class inbound messages are rejected per-connection
      // when a flash job is in progress. The originating client receives a
      // lockStateChanged echo + flashJobActive frame and we skip dispatch.
      // (HTTP write-class requests are gated separately in writeGuard at the
      // global /api mount.)
      if (rejectIfLocked(parsed.msgType, conn, this.jobLock)) return;

      switch (parsed.msgType) {
        case 'SERVO_TEST':
          this.servoMoveCommand(parsed.data as IServoTestData);
          break;
        default:
          logger.error(`Unknown websocket message type: ${parsed.msgType}`);
          break;
      }
    } catch (error) {
      logger.error(`Error parsing websocket message: ${error}`);
    }
  }

  handleSerialWorkerMessage(msg: ISerialWorkerResponse): void {
    switch (msg.type) {
      case SerialWorkerResponseType.UNKNOWN:
        logger.error(`Invalid message received: ${JSON.stringify(msg)}`);
        break;
      case SerialWorkerResponseType.SEND_SERIAL_MESSAGE:
        this.serialPort.write(msg.data, (err: any) => {
          if (err) {
            logger.error(`Error sending serial message: ${err}`);
          }
        });
        break;
      case SerialWorkerResponseType.UPDATE_CLIENTS:
        this.updateClients(msg);
        break;
      case SerialWorkerResponseType.REGISTRATION_SYNC:
        this.handleResgistraionResponse(msg);
        break;
      case SerialWorkerResponseType.POLL:
        this.handlePollResponse(msg);
        break;
      case SerialWorkerResponseType.CONFIG_SYNC:
        this.handleConfigSync(msg);
        break;
      case SerialWorkerResponseType.SCRIPT_DEPLOY:
        this.handleScriptDeployResponse(msg);
        break;
    }
  }
  //#region FROM SERIAL

  async handleResgistraionResponse(msg: ISerialWorkerResponse) {
    try {
      logger.info(`Handling registration response: ${JSON.stringify(msg)}`);

      const val = msg as RegistrationResponse;

      const controllerRepo = new ControllerRepository(this.db);

      await controllerRepo.insertControllers(val.registrations);

      const controllers = await controllerRepo.getControllers();

      logger.info(`Controllers after registration sync: ${JSON.stringify(controllers)}`);

      const update: ControllersResponse = {
        type: TransmissionType.controllers,
        success: val.success,
        message: '',
        controllers,
      };
      this.updateClients(update);
    } catch (error) {
      logger.error(`Error handling registration response: ${error}`);
      this.updateClients({
        type: TransmissionType.controllers,
        success: false,
        message: '',
        controllers: [],
      } as ControllersResponse);
    }
  }

  async handlePollResponse(msg: ISerialWorkerResponse) {
    try {
      const val = msg as PollResponse;

      // Feed the variant cache + heartbeat callback BEFORE
      // the existing DB lookups. The cache populates regardless of whether
      // the controller is registered (DB lookup may fail for first-poll
      // controllers before sync runs); the heartbeat callback fires only
      // when a flash is in flight and the version matches the deployed
      // target, so out-of-protocol heartbeats are dropped here rather than
      // sent into the orchestrator. POLL_ACK with empty variant — older
      // firmware that hasn't picked up the c.6c.1 protocol extension —
      // leaves `controller.variant` undefined per handlePollAck; we skip
      // updating the cache in that case so a regression to old firmware
      // doesn't poison the cache with an empty string.
      const variant = val.controller.variant;
      if (typeof variant === 'string' && variant.length > 0) {
        this.controllerVariantCache.set(val.controller.address, variant);
      }

      // Heartbeat callback: only the master's post-deploy POLL_ACK
      // (sentinel MAC, version matches deployed target) releases the
      // lock. Padawans poll routinely during a flash and any padawan
      // that has already rebooted into the same target version would
      // race the master if we didn't filter on the master sentinel.
      // Decision logic lives in `decidePostDeployHeartbeat` — pure
      // function, fully unit-tested. Log paths surface diagnostic
      // gaps (empty firmwareVersion / wrong version) instead of
      // silently relying on the 15s timer fallback.
      const currentJob = this.flashOrchestrator?.getCurrentJob() ?? null;
      const decision = decidePostDeployHeartbeat(
        val.controller.address,
        val.controller.firmwareVersion,
        currentJob,
      );
      switch (decision.kind) {
        case 'fire':
          this.flashOrchestrator?.notifyMasterHeartbeat(decision.version);
          break;
        case 'empty_version_during_flash':
          logger.info(
            `flash heartbeat: master POLL_ACK from ${decision.from} carried no firmwareVersion during active flash ${decision.jobId}; relying on reboot-timer fallback`,
          );
          break;
        case 'version_mismatch':
          logger.info(
            `flash heartbeat: master POLL_ACK firmwareVersion=${decision.reported} does not match expected ${decision.expected} for job ${decision.jobId}; ignoring`,
          );
          break;
        case 'no_active_job':
        case 'not_master':
          break;
      }

      const controlerRepo = new ControllerRepository(this.db);
      const locationRepo = new LocationsRepository(this.db);

      const controller = await controlerRepo.getControllerByAddress(val.controller.address);

      if (controller === null) {
        logger.error(`Controller not found for address: ${val.controller.address}`);
        return;
      }

      const location = await locationRepo.getLocationByController(controller.id);

      if (location === null) {
        logger.error(`Location not found for controller: ${val.controller.name}`);
        return;
      }

      const firmwareVersion = val.controller.firmwareVersion;
      const firmwareCompatible = meetsMinimum(
        firmwareVersion,
        FirmwareConfig.MINIMUM_FIRMWARE_VERSION,
      );

      const update: StatusResponse = {
        type: TransmissionType.status,
        success: true,
        message: '',
        controllerId: controller.id,
        controllerLocation: location.locationName,
        up: true,
        synced: val.controller.fingerprint === location.configFingerprint,
        firmwareVersion,
        firmwareCompatible,
      };

      this.updateClients(update);
    } catch (error) {
      logger.error(`Error handling poll response: ${error}`);
    }
  }

  async handleConfigSync(msg: ISerialWorkerResponse) {
    try {
      const val = msg as ConfigSyncResponse;

      const locationRepo = new LocationsRepository(this.db);

      const locationId = await locationRepo.getLocationIdByControllerByMac(val.controller.address);

      if (!locationId) {
        logger.error(`Location not found for controller: ${val.controller.name}`);
        return;
      }

      await locationRepo.updateLocationFingerprint(locationId, val.controller.fingerprint ?? '');
    } catch (error) {
      logger.error(`Error handling config sync response: ${error}`);
    }
  }

  private async handleScriptDeployResponse(msg: ISerialWorkerResponse) {
    try {
      const val = msg as ConfigSyncResponse;

      const locationRepo = new LocationsRepository(this.db);
      const scriptRepo = new ScriptRepository(this.db);

      const locId = await locationRepo.getLocationNameByMac(val.controller.address);

      if (val.success) {
        const now = new Date();

        await scriptRepo.updateScriptControllerUploaded(val.scriptId, locId, now);

        const update: ScriptResponse = {
          type: TransmissionType.script,
          success: true,
          message: '',
          scriptId: val.scriptId,
          locationId: locId,
          status: TransmissionStatus.success,
          date: now,
        };

        this.updateClients(update);
      } else {
        const deployDate = await scriptRepo.getLastScriptUploadedDate(val.scriptId, locId);
        const update: ScriptResponse = {
          type: TransmissionType.script,
          success: true,
          message: '',
          scriptId: val.scriptId,
          locationId: locId,
          status: TransmissionStatus.failed,
          date: deployDate,
        };

        this.updateClients(update);
      }
    } catch (error) {
      logger.error(`Error handling script deploy response: ${error}`);
    }
  }

  //#region

  //#region TO SERIAL WORKER

  private async syncControllers(req: any, res: any, next: any) {
    logger.info('syncing controllers');
    this.serialWorker.postMessage({
      type: SerialMessageType.REGISTRATION_SYNC,
      data: null,
    });
    res.status(200);
    res.json({ message: 'success' });
  }

  private async syncControllerConfig(req: any, res: any, next: any) {
    logger.info('syncing controller config');

    const repo = new LocationsRepository(this.db);

    const locations = await repo.loadLocations();

    const toSync = new Array<ControllerLocation>();

    for (let i = 0; i < locations.length; i++) {
      if (!locations[i].controller.address) {
        continue;
      }

      const ctl = await repo.loadLocationConfiguration(locations[i]);

      if (ctl) {
        toSync.push(ctl);
      }
    }

    const configSync = createConfigSync(toSync);

    this.serialWorker.postMessage({
      type: SerialMessageType.DEPLOY_CONFIG,
      data: configSync,
    });

    res.status(200);
    res.json({ message: 'success' });
  }

  private async uploadScript(req: any, res: any, next: any) {
    logger.info('uploading script');

    const id = req.query.id;

    const scriptRepo = new ScriptRepository(this.db);
    const locationsRepo = new LocationsRepository(this.db);

    const cvtr = new ScriptConverter(scriptRepo);

    const messages = await cvtr.convertScript(id);

    if (messages.size < 1) {
      logger.warn(`No locations script values returned for ${id}`);
    }

    const locations = await locationsRepo.loadLocations();

    logger.debug(`scripts: ${JSON.stringify(messages)}`);

    const msg = createScriptUpload(id, messages, locations);

    logger.debug(`msg: ${JSON.stringify(msg)}`);

    this.serialWorker.postMessage({
      type: SerialMessageType.DEPLOY_SCRIPT,
      data: msg,
    });

    res.status(200);
    res.json({ message: 'success' });
  }

  private async runPlaylist(req: any, res: any, next: any) {
    const id = req.query.id;
    logger.info(`running playlist ${id}`);

    const playlistRepo = new PlaylistRepository(this.db);
    const locationsRepo = new LocationsRepository(this.db);

    try {
      const playlist = await playlistRepo.getPlaylist(id);

      if (!playlist) {
        res.status(404);
        res.json({ message: 'Playlist not found' });
        return;
      }

      const locations = await locationsRepo.loadLocations();
      const queueItem = await convertPlaylistToQueueItem(playlist, playlistRepo, locations);
      this.animationQueue.addToQueue(queueItem);

      res.status(200);
      res.json({ message: 'success' });
    } catch (error) {
      if (error instanceof PlaylistCycleError) {
        logger.warn(
          `Refusing to run cyclic playlist ${error.playlistId} via track ${error.offendingTrack.id}`,
        );
        res.status(409);
        res.json({
          error: 'playlist_cycle',
          message: error.message,
          offendingTrack: error.offendingTrack,
        });
        return;
      }
      logger.error(`Failed to run playlist ${id}`, error);
      res.status(500);
      res.json({ error: 'Internal Server Error' });
    }
  }

  private async runScript(req: any, res: any, next: any) {
    const id = req.query.id;
    logger.info(`running script ${id}`);

    const scriptRepo = new ScriptRepository(this.db);
    const locationsRepo = new LocationsRepository(this.db);

    const script = await scriptRepo.getScript(id);
    const locations = await locationsRepo.loadLocations();

    const queueItem: AnimationQueuePlaylist = {
      id: `script-${id}`,
      playlistType: PlaylistType.Sequential,
      locations,
      tracks: [{ id: script.id, duration: script.durationDS * 100, isWait: false }],
      repeatsLeft: 0,
      shuffleWaitMin: 0,
      shuffleWaitMax: 0,
      tracksRemaining: [],
    };

    this.animationQueue.addToQueue(queueItem);

    res.status(200);
    res.json({ message: 'success' });
  }

  private async panicStop(req: any, res: any, next: any) {
    logger.info('panic stop');

    this.animationQueue.panicStop();

    const ctlRepo = new LocationsRepository(this.db);
    const locations = await ctlRepo.loadLocations();
    const msg = createScriptRun('panic', locations);
    msg.type = TransmissionType.panic;

    this.serialWorker.postMessage({
      type: SerialMessageType.PANIC_STOP,
      data: msg,
    });

    res.status(200);
    res.json({ message: 'success' });
  }

  private async remoteControl(req: any, res: any, next: any) {
    const id = req.query.id;

    if (!id) {
      res.status(400);
      res.json({ message: 'Missing id parameter' });
      return;
    }

    if (id.startsWith('p')) {
      await this.runPlaylist(req, res, next);
    } else {
      await this.runScript(req, res, next);
    }
  }

  private dispatchScriptFromQueue(scriptId: string, locations: Array<ControllerLocation>) {
    try {
      if (this.sendSerialUnavailable()) {
        return;
      }

      logger.info(`dispatching script ${scriptId} from animation queue`);

      const msg = createScriptRun(scriptId, locations);

      this.serialWorker.postMessage({
        type: SerialMessageType.RUN_SCRIPT,
        data: msg,
      });
    } catch (error) {
      logger.error(`Error dispatching script from animation queue: ${error}`);
    }
  }

  private async directCommand(req: any, res: any, next: any) {
    logger.info('sending direct command');

    const repo = new ControllerRepository(this.db);
    const controller = await repo.getControllerByLocationId(req.body.locationId);

    logger.debug(`controller: ${JSON.stringify(controller)}`);
    logger.debug(`req: ${JSON.stringify(req.body)}`);

    const converter = new ScriptConverter(new ScriptRepository(this.db));
    const cmd = await converter.convertCommand(req.body);

    this.serialWorker.postMessage({
      type: SerialMessageType.RUN_COMMAND,
      data: { controller: controller, command: cmd },
    });

    res.status(200);
    res.json({ message: 'success' });
  }

  private async servoMoveCommand(data: IServoTestData) {
    try {
      if (this.sendSerialUnavailable()) {
        return;
      }

      // this will hammer logs
      //logger.debug(`sending servo command: ${data.controllerId}:${data.servoId}:${data.value}`);

      const cmd: ServoTest = {
        controllerAddress: data.controllerAddress,
        controllerName: data.controllerName,
        moduleSubType: data.moduleSubType,
        moduleIdx: data.moduleIdx,
        channelNumber: data.channelNumber,
        msValue: data.value,
      };

      this.serialWorker.postMessage({
        type: SerialMessageType.SERVO_TEST,
        data: cmd,
      });
    } catch (error) {
      logger.error(`Error sending servo command: ${error}`);
    }
  }

  private async formatSD(req: any, res: any, next: any) {
    logger.info('formatting SD card');

    const controllers = req.body.controllers;

    this.serialWorker.postMessage({
      type: SerialMessageType.FORMAT_SD,
      data: controllers,
    });

    res.status(200);
    res.json({ message: 'success' });
  }

  //#endregion

  //#region WEBSOCKET

  private updateClients(msg: any): void {
    const str = JSON.stringify(msg);
    for (const [id, client] of this.clients.entries()) {
      try {
        client.send(str);
      } catch (err) {
        logger.error(`websocket send error: ${err}`);
        this.clients.delete(id);
      }
    }
  }

  //#endregion

  /**
   * Async, awaitable shutdown. Two callers:
   *  1. Production SIGTERM/SIGINT handlers in the auto-bootstrap block at the bottom (gated by `isMainModule`) of
   *     this file — they `await shutdown()` then call `process.exit(0)`.
   *  2. Integration test harness `dispose()` — `await`s shutdown() between
   *     tests so each test gets a fresh ApiServer.
   *
   * Closes resources in dependency order: hardware (serial port + Worker),
   * then network (WS server, HTTP server), then DB. Does NOT call
   * `process.exit()` — the caller decides whether the process should exit.
   */
  public async shutdown(): Promise<void> {
    logger.info('Shutting down...');

    // Resilient cascade: each resource is closed in its own try/catch so a
    // failure in one (e.g. serialPort.close errors, worker.terminate rejects
    // on an already-exited worker) doesn't skip the rest, leaving the WS
    // server bound, the HTTP server bound, and the DB connection open.
    // Errors are logged with context; the SIGTERM handler / harness dispose
    // already handle a thrown shutdown by bailing the process or test, so
    // letting individual steps fail loudly here is strictly better than
    // letting them cascade-suppress later steps.
    const safeClose = async (label: string, fn: () => void | Promise<void>): Promise<void> => {
      try {
        await fn();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error(`shutdown ${label} failed: ${msg}`);
      }
    };

    await safeClose('animationQueue.panicStop', () => this.animationQueue?.panicStop());

    await safeClose('serialPort.close', async () => {
      if (this.serialPort?.isOpen) {
        await new Promise<void>((resolve) => this.serialPort.close(() => resolve()));
      }
    });

    await safeClose('serialWorker.terminate', async () => {
      if (this.serialWorker !== undefined) {
        await this.serialWorker.terminate();
      }
    });

    await safeClose('websocket.close', async () => {
      if (this.websocket !== undefined) {
        const websocket = this.websocket;
        // ws.Server.close() only invokes its callback once every connected
        // client has disconnected; it does NOT proactively close them. A
        // SIGTERM with any idle client connected would otherwise hang the
        // whole shutdown. terminate() force-destroys the underlying socket,
        // which is appropriate on a shutdown path — no graceful handshake
        // is required when the process is going down.
        for (const client of websocket.clients) {
          client.terminate();
        }
        await new Promise<void>((resolve) => websocket.close(() => resolve()));
        this.websocket = undefined;
      }
    });

    await safeClose('httpServer.close', async () => {
      if (this.httpServer !== undefined) {
        const httpServer = this.httpServer;
        // Same hazard as ws — http.Server.close() refuses to invoke its
        // callback until every keep-alive connection drains naturally.
        // closeAllConnections() (Node 18.2+) destroys those sockets so
        // close() resolves promptly. WebSocket-upgraded sockets are
        // unaffected by closeAllConnections, but our WS server is a
        // separate WebSocketServer with its own internal http.Server, so
        // there are none on this httpServer to begin with.
        //
        // Runtime guard: closeAllConnections is Node 18.2+ but the project
        // is pinned to Node 20+ (Dockerfile, CI). The typeof check is
        // defense in depth — if anything ever runs this on an older Node
        // (downstream fork, an analytics container, etc.), shutdown should
        // degrade to "wait for keep-alives to drain" rather than throw.
        await new Promise<void>((resolve, reject) => {
          httpServer.close((err) => (err ? reject(err) : resolve()));
          if (typeof httpServer.closeAllConnections === 'function') {
            httpServer.closeAllConnections();
          }
        });
        this.httpServer = undefined;
      }
    });

    await safeClose('db.destroy', async () => {
      if (this.db !== undefined) {
        await this.db.destroy();
      }
    });
  }
}

// Production auto-bootstrap. Fires only when this file is the entry point
// passed to `node` (or `tsx`) — `import.meta.url` matches the resolved
// `argv[1]`. When the file is imported from another module — most importantly
// the integration test harness, which does `import { ApiServer } from
// '../api_server.js'` then calls `bootstrap()` itself — `argv[1]` is some
// other entry (vitest's runner, etc.), the URLs don't match, and this block
// is skipped.
//
// Without this guard, the harness's import would spawn a "default" ApiServer
// the moment api_server.js loads, then collide with the harness's own
// `bootstrap()` call on the same env-var ports. See file header for full
// two-mode contract.
//
// `pathToFileURL(path.resolve(...))` is the robust way to convert argv[1]
// to a file URL — `argv[1]` is often a relative path (e.g. `./dist/api_server.js`
// from `npm run start`), and `new URL('file://./dist/...')` would parse the
// leading `.` as a host, never matching `import.meta.url`'s absolute form.
const isMainModule = (() => {
  try {
    const argv1 = process.argv[1];
    if (argv1 === undefined) return false;
    return import.meta.url === pathToFileURL(path.resolve(argv1)).href;
  } catch {
    return false;
  }
})();

if (isMainModule) {
  ApiServer.bootstrap()
    .then((server) => {
      const handleSignal = async (signal: NodeJS.Signals): Promise<void> => {
        logger.info(`Received ${signal}; shutting down...`);
        try {
          await server.shutdown();
        } catch (err) {
          logger.error(`Shutdown error: ${(err as Error).message}`);
        }
        process.exit(0);
      };
      process.on('SIGTERM', () => void handleSignal('SIGTERM'));
      process.on('SIGINT', () => void handleSignal('SIGINT'));
    })
    .catch((err) => {
      console.error(err.stack);
      process.exit(1);
    });
}
