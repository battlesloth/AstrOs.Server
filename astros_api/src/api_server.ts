import Dotenv from "dotenv";
import cookieParser from "cookie-parser";
import path from "path";
import passport from "passport";
import morgan from "morgan";
import { expressjwt as jwt } from "express-jwt";
import cors from "cors";
import fileUpload from "express-fileupload";

import Express, {
  Router,
  Application,
  RequestHandler as ReqHandler,
} from "express";
import { WebSocketServer as Server, WebSocket } from "ws";
import { v4 as uuid_v4 } from "uuid";
import { Strategy } from "passport-local";
import { Worker } from "worker_threads";

import { pinoHttp } from "pino-http";

import { UserRepository } from "./dal/repositories/user_repository.js";
import { LocationsController } from "./controllers/locations_controller.js";
import { AuthContoller } from "./controllers/authentication_controller.js";
import { ScriptsController } from "./controllers/scripts_controller.js";
import { AudioController } from "./controllers/audio_controller.js";
import { FileController } from "./controllers/file_controller.js";
import { ScriptUpload } from "./models/scripts/script_upload.js";
import { ScriptRepository } from "./dal/repositories/script_repository.js";

import { ScriptConverter } from "./script_converter.js";
import {
  StatusResponse,
  ControllersResponse,
  TransmissionType,
  ControllerLocation,
  ScriptResponse,
  TransmissionStatus,
  ModuleSubType,
} from "astros-common";
import { ControllerRepository } from "./dal/repositories/controller_repository.js";
import { ConfigSync } from "./models/config/config_sync.js";
import { ScriptRun } from "./models/scripts/script_run.js";
import { logger } from "./logger.js";
import { RemoteConfigController } from "./controllers/remote_config_controller.js";
import { SettingsController } from "./controllers/settings_controller.js";
import { ApiKeyValidator } from "./api_key_validator.js";
import { SerialMessageType } from "./serial/serial_message.js";
import {
  ConfigSyncResponse,
  ISerialWorkerResponse,
  PollRepsonse,
  RegistrationResponse,
  SerialWorkerResponseType,
} from "./serial/serial_worker_response.js";
import { LocationsRepository } from "./dal/repositories/locations_repository.js";
import { ServoTest } from "./models/servo_test.js";

import { fileURLToPath } from "url";

import { db, migrateToLatest } from "./dal/database.js";

const __filename = fileURLToPath(import.meta.url);

const __dirname = path.dirname(__filename);

import { SerialPort } from "serialport";
import { DelimiterParser } from "@serialport/parser-delimiter";

