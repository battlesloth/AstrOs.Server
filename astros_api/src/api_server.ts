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

import { ScriptConverter } from './script_converter.js';
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
import { ApiKeyValidator } from './api_key_validator.js';
import { JobLock } from './job_lock.js';
import { requireUnlocked } from './job_lock_middleware.js';
import { buildLockStateResponse } from './models/networking/lock_responses.js';
import { SerialMessageType } from './serial/serial_message.js';
import {
  ConfigSyncResponse,
  ISerialWorkerResponse,
  PollRepsonse,
  RegistrationResponse,
  SerialWorkerResponseType,
} from './serial/serial_worker_response.js';
import { LocationsRepository } from './dal/repositories/locations_repository.js';
import { ServoTest } from './models/servo_test.js';
import { FirmwareConfig } from './models/firmware_config.js';
import { meetsMinimum } from './semver.js';

import { fileURLToPath } from 'url';

import { initializeDatabase } from './dal/database.js';
import { Kysely } from 'kysely';
import { Database } from './dal/types.js';
import { SystemStatus } from './system_status.js';
import { writeGuard } from './write_guard.js';
import { registerSystemStatusRoutes } from './controllers/system_status_controller.js';

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

class ApiServer {
  private apiPort = 0;
  private websocketPort = 0;
  private clients: Map<string, WebSocket>;

  private app: Application;
  private router: Router;
  private websocket!: Server;

  private serialWorker!: Worker;
  private serialPort: any;
  private serialParser: any;

  private animationQueue!: AnimationQueue;

  private authHandler!: any;
  private apiKeyValidator!: ReqHandler;

  private db!: Kysely<Database>;
  private systemStatus = new SystemStatus();
  private readonly jobLock = new JobLock();

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

  constructor() {
    Dotenv.config({ path: __dirname + '/.env' });

    this.apiPort = Number.parseInt(process.env.API_PORT || '3000');
    this.websocketPort = Number.parseInt(process.env.WEBSOCKET_PORT || '5000');

    this.clients = new Map<string, WebSocket>();
    this.app = Express();
    this.router = Express.Router();

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
    this.db = await initializeDatabase(this.systemStatus);

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

    if (process.env.NODE_ENV?.toLocaleLowerCase() === 'test') {
      logger.warn('Running in test mode, skipping serial port setup');
    } else {
      logger.info('Starting up serial port services');
      this.setupSerialPort();
    }

    logger.info('Starting web services');
    this.runWebServices();
  }

  public static async bootstrap(): Promise<ApiServer> {
    const server = new ApiServer();
    try {
      await server.Init();
    } catch (error) {
      logger.error(error);
      throw new Error('Failed to initialize server');
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
    this.app.use('/api', writeGuard(this.systemStatus));
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

    const jwtKey = process.env.JWT_KEY;
    if (!jwtKey) {
      logger.error('JWT_KEY environment variable is required');
      process.exit(1);
    }

    this.authHandler = jwt({
      secret: jwtKey,
      algorithms: ['HS256'],
    });

    this.apiKeyValidator = ApiKeyValidator(this.db);
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
      requireUnlocked(this.jobLock),
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
    this.serialWorker = new Worker(new URL('./background_tasks/serial_worker.js', import.meta.url));

    this.serialWorker.on('exit', (exit) => {
      logger.info(exit);
    });
    this.serialWorker.on('error', (err) => {
      logger.error(err);
    });

    this.serialWorker.on('message', (msg) => {
      this.handleSerialWorkerMessage(msg);
    });

    try {
      this.serialPort = new SerialPort({
        path: process.env.SERIAL_PORT || '/dev/ttyS0',
        baudRate: Number.parseInt(process.env.BAUD_RATE || '9600'),
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

  private runWebServices(): void {
    this.app.listen(this.apiPort, () => {
      logger.info('The application is listening on port 3000');
    });

    this.websocket = new Server({ port: this.websocketPort });

    this.systemStatus.subscribe((state) => {
      this.updateClients({ type: TransmissionType.systemStatus, data: state });
    });

    this.websocket.on('connection', (conn) => {
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

      conn.on('message', (msg) => {
        this.handleWebsocketMessage(msg.toString());
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
  }

  handleWebsocketMessage(msg: string): void {
    try {
      const parsed = JSON.parse(msg) as IWebSocketMessage;

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
      const val = msg as PollRepsonse;

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

  shutdown(): void {
    logger.info('Shutting down...');
    this.animationQueue?.panicStop();
    this.serialPort?.close();
    this.serialWorker?.terminate();
    this.websocket?.close();
    process.exit(0);
  }
}

ApiServer.bootstrap()
  .then((server) => {
    process.on('SIGTERM', () => server.shutdown());
    process.on('SIGINT', () => server.shutdown());
  })
  .catch((err) => {
    console.error(err.stack);
    process.exit(1);
  });
