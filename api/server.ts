import Express from "express";
import Dotenv from "dotenv";
import { DataAccess } from "./dal/data_access";

class Server {

    port: number = 3000;

    public app: Express.Application;

    constructor() {
        this.app = Express();

        this.config();
        this.run();
    }

    public static bootstrap(): Server {
        return new Server();
    }

    private config() {
        Dotenv.config();

        const da = new DataAccess();
        da.setup();
    }

    private run(){
        this.app.listen(3000,()=>{
            console.log('The application is listening on port 3000');
        });
    }
}

Server.bootstrap();
