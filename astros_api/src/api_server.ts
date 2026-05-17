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
import { tmpdir } from 'node:os';

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
import { registerFirmwareReleasesRoutes } from './controllers/firmware_releases_controller.js';
import { registerFirmwareLockStateRoutes } from './controllers/firmware_lock_state_controller.js';
import {
  FIRMWARE_UPLOAD_SIZE_LIMIT_BYTES,
  firmwareUploadLimitHandler,
  registerFirmwareUploadRoutes,
} from './controllers/firmware_upload_controller.js';
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
// Must use `src/*` alias (not relative path) — esbuild-based runtimes
// (tsx/vitest) treat the two import paths as separate modules and break
// `instanceof` checks across the boundary.
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

// Test-harness hooks. `workerScriptUrl` points the Worker at compiled dist/
// because tsx loader hooks don't propagate to Worker threads. `onWorkerError`
// surfaces Worker boot failures to the test runner (logger.error is silent
// to vitest). `configOverrides` avoids mutating process.env so concurrent
// harness boots don't clobber each other.
export interface ApiServerOptions {
  workerScriptUrl?: URL;
  onWorkerError?: (err: Error) => void;
  firmwareReleaseFetcher?: typeof fetch;
  flashOrchestratorConfig?: {
    rebootTimeoutMs?: number;
    throttleWindowMs?: number;
  };
  configOverrides?: ConfigOverrides;
}

export interface ConfigOverrides {
  readonly serialPort?: string;
  readonly baudRate?: number;
  readonly apiPort?: number;
  readonly websocketPort?: number;
  readonly jwtKey?: string;
  // Full path to the SQLite file (not its directory).
  readonly databasePath?: string;
  readonly firmwareCachePath?: string;
  // Explicit override for the implicit `NODE_ENV=test` skip. The harness sets
  // this `false` so vitest's default NODE_ENV doesn't suppress the serial path
  // it's trying to exercise.
  readonly skipSerialSetup?: boolean;
}

