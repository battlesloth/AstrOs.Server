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
import { ScriptUpload } from './models/scripts/script_upload.js';
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
import { ConfigSync } from './models/config/config_sync.js';
import { ScriptRun } from './models/scripts/script_run.js';
import { logger } from './logger.js';
import { registerRemoteConfigRoutes } from './controllers/remote_config_controller.js';
import { registerSettingsRoutes } from './controllers/settings_controller.js';
import { ApiKeyValidator } from './api_key_validator.js';
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

import { fileURLToPath } from 'url';

import { db, migrateToLatest } from './dal/database.js';

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

  constructor() {
    Dotenv.config({ path: __dirname + '/.env' });

    this.apiPort = Number.parseInt(process.env.API_PORT || '3000');
    this.websocketPort = Number.parseInt(process.env.WEBSOCKET_PORT || '5000');

    this.clients = new Map<string, WebSocket>();
    this.app = Express();
    this.router = Express.Router();
  }

  public async Init() {
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
          const repository = new UserRepository(db);

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
    try {
      migrateToLatest(db);
    } catch (error) {
      logger.error('Error migrating database', error);
      process.exit(1);
    }

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

    const jwtKey: string = process.env.JWT_KEY as string;

    this.authHandler = jwt({
      secret: jwtKey,
      algorithms: ['HS256'],
      //userProperty: 'payload'
    });

    this.apiKeyValidator = ApiKeyValidator(db);
  }

  private setRoutes(): void {
    registerAuthRoutes(this.router);
    registerLocationRoutes(this.router, this.authHandler, db);
    registerScriptRoutes(this.router, this.authHandler, db);
    registerPlaylistRoutes(this.router, this.authHandler, db);
    registerRemoteConfigRoutes(this.router, this.authHandler, this.apiKeyValidator, db);
    registerSettingsRoutes(this.router, this.authHandler, db);
    registerAudioRoutes(this.router, this.authHandler, db);
    registerFileRoutes(this.router, this.authHandler, db);

    this.router.get('/check-session', this.authHandler, (req: any, res: any, next: any) => {
      res.status(200);
      res.json({ isAuthenticated: true });
    });

    this.router.get('/locations/syncconfig', this.authHandler, (req: any, res: any, next: any) => {
      this.syncControllerConfig(req, res, next);
    });

    this.router.get(
      '/locations/synccontrollers',
      this.authHandler,
      (req: any, res: any, next: any) => {
        this.syncControllers(req, res, next);
      },
    );

    this.router.get('/scripts/upload', this.authHandler, (req: any, res: any, next: any) => {
      this.uploadScript(req, res, next);
    });

    this.router.get('/scripts/run', this.authHandler, (req: any, res: any, next: any) => {
      this.runScript(req, res, next);
    });

    this.router.get('/playlists/run', this.authHandler, (req: any, res: any, next: any) => {
      this.runPlaylist(req, res, next);
    });

    this.router.post('/settings/formatSD', this.authHandler, (req: any, res: any, next: any) => {
      this.formatSD(req, res, next);
    });

    this.router.post('/directcommand', this.authHandler, (req: any, res: any, next: any) => {
      this.directCommand(req, res, next);
    });

    this.router.post('/panicStop', this.authHandler, (req: any, res: any, next: any) => {
      this.panicStop(req, res, next);
    });

    this.router.post('/panicClear', this.authHandler, (req: any, res: any, next: any) => {
      this.animationQueue.clearPanicStop();
      res.status(200);
      res.json({ message: 'success' });
    });

    // API key secured routes
    this.router.get('/remotecontrol', this.apiKeyValidator, (req: any, res: any, next: any) => {
      this.remoteControl(req, res, next);
    });
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

    this.serialPort = new SerialPort({
      path: process.env.SERIAL_PORT || '/dev/ttyS0',
      baudRate: Number.parseInt(process.env.BAUD_RATE || '9600'),
    });
    this.serialParser = this.serialPort
      .pipe(new DelimiterParser({ delimiter: '\n' }))
      .on('data', (data: any) => {
        this.serialWorker.postMessage({
          type: SerialMessageType.SERIAL_MSG_RECEIVED,
          data: data.toString(),
        });
      });
  }

  private runWebServices(): void {
    this.app.listen(this.apiPort, () => {
      logger.info('The application is listening on port 3000');
    });

    this.websocket = new Server({ port: this.websocketPort });

    this.websocket.on('connection', (conn) => {
      const id = uuid_v4();
      this.clients.set(id, conn);

      conn.on('message', (msg) => {
        this.handelWebsocketMessage(msg.toString());
      });

      logger.info(`websocket connected: id=${id}`);
    });
  }

  async handelWebsocketMessage(msg: string): Promise<void> {
    return new Promise((resolve, _) => {
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
      resolve();
    });
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

      const controllerRepo = new ControllerRepository(db);

      await controllerRepo.insertControllers(val.registrations);

      const controllers = await controllerRepo.getControllers();

      logger.info(`Controllers after registration sync: ${JSON.stringify(controllers)}`);

      const update: ControllersResponse = { type: TransmissionType.controllers, success: val.success, message: '', controllers };
      this.updateClients(update);
    } catch (error) {
      logger.error(`Error handling registration response: ${error}`);
      this.updateClients({ type: TransmissionType.controllers, success: false, message: '', controllers: [] } as ControllersResponse);
    }
  }

  async handlePollResponse(msg: ISerialWorkerResponse) {
    try {
      const val = msg as PollRepsonse;

      const controlerRepo = new ControllerRepository(db);
      const locationRepo = new LocationsRepository(db);

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

      const update: StatusResponse = {
        type: TransmissionType.status,
        success: true,
        message: '',
        controllerId: controller.id,
        controllerLocation: location.locationName,
        up: true,
        synced: val.controller.fingerprint === location.configFingerprint,
      };

      this.updateClients(update);
    } catch (error) {
      logger.error(`Error handling poll response: ${error}`);
    }
  }

  async handleConfigSync(msg: ISerialWorkerResponse) {
    try {
      const val = msg as ConfigSyncResponse;

      const locationRepo = new LocationsRepository(db);

      const locationId = await locationRepo.getLocationIdByControllerByMac(val.controller.address);

      if (!locationId) {
        logger.error(`Location not found for controller: ${val.controller.name}`);
        return;
      }

      await locationRepo.updateLocationFingerprint(locationId, val.controller.fingerprint);
    } catch (error) {
      logger.error(`Error handling config sync response: ${error}`);
    }
  }

  private async handleScriptDeployResponse(msg: ISerialWorkerResponse) {
    try {
      const val = msg as ConfigSyncResponse;

      const locationRepo = new LocationsRepository(db);
      const scriptRepo = new ScriptRepository(db);

      const locId = await locationRepo.getLocationNameByMac(val.controller.address);

      if (val.success) {
        const now = new Date();

        await scriptRepo.updateScriptControllerUploaded(val.scriptId, locId, now);

        const update: ScriptResponse = { type: TransmissionType.script, success: true, message: '', scriptId: val.scriptId, locationId: locId, status: TransmissionStatus.success, date: now };

        this.updateClients(update);
      } else {
        const deployDate = await scriptRepo.getLastScriptUploadedDate(val.scriptId, locId);
        const update: ScriptResponse = { type: TransmissionType.script, success: true, message: '', scriptId: val.scriptId, locationId: locId, status: TransmissionStatus.failed, date: deployDate };

        this.updateClients(update);
      }
    } catch (error) {
      logger.error(`Error handling script deploy response: ${error}`);
    }
  }

  //#region

  //#region TO SERIAL WORKER

  private async syncControllers(req: any, res: any, next: any) {
    try {
      if (this.sendSerialUnavailable(res)) {
        return;
      }

      logger.info('syncing controllers');
      this.serialWorker.postMessage({
        type: SerialMessageType.REGISTRATION_SYNC,
        data: null,
      });
      res.status(200);
      res.json({ message: 'success' });
    } catch (error) {
      logger.error(error);

      res.status(500);
      res.json({
        message: 'Internal server error',
      });
    }
  }

  private async syncControllerConfig(req: any, res: any, next: any) {
    try {
      if (this.sendSerialUnavailable(res)) {
        return;
      }

      logger.info('syncing controller config');

      const repo = new LocationsRepository(db);

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

      const configSync = new ConfigSync(toSync);

      this.serialWorker.postMessage({
        type: SerialMessageType.DEPLOY_CONFIG,
        data: configSync,
      });

      res.status(200);
      res.json({ message: 'success' });
    } catch (error) {
      logger.error(error);

      res.status(500);
      res.json({
        message: 'Internal server error',
      });
    }
  }

  private async uploadScript(req: any, res: any, next: any) {
    try {
      if (this.sendSerialUnavailable(res)) {
        return;
      }

      logger.info('uploading script');

      const id = req.query.id;

      const scriptRepo = new ScriptRepository(db);
      const locationsRepo = new LocationsRepository(db);

      const cvtr = new ScriptConverter(scriptRepo);

      const messages = await cvtr.convertScript(id);

      if (messages.size < 1) {
        logger.warn(`No locations script values returned for ${id}`);
      }

      const locations = await locationsRepo.loadLocations();

      logger.debug(`scripts: ${JSON.stringify(messages)}`);

      const msg = new ScriptUpload(id, messages, locations);

      logger.debug(`msg: ${JSON.stringify(msg)}`);

      this.serialWorker.postMessage({
        type: SerialMessageType.DEPLOY_SCRIPT,
        data: msg,
      });

      res.status(200);
      res.json({ message: 'success' });
    } catch (error) {
      logger.error(error);

      res.status(500);
      res.json({
        message: 'Internal server error',
      });
    }
  }

  private async runPlaylist(req: any, res: any, next: any) {
    try {
      if (this.sendSerialUnavailable(res)) {
        return;
      }

      const id = req.query.id;
      logger.info(`running playlist ${id}`);

      const playlistRepo = new PlaylistRepository(db);
      const locationsRepo = new LocationsRepository(db);

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
      logger.error(error);

      res.status(500);
      res.json({
        message: 'Internal server error',
      });
    }
  }

  private async runScript(req: any, res: any, next: any) {
    try {
      if (this.sendSerialUnavailable(res)) {
        return;
      }

      const id = req.query.id;
      logger.info(`running script ${id}`);

      const scriptRepo = new ScriptRepository(db);
      const locationsRepo = new LocationsRepository(db);

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
    } catch (error) {
      logger.error(error);

      res.status(500);
      res.json({
        message: 'Internal server error',
      });
    }
  }

  private async panicStop(req: any, res: any, next: any) {
    try {
      if (this.sendSerialUnavailable(res)) {
        return;
      }

      logger.info('panic stop');

      this.animationQueue.panicStop();

      const ctlRepo = new LocationsRepository(db);
      const locations = await ctlRepo.loadLocations();
      const msg = new ScriptRun('panic', locations);
      msg.type = TransmissionType.panic;

      this.serialWorker.postMessage({
        type: SerialMessageType.PANIC_STOP,
        data: msg,
      });

      res.status(200);
      res.json({ message: 'success' });
    } catch (error) {
      logger.error(error);

      res.status(500);
      res.json({
        message: 'Internal server error',
      });
    }
  }

  private async remoteControl(req: any, res: any, next: any) {
    const id = req.query.id;

    if (!id) {
      res.status(400);
      res.json({ message: 'Missing id parameter' });
      return;
    }

    if (id.startsWith('p')) {
      this.runPlaylist(req, res, next);
    } else {
      this.runScript(req, res, next);
    }
  }

  private dispatchScriptFromQueue(scriptId: string, locations: Array<ControllerLocation>) {
    try {
      if (this.sendSerialUnavailable()) {
        return;
      }

      logger.info(`dispatching script ${scriptId} from animation queue`);

      const msg = new ScriptRun(scriptId, locations);

      this.serialWorker.postMessage({
        type: SerialMessageType.RUN_SCRIPT,
        data: msg,
      });
    } catch (error) {
      logger.error(`Error dispatching script from animation queue: ${error}`);
    }
  }

  private async directCommand(req: any, res: any, next: any) {
    try {
      if (this.sendSerialUnavailable(res)) {
        return;
      }

      logger.info('sending direct command');

      const repo = new ControllerRepository(db);
      const controller = await repo.getControllerByLocationId(req.body.locationId);

      logger.debug(`controller: ${JSON.stringify(controller)}`);
      logger.debug(`req: ${JSON.stringify(req.body)}`);

      const converter = new ScriptConverter(new ScriptRepository(db));
      const cmd = await converter.convertCommand(req.body);

      this.serialWorker.postMessage({
        type: SerialMessageType.RUN_COMMAND,
        data: { controller: controller, command: cmd },
      });

      res.status(200);
      res.json({ message: 'success' });
    } catch (error) {
      logger.error(error);

      res.status(500);
      res.json({
        message: 'Internal server error',
      });
    }
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
    try {
      if (this.sendSerialUnavailable(res)) {
        return;
      }

      logger.info('formatting SD card');

      const controllers = req.body.controllers;

      this.serialWorker.postMessage({
        type: SerialMessageType.FORMAT_SD,
        data: controllers,
      });

      res.status(200);
      res.json({ message: 'success' });
    } catch (error) {
      logger.error(error);

      res.status(500);
      res.json({
        message: 'Internal server error',
      });
    }
  }

  //#endregion

  //#region WEBSOCKET

  private updateClients(msg: any): void {
    const str = JSON.stringify(msg);
    for (const client of this.clients.values()) {
      try {
        client.send(str);
      } catch (err) {
        logger.error(`websocket send error: ${err}`);
      }
    }
  }

  //#endregion
}

ApiServer.bootstrap().catch((err) => {
  console.error(err.stack);
  process.exit(1);
});
