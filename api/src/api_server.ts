import Dotenv from "dotenv";
import cookieParser from "cookie-parser";
import path from "path";
import passport from "passport";
import morgan from "morgan";
import jwt, { RequestHandler } from "express-jwt";
import cors from 'cors';
import appdata from 'appdata-path';
import { existsSync, mkdirSync } from 'fs';
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

class ApiServer {

    private apiPort = 3000;
    private websocketPort = 5000;
    private clients: Map<string, WebSocket>;

    private app: Application;
    private router: Router;
    private websocket!: Server;
    private espMonitor!: Worker;

    private scriptLoader!: Worker;

    private authHandler!: RequestHandler;

    upload!: any;

    constructor() {
        Dotenv.config({ path: __dirname + '/.env' });

        this.clients = new Map<string, WebSocket>();
        this.app = Express();
        this.router = Express.Router();

        this.setAuthStrategy();
        this.configApi();
        this.configFileHandler();
        this.setRoutes();
        this.runWebServices();
        this.runBackgroundServices();
    }

    public static bootstrap(): ApiServer {
        return new ApiServer();
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

        this.router.route(FileController.audioUploadRoute).post( (req, res) =>{
           FileController.HandleFile(req, res);
        })
    }

    private setRoutes(): void {

        this.router.post(AuthContoller.route, AuthContoller.login);

        this.router.get(ControllerController.route, this.authHandler, ControllerController.getControllers);
        this.router.put(ControllerController.route, this.authHandler, ControllerController.saveControllers);

        this.router.get(ScriptsController.getRoute, this.authHandler, ScriptsController.getScript);
        this.router.get(ScriptsController.getAllRoute, this.authHandler, ScriptsController.getAllScripts);
        this.router.put(ScriptsController.putRoute, this.authHandler, ScriptsController.saveScript);

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

    private runBackgroundServices(): void {
        this.espMonitor = new Worker('./dist/background_tasks/esp_monitor.js', { workerData: { monitor: 'core' } });
        this.espMonitor.on('exit', exit => { console.log(exit); });
        this.espMonitor.on('error', err => { console.log(err); });

        this.espMonitor.on('message', (msg) => {
            console.log(`${msg.module}:${msg.status}`);
            this.updateClients(msg);
        });

        setInterval(() => { this.espMonitor.postMessage({ monitor: 'core', ip: '192.168.50.22' }) }, 5000);
    
        this.scriptLoader = new Worker('./dist/background_tasks/script_loader.js')
        this.scriptLoader.on('exit', exit => { console.log(exit); });
        this.scriptLoader.on('error', err => { console.log(err); });
        
        this.scriptLoader.on('message', (msg) => {
            console.log(`${msg.}:${msg.status}`);
            this.updateClients(msg);
        });
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

ApiServer.bootstrap();