//const { SerialPort } = eval("require('serialport')");
//const { DelimiterParser } = eval("require('@serialport/parser-delimiter')");

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

  private authHandler!: any;
  private apiKeyValidator!: ReqHandler;

  upload!: any;

  constructor() {
    Dotenv.config({ path: __dirname + "/.env" });

    this.apiPort = Number.parseInt(process.env.API_PORT || "3000");
    this.websocketPort = Number.parseInt(process.env.WEBSOCKET_PORT || "5000");

    this.clients = new Map<string, WebSocket>();
    this.app = Express();
    this.router = Express.Router();
  }

  public async Init() {
    logger.info("Setting up authentication strategy");
    this.setAuthStrategy();

    logger.info("Setting up API server");
    await this.configApi();

    logger.info("Setting up file handler");
    this.configFileHandler();

    logger.info("Setting up routes");
    this.setRoutes();

    if (process.env.NODE_ENV?.toLocaleLowerCase() === "test") {
      logger.warn("Running in test mode, skipping serial port setup");
    } else {
      logger.info("Starting up serial port services");
      this.setupSerialPort();
    }

    logger.info("Starting web services");
    this.runWebServices();
  }

  public static async bootstrap(): Promise<ApiServer> {
    const server = new ApiServer();
    try {
      await server.Init();
    } catch (error) {
      logger.error(error);
      throw new Error("Failed to initialize server");
    }

    return server;
  }

  private setAuthStrategy(): void {
    passport.use(
      new Strategy(
        {
          usernameField: "username",
        },
        async (username: string, password: string, done) => {
          const repository = new UserRepository(db);

          const user = await repository.getByUsername(username);

          // Return if user not found in database
          if (!user) {
            return done(null, false, {
              message: "User not found",
            });
          }
          // Return if password is wrong
          if (!user.validatePassword(password)) {
            return done(null, false, {
              message: "Password is wrong",
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
      logger.error("Error migrating database", error);
      process.exit(1);
    }

    //const da = new DataAccess();
    //await da.setup();

    const loggerMiddleware = pinoHttp({
      logger: logger,
      autoLogging: true,
    });

    this.app.use(loggerMiddleware);
    this.app.use(morgan("dev"));

    const allowedOrigins = process.env.CORS_ORIGIN
      ? process.env.CORS_ORIGIN.split(",").map((origin) => origin.trim())
      : ["http://localhost:5173", "http://localhost:8080"];

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
    this.app.use(Express.static(path.join(__dirname, "public")));
    this.app.use(passport.initialize());
    this.app.use("/api", this.router);

    this.app.get("/index.html", (req, res) => {
      res.send("Hello World!");
    });

    this.app.use((req: any, res: any, next: any) => {
      res.status(404).json({
        message: "Endpoint not found",
      });
    });

    this.app.use((err: any, req: any, res: any, next: any) => {
      res.locals.message = err.message;
      res.locals.error = req.app.get("env") === "development" ? err : {};
      res.status(err.status || 500);
    });

    const jwtKey: string = process.env.JWT_KEY as string;

    this.authHandler = jwt({
      secret: jwtKey,
      algorithms: ["HS256"],
      //userProperty: 'payload'
    });

    this.apiKeyValidator = ApiKeyValidator();
  }

  private configFileHandler() {
    this.router.route(FileController.audioUploadRoute).post((req, res) => {
      FileController.HandleFile(req, res);
    });
  }

  private setRoutes(): void {
    this.router.post(AuthContoller.route, AuthContoller.login);
    this.router.post(AuthContoller.reauthRoute, AuthContoller.reauth);

    this.router.get(
      "/check-session",
      this.authHandler,
      (req: any, res: any, next: any) => {
        res.status(200);
        res.json({ isAuthenticated: true });
      },
    );

    this.router.get(
      LocationsController.route,
      this.authHandler,
      LocationsController.getLocations,
    );
    this.router.put(
      LocationsController.route,
      this.authHandler,
      LocationsController.saveLocations,
    );
    this.router.get(
      LocationsController.loadRoute,
      this.authHandler,
      LocationsController.loadLocations,
    );
    this.router.get(
      LocationsController.syncConfigRoute,
      this.authHandler,
      (req: any, res: any, next: any) => {
        this.syncControllerConfig(req, res, next);
      },
    );
    this.router.get(
      LocationsController.syncControllersRoute,
      this.authHandler,
      (req: any, res: any, next: any) => {
        this.syncControllers(req, res, next);
      },
    );

    this.router.get(
      ScriptsController.getRoute,
      this.authHandler,
      ScriptsController.getScript,
    );
    this.router.get(
      ScriptsController.getAllRoute,
      this.authHandler,
      ScriptsController.getAllScripts,
    );
    this.router.put(
      ScriptsController.putRoute,
      this.authHandler,
      ScriptsController.saveScript,
    );
    this.router.delete(
      ScriptsController.deleteRoute,
      this.authHandler,
      ScriptsController.deleteScript,
    );
    this.router.get(
      ScriptsController.copyRoute,
      this.authHandler,
      ScriptsController.copyScript,
    );

    this.router.get(
      ScriptsController.uploadRoute,
      this.authHandler,
      (req: any, res: any, next: any) => {
        this.uploadScript(req, res, next);
      },
    );
    this.router.get(
      ScriptsController.runRoute,
      this.authHandler,
      (req: any, res: any, next: any) => {
        this.runScript(req, res, next);
      },
    );

    this.router.get(
      RemoteConfigController.getRoute,
      this.authHandler,
      RemoteConfigController.getRemoteConfig,
    );
    this.router.put(
      RemoteConfigController.putRoute,
      this.authHandler,
      RemoteConfigController.saveRemoteConfig,
    );

    this.router.get(
      SettingsController.getRoute,
      this.authHandler,
      SettingsController.getSetting,
    );
    this.router.put(
      SettingsController.putRoute,
      this.authHandler,
      SettingsController.saveSetting,
    );
    this.router.get(
      SettingsController.controllersRoute,
      this.authHandler,
      SettingsController.getControllers,
    );
    this.router.post(
      SettingsController.formatSDRoute,
      this.authHandler,
      (req: any, res: any, next: any) => {
        this.formatSD(req, res, next);
      },
    );

    this.router.get(
      AudioController.getAll,
      this.authHandler,
      AudioController.getAllAudioFiles,
    );
    this.router.get(
      AudioController.deleteRoute,
      this.authHandler,
      AudioController.deleteAudioFile,
    );

    this.router.post(
      "/directcommand",
      this.authHandler,
      (req: any, res: any, next: any) => {
        this.directCommand(req, res, next);
      },
    );

    // API key secured routes
    this.router.get(
      "/remotecontrol",
      this.apiKeyValidator,
      (req: any, res: any, next: any) => {
        this.runScript(req, res, next);
      },
    );
    this.router.get(
      "/remotecontrolsync",
      this.apiKeyValidator,
      RemoteConfigController.syncRemoteConfig,
    );
  }

  private setupSerialPort(): void {
    this.serialWorker = new Worker(
      new URL("./background_tasks/serial_worker.js", import.meta.url),
    );

    this.serialWorker.on("exit", (exit) => {
      logger.info(exit);
    });
    this.serialWorker.on("error", (err) => {
      logger.error(err);
    });

    this.serialWorker.on("message", (msg) => {
      this.handleSerialWorkerMessage(msg);
    });

    this.serialPort = new SerialPort({
      path: process.env.SERIAL_PORT || "/dev/ttyS0",
      baudRate: Number.parseInt(process.env.BAUD_RATE || "9600"),
    });
    this.serialParser = this.serialPort
      .pipe(new DelimiterParser({ delimiter: "\n" }))
      .on("data", (data: any) => {
        this.serialWorker.postMessage({
          type: SerialMessageType.SERIAL_MSG_RECEIVED,
          data: data.toString(),
        });
      });
  }

  private runWebServices(): void {
    this.app.listen(this.apiPort, () => {
      logger.info("The application is listening on port 3000");
    });

    this.websocket = new Server({ port: this.websocketPort });

    this.websocket.on("connection", (conn) => {
      const id = uuid_v4();
      this.clients.set(id, conn);

      conn.on("message", (msg) => {
        this.handelWebsocketMessage(msg.toString());
      });

      logger.info(`${conn.url}:${id} connected`);
    });
  }

  async handelWebsocketMessage(msg: string): Promise<void> {
    return new Promise((resolve, _) => {
      try {
        const parsed = JSON.parse(msg) as IWebSocketMessage;

        switch (parsed.msgType) {
          case "SERVO_TEST":
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
        logger.error("Invalid message received");
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

  async handleResgistraionResponse(msg: ISerialWorkerResponse) {
    try {
      const val = msg as RegistrationResponse;

      const controllerRepo = new ControllerRepository(db);

      await controllerRepo.insertControllers(val.registrations);

      const contollers = await controllerRepo.getControllers();

      const update = new ControllersResponse(val.success, contollers);
      this.updateClients(update);
    } catch (error) {
      logger.error(`Error handling registration response: ${error}`);
      this.updateClients(new ControllersResponse(false, []));
    }
  }

  async handlePollResponse(msg: ISerialWorkerResponse) {
    try {
      const val = msg as PollRepsonse;

      const controlerRepo = new ControllerRepository(db);
      const locationRepo = new LocationsRepository(db);

      const controller = await controlerRepo.getControllerByAddress(
        val.controller.address,
      );

      if (controller === null) {
        logger.error(
          `Controller not found for address: ${val.controller.address}`,
        );
        return;
      }

      const location = await locationRepo.getLocationByController(
        controller.id,
      );

      if (location === null) {
        logger.error(
          `Location not found for controller: ${val.controller.name}`,
        );
        return;
      }

      const update = new StatusResponse(
        controller.id,
        location.locationName,
        true,
        val.controller.fingerprint === location.configFingerprint,
      );

      this.updateClients(update);
    } catch (error) {
      logger.error(`Error handling poll response: ${error}`);
    }
  }

  async handleConfigSync(msg: ISerialWorkerResponse) {
    try {
      const val = msg as ConfigSyncResponse;

      const locationRepo = new LocationsRepository(db);

      const locationId = await locationRepo.getLocationIdByControllerByMac(
        val.controller.address,
      );

      if (!locationId) {
        logger.error(
          `Location not found for controller: ${val.controller.name}`,
        );
        return;
      }

      await locationRepo.updateLocationFingerprint(
        locationId,
        val.controller.fingerprint,
      );
    } catch (error) {
      logger.error(`Error handling config sync response: ${error}`);
    }
  }

  private async handleScriptDeployResponse(msg: ISerialWorkerResponse) {
    try {
      const val = msg as ConfigSyncResponse;

      const locationRepo = new LocationsRepository(db);
      const scriptRepo = new ScriptRepository(db);

      const locId = await locationRepo.getLocationNameByMac(
        val.controller.address,
      );

      if (val.success) {
        const now = new Date();

        await scriptRepo.updateScriptControllerUploaded(
          val.scriptId,
          locId,
          now,
        );

        const update = new ScriptResponse(
          val.scriptId,
          locId,
          TransmissionStatus.success,
          now,
        );

        this.updateClients(update);
      } else {
        const deployDate = await scriptRepo.getLastScriptUploadedDate(
          val.scriptId,
          locId,
        );
        const update = new ScriptResponse(
          val.scriptId,
          locId,
          TransmissionStatus.failed,
          deployDate,
        );

        this.updateClients(update);
      }
    } catch (error) {
      logger.error(`Error handling script deploy response: ${error}`);
    }
  }

  private async syncControllers(req: any, res: any, next: any) {
    try {
      logger.info("syncing controllers");
      this.serialWorker.postMessage({
        type: SerialMessageType.REGISTRATION_SYNC,
        data: null,
      });
      res.status(200);
      res.json({ message: "success" });
    } catch (error) {
      logger.error(error);

      res.status(500);
      res.json({
        message: "Internal server error",
      });
    }
  }

  private async syncControllerConfig(req: any, res: any, next: any) {
    try {
      logger.info("syncing controller config");

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
      res.json({ message: "success" });
    } catch (error) {
      logger.error(error);

      res.status(500);
      res.json({
        message: "Internal server error",
      });
    }
  }

  private async uploadScript(req: any, res: any, next: any) {
    try {
      logger.info("uploading script");

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
      res.json({ message: "success" });
    } catch (error) {
      logger.error(error);

      res.status(500);
      res.json({
        message: "Internal server error",
      });
    }
  }

  private async runScript(req: any, res: any, next: any) {
    try {
      logger.info("running script");

      const id = req.query.id;

      const ctlRepo = new LocationsRepository(db);

      const locations = await ctlRepo.loadLocations();

      const msg = new ScriptRun(id, locations);

      let msgType = SerialMessageType.RUN_SCRIPT;

      if (id === "panic") {
        msg.type = TransmissionType.panic;
        msgType = SerialMessageType.PANIC_STOP;
      }

      logger.debug(`msg: ${JSON.stringify(msg)}`);

      this.serialWorker.postMessage({ type: msgType, data: msg });

      res.status(200);
      res.json({ message: "success" });
    } catch (error) {
      logger.error(error);

      res.status(500);
      res.json({
        message: "Internal server error",
      });
    }
  }

  private async directCommand(req: any, res: any, next: any) {
    try {
      logger.info("sending direct command");

      const repo = new ControllerRepository(db);
      const controller = await repo.getControllerByLocationId(
        req.body.locationId,
      );

      logger.debug(`controller: ${JSON.stringify(controller)}`);
      logger.debug(`req: ${JSON.stringify(req.body)}`);

      const converter = new ScriptConverter(new ScriptRepository(db));
      const cmd = await converter.convertCommand(req.body);

      this.serialWorker.postMessage({
        type: SerialMessageType.RUN_COMMAND,
        data: { controller: controller, command: cmd },
      });

      res.status(200);
      res.json({ message: "success" });
    } catch (error) {
      logger.error(error);

      res.status(500);
      res.json({
        message: "Internal server error",
      });
    }
  }

  private async servoMoveCommand(data: IServoTestData) {
    try {
      // this will hammer logs
      //logger.debug(`sending servo command: ${data.controllerId}:${data.servoId}:${data.value}`);

      const cmd = new ServoTest(
        data.controllerAddress,
        data.controllerName,
        data.moduleSubType,
        data.moduleIdx,
        data.channelNumber,
        data.value,
      );

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
      logger.info("formatting SD card");

      const controllers = req.body.controllers;

      this.serialWorker.postMessage({
        type: SerialMessageType.FORMAT_SD,
        data: controllers,
      });

      res.status(200);
      res.json({ message: "success" });
    } catch (error) {
      logger.error(error);

      res.status(500);
      res.json({
        message: "Internal server error",
      });
    }
  }

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
}

ApiServer.bootstrap().catch((err) => {
  console.error(err.stack);
  process.exit(1);
});