// See file header for the two-mode (production / test-harness) contract.
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

  // Firmware-OTA wiring. The orchestrator + WorkerSerialBus depend on the
  // serial worker, so they're built in setupSerialPort() and stay undefined
  // when serial setup is skipped — flash routes aren't registered then, so
  // /api/firmware/flash 404s rather than null-derefing.
  private firmwareCache!: FirmwareCache;
  private firmwareUploadStore!: FirmwareUploadStore;
  private githubReleaseService!: GitHubReleaseService;
  private workerSerialBus?: WorkerSerialBus;
  private flashOrchestrator?: FlashJobOrchestrator;
  // POLL_ACK-fed variant cache keyed by controller MAC. Entries never expire;
  // operator recovers stale state via syncControllers (re-poll).
  private readonly controllerVariantCache = new Map<string, string>();

  // Test-only: lets the harness poll-wait for a POLL_ACK to populate the cache
  // instead of sleeping an arbitrary duration before flashing.
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

  // Wraps a route: 503 when serial worker is down, 500 on thrown errors.
  // Handler still owns its success / 404 response.
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

    // Worker threads don't inherit the tsx loader, so the default URL only
    // works against compiled dist/. Tests override to point at dist/ explicitly.
    this.workerScriptUrl =
      opts?.workerScriptUrl ?? new URL('./background_tasks/serial_worker.js', import.meta.url);
    this.onWorkerError = opts?.onWorkerError;
    this.firmwareReleaseFetcher = opts?.firmwareReleaseFetcher;
    this.flashOrchestratorConfig = opts?.flashOrchestratorConfig;

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

    // configOverrides.skipSerialSetup wins over NODE_ENV — vitest defaults
    // NODE_ENV=test, which would otherwise hide the serial path from the
    // integration harness that is specifically exercising it.
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

  // Construct + Init. On boot failure, logs and rethrows wrapped with `cause`.
  public static async bootstrap(opts?: ApiServerOptions): Promise<ApiServer> {
    const server = new ApiServer(opts);
    try {
      await server.Init();
    } catch (error) {
      logger.error(error);
      // Assign `cause` as a property — the ES2022 constructor option isn't
      // available with tsconfig.target=ES6. Node 20 still surfaces it.
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

          if (!user) {
            return done(null, false, {
              message: 'User not found',
            });
          }
          if (!user.validatePassword(password)) {
            return done(null, false, {
              message: 'Password is wrong',
            });
          }
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
    // 50 MB ceiling: AstrOs.ESP binaries are ~1.2 MB; this leaves an order of
    // magnitude of headroom for future growth while preventing an authenticated
    // operator from buffering a multi-GB POST into memory. `useTempFiles`
    // streams the multipart body to disk during parse, so `.mv()` in the
    // upload controller becomes a fast rename rather than a buffer-to-disk
    // write. `abortOnLimit` rejects oversize uploads with 413 (its
    // `closeConnection` is a no-op once `limitHandler` has sent the response
    // body) and runs the lib's tmp-file cleanup either way.
    this.app.use(
      fileUpload({
        limits: { fileSize: FIRMWARE_UPLOAD_SIZE_LIMIT_BYTES },
        abortOnLimit: true,
        limitHandler: firmwareUploadLimitHandler,
        useTempFiles: true,
        tempFileDir: tmpdir(),
      }),
    );
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
      // Throw, don't process.exit — the harness imports this class and a
      // library-level exit defeats any caller's misconfiguration handling.
      // The auto-bootstrap block at file-bottom owns process.exit.
      throw new Error(
        'JWT_KEY is required (set process.env.JWT_KEY or pass configOverrides.jwtKey)',
      );
    }

    this.authHandler = jwt({
      secret: jwtKey,
      algorithms: ['HS256'],
    });

    this.apiKeyValidator = ApiKeyValidator(this.db);

    // Firmware infrastructure has no Worker dependency — safe to construct
    // unconditionally even when serial setup is skipped.
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
    // Firmware routes whose dependencies are available before setupSerialPort()
    // belong here so they stay registered when serial is skipped (test envs,
    // future no-hardware boot modes). The flash route still lives in
    // setupSerialPort() because flashOrchestrator needs the serial Worker.
    //   - lock-state: depends on this.jobLock (field-init, line 193)
    //   - releases:   depends on this.githubReleaseService (configApi, line 453)
    registerFirmwareLockStateRoutes(this.router, this.jobLock);
    registerFirmwareReleasesRoutes(this.router, this.authHandler, this.githubReleaseService);
    registerFirmwareUploadRoutes(this.router, this.authHandler, this.firmwareUploadStore);
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

    // Built here (not in configApi) because WorkerSerialBus needs the
    // serialWorker reference. Flash routes register alongside so they 404
    // when serial setup is skipped instead of hitting an undefined orchestrator.
    this.workerSerialBus = new WorkerSerialBus({ worker: this.serialWorker });
    this.flashOrchestrator = new FlashJobOrchestrator({
      bus: this.workerSerialBus,
      jobLock: this.jobLock,
      cache: this.firmwareCache,
      upload: this.firmwareUploadStore,
      releaseService: this.githubReleaseService,
      controllersStore: {
        // Snapshot per call so validateControllers doesn't race a concurrent
        // POLL_ACK update of the underlying Map. Filter to the operator's
        // requested MAC set so the flash scopes to what the UI selected
        // (rather than every controller the server has ever heard from).
        // The orchestrator detects requested-but-missing MACs and throws
        // `controllers_unknown` with detail; this side just returns the
        // intersection.
        listFlashTargets: async (requestedIds) => {
          const wanted = new Set(requestedIds);
          return Array.from(this.controllerVariantCache.entries())
            .filter(([id]) => wanted.has(id))
            .map(([id, variant]) => ({ id, variant }));
        },
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
    // Await both binds so bootstrap() rejects cleanly on EADDRINUSE and
    // getBoundApiPort/getBoundWebsocketPort have something to read.
    // API_PORT/WEBSOCKET_PORT='0' requests ephemeral ports — the harness
    // uses this to avoid TOCTOU on "find free port, bind later".
    await new Promise<void>((resolve, reject) => {
      const httpServer = this.app.listen(this.apiPort, () => {
        logger.info(`The application is listening on port ${this.getBoundApiPort()}`);
        resolve();
      });
      this.httpServer = httpServer;
      httpServer.once('error', reject);
    });

    // If WS bind fails the HTTP server above is already listening; the
    // catch below rolls it back to avoid leaking a live socket and
    // double-emitting systemStatus frames from an orphaned subscriber.
    let unsubscribeSystemStatus: (() => void) | undefined;
    try {
      const ws = (this.websocket = new Server({ port: this.websocketPort }));

      unsubscribeSystemStatus = this.systemStatus.subscribe((state) => {
        this.updateClients({ type: TransmissionType.systemStatus, data: state });
      });

      // Attach the connection handler before awaiting 'listening' to close
      // the window where a racing client connects without a listener.
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

        // Late-join lock snapshot: a client connecting while the lock is held
        // would otherwise wait until the next acquire/release to learn state.
        try {
          conn.send(JSON.stringify(buildLockStateResponse(this.jobLock.getState())));
        } catch (err) {
          logger.error(`websocket initial lockState send error: ${err}`);
        }

        // Late-join flash-job snapshot — only emitted when a job is in flight.
        // No history persistence in v1, so completed jobs are not retained.
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
      // Roll back: detach the systemStatus subscriber, close the HTTP
      // server, and close any partial WS instance (ws schedules its bind
      // on next tick, so the Server may exist even when listen errored).
      if (unsubscribeSystemStatus !== undefined) {
        unsubscribeSystemStatus();
      }
      const httpServer = this.httpServer;
      this.httpServer = undefined;
      if (httpServer !== undefined) {
        // Log close errors instead of rethrowing — wsErr is the primary
        // fault the caller asked about; an ENOTLISTENING here would still
        // signal a real leak the operator needs to see.
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
        // ws.Server.close() can hang forever on an instance that errored
        // before 'listening' — race a 1s timeout so rollback always completes.
        try {
          await Promise.race([
            new Promise<void>((resolve) => partialWs.close(() => resolve())),
            new Promise<void>((resolve) => setTimeout(resolve, 1000)),
          ]);
        } catch (closeErr) {
          // Don't mask wsErr.
          const msg = closeErr instanceof Error ? closeErr.message : String(closeErr);
          logger.warn(`runWebServices rollback: partialWs.close threw: ${msg}`);
        }
      }
      throw wsErr;
    }
  }

  // Resolves the kernel-assigned port when API_PORT=0. Throws if called
  // before runWebServices completes.
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

  // See getBoundApiPort. Also throws on a unix-socket WS bind, which the
  // ws types permit but this codebase never uses.
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

      // Per-connection lock guard for write-class messages during a flash.
      // HTTP requests are gated separately by writeGuard on /api.
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

      // Update the variant cache before the DB lookups below — those can
      // fail for first-poll controllers, but the cache should still populate.
      // Skip empty variants (pre-c.6c.1 firmware) so a regression doesn't
      // poison the cache.
      const variant = val.controller.variant;
      if (typeof variant === 'string' && variant.length > 0) {
        this.controllerVariantCache.set(val.controller.address, variant);
      }

      // Only the master's post-deploy POLL_ACK (sentinel MAC, version
      // matches target) releases the flash lock — padawans polling during
      // a flash would otherwise race the master.
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
        controllerAddress: val.controller.address,
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

  // Awaitable shutdown. Closes resources in dependency order — hardware,
  // network, DB. Caller decides whether to process.exit().
  public async shutdown(): Promise<void> {
    logger.info('Shutting down...');

    // Each step gets its own try/catch so a failure in one resource doesn't
    // skip the rest and leave sockets / DB handles dangling.
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
        // ws.Server.close() waits for clients to disconnect on their own; an
        // idle client would hang shutdown forever. terminate() each one first.
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
        // http.Server.close() blocks on keep-alive sockets draining naturally;
        // closeAllConnections() (Node 18.2+) destroys them so close() resolves
        // promptly. Our WS server is a separate WebSocketServer with its own
        // http.Server, so no upgraded sockets live on this one. The typeof
        // guard is defense in depth — Node is pinned to 20+ in Dockerfile/CI,
        // but a downstream fork on older Node should still gracefully degrade.
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

// Auto-bootstrap only when this file is the entry point. When imported (e.g.
// by the test harness), this block must skip so it doesn't collide with the
// caller's own bootstrap() on the same env-var ports.
// `pathToFileURL(path.resolve(...))` handles argv[1] being relative (e.g.
// `./dist/api_server.js`) — `new URL('file://./...')` would parse the `.`
// as a host and never match `import.meta.url`.
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
