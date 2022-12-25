import Dotenv from "dotenv";
import cookieParser from "cookie-parser";
import path from "path";
import passport from "passport";
import morgan from "morgan";
import jwt, { RequestHandler } from "express-jwt";
import cors from 'cors';
import fileUpload from 'express-fileupload';

import Express, { Router, Application } from "express";
import { HttpError } from "http-errors";
import { Server, WebSocket } from "ws";
import { v4 as uuid_v4 } from "uuid";
import { Strategy } from "passport-local"
import { Worker } from "worker_threads";

import { DataAccess } from "src/dal/data_access";
import { UserRepository } from "src/dal/repositories/user_repository";
import { ControllerController } from "src/controllers/controller_controller";
import { AuthContoller } from "src/controllers/authentication_controller";
import { ScriptsController } from "src/controllers/scripts_controller";
import { AudioController } from "./controllers/audio_controller";
import { FileController } from "./controllers/file_controller";
import { ScriptUpload } from "src/models/scripts/script_upload";
import { ControllerEndpoint } from "./models/controller_endpoint";
import { ScriptRepository } from "./dal/repositories/script_repository";

import { ScriptConverter } from "./script_converter";
import { ControllerType, Script, TransmissionStatus, TransmissionType } from "astros-common";
import { ControllerRepository } from "./dal/repositories/controller_repository";

class ApiServer {

    private apiPort = 3000;
    private websocketPort = 5000;
    private clients: Map<string, WebSocket>;

    private app: Application;
    private router: Router;
    private websocket!: Server;
    private espMonitor!: Worker;

    moduleLoader!: Worker;

    private authHandler!: RequestHandler;

    upload!: any;

    constructor() {
        Dotenv.config({ path: __dirname + '/.env' });

        this.clients = new Map<string, WebSocket>();
        this.app = Express();
        this.router = Express.Router();

    }

    public async Init() {
        this.setAuthStrategy();
        this.configApi();
        this.configFileHandler();
        this.setRoutes();
        this.runWebServices();
        await this.runBackgroundServices();
    }

