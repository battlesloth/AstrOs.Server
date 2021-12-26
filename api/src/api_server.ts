import Dotenv from "dotenv";
import cookieParser from "cookie-parser";
import path from "path";
import passport from "passport";
import morgan from "morgan";
import jwt from "express-jwt";

import Express, { Router, Application } from "express";
import { HttpError } from "http-errors";
import { Server, WebSocket } from "ws";
import {uuid } from "uuidv4";
import { Strategy } from "passport-local"
import { Worker } from "worker_threads";

import { DataAccess } from "src/dal/data_access";
import { UserRepository } from "src/dal/repositories/user_repository";
import { ControllerController } from "src/controllers/controller_controller";
import { AuthContoller } from "src/controllers/authentication_controller";

class ApiServer {

    private apiPort = 3000;
    private websocketPort = 5000;
    private clients: Map<string, WebSocket>;

    private app: Application;
    private router: Router;
    private websocket!: Server;
    private espMonitor!: Worker;

    constructor() {
        Dotenv.config({ path: __dirname+'/.env' });

        this.clients = new Map<string, WebSocket>();
        this.app = Express();
        this.router = Express.Router();

        this.setAuthStrategy();
        this.configApi();
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
    }

    private setRoutes(): void {
        const jwtKey: string = (process.env.JWT_KEY as string);

        const auth = jwt({
            secret: jwtKey,
            algorithms: ['HS256'],
            userProperty: 'payload'
        });

        this.router.post(AuthContoller.route, AuthContoller.login);

        this.router.get(ControllerController.route, auth, ControllerController.getControllers);
        this.router.put(ControllerController.route, auth, ControllerController.saveControllers);
    }

    private runWebServices(): void {
        this.app.listen(this.apiPort, () => {
            console.log('The application is listening on port 3000');
        });

        this.websocket = new Server({ port: this.websocketPort });

        this.websocket.on('connection', (conn) => {
            const id = uuid();
            this.clients.set(id, conn);

            console.log(`${conn} connected`);
        });
    }

    private runBackgroundServices(): void {
        this.espMonitor = new Worker('./dist/background_tasks/esp_monitor.js', { workerData: {monitor: 'core'}});
        this.espMonitor.on('exit', exit => { console.log(exit); });
        this.espMonitor.on('error', err => { console.log(err); });

        this.espMonitor.on('message', (msg) =>{
            console.log(`${msg.module}:${msg.status}`);
            this.updateClients(msg);
        });

        setInterval(() => { this.espMonitor.postMessage({monitor: 'core', ip: '192.168.50.22'})}, 5000);
    }

    private updateClients(msg: any): void {
        const str = JSON.stringify(msg);
        for (const client of this.clients.values()){
            try{
                client.send(str);
            } catch(err){
                console.log(`websocket send error: ${err}`);
            }
        }
    }
}

ApiServer.bootstrap();
