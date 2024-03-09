import Dotenv from "dotenv";
import cookieParser from "cookie-parser";
import path from "path";
import passport from "passport";
import morgan from "morgan";
import { expressjwt as jwt } from "express-jwt";
import cors from 'cors';
import fileUpload from 'express-fileupload';

import Express, { Router, Application, RequestHandler as ReqHandler } from "express";
import { WebSocketServer as Server, WebSocket } from "ws";
import { v4 as uuid_v4 } from "uuid";
import { Strategy } from "passport-local"
import { Worker } from "worker_threads";

import { pinoHttp } from "pino-http";

import { DataAccess } from "./dal/data_access";
import { UserRepository } from "./dal/repositories/user_repository";
import { LocationsController } from "./controllers/locations_controller";
import { AuthContoller } from "./controllers/authentication_controller";
import { ScriptsController } from "./controllers/scripts_controller";
import { AudioController } from "./controllers/audio_controller";
import { FileController } from "./controllers/file_controller";
import { ScriptUpload } from "./models/scripts/script_upload";
import { ScriptRepository } from "./dal/repositories/script_repository";

import { ScriptConverter } from "./script_converter";
import {
    BaseResponse, ControlModule, Script, StatusResponse, ControllersResponse,
    TransmissionStatus, TransmissionType, ControllerLocation
} from "astros-common";
import { ControllerRepository } from "./dal/repositories/controller_repository";
import { ConfigSync } from "./models/config/config_sync";
import { ScriptRun } from "./models/scripts/script_run";
import { logger } from "./logger";
import { RemoteConfigController } from "./controllers/remote_config_controller";
import { SettingsController } from "./controllers/settings_controller";
import { ApiKeyValidator } from "./api_key_validator";
import { P } from "pino";
import { SerialMessageType } from "./serial/serial_message";
import {
    ConfigSyncResponse,
    ISerialWorkerResponse, PollRepsonse, RegistrationResponse,
    SerialWorkerResponseType
} from "./serial/serial_worker_response";
import { LocationsRepository } from "./dal/repositories/locations_repository";