    public static async bootstrap(): Promise<ApiServer> {

        const server = new ApiServer();
        await server.Init();
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

    private configApi(): void {
        const da = new DataAccess();
        da.setup();

        this.app.use(morgan('dev'))
        this.app.use(cors());
        this.app.use(fileUpload());
        this.app.use(Express.json());
        this.app.use(Express.urlencoded({ extended: false }));
        this.app.use(cookieParser());
        this.app.use(Express.static(path.join(__dirname, 'public')))
        this.app.use(passport.initialize());
        this.app.use('/api', this.router);

        this.app.use((req: any, res: any, next: any) => {
            next(() => {
                const err = new HttpError();
                err.statusCode = 404;
                return err;
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
            userProperty: 'payload'
        });

    }

    private configFileHandler() {

        this.router.route(FileController.audioUploadRoute).post((req, res) => {
            FileController.HandleFile(req, res);
        })
    }

    private setRoutes(): void {

        this.router.post(AuthContoller.route, AuthContoller.login);

        this.router.get(ControllerController.route, this.authHandler, ControllerController.getControllers);
        this.router.put(ControllerController.route, this.authHandler, ControllerController.saveControllers);
        this.router.get(ControllerController.syncRoute, this.authHandler, (req: any, res: any, next: any) => { this.syncControllers(req, res, next); });


        this.router.get(ScriptsController.getRoute, this.authHandler, ScriptsController.getScript);
        this.router.get(ScriptsController.getAllRoute, this.authHandler, ScriptsController.getAllScripts);
        this.router.put(ScriptsController.putRoute, this.authHandler, ScriptsController.saveScript);

        this.router.get(ScriptsController.upload, this.authHandler, (req: any, res: any, next: any) => { this.uploadScript(req, res, next); });

        this.router.get(AudioController.getAll, this.authHandler, AudioController.getAllAudioFiles);
        this.router.get(AudioController.deleteRoute, this.authHandler, AudioController.deleteAudioFile);
    }

    private runWebServices(): void {
        this.app.listen(this.apiPort, () => {
            console.log('The application is listening on port 3000');
        });

        this.websocket = new Server({ port: this.websocketPort });

        this.websocket.on('connection', (conn) => {
            const id = uuid_v4();
            this.clients.set(id, conn);

            console.log(`${conn} connected`);
        });
    }

    private async runBackgroundServices(): Promise<void> {

        this.espMonitor = new Worker('./dist/background_tasks/esp_monitor.js', { workerData: {} });
        this.espMonitor.on('exit', exit => { console.log(exit); });
        this.espMonitor.on('error', err => { console.log(err); });

        this.espMonitor.on('message', (msg) => {
            console.log(`${msg.module}:${msg.status}:${msg.synced}`);
            this.updateClients(msg);
        });

        setInterval(() => {

            const dao = new DataAccess();
            const repository = new ControllerRepository(dao);

            repository.getControllerData()
                .then((val: any) => {

                    const ctlMap = new Map<number, string>();
                    ctlMap.set(1, 'core');
                    ctlMap.set(2, 'dome');
                    ctlMap.set(3, 'body');

                    const ctlList = new Array<any>();

                    val.forEach(function (ctl: any) {
                        ctlList.push({ monitor: ctlMap.get(ctl.id), ip: ctl.ipAddress, fingerprint: ctl.fingerprint });
                    });

                    this.espMonitor.postMessage(ctlList);
                })
                .catch((err) => {
                    console.log(`error getting controler IPs for monitor update: ${err}`);
                });

        }, 15 * 1000);

        this.moduleLoader = new Worker('./dist/background_tasks/script_loader.js')
        this.moduleLoader.on('exit', exit => { console.log(exit); });
        this.moduleLoader.on('error', err => { console.log(err); });

        this.moduleLoader.on('message', async (msg) => {

            switch (msg.type) {
                case TransmissionType.script:
                    await this.handleScriptRepsonse(msg);
                    break;
                case TransmissionType.sync:
                    msg.success = await this.handleSyncResponse(msg);
                    break;
            }

            this.updateClients(msg);
        });
    }

    private async handleSyncResponse(msg: any) : Promise<boolean> {
        if (msg.status == TransmissionStatus.success){
            const dao = new DataAccess();
            const repository = new ControllerRepository(dao);

            return await repository.updateControllerFingerprint(msg.controllerId, msg.fingerprint);
        } 

        return false;
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

            await repository.updateScriptControllerUploaded(msg.scriptId, msg.controller, date);

            console.log(`Controller ${msg.controller} uploaded for ${msg.scriptId}!`)

            msg.date = date;
        } else if (msg.status === TransmissionStatus.failed) {
            console.log(`Controller ${msg.controller} upload failed for ${msg.scriptId}!`)
        } else {
            console.log(`Updating transmission status for Controller ${msg.controller}, ${msg.scriptId} => ${msg.status}`);
        }
    }

    private async uploadScript(req: any, res: any, next: any) {
        try {
            const id = req.query.id;

            const dao = new DataAccess();
            const repo = new ScriptRepository(dao);

            const script = await repo.getScript(id) as Script;

            const cvtr = new ScriptConverter();

            const messages = cvtr.convertScript(script);

            if (messages.size < 1) {
                console.log(`No controller script values returned for ${id}`);
                throw new Error(`No controller script values returned for ${id}`);
            }

            const controllers = new Array<ControllerEndpoint>(
                new ControllerEndpoint('core', ControllerType.core, '', true),
                new ControllerEndpoint('dome', ControllerType.dome, '', true),
                new ControllerEndpoint('body', ControllerType.body, '', true),
            );

            const msg = new ScriptUpload(id, messages, controllers);

            this.moduleLoader.postMessage(msg);

            res.status(200);
            res.json({ message: "success" });

        } catch (error) {
            console.log(error);

            res.status(500);
            res.json({
                message: 'Internal server error'
            });
        }
    }

    private async syncControllers(req: any, res: any, next: any) {
        try {
            const dao = new DataAccess();
            const repo = new ControllerRepository(dao);

            const controllers = await repo.getControllers();

            const array

            controllers.forEach( ctl => {

            });

            const msg = new ScriptUpload(id, messages, controllers);

            this.moduleLoader.postMessage(msg);

            res.status(200);
            res.json({ message: "success" });

        } catch (error) {
            console.log(error);

            res.status(500);
            res.json({
                message: 'Internal server error'
            });
        }
    }

    private updateClients(msg: any): void {
        const str = JSON.stringify(msg);
        for (const client of this.clients.values()) {
            try {
                client.send(str);
            } catch (err) {
                console.log(`websocket send error: ${err}`);
            }
        }
    }
}

ApiServer.bootstrap().catch(err => {
    console.error(err.stack)
    process.exit(1)
});
