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
import { ScriptRepository } from "./dal/repositories/script_repository";

import { ScriptConverter } from "./script_converter";
import { BaseResponse, ControllerType, Script, TransmissionStatus, TransmissionType } from "astros-common";
import { ControllerRepository } from "./dal/repositories/controller_repository";
import { ConfigSync } from "./models/config/config_sync";
import { ScriptRun } from "./models/scripts/script_run";

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
        this.router.get(ScriptsController.run, this.authHandler, (req: any, res: any, next: any) => { this.runScript(req, res, next); });

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
            console.log(`Controller=${ControllerType[msg.controllerType]};up=${msg.up};synced=${msg.synced}`);
            this.updateClients(msg);
        });

        setInterval(() => {

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
                    console.log(`error getting controler IPs for monitor update: ${err}`);
                });

        }, 15 * 1000);

        this.moduleLoader = new Worker('./dist/background_tasks/module_loader.js')
        this.moduleLoader.on('exit', exit => { console.log(exit); });
        this.moduleLoader.on('error', err => { console.log(err); });

        this.moduleLoader.on('message', async (msg) => {

            switch (msg.type) {
                case TransmissionType.script:
                    await this.handleScriptRepsonse(msg);
                    this.updateClients(msg);   
                    break;
                case TransmissionType.sync:{
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

    private async handleSyncResponse(msg: any) : Promise<BaseResponse> {

        const result = new BaseResponse(TransmissionType.sync, true, '');

        const modMap = new Map<number, string>();
        modMap.set(1, 'Core Module');
        modMap.set(2, 'Dome Module');
        modMap.set(3, 'Body Module');

        for (const r of msg.results)  {
            
            if (r.synced){
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
                console.log(`No controller script values returned for ${id}`);
            }

            const controllers = await ctlRepo.getControllerData();

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

    private async runScript(req: any, res: any, next: any) {
        try {
            const id = req.query.id;

            const dao = new DataAccess();
            const ctlRepo = new ControllerRepository(dao);

            const controllers = await ctlRepo.getControllerData();

            const msg = new ScriptRun(id, controllers);

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

            console.log(`Controller ${msg.controllerType} uploaded for ${msg.scriptId}!`)

            msg.date = date;
        } else if (msg.status === TransmissionStatus.failed) {
            console.log(`Controller ${msg.controllerType} upload failed for ${msg.scriptId}!`)
        } else {
            console.log(`Updating transmission status for Controller ${msg.controllerType}, ${msg.scriptId} => ${msg.status}`);
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