const { SerialPort } = eval("require('serialport')");
const { DelimiterParser } = eval("require('@serialport/parser-delimiter')");

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

        logger.info('Setting up file handler');
        this.configFileHandler();

        logger.info('Setting up routes');
        this.setRoutes();

        logger.info('Starting up serial port services');
        this.setupSerialPort();

        logger.info('Starting web services');
        this.runWebServices();
    }

    public static async bootstrap(): Promise<ApiServer> {

        const server = new ApiServer();
        try {
            await server.Init();
        }
        catch (error) {
            logger.error(error);
            throw new Error('Failed to initialize server');
        }

        return server;
    }

    private setAuthStrategy(): void {
        passport.use(
            new Strategy(
                {
                    usernameField: 'username'
                },
                async (username: string, password: string, done) => {
                    const dao = new DataAccess();
                    const repository = new UserRepository(dao);

                    const user = await repository.getByUsername(username);

                    // Return if user not found in database
                    if (!user) {
                        return done(null, false, {
                            message: 'User not found'
                        });
                    }
                    // Return if password is wrong
                    if (!user.validatePassword(password)) {
                        return done(null, false, {
                            message: 'Password is wrong'
                        });
                    }
                    // If credentials are correct, return the user object
                    return done(null, user);
                }
            )
        );
    }

    private async configApi(): Promise<void> {
        const da = new DataAccess();
        await da.setup();

        const loggerMiddleware = pinoHttp({
            logger: logger,
            autoLogging: true
        });

        this.app.use(loggerMiddleware);
        this.app.use(morgan('dev'));
        this.app.use(cors());
        this.app.use(fileUpload());
        this.app.use(Express.json());
        this.app.use(Express.urlencoded({ extended: false }));
        this.app.use(cookieParser());
        this.app.use(Express.static(path.join(__dirname, 'public')))
        this.app.use(passport.initialize());
        this.app.use('/api', this.router);

        this.app.use((req: any, res: any, next: any) => {
            res.status(404).json({
                message: 'Endpoint not found'
            })
        });

        this.app.use((err: any, req: any, res: any, next: any) => {
            res.locals.message = err.message;
            res.locals.error = req.app.get('env') === 'development' ? err : {};
            res.status(err.status || 500);
        });

        const jwtKey: string = (process.env.JWT_KEY as string);

        this.authHandler = jwt({
            secret: jwtKey,
            algorithms: ['HS256'],
            //userProperty: 'payload'
        });

        this.apiKeyValidator = ApiKeyValidator();
    }

    private configFileHandler() {

        this.router.route(FileController.audioUploadRoute).post((req, res) => {
            FileController.HandleFile(req, res);
        })
    }

    private setRoutes(): void {

        this.router.post(AuthContoller.route, AuthContoller.login);
        this.router.post(AuthContoller.reauthRoute, AuthContoller.reauth);

        this.router.get(LocationsController.route, this.authHandler, LocationsController.getLocations);
        this.router.put(LocationsController.route, this.authHandler, LocationsController.saveLocations);
        this.router.get(LocationsController.loadRoute, this.authHandler, LocationsController.loadLocations);
        this.router.get(LocationsController.syncConfigRoute, this.authHandler, (req: any, res: any, next: any) => { this.syncControllerConfig(req, res, next); });
        this.router.get(LocationsController.syncControllersRoute, this.authHandler, (req: any, res: any, next: any) => { this.syncControllers(req, res, next); });

        this.router.get(ScriptsController.getRoute, this.authHandler, ScriptsController.getScript);
        this.router.get(ScriptsController.getAllRoute, this.authHandler, ScriptsController.getAllScripts);
        this.router.put(ScriptsController.putRoute, this.authHandler, ScriptsController.saveScript);
        this.router.delete(ScriptsController.deleteRoute, this.authHandler, ScriptsController.deleteScript);
        this.router.get(ScriptsController.copyRoute, this.authHandler, ScriptsController.copyScript);

        this.router.get(ScriptsController.uploadRoute, this.authHandler, (req: any, res: any, next: any) => { this.uploadScript(req, res, next); });
        this.router.get(ScriptsController.runRoute, this.authHandler, (req: any, res: any, next: any) => { this.runScript(req, res, next); });

        this.router.get(RemoteConfigController.getRoute, this.authHandler, RemoteConfigController.getRemoteConfig);
        this.router.put(RemoteConfigController.putRoute, this.authHandler, RemoteConfigController.saveRemoteConfig);

        this.router.get(SettingsController.getRoute, this.authHandler, SettingsController.getSetting);
        this.router.put(SettingsController.putRoute, this.authHandler, SettingsController.saveSetting);
        this.router.post(SettingsController.formatSDRoute, this.authHandler, (req: any, res: any, next: any) => { this.formatSD(req, res, next); })

        this.router.get(AudioController.getAll, this.authHandler, AudioController.getAllAudioFiles);
        this.router.get(AudioController.deleteRoute, this.authHandler, AudioController.deleteAudioFile);

        this.router.post('/directcommand', this.authHandler, (req: any, res: any, next: any) => { this.directCommand(req, res, next); });

        // API key secured routes
        this.router.get('/remotecontrol', this.apiKeyValidator, (req: any, res: any, next: any) => { this.runScript(req, res, next); });
        this.router.get('/remotecontrolsync', this.apiKeyValidator, RemoteConfigController.syncRemoteConfig);

    }

    private setupSerialPort(): void {
        this.serialWorker = new Worker(new URL('./background_tasks/serial_worker.js', import.meta.url));

        this.serialWorker.on('exit', exit => { logger.info(exit); });
        this.serialWorker.on('error', err => { logger.error(err); });

        this.serialWorker.on('message', (msg) => {
            this.handleSerialWorkerMessage(msg);
        });

        this.serialPort = new SerialPort({ path: process.env.SERIAL_PORT || "/dev/ttyS0", baudRate: Number.parseInt(process.env.BAUD_RATE || "9600") });
        this.serialParser = this.serialPort.pipe(new DelimiterParser({ delimiter: '\n' }))
            .on('data', (data: any) => {
                this.serialWorker.postMessage({ type: SerialMessageType.SERIAL_MSG_RECEIVED, data: data.toString() })
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

            logger.info(`${conn.url}:${id} connected`);
        });
    }

    handleSerialWorkerMessage(msg: ISerialWorkerResponse): void {
        switch (msg.type) {
            case SerialWorkerResponseType.UNKNOWN:
                logger.error('Invalid message received');
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
                break
            case SerialWorkerResponseType.REGISTRATION_SYNC:
                this.handleResgistraionResponse(msg);
                break;
            case SerialWorkerResponseType.POLL:
                this.handlePollResponse(msg);
                break
            case SerialWorkerResponseType.CONFIG_SYNC:
                this.handleConfigSync(msg);
                break;
        }
    }

    async handleResgistraionResponse(msg: ISerialWorkerResponse) {
        try {
            const val = msg as RegistrationResponse;

            const dao = new DataAccess();
            const controllerRepo = new ControllerRepository(dao);

            await controllerRepo.insertControllers(val.registrations);

            const contollers = await controllerRepo.getControllers();

            const update = new ControllersResponse(val.success, contollers);
            this.updateClients(update);
        }
        catch (error) {
            logger.error(`Error handling registration response: ${error}`);
        }
    }

    async handlePollResponse(msg: ISerialWorkerResponse) {
        try {
            const val = msg as PollRepsonse;

            const dao = new DataAccess();
            const controlerRepo = new ControllerRepository(dao);
            const locationRepo = new LocationsRepository(dao);

            const controller = await controlerRepo.getControllerByAddress(val.controller.address);


            logger.info(`${JSON.stringify(controller)}`);

            if (controller === null) {
                logger.error(`Controller not found for address: ${val.controller.address}`);
                return;
            }

            const location = await locationRepo.getLocationByController(controller.id);

            if (location === null) {
                logger.error(`Location not found for controller: ${val.controller.name}`);
                return;
            }

            logger.info(`msg: ${val.controller.fingerprint}, db: ${location.configFingerprint}`);

            const update = new StatusResponse(controller.id, location.locationName, true, val.controller.fingerprint === location.configFingerprint);

            this.updateClients(update);
        }
        catch (error) {
            logger.error(`Error handling poll response: ${error}`);
        }
    }

    async handleConfigSync(msg: ISerialWorkerResponse) {
        try {
            const val = msg as ConfigSyncResponse;

            const dao = new DataAccess();

            const locationRepo = new LocationsRepository(dao);

            const locationId = await locationRepo.getLocationIdByController(val.controller.address);

            if (locationId < 1) {
                logger.error(`Location not found for controller: ${val.controller.name}`);
                return;
            }

            await locationRepo.updateLocationFingerprint(locationId, val.controller.fingerprint);
        }
        catch (error) {
            logger.error(`Error handling config sync response: ${error}`);
        }
    }


    private async syncControllers(req: any, res: any, next: any) {
        try {

            logger.info('syncing controllers');
            this.serialWorker.postMessage({ type: SerialMessageType.REGISTRATION_SYNC, data: null });
            res.status(200);
            res.json({ message: "success" });
        } catch (error) {
            logger.error(error);

            res.status(500);
            res.json({
                message: 'Internal server error'
            });
        }
    }

    private async syncControllerConfig(req: any, res: any, next: any) {
        try {

            logger.info('syncing controller config');

            const dao = new DataAccess();
            const repo = new LocationsRepository(dao);

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

            this.serialWorker.postMessage({ type: SerialMessageType.DEPLOY_CONFIG, data: configSync });

            res.status(200);
            res.json({ message: "success" });
        } catch (error) {
            logger.error(error);

            res.status(500);
            res.json({
                message: 'Internal server error'
            });
        }
    }

    private async uploadScript(req: any, res: any, next: any) {
        try {

            logger.info('uploading script');
        } catch (error) {
            logger.error(error);

            res.status(500);
            res.json({
                message: 'Internal server error'
            });
        }
    }

    private async runScript(req: any, res: any, next: any) {
        try {

            logger.info('running script');
        } catch (error) {
            logger.error(error);

            res.status(500);
            res.json({
                message: 'Internal server error'
            });
        }
    }

    private async directCommand(req: any, res: any, next: any) {
        try {

            logger.info('sending direct command');

        } catch (error) {
            logger.error(error);

            res.status(500);
            res.json({
                message: 'Internal server error'
            });
        }
    }

    private async formatSD(req: any, res: any, next: any) {
        try {

            logger.info('formatting SD card');
        } catch (error) {
            logger.error(error);

            res.status(500);
            res.json({
                message: 'Internal server error'
            });
        }
    }


    /*
    
        private async syncControlModules(): Promise<void> {
    
            setInterval(async () => {
    
                const guid = uuid_v4();
    
                const msg = `1\u001eREGISTRATION_SYNC\u001e${guid}\u001d\n`;
    
                await this.serialMsgSvc.sendMessage(msg);
    
            }, 2 * 1000);
    
        }
        
            private async runBackgroundServices(): Promise<void> {
        
                this.espMonitor = new Worker(new URL('./background_tasks/esp_monitor.js', import.meta.url));
        
                this.espMonitor.on('exit', exit => { logger.info(exit); });
                this.espMonitor.on('error', err => { logger.error(err); });
        
                this.espMonitor.on('message', (msg) => {
                    logger.info(`Controller=${ControllerType[msg.controllerType]};up=${msg.up};synced=${msg.synced}`);
                    this.updateClients(msg);
                });
        
                setInterval(() => {
        
                    this.port.write(`testing1,2,3\n`, (err: any) => {
                        if (err) {
                            logger.error(`Error writing to serial port: ${err.message}`);
                        }
                    });
        
                    const dao = new DataAccess();
                    const repository = new ControllerRepository(dao);
        
                    repository.getControllerData()
                        .then((val: any) => {
        
                            const ctlList = new Array<any>();
        
                            val.forEach(function (ctl: any) {
                                ctlList.push({ controllerType: ctl.id, ip: ctl.ipAddress, fingerprint: ctl.fingerprint });
                            });
        
                            this.espMonitor.postMessage(ctlList);
                        })
                        .catch((err) => {
                            logger.error(`error getting controler IPs for monitor update: ${err}`);
                        });
        
                }, 15 * 1000);
        
                this.moduleInterface = new Worker(new URL('./background_tasks/module_interface.js', import.meta.url))
        
                this.moduleInterface.on('exit', exit => { logger.info(exit); });
                this.moduleInterface.on('error', err => { logger.error(err); });
        
                this.moduleInterface.on('message', async (msg) => {
        
                    switch (msg.type) {
                        case TransmissionType.script:
                            await this.handleScriptRepsonse(msg);
                            this.updateClients(msg);
                            break;
                        case TransmissionType.sync: {
                            const response = await this.handleSyncResponse(msg);
                            this.updateClients(response);
                            break;
                        }
        
                    }
        
                });
            }
        
            private async syncControllers(req: any, res: any, next: any) {
                try {
                    const dao = new DataAccess();
                    const repo = new ControllerRepository(dao);
        
                    const controllers = await repo.getControllers();
        
                    const msg = new ConfigSync(controllers);
        
                    this.moduleInterface.postMessage(msg);
        
                    res.status(200);
                    res.json({ message: "success" });
        
                } catch (error) {
                    logger.error(error);
        
                    res.status(500);
                    res.json({
                        message: 'Internal server error'
                    });
                }
            }
        
            private async handleSyncResponse(msg: any): Promise<BaseResponse> {
        
                const result = new BaseResponse(TransmissionType.sync, true, '');
        
                const modMap = new Map<number, string>();
                modMap.set(1, 'Core Module');
                modMap.set(2, 'Dome Module');
                modMap.set(3, 'Body Module');
        
                for (const r of msg.results) {
        
                    if (r.synced) {
                        const dao = new DataAccess();
                        const repository = new ControllerRepository(dao);
        
                        const saved = await repository.updateControllerFingerprint(r.id, r.fingerprint);
        
                        result.message += `${modMap.get(r.id)} sync ${saved ? 'succeeded' : 'failed'}, `;
                    } else {
                        result.message += `${modMap.get(r.id)} sync failed, `;
                    }
                }
        
                result.message = result.message.trim().slice(0, -1);
                return result;
            }
        
            private async uploadScript(req: any, res: any, next: any) {
                try {
                    const id = req.query.id;
        
                    const dao = new DataAccess();
                    const scriptRepo = new ScriptRepository(dao);
                    const ctlRepo = new ControllerRepository(dao);
        
                    const script = await scriptRepo.getScript(id) as Script;
        
                    const cvtr = new ScriptConverter();
        
                    const messages = cvtr.convertScript(script);
        
                    if (messages.size < 1) {
                        logger.warn(`No controller script values returned for ${id}`);
                    }
        
                    const controllers = await ctlRepo.getControllerData();
        
                    const msg = new ScriptUpload(id, messages, controllers);
        
                    this.moduleInterface.postMessage(msg);
        
                    res.status(200);
                    res.json({ message: "success" });
        
                } catch (error) {
                    logger.error(error);
        
                    res.status(500);
                    res.json({
                        message: 'Internal server error'
                    });
                }
            }
        
            private async runScript(req: any, res: any, next: any) {
                try {
                    const id = req.query.id;
        
                    const dao = new DataAccess();
                    const ctlRepo = new ControllerRepository(dao);
        
                    const controllers = await ctlRepo.getControllerData();
        
                    const msg = new ScriptRun(id, controllers);
        
                    if (id === "panic"){
                        msg.type = TransmissionType.panic;
                    }
        
                    this.moduleInterface.postMessage(msg);
        
                    res.status(200);
                    res.json({ message: "success" });
        
                } catch (error) {
                    logger.error(error);
        
                    res.status(500);
                    res.json({
                        message: 'Internal server error'
                    });
                }
            }
        
            private async handleScriptRepsonse(msg: any) {
        
                if (msg.status === TransmissionStatus.success) {
                    const dao = new DataAccess();
                    const repository = new ScriptRepository(dao);
        
                    const options: Intl.DateTimeFormatOptions = {
                        day: "numeric", month: "numeric", year: "numeric",
                        hour: "2-digit", minute: "2-digit", second: "2-digit"
                    };
        
                    const date = (new Date()).toLocaleString('en-US', options);
        
                    await repository.updateScriptControllerUploaded(msg.scriptId, msg.controllerType, date);
        
                    logger.info(`Controller ${msg.controllerType} uploaded for ${msg.scriptId}!`)
        
                    msg.date = date;
                } else if (msg.status === TransmissionStatus.failed) {
                    logger.warn(`Controller ${msg.controllerType} upload failed for ${msg.scriptId}!`)
                } else {
                    logger.info(`Updating transmission status for Controller ${msg.controllerType}, ${msg.scriptId} => ${msg.status}`);
                }
            }
        
            private async directCommand(req: any, res: any, next: any) {
                try {
        
                    const dao = new DataAccess();
                    const repo = new ControllerRepository(dao);
        
                    req.body.ip = await repo.getControllerIp(req.body.controller);
        
                    req.body.type = TransmissionType.directCommand;
        
                    logger.info(`sending direct command: ${JSON.stringify(req.body)}`);
        
                    this.moduleInterface.postMessage(req.body);
        
                    res.status(200);
                    res.json({ message: "success" });
        
                } catch (error) {
                    logger.error(error);
        
                    res.status(500);
                    res.json({
                        message: 'Internal server error'
                    });
                }
        
            }
        
            private async formatSD(req: any, res: any, next: any){
                try {
        
                    const dao = new DataAccess();
                    const repo = new ControllerRepository(dao);
        
                    for (const module of req.body.modules){
        
                        const ip = await repo.getControllerIp(module);
        
                        const msg = {ip: ip, type: TransmissionType.formatSD};
                        logger.info(`sending format SD command: ${JSON.stringify(msg)}`);
        
                        this.moduleInterface.postMessage(msg);
                    }
                    
                    res.status(200);
                    res.json({ message: "success" });
        
                } catch (error) {
                    logger.error(error);
        
                    res.status(500);
                    res.json({
                        message: 'Internal server error'
                    });
                }
            }
        */
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

ApiServer.bootstrap().catch(err => {
    console.error(err.stack)
    process.exit(1)
});
